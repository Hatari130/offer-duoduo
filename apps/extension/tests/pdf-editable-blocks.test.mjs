import assert from "node:assert/strict";
import test from "node:test";

import { buildPdfEditableBlocks, buildPdfEditableRegions } from "../src/features/tailor/pdfEditableBlocks.ts";

const item = (id, text, x, top, width, options = {}) => ({
  id,
  text,
  x,
  top,
  width,
  height: options.fontSize || 10,
  fontSize: options.fontSize || 10,
  fontFamily: options.fontFamily || "OfferFlowPdf-body",
  fontId: options.fontId || "body",
  fallbackFontFamily: "Microsoft YaHei",
  fontWeight: options.fontWeight || 400,
  fontStyle: "normal",
  color: options.color || "#111111",
  backgroundColor: "#ffffff",
  backgroundConfidence: 1,
  rotation: 0,
  direction: "ltr"
});

const page = {
  page: 1,
  widthPt: 595,
  heightPt: 842,
  imageDataUrl: "data:image/png;base64,AA==",
  backgroundImageDataUrl: "data:image/png;base64,BB==",
  vectorShapes: [],
  items: [
    item("heading", "项目经历", 50, 50, 72, { fontSize: 16, fontWeight: 700 }),
    item("p1-a", "负责需求调研、产品设计与", 50, 100, 150),
    item("p1-b", "上线验证，", 200, 100, 60),
    item("p2-a", "基于用户反馈持续优化产品体验。", 50, 112, 205),
    item("table-a1", "学校", 50, 200, 40),
    item("table-b1", "专业", 250, 200, 40),
    item("table-a2", "南京大学", 50, 214, 60),
    item("table-b2", "城乡规划", 250, 214, 60)
  ]
};

test("merges fragmented PDF runs into editable paragraphs without merging table columns", () => {
  const blocks = buildPdfEditableBlocks(page);
  const paragraph = blocks.find((block) => block.itemIds.includes("p1-a"));
  assert.ok(paragraph);
  assert.deepEqual(paragraph.itemIds, ["p1-a", "p1-b", "p2-a"]);
  assert.equal(paragraph.text, "负责需求调研、产品设计与上线验证，\n基于用户反馈持续优化产品体验。");
  assert.equal(blocks.filter((block) => block.itemIds.some((id) => id.startsWith("table-"))).length, 4);
  assert.ok(blocks.length < page.items.length);
});

test("builds local edit regions around detected section headings", () => {
  const regions = buildPdfEditableRegions(page);
  assert.ok(regions.length >= 1);
  assert.equal(regions.flatMap((region) => region.blocks).length, buildPdfEditableBlocks(page).length);
  assert.ok(regions.some((region) => region.blocks.some((block) => block.text === "项目经历")));
});
