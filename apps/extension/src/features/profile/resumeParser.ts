import type {
  PersonalProfile,
  ProfileEducation,
  ProfileExperience,
  ProfileProject,
  ResumeAsset
} from "@/shared/types";
import { getDocument, GlobalWorkerOptions, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {
  parseResumeStructuredText,
  type ResumeStructuredDiagnostics
} from "@/features/profile/resumeStructuredParser";

GlobalWorkerOptions.workerSrc = workerUrl;

export interface ResumeParseResult {
  profile: PersonalProfile;
  extractedCount: number;
  warnings: string[];
  textLength: number;
  diagnostics?: ResumeStructuredDiagnostics;
}

export interface ResumePdfTextItem {
  id: string;
  text: string;
  x: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: 400 | 700;
  fontStyle: "normal" | "italic";
  fontId: string;
  fallbackFontFamily: string;
  color: string;
  backgroundColor: string;
  backgroundConfidence: number;
  rotation: number;
  direction: string;
}

export interface ResumePdfFont {
  id: string;
  family: string;
  fallbackFamily: string;
  dataBase64: string;
  mimeType: string;
  fontWeight: 400 | 700;
  fontStyle: "normal" | "italic";
  isSubset: boolean;
}

export interface ResumePdfVectorShape {
  d: string;
  fill: string;
  fillRule: "nonzero" | "evenodd";
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
  lineCap: "butt" | "round" | "square";
  lineJoin: "miter" | "round" | "bevel";
  miterLimit: number;
  dashArray: number[];
  dashOffset: number;
}

export interface ResumePdfPageLayout {
  page: number;
  widthPt: number;
  heightPt: number;
  imageDataUrl: string;
  backgroundImageDataUrl?: string;
  vectorShapes: ResumePdfVectorShape[];
  items: ResumePdfTextItem[];
}

export interface ResumePdfLayout {
  pages: ResumePdfPageLayout[];
  fonts: ResumePdfFont[];
  characterCount: number;
}

export interface ResumePdfLayoutOptions {
  onProgress?: (phase: string, pageNumber?: number, pageCount?: number) => void;
}

export interface ResumePdfAssetExtraction {
  assets: ResumeAsset[];
  portraitAssetId?: string;
  warnings: string[];
}

function pdfJsAssetDirectory(directory: "cmaps" | "standard_fonts" | "wasm" | "iccs") {
  const relativePath = `pdfjs/${directory}/`;
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(relativePath);
  }
  return new URL(`/${relativePath}`, globalThis.location?.origin || "https://extension.invalid").href;
}

function pdfDocumentOptions(buffer: ArrayBuffer) {
  return {
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    cMapUrl: pdfJsAssetDirectory("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: pdfJsAssetDirectory("standard_fonts"),
    wasmUrl: pdfJsAssetDirectory("wasm"),
    iccUrl: pdfJsAssetDirectory("iccs"),
    fontExtraProperties: true
  };
}

const id = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const normalizeSpaces = (value: string) =>
  value
    .replace(/[\u0000\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const fileExtension = (name: string) => name.toLowerCase().split(".").pop() || "";

async function inflate(bytes: Uint8Array, format: "deflate" | "deflate-raw") {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前浏览器不支持 DOCX 压缩内容解析");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readUInt16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

async function readZipEntry(bytes: Uint8Array, entryName: string) {
  const lowerName = entryName.toLowerCase();
  let endRecord = -1;
  for (let cursor = bytes.length - 22; cursor >= Math.max(0, bytes.length - 65557); cursor -= 1) {
    if (readUInt32(bytes, cursor) === 0x06054b50) {
      endRecord = cursor;
      break;
    }
  }
  if (endRecord < 0) throw new Error("DOCX 文件结构无法识别");

  const entryCount = readUInt16(bytes, endRecord + 10);
  const directoryOffset = readUInt32(bytes, endRecord + 16);
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(bytes, cursor) !== 0x02014b50) break;
    const method = readUInt16(bytes, cursor + 10);
    const compressedSize = readUInt32(bytes, cursor + 20);
    const nameLength = readUInt16(bytes, cursor + 28);
    const extraLength = readUInt16(bytes, cursor + 30);
    const commentLength = readUInt16(bytes, cursor + 32);
    const localHeaderOffset = readUInt32(bytes, cursor + 42);
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if (name.toLowerCase() !== lowerName) continue;

    if (readUInt32(bytes, localHeaderOffset) !== 0x04034b50) {
      throw new Error("DOCX 文件内容无法读取");
    }
    const localNameLength = readUInt16(bytes, localHeaderOffset + 26);
    const localExtraLength = readUInt16(bytes, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    if (method === 0) return compressed;
    if (method === 8) return inflate(compressed, "deflate-raw");
    throw new Error("DOCX 使用了暂不支持的压缩方式");
  }
  throw new Error("DOCX 中未找到正文");
}

function decodeXml(value: string) {
  const element = document.createElement("textarea");
  element.innerHTML = value;
  return element.value;
}

async function extractDocxText(buffer: ArrayBuffer) {
  const xml = new TextDecoder().decode(await readZipEntry(new Uint8Array(buffer), "word/document.xml"));
  const paragraphs = xml.match(/<w:p[\s\S]*?<\/w:p>/gi) || [];
  return normalizeSpaces(
    paragraphs
      .map((paragraph) =>
        (paragraph.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi) || [])
          .map((part) => decodeXml(part.replace(/^<w:t[^>]*>|<\/w:t>$/gi, "")))
          .join("")
      )
      .join("\n")
  );
}

function decodePdfLiteral(value: string) {
  return value
    .slice(1, -1)
    .replace(/\\([nrtbf()\\])/g, (_, code: string) =>
      ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" } as Record<string, string>)[code] || code
    )
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

function decodePdfHex(value: string) {
  const hex = value.slice(1, -1).replace(/\s/g, "");
  let output = "";
  for (let index = 0; index < hex.length; index += 2) {
    output += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16));
  }
  return output;
}

function extractPdfStrings(value: string) {
  const textBlocks = value.match(/BT[\s\S]*?ET/g) || [value];
  return normalizeSpaces(
    textBlocks
      .map((block) => {
        const tokens = block.match(/\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]+>/g) || [];
        return tokens.map((token) => (token.startsWith("<") ? decodePdfHex(token) : decodePdfLiteral(token))).join(" ");
      })
      .join("\n")
  );
}

async function extractPdfTextLegacy(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const binary = new TextDecoder("latin1").decode(bytes);
  const chunks = [extractPdfStrings(binary)];
  const streamPattern = /\/FlateDecode[\s\S]{0,120}?stream\r?\n([\s\S]*?)endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(binary))) {
    const streamBytes = Uint8Array.from(match[1], (character) => character.charCodeAt(0) & 255);
    try {
      chunks.push(extractPdfStrings(new TextDecoder("latin1").decode(await inflate(streamBytes, "deflate"))));
    } catch {
      try {
        chunks.push(extractPdfStrings(new TextDecoder("latin1").decode(await inflate(streamBytes, "deflate-raw"))));
      } catch {
        // Some PDFs use an encoding that cannot be decoded without a full PDF engine.
      }
    }
  }
  return normalizeSpaces(chunks.filter(Boolean).join("\n"));
}

async function extractPdfText(buffer: ArrayBuffer) {
  try {
    const pdf = await getDocument(pdfDocumentOptions(buffer)).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items
        .filter((item): item is typeof item & { str: string; transform: number[] } =>
          "str" in item && typeof item.str === "string" && "transform" in item && Array.isArray(item.transform)
        )
        .map((item) => ({ text: item.str, x: Number(item.transform[4]) || 0, y: Number(item.transform[5]) || 0 }))
        .filter((item) => item.text.trim());
      items.sort((left, right) => right.y - left.y || left.x - right.x);
      const lines: string[] = [];
      let currentY: number | undefined;
      let currentLine = "";
      for (const item of items) {
        if (currentY === undefined || Math.abs(item.y - currentY) > 3) {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = item.text;
          currentY = item.y;
        } else {
          currentLine += `${currentLine.endsWith(" ") || item.text.startsWith(" ") ? "" : " "}${item.text}`;
        }
      }
      if (currentLine.trim()) lines.push(currentLine.trim());
      pages.push(lines.join("\n"));
      page.cleanup();
    }
    const text = normalizeSpaces(pages.join("\n"));
    if (text.length >= 20) return text;
  } catch {
    // Fall back to the lightweight extractor for older or unusual PDFs.
  }
  return extractPdfTextLegacy(buffer);
}

type PdfMatrix = [number, number, number, number, number, number];

interface PdfVectorState {
  matrix: PdfMatrix;
  fill: string;
  stroke: string;
  fillOpacity: number;
  strokeOpacity: number;
  lineWidth: number;
  lineCap: ResumePdfVectorShape["lineCap"];
  lineJoin: ResumePdfVectorShape["lineJoin"];
  miterLimit: number;
  dashArray: number[];
  dashOffset: number;
}

const VECTOR_PAINT_OPERATIONS = new Set<number>([
  OPS.stroke,
  OPS.closeStroke,
  OPS.fill,
  OPS.eoFill,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke
]);

function multiplyMatrices(left: PdfMatrix, right: PdfMatrix): PdfMatrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5]
  ];
}

function transformPoint(matrix: PdfMatrix, x: number, y: number) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5]
  };
}

function finite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function compactNumber(value: number) {
  const rounded = Math.abs(value) < 0.0005 ? 0 : Math.round(value * 1000) / 1000;
  return String(rounded);
}

function buildSvgPath(rawData: unknown, matrix: PdfMatrix) {
  const source = Array.from((rawData || []) as ArrayLike<number>);
  const parts: string[] = [];
  for (let index = 0; index < source.length;) {
    const operation = source[index++];
    if (operation === 0 || operation === 1) {
      const point = transformPoint(matrix, finite(source[index++]), finite(source[index++]));
      parts.push(`${operation === 0 ? "M" : "L"}${compactNumber(point.x)} ${compactNumber(point.y)}`);
    } else if (operation === 2) {
      const first = transformPoint(matrix, finite(source[index++]), finite(source[index++]));
      const second = transformPoint(matrix, finite(source[index++]), finite(source[index++]));
      const end = transformPoint(matrix, finite(source[index++]), finite(source[index++]));
      parts.push(`C${compactNumber(first.x)} ${compactNumber(first.y)} ${compactNumber(second.x)} ${compactNumber(second.y)} ${compactNumber(end.x)} ${compactNumber(end.y)}`);
    } else if (operation === 3) {
      const control = transformPoint(matrix, finite(source[index++]), finite(source[index++]));
      const end = transformPoint(matrix, finite(source[index++]), finite(source[index++]));
      parts.push(`Q${compactNumber(control.x)} ${compactNumber(control.y)} ${compactNumber(end.x)} ${compactNumber(end.y)}`);
    } else if (operation === 4) {
      parts.push("Z");
    } else {
      break;
    }
  }
  return parts.join(" ");
}

function colorComponent(value: unknown) {
  const component = finite(value);
  return Math.max(0, Math.min(255, component <= 1 ? component * 255 : component));
}

function rgbColor(args: unknown[], fallback: string) {
  if (typeof args[0] === "string") return args[0];
  if (args.length < 3) return fallback;
  const values = args.slice(0, 3).map(colorComponent);
  return `#${values.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function grayColor(args: unknown[], fallback: string) {
  if (typeof args[0] === "string") return args[0];
  if (!args.length) return fallback;
  const value = Math.round(colorComponent(args[0])).toString(16).padStart(2, "0");
  return `#${value}${value}${value}`;
}

function cmykColor(args: unknown[], fallback: string) {
  if (typeof args[0] === "string") return args[0];
  if (args.length < 4) return fallback;
  const [c, m, y, k] = args.slice(0, 4).map((value) => Math.max(0, Math.min(1, finite(value))));
  const red = 255 * (1 - c) * (1 - k);
  const green = 255 * (1 - m) * (1 - k);
  const blue = 255 * (1 - y) * (1 - k);
  return rgbColor([red, green, blue], fallback);
}

function cloneVectorState(state: PdfVectorState): PdfVectorState {
  return { ...state, matrix: [...state.matrix] as PdfMatrix, dashArray: [...state.dashArray] };
}

function lineCap(value: unknown): ResumePdfVectorShape["lineCap"] {
  return value === 1 ? "round" : value === 2 ? "square" : "butt";
}

function lineJoin(value: unknown): ResumePdfVectorShape["lineJoin"] {
  return value === 1 ? "round" : value === 2 ? "bevel" : "miter";
}

function applyGState(state: PdfVectorState, raw: unknown) {
  const values = Array.isArray(raw) ? raw : [];
  for (const entry of values) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [key, value] = entry;
    if (key === "ca") state.fillOpacity = finite(value, 1);
    else if (key === "CA") state.strokeOpacity = finite(value, 1);
    else if (key === "LW") state.lineWidth = finite(value, 1);
    else if (key === "LC") state.lineCap = lineCap(value);
    else if (key === "LJ") state.lineJoin = lineJoin(value);
    else if (key === "ML") state.miterLimit = finite(value, 10);
    else if (key === "D" && Array.isArray(value)) {
      state.dashArray = Array.isArray(value[0]) ? value[0].map((item) => finite(item)) : [];
      state.dashOffset = finite(value[1]);
    }
  }
}

function extractVectorShapes(
  operatorList: { fnArray: number[]; argsArray: unknown[][] },
  viewportMatrix: number[]
): ResumePdfVectorShape[] {
  const initialMatrix = viewportMatrix.slice(0, 6).map((value) => finite(value)) as PdfMatrix;
  let state: PdfVectorState = {
    matrix: initialMatrix,
    fill: "#000000",
    stroke: "#000000",
    fillOpacity: 1,
    strokeOpacity: 1,
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    miterLimit: 10,
    dashArray: [],
    dashOffset: 0
  };
  const stack: PdfVectorState[] = [];
  const shapes: ResumePdfVectorShape[] = [];

  operatorList.fnArray.forEach((operation, index) => {
    const args = operatorList.argsArray[index] || [];
    if (operation === OPS.save) {
      stack.push(cloneVectorState(state));
      return;
    }
    if (operation === OPS.restore) {
      state = stack.pop() || state;
      return;
    }
    if (operation === OPS.transform) {
      state.matrix = multiplyMatrices(state.matrix, args.slice(0, 6).map((value) => finite(value)) as PdfMatrix);
      return;
    }
    if (operation === OPS.setFillRGBColor) state.fill = rgbColor(args, state.fill);
    else if (operation === OPS.setStrokeRGBColor) state.stroke = rgbColor(args, state.stroke);
    else if (operation === OPS.setFillGray) state.fill = grayColor(args, state.fill);
    else if (operation === OPS.setStrokeGray) state.stroke = grayColor(args, state.stroke);
    else if (operation === OPS.setFillCMYKColor) state.fill = cmykColor(args, state.fill);
    else if (operation === OPS.setStrokeCMYKColor) state.stroke = cmykColor(args, state.stroke);
    else if (operation === OPS.setFillTransparent) state.fillOpacity = 0;
    else if (operation === OPS.setStrokeTransparent) state.strokeOpacity = 0;
    else if (operation === OPS.setLineWidth) state.lineWidth = finite(args[0], 1);
    else if (operation === OPS.setLineCap) state.lineCap = lineCap(args[0]);
    else if (operation === OPS.setLineJoin) state.lineJoin = lineJoin(args[0]);
    else if (operation === OPS.setMiterLimit) state.miterLimit = finite(args[0], 10);
    else if (operation === OPS.setDash) {
      state.dashArray = Array.isArray(args[0]) ? args[0].map((value) => finite(value)) : [];
      state.dashOffset = finite(args[1]);
    } else if (operation === OPS.setGState) {
      applyGState(state, args[0]);
    } else if (operation === OPS.constructPath) {
      const paintOperation = finite(args[0], -1);
      if (!VECTOR_PAINT_OPERATIONS.has(paintOperation)) return;
      const pathContainer = args[1] as unknown;
      const rawPath = Array.isArray(pathContainer) && pathContainer.length === 1 ? pathContainer[0] : pathContainer;
      const d = buildSvgPath(rawPath, state.matrix);
      if (!d) return;
      const fills = new Set<number>([
        OPS.fill,
        OPS.eoFill,
        OPS.fillStroke,
        OPS.eoFillStroke,
        OPS.closeFillStroke,
        OPS.closeEOFillStroke
      ]);
      const strokes = new Set<number>([
        OPS.stroke,
        OPS.closeStroke,
        OPS.fillStroke,
        OPS.eoFillStroke,
        OPS.closeFillStroke,
        OPS.closeEOFillStroke
      ]);
      const determinant = Math.abs(state.matrix[0] * state.matrix[3] - state.matrix[1] * state.matrix[2]);
      const strokeScale = determinant > 0 ? Math.sqrt(determinant) : 1;
      shapes.push({
        d,
        fill: fills.has(paintOperation) ? state.fill : "none",
        fillRule: [OPS.eoFill, OPS.eoFillStroke, OPS.closeEOFillStroke].includes(paintOperation) ? "evenodd" : "nonzero",
        fillOpacity: state.fillOpacity,
        stroke: strokes.has(paintOperation) ? state.stroke : "none",
        strokeOpacity: state.strokeOpacity,
        strokeWidth: state.lineWidth * strokeScale,
        lineCap: state.lineCap,
        lineJoin: state.lineJoin,
        miterLimit: state.miterLimit,
        dashArray: state.dashArray.map((value) => value * strokeScale),
        dashOffset: state.dashOffset * strokeScale
      });
    }
  });
  return shapes;
}

function createPdfCanvas(viewport: { width: number; height: number }) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器无法创建 PDF 预览画布");
  return { canvas, context };
}

function inferPdfFontFamily(name: string, fallback = "sans-serif") {
  const normalized = name.replace(/^[A-Z]{6}\+/, "").replace(/[-_]/g, " ");
  if (/microsoft\s*yahei/i.test(normalized)) return "Microsoft YaHei";
  if (/simsun|宋体/i.test(normalized)) return "SimSun";
  if (/simhei|黑体/i.test(normalized)) return "SimHei";
  if (/kaiti|楷体/i.test(normalized)) return "KaiTi";
  if (/fangsong|仿宋/i.test(normalized)) return "FangSong";
  if (/times\s*new\s*roman/i.test(normalized)) return "Times New Roman";
  if (/arial/i.test(normalized)) return "Arial";
  if (/calibri/i.test(normalized)) return "Calibri";
  if (/wingdings/i.test(normalized)) return "Wingdings";
  if (/symbol/i.test(normalized)) return "Symbol";
  return fallback || "sans-serif";
}

function inferPdfFontWeight(name: string): 400 | 700 {
  return /bold|black|heavy|semibold|demi|simhei|黑体/i.test(name) ? 700 : 400;
}

function inferPdfFontStyle(name: string): "normal" | "italic" {
  return /italic|oblique/i.test(name) ? "italic" : "normal";
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

interface SampledColor {
  css: string;
  red: number;
  green: number;
  blue: number;
  confidence: number;
}

function colorCss(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function sampleItemBackground(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  item: Pick<ResumePdfTextItem, "x" | "top" | "width" | "height">,
  scale: number
): SampledColor {
  const padding = Math.max(3, Math.ceil(scale * 2));
  const left = Math.max(0, Math.floor(item.x * scale));
  const top = Math.max(0, Math.floor(item.top * scale));
  const right = Math.min(canvasWidth - 1, Math.ceil((item.x + item.width) * scale));
  const bottom = Math.min(canvasHeight - 1, Math.ceil((item.top + item.height) * scale));
  const outerLeft = Math.max(0, left - padding);
  const outerTop = Math.max(0, top - padding);
  const outerRight = Math.min(canvasWidth - 1, right + padding);
  const outerBottom = Math.min(canvasHeight - 1, bottom + padding);
  const buckets = new Map<number, { count: number; red: number; green: number; blue: number }>();
  const add = (x: number, y: number) => {
    const offset = (y * canvasWidth + x) * 4;
    if (pixels[offset + 3] < 220) return;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const key = (red >> 3) * 1024 + (green >> 3) * 32 + (blue >> 3);
    const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count += 1;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    buckets.set(key, bucket);
  };
  for (let x = outerLeft; x <= outerRight; x += 1) {
    for (let y = outerTop; y < top; y += 1) add(x, y);
    for (let y = bottom + 1; y <= outerBottom; y += 1) add(x, y);
  }
  for (let y = top; y <= bottom; y += 1) {
    for (let x = outerLeft; x < left; x += 1) add(x, y);
    for (let x = right + 1; x <= outerRight; x += 1) add(x, y);
  }
  const total = [...buckets.values()].reduce((sum, bucket) => sum + bucket.count, 0);
  const best = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!best?.count) return { css: "#ffffff", red: 255, green: 255, blue: 255, confidence: 0 };
  const red = best.red / best.count;
  const green = best.green / best.count;
  const blue = best.blue / best.count;
  return {
    css: colorCss(red, green, blue),
    red,
    green,
    blue,
    confidence: total ? best.count / total : 0
  };
}

function detectTextColor(
  layerPixels: Uint8ClampedArray,
  background: Pick<SampledColor, "red" | "green" | "blue">,
  canvasWidth: number,
  canvasHeight: number,
  item: Pick<ResumePdfTextItem, "x" | "top" | "width" | "height">,
  scale: number
) {
  const left = Math.max(0, Math.floor((item.x - 2) * scale));
  const top = Math.max(0, Math.floor((item.top - 2) * scale));
  const right = Math.min(canvasWidth, Math.ceil((item.x + item.width + 2) * scale));
  const bottom = Math.min(canvasHeight, Math.ceil((item.top + item.height + 2) * scale));
  const buckets = new Map<number, { score: number; red: number; green: number; blue: number; weight: number }>();
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * canvasWidth + x) * 4;
      const alpha = layerPixels[offset + 3];
      if (alpha < 32) continue;
      const red = layerPixels[offset];
      const green = layerPixels[offset + 1];
      const blue = layerPixels[offset + 2];
      const contrast = Math.hypot(red - background.red, green - background.green, blue - background.blue);
      if (contrast < 8) continue;
      const key = (red >> 4) * 256 + (green >> 4) * 16 + (blue >> 4);
      const bucket = buckets.get(key) || { score: 0, red: 0, green: 0, blue: 0, weight: 0 };
      bucket.score += alpha * contrast;
      bucket.red += red * alpha;
      bucket.green += green * alpha;
      bucket.blue += blue * alpha;
      bucket.weight += alpha;
      buckets.set(key, bucket);
    }
  }
  const best = [...buckets.values()].sort((leftBucket, rightBucket) => rightBucket.score - leftBucket.score)[0];
  if (!best?.weight) return "#111111";
  const values = [best.red, best.green, best.blue].map((value) => Math.round(value / best.weight));
  return colorCss(values[0], values[1], values[2]);
}

/**
 * Extract the immutable page render plus a coordinate-aware text layer.
 * The complete page image remains the visual source of truth. Editing only
 * repaints the individual text runs that changed, so a parser miss can never
 * erase content from the original PDF.
 */
export async function extractResumePdfLayout(
  buffer: ArrayBuffer,
  options: ResumePdfLayoutOptions = {}
): Promise<ResumePdfLayout> {
  options.onProgress?.("loading-document");
  const pdf = await getDocument(pdfDocumentOptions(buffer)).promise;
  options.onProgress?.("document-ready", undefined, pdf.numPages);
  const pages: ResumePdfPageLayout[] = [];
  const fonts = new Map<string, ResumePdfFont>();
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      options.onProgress?.("loading-page", pageNumber, pdf.numPages);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const renderViewport = page.getViewport({ scale: 2 });
      options.onProgress?.("extracting-text", pageNumber, pdf.numPages);
      const content = await page.getTextContent();
      options.onProgress?.("extracting-operators", pageNumber, pdf.numPages);
      const operatorList = await page.getOperatorList() as unknown as { fnArray: number[]; argsArray: unknown[][] };
      const full = createPdfCanvas(renderViewport);
      options.onProgress?.("rendering-reference", pageNumber, pdf.numPages);
      await page.render({ canvasContext: full.context, canvas: full.canvas, viewport: renderViewport }).promise;
      const imageDataUrl = full.canvas.toDataURL("image/png");
      const fullPixels = new Uint8ClampedArray(
        full.context.getImageData(0, 0, full.canvas.width, full.canvas.height).data
      );
      options.onProgress?.("building-text-layer", pageNumber, pdf.numPages);
      const items = content.items
        .filter((item): item is typeof item & {
          str: string;
          transform: number[];
          width?: number;
          height?: number;
          fontName?: string;
          dir?: string;
        } =>
          "str" in item && typeof item.str === "string" && "transform" in item && Array.isArray(item.transform)
        )
        .filter((item) => item.str.trim())
        .map((item, itemIndex) => {
          const transform = item.transform.slice(0, 6).map((value) => finite(value)) as PdfMatrix;
          const textTransform = multiplyMatrices(viewport.transform.slice(0, 6) as PdfMatrix, transform);
          const fontHeight = Math.max(4, Math.hypot(textTransform[2], textTransform[3]));
          const fontName = String(item.fontName || "");
          const style = content.styles[fontName];
          let pdfFont: {
            name?: string;
            bold?: boolean;
            black?: boolean;
            italic?: boolean;
            fallbackName?: string;
            mimetype?: string;
            data?: Uint8Array;
          } | undefined;
          try {
            pdfFont = page.commonObjs.get(fontName) as typeof pdfFont;
          } catch {
            pdfFont = undefined;
          }
          const rawFontName = pdfFont?.name || fontName;
          const fallbackFontFamily = inferPdfFontFamily(rawFontName, pdfFont?.fallbackName || style?.fontFamily);
          const fontWeight = pdfFont?.bold || pdfFont?.black || inferPdfFontWeight(rawFontName) === 700 ? 700 as const : 400 as const;
          const fontStyle = pdfFont?.italic || inferPdfFontStyle(rawFontName) === "italic" ? "italic" as const : "normal" as const;
          const fontFamily = `OfferFlowPdf-${fontName.replace(/[^a-zA-Z0-9_-]/g, "-") || `page-${pageNumber}-${itemIndex}`}`;
          if (pdfFont?.data?.length && !fonts.has(fontName)) {
            fonts.set(fontName, {
              id: fontName,
              family: fontFamily,
              fallbackFamily: fallbackFontFamily,
              dataBase64: bytesToBase64(pdfFont.data),
              mimeType: pdfFont.mimetype || "font/opentype",
              fontWeight,
              fontStyle,
              isSubset: /^[A-Z]{6}\+/.test(rawFontName)
            });
          }
          const angle = Math.atan2(textTransform[1], textTransform[0]);
          const ascentRatio = style?.ascent || (style?.descent ? 1 + style.descent : 0.8);
          const fontAscent = fontHeight * ascentRatio;
          const x = angle === 0
            ? textTransform[4]
            : textTransform[4] + fontAscent * Math.sin(angle);
          const top = angle === 0
            ? textTransform[5] - fontAscent
            : textTransform[5] - fontAscent * Math.cos(angle);
          const result: ResumePdfTextItem = {
            id: `pdf-${pageNumber}-${itemIndex}`,
            text: item.str,
            x,
            top: Math.max(0, top),
            width: Math.max(1, finite(item.width, item.str.length * fontHeight * 0.55)),
            height: fontHeight,
            fontSize: fontHeight,
            fontFamily,
            fontWeight,
            fontStyle,
            fontId: fontName,
            fallbackFontFamily,
            color: "#111111",
            backgroundColor: "#ffffff",
            backgroundConfidence: 0,
            rotation: angle * 180 / Math.PI,
            direction: item.dir || "ltr"
          };
          const background = sampleItemBackground(
            fullPixels,
            full.canvas.width,
            full.canvas.height,
            result,
            renderViewport.scale
          );
          result.backgroundColor = background.css;
          result.backgroundConfidence = background.confidence;
          result.color = detectTextColor(
            fullPixels,
            background,
            full.canvas.width,
            full.canvas.height,
            result,
            renderViewport.scale
          );
          return result;
        });
      options.onProgress?.("building-vector-layer", pageNumber, pdf.numPages);
      pages.push({
        page: pageNumber,
        widthPt: viewport.width,
        heightPt: viewport.height,
        imageDataUrl,
        vectorShapes: extractVectorShapes(operatorList, viewport.transform),
        items
      });
      options.onProgress?.("page-ready", pageNumber, pdf.numPages);
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  options.onProgress?.("complete", pdf.numPages, pdf.numPages);
  return {
    pages,
    fonts: [...fonts.values()],
    characterCount: pages.reduce(
      (total, page) => total + page.items.reduce((pageTotal, item) => pageTotal + [...item.text.trim()].length, 0),
      0
    )
  };
}

interface ResumeImageCandidate {
  asset: ResumeAsset;
  portraitScore: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function trackedImageBoxes(rawCoordinates: ArrayLike<number> | null | undefined) {
  const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
  if (!rawCoordinates) return boxes;
  for (let index = 0; index + 5 < rawCoordinates.length; index += 6) {
    const first = { x: finite(rawCoordinates[index]), y: finite(rawCoordinates[index + 1]) };
    const second = { x: finite(rawCoordinates[index + 2]), y: finite(rawCoordinates[index + 3]) };
    const third = { x: finite(rawCoordinates[index + 4]), y: finite(rawCoordinates[index + 5]) };
    const fourth = {
      x: second.x + third.x - first.x,
      y: second.y + third.y - first.y
    };
    const xs = [first.x, second.x, third.x, fourth.x];
    const ys = [first.y, second.y, third.y, fourth.y];
    const left = clamp01(Math.min(...xs));
    const top = clamp01(Math.min(...ys));
    const right = clamp01(Math.max(...xs));
    const bottom = clamp01(Math.max(...ys));
    if (right > left && bottom > top) boxes.push({ x: left, y: top, width: right - left, height: bottom - top });
  }
  return boxes;
}

function cropCanvas(source: HTMLCanvasElement, box: { x: number; y: number; width: number; height: number }) {
  const sourceX = Math.max(0, Math.floor(box.x * source.width));
  const sourceY = Math.max(0, Math.floor(box.y * source.height));
  const width = Math.max(1, Math.min(source.width - sourceX, Math.ceil(box.width * source.width)));
  const height = Math.max(1, Math.min(source.height - sourceY, Math.ceil(box.height * source.height)));
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器无法提取 PDF 图片");
  context.drawImage(source, sourceX, sourceY, width, height, 0, 0, width, height);
  return output;
}

function portraitPixelScore(canvas: HTMLCanvasElement): number {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return 0;
  const scale = Math.min(1, 96 / Math.max(canvas.width, canvas.height));
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const sample = document.createElement("canvas");
  sample.width = width;
  sample.height = height;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return 0;
  sampleContext.drawImage(canvas, 0, 0, width, height);
  const pixels = sampleContext.getImageData(0, 0, width, height).data;
  let skinPixels = 0;
  const colorBuckets = new Set<number>();
  for (let index = 0; index < pixels.length; index += 16) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const alpha = pixels[index + 3];
    if (alpha < 64) continue;
    colorBuckets.add((red >> 5) * 64 + (green >> 5) * 8 + (blue >> 5));
    if (red > 90 && green > 35 && blue > 20 && red > green && red > blue && Math.max(red, green, blue) - Math.min(red, green, blue) > 15) {
      skinPixels += 1;
    }
  }
  const samples = Math.max(1, Math.ceil(pixels.length / 16));
  const skinRatio = skinPixels / samples;
  const skinScore = skinRatio >= 0.015 && skinRatio <= 0.55 ? Math.min(1, skinRatio / 0.12) : 0;
  const detailScore = clamp01(colorBuckets.size / 90);
  return skinScore * 0.72 + detailScore * 0.28;
}

function candidatePortraitScore(
  box: { x: number; y: number; width: number; height: number },
  pageNumber: number,
  pixelScore: number
) {
  const aspect = box.width / box.height;
  const aspectScore = clamp01(1 - Math.abs(aspect - 0.78) / 0.62);
  const topScore = clamp01(1 - Math.max(0, box.y - 0.08) / 0.62);
  const area = box.width * box.height;
  const sizeScore = clamp01(area / 0.025) * clamp01((0.16 - area) / 0.12);
  return clamp01(aspectScore * 0.34 + topScore * 0.2 + sizeScore * 0.16 + pixelScore * 0.25 + (pageNumber === 1 ? 0.05 : 0));
}

/**
 * Extracts the actual raster images painted by PDF.js. Cropping the rendered
 * source at PDF image coordinates preserves masks, clipping and colour exactly
 * as the candidate saw them, while avoiding a fragile dependency on PDF image
 * object encodings.
 */
export async function extractResumePdfAssets(buffer: ArrayBuffer): Promise<ResumePdfAssetExtraction> {
  const pdf = await getDocument(pdfDocumentOptions(buffer)).promise;
  const candidates: ResumeImageCandidate[] = [];
  const warnings: string[] = [];
  try {
    const pageLimit = Math.min(pdf.numPages, 2);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const renderViewport = page.getViewport({ scale: 2.5 });
      const rendered = createPdfCanvas(renderViewport);
      await page.render({
        canvasContext: rendered.context,
        canvas: rendered.canvas,
        viewport: renderViewport,
        recordImages: true
      }).promise;
      const boxes = trackedImageBoxes(page.imageCoordinates as ArrayLike<number> | null);
      boxes.forEach((box, imageIndex) => {
        const pixelWidth = box.width * rendered.canvas.width;
        const pixelHeight = box.height * rendered.canvas.height;
        const area = box.width * box.height;
        if (pixelWidth < 36 || pixelHeight < 36 || area < 0.0008 || area > 0.22 || box.width > 0.62 || box.height > 0.62) return;
        const cropped = cropCanvas(rendered.canvas, box);
        const pixelScore = portraitPixelScore(cropped);
        const portraitScore = candidatePortraitScore(box, pageNumber, pixelScore);
        const assetId = `pdf-image-${pageNumber}-${imageIndex}`;
        candidates.push({
          portraitScore,
          asset: {
            id: assetId,
            kind: "image",
            dataUrl: cropped.toDataURL("image/png"),
            mimeType: "image/png",
            width: cropped.width,
            height: cropped.height,
            source: "pdf",
            sourcePage: pageNumber,
            sourceBox: {
              x: box.x * viewport.width,
              y: box.y * viewport.height,
              width: box.width * viewport.width,
              height: box.height * viewport.height
            },
            confidence: Math.round(portraitScore * 100) / 100
          }
        });
      });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  const unique = candidates
    .sort((left, right) => right.portraitScore - left.portraitScore)
    .filter((candidate, index, all) => all.findIndex((item) => (
      item.asset.width === candidate.asset.width
      && item.asset.height === candidate.asset.height
      && item.asset.dataUrl.slice(-160) === candidate.asset.dataUrl.slice(-160)
    )) === index)
    .slice(0, 8);
  const portrait = unique.find((candidate) => {
    const aspect = candidate.asset.width / candidate.asset.height;
    return candidate.portraitScore >= 0.46 && aspect >= 0.48 && aspect <= 1.28;
  });
  if (portrait) portrait.asset.kind = "portrait";
  if (!unique.length) warnings.push("未在 PDF 中发现可迁移的独立图片；如有证件照，可在简历工作台手动上传");
  else if (!portrait) warnings.push("已保留 PDF 图片，但无法可靠判断哪一张是证件照，请在简历工作台选择");
  return {
    assets: unique.map((candidate) => candidate.asset),
    portraitAssetId: portrait?.asset.id,
    warnings
  };
}

async function extractText(file: File) {
  const extension = fileExtension(file.name);
  if (["txt", "md", "html", "htm"].includes(extension)) {
    const content = await file.text();
    return normalizeSpaces(extension === "html" || extension === "htm" ? content.replace(/<[^>]+>/g, "\n") : content);
  }
  const buffer = await file.arrayBuffer();
  if (extension === "pdf") return extractPdfText(buffer);
  if (extension === "docx") return extractDocxText(buffer);
  throw new Error("暂时支持 PDF、DOCX、TXT 和 HTML 简历；旧版 DOC 请先另存为 DOCX");
}

function linesOf(text: string) {
  return text
    .split(/\r?\n|[|｜]/)
    .map((line) => line.replace(/^[\s·•▪▫]+/, "").trim())
    .filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labeledValue(text: string, labels: string[]) {
  const labelPattern = labels.map(escapeRegExp).join("|");
  const match = text.match(new RegExp(`(?:${labelPattern})\\s*(?:[:：]\\s*)?([^\\n|｜]{1,100})`, "i"));
  return match?.[1]?.trim().replace(/^[：:：\-]+\s*/, "") || "";
}

function labeledValueInBlock(text: string, labels: string[], boundaryLabels: string[]) {
  const labelPattern = labels.map(escapeRegExp).join("|");
  const boundaryPattern = boundaryLabels.map(escapeRegExp).join("|");
  const match = text.match(new RegExp(
    `(?:${labelPattern})\\s*(?:[:：]\\s*)?([^\\n|｜]+?)(?=\\s*(?:${boundaryPattern})\\s*[:：]|$)`,
    "i"
  ));
  return match?.[1]?.trim().replace(/^[：:：\-]+\s*/, "") || "";
}

function normalizedDate(value: string) {
  const source = value.replace(/[．。／]/g, ".").replace(/\s+/g, " ").trim();
  const match = source.match(/((?:19|20)\d{2})\s*(?:年|[./-])?\s*(\d{1,2})?\s*月?/);
  if (!match) return "";
  const month = Number(match[2] || 1);
  if (month < 1 || month > 12) return "";
  return `${match[1]}-${String(month).padStart(2, "0")}`;
}

function dateRange(text: string) {
  const source = text.replace(/[．。／]/g, ".").replace(/\s+/g, " ").trim();
  const year = "(?:19|20)\\d{2}";
  const separator = "(?:至|到|[-~～—–−])";
  const currentMonth = new Date().toISOString().slice(0, 7);

  const fullRange = source.match(new RegExp(
    `(${year})\\s*(?:年|[./-])\\s*(\\d{1,2})\\s*月?\\s*${separator}\\s*(${year})\\s*(?:年|[./-])\\s*(\\d{1,2})\\s*月?`,
    "i"
  ));
  if (fullRange) return {
    startDate: normalizedDate(`${fullRange[1]}-${fullRange[2]}`),
    endDate: normalizedDate(`${fullRange[3]}-${fullRange[4]}`)
  };

  // Covers the common resume format: 2025年6月-9月 / 2025.06-09.
  const sameYearRange = source.match(new RegExp(
    `(${year})\\s*(?:年|[./-])\\s*(\\d{1,2})\\s*月?\\s*${separator}\\s*(\\d{1,2})\\s*月?`,
    "i"
  ));
  if (sameYearRange) return {
    startDate: normalizedDate(`${sameYearRange[1]}-${sameYearRange[2]}`),
    endDate: normalizedDate(`${sameYearRange[1]}-${sameYearRange[3]}`)
  };

  const ongoing = source.match(new RegExp(
    `(${year})\\s*(?:年|[./-])\\s*(\\d{1,2})\\s*月?\\s*${separator}\\s*(?:至今|现在|在职|present|current)`,
    "i"
  ));
  if (ongoing) return {
    startDate: normalizedDate(`${ongoing[1]}-${ongoing[2]}`),
    endDate: currentMonth
  };

  const single = source.match(new RegExp(`(${year})\\s*(?:年|[./-])\\s*(\\d{1,2})\\s*月?`, "i"));
  return single
    ? { startDate: normalizedDate(`${single[1]}-${single[2]}`), endDate: "" }
    : { startDate: "", endDate: "" };
}

function stripDateExpressions(value: string) {
  const year = "(?:19|20)\\d{2}";
  const separator = "(?:至|到|[-~～—–−])";
  return value
    .replace(new RegExp(`${year}\\s*(?:年|[./-])\\s*\\d{1,2}\\s*月?\\s*${separator}\\s*(?:至今|现在|在职|present|current)`, "gi"), "")
    .replace(new RegExp(`${year}\\s*(?:年|[./-])\\s*\\d{1,2}\\s*月?\\s*${separator}\\s*(?:(?:${year})\\s*(?:年|[./-])\\s*)?\\d{1,2}\\s*月?`, "gi"), "")
    .replace(/\s{2,}/g, " ")
    .replace(/[·|,，、-]\s*$/g, "")
    .trim();
}

function cleanEducationSchool(value: string) {
  return value
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/^(?:学校|院校|毕业院校)\s*[:：]?\s*/i, "")
    .trim();
}

function cleanEducationMajor(value: string) {
  return value
    .replace(/^(?:专业|主修|研究方向)\s*[:：]?\s*/i, "")
    .replace(/^[：:：\-、，,\s]+/, "")
    .trim();
}

function parseEducation(source: string[]) {
  const sourceText = source.join(" ");
  const boundaryLabels = ["学校", "院校", "毕业院校", "专业", "主修", "研究方向", "学历", "学位", "GPA", "成绩", "排名"];
  const candidate = source.find((line) =>
    /(?:大学|学院|学校)/.test(line) &&
    (/(?:19|20)\d{2}/.test(line) || /(?:博士|硕士|研究生|本科|专科|大专)/.test(line))
  ) || source.find((line) => /(?:大学|学院|学校)/.test(line));
  const educationText = candidate || sourceText;
  const degree = educationText.match(/博士|硕士|研究生|本科|专科|大专/)?.[0] || "";
  const explicitSchool = labeledValueInBlock(sourceText, ["学校", "院校", "毕业院校"], boundaryLabels);
  const explicitMajor = labeledValueInBlock(sourceText, ["专业", "主修", "研究方向"], boundaryLabels);
  let school = cleanEducationSchool(explicitSchool);
  let major = cleanEducationMajor(explicitMajor);

  if (candidate) {
    const withoutDate = stripDateExpressions(candidate).replace(/^\s*[-—–至到]+\s*/, "").trim();
    const degreeLead = withoutDate.match(/(?:博士|硕士|研究生|本科|专科|大专)\s*[:：]\s*(.+)$/);
    const payload = (degreeLead?.[1] || withoutDate).trim();
    const schoolMatch = payload.match(/^(.+?(?:大学|学院|学校))(?:\s*[（(][^）)]*[）)])?\s*(.+)$/);
    if (schoolMatch) {
      school = cleanEducationSchool(schoolMatch[1]);
      major = cleanEducationMajor(schoolMatch[2]);
    } else if (!school) {
      const institution = payload.match(/^(.+?(?:大学|学院|学校))/);
      if (institution) {
        school = cleanEducationSchool(institution[1]);
        if (!major) major = cleanEducationMajor(payload.slice(institution[0].length));
      }
    }
  }

  return { school, major, degree };
}

/** Repair common PDF layouts that put the whole education row in the school field. */
export function normalizeEducationEntries(education: ProfileEducation[]): ProfileEducation[] {
  return education.map((item) => {
    if (!item.school.trim()) return item;
    const parsed = parseEducation([item.school]);
    if (!parsed.school || !parsed.major) return item;
    return {
      ...item,
      school: parsed.school,
      major: parsed.major,
      degree: parsed.degree || item.degree
    };
  });
}

function findHeadingBlock(lines: string[], headings: RegExp) {
  const start = lines.findIndex((line) => headings.test(line.trim()));
  if (start < 0) return [];
  const nextHeading = /^(?:教育经历|教育背景|学历|工作经历|实习经历|职业经历|项目经历|项目经验|项目简历|个人项目|项目实践|项目成果|项目案例|校园经历|获奖情况|获奖与证书|技能特长|专业技能|证书资格|自我介绍|个人优势|职业规划|联系方式|基本信息)\s*[:：]?$/i;
  const block: string[] = [];
  for (let index = start + 1; index < Math.min(lines.length, start + 25); index += 1) {
    if (index > start + 1 && nextHeading.test(lines[index])) break;
    block.push(lines[index]);
  }
  return block;
}

function parseExperience(lines: string[]): ProfileExperience[] {
  const block = findHeadingBlock(lines, /(?:实习|工作|职业)经历/i);
  const source = block.length ? block : lines;
  const organization = source.find((line) => /(?:有限公司|有限责任公司|公司|科技|集团|银行|研究院|大学|学院|组织)/.test(line)) || "";
  const title = source.find((line) => /(?:实习生|工程师|经理|助理|专员|运营|产品|开发|设计|分析师|教师|岗位)/.test(line) && line !== organization) || "";
  const dateLine = [title, organization, ...source].find((line) => /(?:19|20)\d{2}/.test(line)) || source.join(" ");
  const dates = dateRange(dateLine);
  const cleanTitle = stripDateExpressions(title);
  const description = source
    .filter((line) => line !== organization && line !== title && !/(?:19|20)\d{2}/.test(line))
    .slice(0, 5)
    .join("；");
  if (!organization && !title && !description) return [];
  return [{ id: id("experience"), organization, title: cleanTitle || title, ...dates, description }];
}

function parseProjects(lines: string[]): ProfileProject[] {
  const block = findHeadingBlock(lines, /^(?:项目(?:经历|经验|简历|实践|成果|案例)?|个人项目)\s*[:：]?$/i);
  let source = block;

  // Some PDF text layers merge the section title with the first project, for example
  // “项目简历：校园二手交易平台”. Keep that first line as data instead of dropping it.
  if (!source.length) {
    const inlineIndex = lines.findIndex((line) => /^(?:项目名称|项目(?:经历|经验|简历|实践|成果|案例)?)\s*[:：]/i.test(line));
    if (inlineIndex >= 0) source = lines.slice(inlineIndex, Math.min(lines.length, inlineIndex + 18));
  }
  if (!source.length) return [];

  const entries: string[][] = [];
  let current: string[] = [];
  let currentHasDate = false;
  const descriptionStart = /^(?:负责|通过|基于|针对|完成|参与|协助|搭建|设计|开发|实现|优化|提升|分析|调研|制定|维护|使用|结果|成果|项目描述|工作内容|主要贡献)/i;
  const looksLikeProjectTitle = (line: string) =>
    line.length <= 48 &&
    !/(?:19|20)\d{2}/.test(line) &&
    !/[:：]/.test(line) &&
    !descriptionStart.test(line) &&
    !/^(?:负责人|角色|担任|技术栈|工具|周期|时间)/i.test(line);

  const flush = () => {
    if (current.length) entries.push(current);
    current = [];
    currentHasDate = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const rawLine = source[index];
    const line = rawLine.trim();
    if (!line) continue;
    const lineHasDate = /(?:19|20)\d{2}/.test(line);
    // A short line followed by a date is usually the next project title. This
    // avoids mistaking ordinary role/description lines for new projects.
    const nextLineHasDate = /(?:19|20)\d{2}/.test(source[index + 1] || "");
    if (current.length && currentHasDate && looksLikeProjectTitle(line) && nextLineHasDate) flush();
    // If the extractor puts the next date on its own line after the previous description,
    // start a new entry while retaining the date for that entry.
    if (current.length && currentHasDate && lineHasDate && !looksLikeProjectTitle(line)) flush();
    current.push(line);
    currentHasDate ||= lineHasDate;
  }
  flush();

  return entries
    .map((entry) => {
      const dateLine = entry.find((line) => /(?:19|20)\d{2}/.test(line)) || entry.join(" ");
      const dates = dateRange(dateLine);
      const role = entry.find((line) => /^(?:负责人|角色|担任|技术栈|工具)\s*[:：]/i.test(line)) ||
        entry.find((line) => /(?:负责人|产品|开发|设计|研究|运营|角色)/.test(line) && !/(?:19|20)\d{2}/.test(line)) || "";
      const name = entry.find((line) =>
        !/(?:19|20)\d{2}/.test(line) &&
        line !== role &&
        !descriptionStart.test(line) &&
        !/^(?:负责人|角色|担任|技术栈|工具|周期|时间)/i.test(line)
      ) || "";
      const description = entry
        .filter((line) => line !== name && line !== role && !/(?:19|20)\d{2}/.test(line))
        .slice(0, 8)
        .join("；");
      const cleanName = stripDateExpressions(name).replace(/^(?:项目名称|项目(?:经历|经验|简历|实践|成果|案例)?)\s*[:：]\s*/i, "");
      return { id: id("project"), name: cleanName, role: stripDateExpressions(role), ...dates, description };
    })
    .filter((project) => project.name || project.description || project.startDate || project.endDate);
}

export async function parseResumeFile(file: File): Promise<ResumeParseResult> {
  const text = await extractText(file);
  if (text.length < 20) throw new Error("没有从文件中提取到足够文字；扫描件请先接入 OCR 解析");
  const structured = parseResumeStructuredText(text, file.name);
  const profile: PersonalProfile = {
    ...structured.profile,
    extraFields: {
      ...(structured.profile.extraFields || {}),
      resumeSourceName: file.name,
      parseMode: "layout-aware-text-v2"
    }
  };

  const extractedCount = [
    profile.fullName,
    profile.phone,
    profile.email,
    profile.currentCity,
    profile.targetRole,
    profile.graduationDate,
    profile.address,
    profile.portfolioUrl,
    profile.githubUrl,
    ...profile.education.flatMap((item) => Object.values(item)),
    ...profile.experiences.flatMap((item) => Object.values(item)),
    ...profile.projects.flatMap((item) => Object.values(item)),
    ...profile.campusExperiences.flatMap((item) => Object.values(item)),
    ...profile.awards.flatMap((item) => Object.values(item))
  ].filter((value) => typeof value === "string" && value.trim()).length;
  const warnings = [...structured.diagnostics.warnings];
  if (!profile.phone) warnings.push("未识别到手机号");
  if (!profile.email) warnings.push("未识别到邮箱");
  if (!profile.education.length) warnings.push("未识别到教育经历");
  return {
    profile,
    extractedCount,
    warnings: [...new Set(warnings)],
    textLength: structured.diagnostics.normalizedText.length,
    diagnostics: structured.diagnostics
  };
}

export function mergeParsedProfile(current: PersonalProfile, parsed: PersonalProfile): PersonalProfile {
  const next: PersonalProfile = { ...current };
  const scalarKeys: Array<keyof PersonalProfile> = [
    "fullName", "gender", "phone", "email", "birthDate", "graduationDate", "currentCity", "nativePlace",
    "height", "weight", "recruitmentType", "graduateStatus", "address", "targetRole", "targetCities",
    "earliestStartDate", "portfolioUrl", "githubUrl", "selfIntroduction", "strengths", "careerPlan"
  ];
  for (const key of scalarKeys) {
    const value = parsed[key];
    if (typeof value === "string" && value.trim()) next[key] = value as never;
  }
  if (parsed.education.length) next.education = parsed.education;
  if (parsed.experiences.length) next.experiences = parsed.experiences;
  if (parsed.projects.length) next.projects = parsed.projects;
  if (parsed.campusExperiences.length) next.campusExperiences = parsed.campusExperiences;
  if (parsed.awards.length) next.awards = parsed.awards;
  next.extraFields = { ...current.extraFields, ...parsed.extraFields };
  return next;
}
