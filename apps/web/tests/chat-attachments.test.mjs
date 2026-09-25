import assert from "node:assert/strict";
import test from "node:test";
import { extractedAttachment, validateAttachmentFile } from "../src/features/chat/attachments.ts";

test("accepts extension-based file types and clipboard image types", () => {
  assert.equal(validateAttachmentFile({ name: "简历.PDF", type: "", size: 800_000 }), "application/pdf");
  assert.equal(validateAttachmentFile({ name: "clipboard", type: "image/png", size: 100 }), "image/png");
  assert.equal(validateAttachmentFile({ name: "截图.jpg", type: "", size: 100 }), "image/jpeg");
  assert.throws(() => validateAttachmentFile({ name: "file.zip", type: "application/zip", size: 100 }), /支持/);
  assert.throws(() => validateAttachmentFile({ name: "file.txt", type: "text/plain", size: 200_001 }), /200 KB/);
  assert.throws(() => validateAttachmentFile({ name: "file.pdf", type: "application/pdf", size: 9_000_000 }), /8 MB/);
  assert.throws(() => validateAttachmentFile({ name: "empty.txt", type: "text/plain", size: 0 }), /空文件/);
});

test("normalizes recognized content and keeps only text and metadata", () => {
  const file = new File(["original bytes"], "截图.png", { type: "image/png" });
  assert.deepEqual(extractedAttachment(file, file.type, "\n 岗位描述 \n", "a"), {
    id: "a", name: "截图.png", mimeType: "image/png", size: 14, content: "岗位描述"
  });
  assert.throws(() => extractedAttachment(file, file.type, " ", "a"), /没有可读取/);
  assert.throws(() => extractedAttachment(file, file.type, "中".repeat(70_000), "a"), /文字过多/);
});
