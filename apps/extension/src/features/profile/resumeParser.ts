import type {
  PersonalProfile,
  ProfileEducation,
  ProfileExperience,
  ProfileProject
} from "@/shared/types";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export interface ResumeParseResult {
  profile: PersonalProfile;
  extractedCount: number;
  warnings: string[];
  textLength: number;
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
    const pdf = await getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false
    }).promise;
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

  const lines = linesOf(text);
  const phone = text.match(/(?:\+?86[ -]?)?1[3-9]\d{9}/)?.[0]?.replace(/\s|-/g, "") || "";
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const educationBlock = findHeadingBlock(lines, /(?:教育经历|教育背景|学历)/i);
  const educationSource = educationBlock.length ? educationBlock : lines;
  const { school, major, degree } = parseEducation(educationSource);
  const educationDates = dateRange(educationSource.join(" "));
  const name = labeledValue(text, ["姓名", "name"]) || lines.find((line) => /^[\u4e00-\u9fa5]{2,4}$/.test(line)) || "";
  const gender = labeledValue(text, ["性别", "gender"]);
  const city = labeledValue(text, ["现居城市", "所在地", "居住地"]);
  const nativePlace = labeledValue(text, ["籍贯"]);
  const address = labeledValue(text, ["联系地址", "地址"]);
  const targetRole = labeledValue(text, ["求职意向", "目标岗位", "应聘职位", "期望职位"]);
  const targetCities = labeledValue(text, ["意向城市", "期望城市"]);
  const portfolioUrl = text.match(/https?:\/\/[^\s]+(?:framer|notion|portfolio)[^\s]*/i)?.[0] || "";
  const githubUrl = text.match(/https?:\/\/github\.com\/[^\s]+/i)?.[0] || "";
  const birthDate = normalizedDate(labeledValue(text, ["出生日期", "出生年月"]));
  const graduationDate = normalizedDate(labeledValue(text, ["毕业时间", "毕业日期"])) || educationDates.endDate;
  const education: ProfileEducation[] = school || major || degree
    ? [{ id: id("education"), school, major, degree, startDate: educationDates.startDate, endDate: educationDates.endDate, gpa: labeledValue(text, ["GPA", "成绩", "排名"]) }]
    : [];
  const experiences = parseExperience(lines);
  const projects = parseProjects(lines);

  const profile: PersonalProfile = {
    fullName: name,
    gender,
    phone,
    email,
    birthDate,
    graduationDate,
    currentCity: city,
    nativePlace,
    height: labeledValue(text, ["身高"]),
    weight: labeledValue(text, ["体重"]),
    recruitmentType: labeledValue(text, ["是否统招", "统招"]),
    graduateStatus: labeledValue(text, ["应届", "毕业状态"]),
    address,
    targetRole,
    targetCities,
    earliestStartDate: labeledValue(text, ["最早到岗", "可到岗时间"]),
    portfolioUrl,
    githubUrl,
    education,
    experiences,
    projects,
    campusExperiences: [],
    awards: [],
    selfIntroduction: labeledValue(text, ["自我介绍", "个人简介", "个人总结"]),
    strengths: labeledValue(text, ["个人优势", "自我评价", "核心优势"]),
    careerPlan: labeledValue(text, ["职业规划", "发展规划"]),
    extraFields: { resumeSourceName: file.name, parseMode: "local-text" }
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
    ...education.flatMap((item) => Object.values(item)),
    ...experiences.flatMap((item) => Object.values(item)),
    ...projects.flatMap((item) => Object.values(item))
  ].filter((value) => typeof value === "string" && value.trim()).length;
  const warnings: string[] = [];
  if (!phone) warnings.push("未识别到手机号");
  if (!email) warnings.push("未识别到邮箱");
  if (!education.length) warnings.push("未识别到教育经历");
  if (fileExtension(file.name) === "pdf") warnings.push("PDF 已使用结构化文本提取；扫描件仍需 OCR");
  return { profile, extractedCount, warnings, textLength: text.length };
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
  next.extraFields = { ...current.extraFields, ...parsed.extraFields };
  return next;
}
