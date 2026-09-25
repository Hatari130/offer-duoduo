import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import type { IncomingMessage } from "node:http";
import { MAX_CHAT_FILE_BYTES, MAX_CHAT_TEXT_BYTES, isRecord } from "@offerflow/contracts";
import type { ApiConfig } from "../config.ts";

export class OcrError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export interface ChatOcrProvider {
  configured: boolean;
  recognize(bytes: Buffer, mimeType: string, signal: AbortSignal): Promise<string>;
}

export async function readOcrFile(request: IncomingMessage): Promise<Buffer> {
  const tooLarge = () => new OcrError(413, "OCR_FILE_TOO_LARGE", "PDF 和图片不能超过 8 MB。");
  if (Number(request.headers["content-length"]) > MAX_CHAT_FILE_BYTES) throw tooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buffer);
      size += buffer.length;
      if (size > MAX_CHAT_FILE_BYTES) throw tooLarge();
    }
    if (!size) throw new OcrError(400, "OCR_EMPTY_FILE", "请选择非空图片或 PDF。");
    return Buffer.concat(chunks);
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
}

export function validateOcrSignature(bytes: Buffer, mimeType: string): void {
  const matches = mimeType === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mimeType === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mimeType === "image/webp" ? bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
    : mimeType === "application/pdf" ? bytes.toString("ascii", 0, 5) === "%PDF-"
    : false;
  if (!matches) throw new OcrError(400, "OCR_INVALID_FILE", "文件内容与格式不符，请选择有效的 PDF / PNG / JPG / WebP 文件。");
}

function upstreamError(): OcrError {
  return new OcrError(502, "OCR_UPSTREAM_ERROR", "文字识别服务暂时不可用，请稍后重试。");
}

async function boundedText(response: Response, maximumBytes: number): Promise<string> {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw upstreamError();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) throw new OcrError(413, "OCR_RESULT_TOO_LARGE", "识别结果过大，请拆分文件后重试。");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function dataRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.data)) throw upstreamError();
  return value.data;
}

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)));
  }
  // Only global unicast IPv6; excludes mapped IPv4, loopback and local ranges.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0):/i.test(address);
}

export async function validateOcrResultUrl(value: string): Promise<void> {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw upstreamError();
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw upstreamError();
}

export function extractOcrMarkdown(jsonl: string): string {
  const pages: string[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item: unknown = JSON.parse(line);
    if (!isRecord(item) || !isRecord(item.result) || !Array.isArray(item.result.layoutParsingResults)) throw upstreamError();
    for (const page of item.result.layoutParsingResults) {
      if (!isRecord(page) || !isRecord(page.markdown) || typeof page.markdown.text !== "string") throw upstreamError();
      // Persist recognized text, never result-image links or embedded binary data.
      pages.push(page.markdown.text
        .replace(/!\[[^\]]*\]\([^\n]*?\)/g, "")
        .replace(/<img\b[^>]*>/gi, "")
        .trim());
    }
  }
  const text = pages.filter(Boolean).join("\n\n").trim();
  if (!text) throw new OcrError(422, "OCR_NO_TEXT", "未识别到文字，请上传更清晰的截图或文档。");
  if (Buffer.byteLength(text, "utf8") > MAX_CHAT_TEXT_BYTES) {
    throw new OcrError(413, "OCR_TEXT_TOO_LARGE", "识别文字过多，请拆分文件后上传。");
  }
  return text;
}

export function createChatOcrProvider(config: ApiConfig, dependencies: {
  fetchImpl?: typeof fetch;
  validateResultUrl?: (url: string) => Promise<void>;
  pollMs?: number;
  timeoutMs?: number;
} = {}): ChatOcrProvider {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  return {
    configured: Boolean(config.paddleOcrToken),
    async recognize(bytes, mimeType, parentSignal) {
      if (!config.paddleOcrToken) throw new OcrError(503, "OCR_NOT_CONFIGURED", "图片识别尚未配置，请先上传文字版 PDF、TXT 或 Markdown。");
      const timeout = AbortSignal.timeout(dependencies.timeoutMs ?? 180_000);
      const signal = AbortSignal.any([parentSignal, timeout]);
      const jobUrl = config.paddleOcrJobUrl.replace(/\/$/, "");
      const headers = { authorization: `bearer ${config.paddleOcrToken}` };
      try {
        signal.throwIfAborted();
        if (new URL(jobUrl).protocol !== "https:") throw upstreamError();
        const form = new FormData();
        const extension = ({ "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[mimeType];
        form.set("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), `attachment.${extension}`);
        form.set("model", config.paddleOcrModel);
        form.set("optionalPayload", JSON.stringify({ useDocOrientationClassify: false, useDocUnwarping: false, useChartRecognition: false }));
        const submitted = dataRecord(JSON.parse(await boundedText(await fetchImpl(jobUrl, {
          method: "POST", headers, body: form, signal, redirect: "error"
        }), 128_000)));
        form.delete("file");
        if (typeof submitted.jobId !== "string" || !submitted.jobId.trim()) throw upstreamError();
        const statusUrl = `${jobUrl}/${encodeURIComponent(submitted.jobId)}`;
        while (true) {
          signal.throwIfAborted();
          const data = dataRecord(JSON.parse(await boundedText(await fetchImpl(statusUrl, {
            headers, signal, redirect: "error"
          }), 128_000)));
          if (data.state === "done") {
            if (!isRecord(data.resultUrl) || typeof data.resultUrl.jsonUrl !== "string") throw upstreamError();
            await (dependencies.validateResultUrl ?? validateOcrResultUrl)(data.resultUrl.jsonUrl);
            // Result URLs are signed; never forward our provider token to their host.
            return extractOcrMarkdown(await boundedText(await fetchImpl(data.resultUrl.jsonUrl, {
              signal, redirect: "error"
            }), 4 * 1024 * 1024));
          }
          if (data.state === "failed") throw new OcrError(422, "OCR_FAILED", "文字识别失败，请确认文件完整、未加密且文字清晰。");
          if (data.state !== "pending" && data.state !== "running") throw upstreamError();
          await delay(dependencies.pollMs ?? 3000, undefined, { signal });
        }
      } catch (error) {
        if (parentSignal.aborted) throw new OcrError(499, "OCR_CANCELLED", "已取消文字识别。");
        if (timeout.aborted) throw new OcrError(504, "OCR_TIMEOUT", "文字识别超时，请拆分文件或稍后重试。");
        if (error instanceof OcrError) throw error;
        // Do not expose or log upstream responses, tokens, signed URLs or file content.
        throw upstreamError();
      }
    }
  };
}
