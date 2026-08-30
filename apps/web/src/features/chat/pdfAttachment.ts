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
    }
    const truncated = truncateToUtf8Bytes(pages.join("\n\n"), MAX_PDF_TEXT_BYTES);
    return truncated.truncated
      ? `${truncated.text}\n\n（附件内容过长，超出部分已截断）`
      : truncated.text;
  } finally {
    void pdf.destroy();
  }
}
