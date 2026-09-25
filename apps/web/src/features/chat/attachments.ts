import type { ChatAttachment } from "@offerflow/domain";
import {
  CHAT_IMAGE_MIME_TYPES,
  MAX_CHAT_FILE_BYTES,
  MAX_CHAT_TEXT_BYTES
} from "@offerflow/contracts";

export const CHAT_FILE_ACCEPT = ".txt,.md,.pdf,.png,.jpg,.jpeg,.webp,text/plain,text/markdown,application/pdf,image/png,image/jpeg,image/webp";

export function attachmentMimeType(file: Pick<File, "name" | "type">): string {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return ({ txt: "text/plain", md: "text/markdown", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" } as Record<string, string>)[extension ?? ""]
    ?? (CHAT_IMAGE_MIME_TYPES.some((mime) => mime === file.type) ? file.type : "");
}

export function validateAttachmentFile(file: Pick<File, "name" | "type" | "size">): string {
  const mimeType = attachmentMimeType(file);
  if (!mimeType) throw new Error("支持 TXT、Markdown、PDF 和 PNG / JPG / WebP 图片。");
  if (!file.size) throw new Error(`「${file.name}」是空文件，请重新选择。`);
  if (file.name.length > 255) throw new Error("文件名过长，请缩短文件名后重试。");
  const textFile = mimeType.startsWith("text/");
  if (file.size > (textFile ? MAX_CHAT_TEXT_BYTES : MAX_CHAT_FILE_BYTES)) {
    throw new Error(textFile ? "TXT / Markdown 文件不能超过 200 KB。" : "PDF 和图片不能超过 8 MB。");
  }
  return mimeType;
}

export function extractedAttachment(file: Pick<File, "name" | "size">, mimeType: string, content: string, id: string): ChatAttachment {
  const text = content.trim();
  if (!text) throw new Error(`「${file.name}」没有可读取的文字，请换一份文档或更清晰的截图。`);
  if (new TextEncoder().encode(text).length > MAX_CHAT_TEXT_BYTES) {
    throw new Error(`「${file.name}」文字过多，请拆分文件后上传。`);
  }
  return { id, name: file.name, mimeType, size: file.size, content: text };
}
