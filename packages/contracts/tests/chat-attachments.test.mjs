import assert from "node:assert/strict";
import test from "node:test";
import { isSendMessageRequest, MAX_CHAT_FILE_BYTES } from "../src/chat.ts";

const base = { id: "attachment", name: "截图.png", mimeType: "image/png", size: 1000, content: "岗位职责" };
const accepts = (attachment) => isSendMessageRequest({ content: "请分析", clientMessageId: "message", attachments: [attachment] });

test("accepts extracted text with original PDF/image metadata and separate file/text limits", () => {
  for (const mimeType of ["application/pdf", "image/png", "image/jpeg", "image/webp"]) {
    assert.equal(accepts({ ...base, mimeType, size: MAX_CHAT_FILE_BYTES }), true);
    assert.equal(accepts({ ...base, mimeType, size: MAX_CHAT_FILE_BYTES + 1 }), false);
  }
  assert.equal(accepts({ ...base, mimeType: "text/plain", size: 200_001 }), false);
  assert.equal(accepts({ ...base, content: "中".repeat(70_000) }), false);
  assert.equal(accepts({ ...base, content: " " }), false);
  assert.equal(accepts({ ...base, size: 0 }), false);
  assert.equal(accepts({ ...base, mimeType: "application/zip" }), false);
});

test("rejects original binary fields, URLs, duplicate ids and excess attachments before persistence", () => {
  for (const field of ["url", "data", "base64", "bytes", "file"]) assert.equal(accepts({ ...base, [field]: "secret" }), false);
  assert.equal(isSendMessageRequest({ content: "分析", clientMessageId: "m", attachments: [base, base] }), false);
  assert.equal(isSendMessageRequest({ content: "分析", clientMessageId: "m", attachments: [1, 2, 3].map((id) => ({ ...base, id: String(id) })) }), false);
});
