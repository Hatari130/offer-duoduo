import assert from "node:assert/strict";
import test from "node:test";
import { validatePdfTailoringPatches } from "../src/features/tailor/pdfTailoringPatches.ts";

const blocks = [{ blockId: "pdf-block-15", page: 1, text: "负责平台日常维护，持续优化产品体验与性能。" }];

test("accepts a patch only when it is bound to the exact PDF block", () => {
  const patches = validatePdfTailoringPatches([{
    page: 1,
    block_id: "pdf-block-15",
    source_text: blocks[0].text,
    tailored_text: `${blocks[0].text.slice(0, -1)}！`,
    map_ids: ["JD-1"]
  }], blocks);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].blockId, "pdf-block-15");
});

test("rejects a patch whose source text does not equal the PDF block", () => {
  const patches = validatePdfTailoringPatches([{
    page: 1,
    block_id: "pdf-block-15",
    source_text: "解析器拼出来的另一段文字",
    tailored_text: "改写文字"
  }], blocks);
  assert.equal(patches.length, 0);
});

test("rejects a patch that exceeds the frozen PDF block text budget", () => {
  const source = "负责平台产品规划、用户研究、方案设计、上线验证以及数据复盘，持续优化产品体验";
  const patches = validatePdfTailoringPatches([{
    page: 1,
    block_id: "pdf-block-2",
    source_text: source,
    tailored_text: `${source}，并新增跨部门协作、商业分析和团队管理工作`,
    map_ids: ["JD-1"]
  }], [{ blockId: "pdf-block-2", page: 1, text: source }]);
  assert.equal(patches.length, 0);
});

test("rejects equal-character patches whose estimated rendered width is too large", () => {
  const source = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const tailored = "项目项目项目项目项目项目项目项目项目项目项目项目项目项目项目项目";
  assert.equal([...source].length, [...tailored].length);
  const patches = validatePdfTailoringPatches([{
    page: 1,
    block_id: "pdf-block-3",
    source_text: source,
    tailored_text: tailored
  }], [{ blockId: "pdf-block-3", page: 1, text: source }]);
  assert.equal(patches.length, 0);
});
