import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractResumePdfLayout } from "@/features/profile/resumeParser";
import { buildPdfBackedResumeHtml } from "@/features/tailor/buildPdfBackedResumeHtml";

declare global {
  interface Window {
    __PDF_FIDELITY_HTML__?: string;
    __PDF_FIDELITY_RESULT__?: {
      ready: boolean;
      characterCount: number;
      fontCount: number;
      vectorShapeCount: number;
      boldItemCount: number;
      symbolItemCount: number;
      symbolFontCount: number;
      pageWidthPt: number;
      pageHeightPt: number;
    };
  }
}

const fixture = new URLSearchParams(location.search).get("fixture") || "0";
const response = await fetch(`/__pdf_fixture__/${encodeURIComponent(fixture)}`);
if (!response.ok) throw new Error(`Unable to load PDF fixture ${fixture}`);
const source = await response.arrayBuffer();

const layout = await extractResumePdfLayout(source.slice(0), {
  onProgress: (phase, pageNumber, pageCount) => {
    console.log(`[pdf-fidelity] ${phase}${pageNumber ? ` ${pageNumber}/${pageCount || "?"}` : ""}`);
  }
});
const pageLayout = layout.pages[0];
if (!pageLayout) throw new Error("The PDF fixture has no page");

const emptyProfile = {
  fullName: "",
  email: "",
  phone: "",
  currentCity: "",
  targetRole: "",
  education: [],
  experiences: [],
  projects: [],
  campusExperiences: [],
  awards: []
};

const emptyResume = {
  targetCompany: "",
  targetRole: "",
  generatedAt: new Date(0).toISOString(),
  header: { name: "原版简历", headline: "", email: "", phone: "", city: "", links: [] },
  summary: "",
  education: [],
  experience: [],
  projects: [],
  campus: [],
  awards: [],
  skills: [],
  languages: [],
  publications: [],
  interests: []
};

const output = document.querySelector<HTMLIFrameElement>("#output");
if (!output) throw new Error("Missing output iframe");
const loaded = new Promise<void>((resolve) => output.addEventListener("load", () => resolve(), { once: true }));
const generatedHtml = buildPdfBackedResumeHtml({
  layout,
  resume: emptyResume,
  sourceProfile: emptyProfile
});
window.__PDF_FIDELITY_HTML__ = generatedHtml;
output.srcdoc = generatedHtml;
await loaded;
const outputDocument = output.contentDocument;
if (!outputDocument) throw new Error("Unable to read output iframe");
await outputDocument.fonts.ready;
await Promise.all([...outputDocument.images].map((image) => image.complete ? Promise.resolve() : image.decode()));

const asset = (directory: string) => new URL(`/pdfjs/${directory}/`, location.origin).href;
const pdf = await getDocument({
  data: new Uint8Array(source.slice(0)),
  useWorkerFetch: false,
  cMapUrl: asset("cmaps"),
  cMapPacked: true,
  standardFontDataUrl: asset("standard_fonts"),
  wasmUrl: asset("wasm"),
  iccUrl: asset("iccs")
}).promise;
try {
  const page = await pdf.getPage(1);
  const renderViewport = page.getViewport({ scale: 2 });
  const displayViewport = page.getViewport({ scale: 96 / 72 });
  const canvas = document.querySelector<HTMLCanvasElement>("#reference");
  if (!canvas) throw new Error("Missing reference canvas");
  canvas.width = Math.ceil(renderViewport.width);
  canvas.height = Math.ceil(renderViewport.height);
  canvas.style.width = `${displayViewport.width}px`;
  canvas.style.height = `${displayViewport.height}px`;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create reference canvas");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport: renderViewport }).promise;
} finally {
  await pdf.destroy();
}

window.__PDF_FIDELITY_RESULT__ = {
  ready: true,
  characterCount: layout.characterCount,
  fontCount: layout.fonts.length,
  vectorShapeCount: layout.pages.reduce((total, page) => total + page.vectorShapes.length, 0),
  boldItemCount: layout.pages.reduce((total, page) => total + page.items.filter((item) => item.fontWeight === 700).length, 0),
  symbolItemCount: layout.pages.reduce((total, page) => total + page.items.filter((item) => /[•▪■◆●★✓]/u.test(item.text)).length, 0),
  symbolFontCount: layout.fonts.filter((font) => /wingdings|symbol/i.test(font.fallbackFamily)).length,
  pageWidthPt: pageLayout.widthPt,
  pageHeightPt: pageLayout.heightPt
};
