import assert from "node:assert/strict";
import test from "node:test";
import { blocksToDescription, descriptionToBlocks, blockInlineText, safeResumeLink, monthInputValue, experienceDateError } from "../src/features/resumes/descriptionDocument.ts";

let nextId = 0;
const createId = () => `test-${++nextId}`;
const text = value => ({ type: "text", text: value });
const paragraph = (value, resumeId) => ({ type: "paragraph", attrs: { resumeId }, content: [text(value)] });

test("an empty description has no preset points", () => {
  const doc = blocksToDescription([]);
  assert.deepEqual(doc, { type: "doc", content: [{ type: "paragraph" }] });
  assert.deepEqual(descriptionToBlocks(doc, [], createId), []);
});

test("typing action verbs and colons does not automatically turn paragraphs into bullets", () => {
  const doc = { content: [paragraph("负责产品设计与研发协作。", "a"), paragraph("需求分析：访谈用户。", "b")] };
  assert.deepEqual(descriptionToBlocks(doc, [], createId).map(block => block.kind), ["paragraph", "paragraph"]);
});

test("old projects, labels, text, ids and evidence survive a rich-editor round trip", () => {
  const original = [{ id: "project", kind: "project", title: "知识库产品", children: [
    { id: "context", kind: "paragraph", text: "一段背景说明" },
    { id: "result", kind: "bullet", label: "效果", text: "完成两轮验证。", evidence: [{ source: "manual" }] }
  ] }];
  const converted = descriptionToBlocks(blocksToDescription(original), original, createId);
  assert.equal(converted[0].id, "project");
  assert.equal(converted[0].title, "知识库产品");
  assert.equal(converted[0].children[0].text, "一段背景说明");
  assert.deepEqual(converted[0].children[1], { ...original[0].children[1], inline: [{ text: "效果：", bold: true }, { text: "完成两轮验证。" }], listOrder: undefined });
});

test("selected bold and safe links persist as structured inline runs", () => {
  const doc = { content: [{ type: "paragraph", attrs: { resumeId: "a" }, content: [text("参与"), { ...text("产品设计"), marks: [{ type: "bold" }] }, { ...text("查看成果"), marks: [{ type: "link", attrs: { href: "https://example.com/work" } }] }] }] };
  const [block] = descriptionToBlocks(doc, [], createId);
  assert.equal(block.text, "参与产品设计查看成果");
  assert.deepEqual(blockInlineText(block), [{ text: "参与", bold: undefined, href: undefined }, { text: "产品设计", bold: true, href: undefined }, { text: "查看成果", bold: undefined, href: "https://example.com/work" }]);
  assert.equal(blocksToDescription([block]).content[0].content[1].marks[0].type, "bold");
});

test("AI changing plain text cannot leave stale formatted wording on screen", () => {
  const block = { id: "a", kind: "paragraph", text: "新内容", inline: [{ text: "旧内容", bold: true }] };
  assert.deepEqual(blockInlineText(block), [{ text: "新内容" }]);
});

test("ordered lists and deliberate line breaks survive save and reopening", () => {
  const original = [{ id: "a", kind: "bullet", text: "第一行\n第二行", listOrder: 3 }, { id: "b", kind: "bullet", text: "下一项", listOrder: 4 }];
  const doc = blocksToDescription(original);
  assert.equal(doc.content[0].type, "orderedList");
  assert.equal(doc.content[0].attrs.start, 3);
  assert.deepEqual(descriptionToBlocks(doc, original, createId), original);
});

test("pasted nested list text is preserved without extra indentation", () => {
  const doc = { content: [{ type: "bulletList", content: [{ type: "listItem", content: [paragraph("第一行", "a"), paragraph("第二行", "b"), { type: "bulletList", content: [{ type: "listItem", content: [paragraph("子项", "c")] }] }] }] }] };
  const blocks = descriptionToBlocks(doc, [], createId);
  assert.equal(blocks[0].text, "第一行\n第二行");
  assert.equal(blocks[1].text, "子项");
  assert.ok(blocks.every(block => block.kind === "bullet"));
});

test("links reject executable, relative and credential-bearing URLs", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,bad", "/relative", "https://user:secret@example.com", "https://"]) assert.equal(safeResumeLink(value), undefined);
  assert.equal(safeResumeLink("https://example.com/work"), "https://example.com/work");
});

test("month fields preserve old values and validate chronological order", () => {
  assert.equal(monthInputValue("2024.3"), "2024-03");
  assert.equal(monthInputValue("2024"), "");
  assert.equal(monthInputValue("2024-13"), "");
  assert.equal(experienceDateError("2026-02", "2026-01"), "结束日期不能早于开始日期");
  assert.equal(experienceDateError("2026.02", "2026-02"), "");
  assert.equal(experienceDateError("2026-02", "2026-01", true), "");
});
