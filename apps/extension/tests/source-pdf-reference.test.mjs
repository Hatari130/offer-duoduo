import assert from "node:assert/strict";
import test from "node:test";

import { buildSourcePdfReferenceHtml } from "../src/features/tailor/buildSourcePdfReferenceHtml.ts";

test("source PDF reference is read-only and keeps every rendered page", () => {
  const html = buildSourcePdfReferenceHtml({
    characterCount: 12,
    fonts: [],
    pages: [
      { page: 1, widthPt: 595, heightPt: 842, imageDataUrl: "data:image/png;base64,AA==", items: [], vectorShapes: [] },
      { page: 2, widthPt: 595, heightPt: 842, imageDataUrl: "data:image/png;base64,BB==", items: [], vectorShapes: [] }
    ]
  });

  assert.equal((html.match(/class="source-page"/g) || []).length, 2);
  assert.match(html, /原 PDF 对照/);
  assert.doesNotMatch(html, /contenteditable|tailor-edit-toggle/);
});
