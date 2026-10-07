let getDocumentImpl: typeof import("pdfjs-dist")["getDocument"] | undefined;

async function loadPdfJs() {
  if (!getDocumentImpl) {
    const [{ getDocument, GlobalWorkerOptions }, { default: workerUrl }] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url")
    ]);
    GlobalWorkerOptions.workerSrc = workerUrl;
    getDocumentImpl = getDocument;
  }
  return getDocumentImpl;
}

export const MAX_PDF_ATTACHMENT_BYTES = 8 * 1024 * 1024;
// Attachment text rides inside the message JSON, and the API caps request
// bodies at 1 MB, so keep each extracted text within the same 200 KB budget
// as TXT/Markdown attachments even for multi-byte scripts.
export const MAX_PDF_TEXT_BYTES = 190_000;

function cMapUrl() {
  return new URL("pdfjs/cmaps/", globalThis.location?.href ?? "https://localhost/").href;
}

function truncateToUtf8Bytes(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return { text, truncated: false };
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (encoder.encode(text.slice(0, mid)).length <= maxBytes) low = mid;
    else high = mid - 1;
  }
  return { text: text.slice(0, low), truncated: true };
}

const CJK_CHAR = "[\\u3400-\\u9fff\\u3000-\\u303f\\uff01-\\uff5e]";
const SPACE_BETWEEN_CJK = new RegExp(`(?<=${CJK_CHAR})[ \\t]+(?=${CJK_CHAR})`, "g");

// CJK Radicals Supplement has no NFKC mapping; these simplified forms are drawn
// for whole characters by some fonts. Code points checked against Unicode names.
const RADICAL_SUPPLEMENT: Record<string, string> = {
  "⺟": "母", "⺠": "民", "⻄": "西", "⻅": "见", "⻆": "角",
  "⻉": "贝", "⻋": "车", "⻓": "长", "⻔": "门", "⻘": "青",
  "⻙": "韦", "⻚": "页", "⻛": "风", "⻜": "飞", "⻝": "食",
  "⻢": "马", "⻣": "骨", "⻤": "鬼", "⻥": "鱼", "⻦": "鸟",
  "⻨": "麦", "⻩": "黄", "⻬": "齐", "⻮": "齿", "⻰": "龙",
  "⻳": "龟"
};

/**
 * Some PDF fonts map common characters to look-alike radicals (⼩ U+2F29 instead
 * of 小 U+5C0F), and pdf.js inserts spaces between separately drawn glyphs.
 * Kangxi radicals are NFKC-normalised one by one, so full-width Chinese
 * punctuation such as ， is left alone.
 */
export function normalizePdfText(text: string): string {
  return text
    .replace(/[⼀-⿟]/g, (character) => character.normalize("NFKC"))
    .replace(/[⺀-⻿]/g, (character) => RADICAL_SUPPLEMENT[character] ?? character)
    .replace(SPACE_BETWEEN_CJK, "");
}

export async function extractPdfAttachmentText(buffer: ArrayBuffer): Promise<string> {
  const getDocument = await loadPdfJs();
  const pdf = await getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    cMapUrl: cMapUrl(),
    cMapPacked: true
  }).promise;
  try {
    const pages: string[] = [];
    let needsOcr = false;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) =>
          "str" in item ? `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : " "}` : ""
        )
        .join("")
        .trim();
      if (pageText) pages.push(pageText);
      else needsOcr = true;
    }
    if (needsOcr || !pages.length) throw new Error("PDF_NEEDS_OCR");
    const truncated = truncateToUtf8Bytes(normalizePdfText(pages.join("\n\n")), MAX_PDF_TEXT_BYTES);
    return truncated.truncated
      ? `${truncated.text}\n\n（附件内容过长，超出部分已截断）`
      : truncated.text;
  } finally {
    void pdf.destroy();
  }
}
