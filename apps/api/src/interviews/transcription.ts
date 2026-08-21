import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import type { ApiConfig } from "../config.ts";

const BCUT_API_BASE_URL = "https://member.bilibili.com/x/bcut/rubick-interface";
const BCUT_CREATE_RESOURCE = `${BCUT_API_BASE_URL}/resource/create`;
const BCUT_COMPLETE_RESOURCE = `${BCUT_API_BASE_URL}/resource/create/complete`;
const BCUT_CREATE_TASK = `${BCUT_API_BASE_URL}/task`;
const BCUT_TASK_RESULT = `${BCUT_API_BASE_URL}/task/result`;
const BCUT_HEADERS = {
  "user-agent": "Bilibili/1.0.0 (https://www.bilibili.com)",
  "content-type": "application/json"
};
const CHUNK_SECONDS = 10 * 60;
const OVERLAP_SECONDS = 10;
const MAX_CONCURRENCY = 3;

export interface TranscriptionInput {
  audio: Uint8Array;
  fileName: string;
  mimeType: string;
  signal?: AbortSignal;
}

export interface InterviewTranscriptionProvider {
  readonly name: string;
  readonly configured: boolean;
  transcribe(input: TranscriptionInput): Promise<string>;
}

export class TranscriptionProviderError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "TranscriptionProviderError";
  }
}

interface AudioChunk {
  path: string;
  offset: number;
}

export interface BcutSegment {
  start: number;
  end: number;
  text: string;
}

function command(
  executable: string,
  args: string[],
  signal?: AbortSignal,
  timeoutMs = 5 * 60_000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve(stdout);
    };
    const abort = () => {
      child.kill();
      finish(new TranscriptionProviderError("ASR_ABORTED", "录音转写已取消"));
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new TranscriptionProviderError("FFMPEG_TIMEOUT", "录音转码超时"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 4_000) stderr += chunk.toString();
    });
    child.on("error", (error) => {
      finish(
        new TranscriptionProviderError(
          "FFMPEG_UNAVAILABLE",
          `无法启动音频处理工具 ${executable}：${error.message}`
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new TranscriptionProviderError("FFMPEG_FAILED", `音频处理失败：${stderr.trim() || `退出码 ${code}`}`));
    });
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

function requestSignal(parent: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason);
  const timer = setTimeout(() => controller.abort(new Error("request timeout")), timeoutMs);
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    }
  };
}

async function fetchJson(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
  timeoutMs = 60_000
): Promise<Record<string, unknown>> {
  const request = requestSignal(signal, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: request.signal });
    const body = await response.text();
    if (!response.ok) {
      throw new TranscriptionProviderError(
        "BCUT_HTTP_ERROR",
        `BcutASR 请求失败（${response.status}）：${body.slice(0, 300)}`
      );
    }
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("response is not an object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof TranscriptionProviderError) throw error;
    throw new TranscriptionProviderError(
      "BCUT_REQUEST_FAILED",
      `BcutASR 网络请求失败：${error instanceof Error ? error.message : "未知错误"}`
    );
  } finally {
    request.cleanup();
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requiredString(value: unknown, error: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new TranscriptionProviderError("BCUT_INVALID_RESPONSE", error);
}

function parseBcutSegments(value: unknown): BcutSegment[] {
  const result = typeof value === "string" ? JSON.parse(value) as unknown : value;
  const utterances = object(result).utterances;
  if (!Array.isArray(utterances)) return [];
  return utterances
    .map((utterance) => object(utterance))
    .map((utterance) => ({
      start: Number(utterance.start_time ?? 0) / 1_000,
      end: Number(utterance.end_time ?? 0) / 1_000,
      text: typeof utterance.transcript === "string" ? utterance.transcript.trim() : ""
    }))
    .filter((segment) => segment.text && Number.isFinite(segment.start) && Number.isFinite(segment.end));
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new TranscriptionProviderError("ASR_ABORTED", "录音转写已取消"));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new TranscriptionProviderError("ASR_ABORTED", "录音转写已取消"));
    }, { once: true });
  });
}

async function transcribeBcutFile(path: string, signal?: AbortSignal): Promise<BcutSegment[]> {
  const binary = await readFile(path);
  try {
  const create = await fetchJson(BCUT_CREATE_RESOURCE, {
    method: "POST",
    headers: BCUT_HEADERS,
    body: JSON.stringify({
      type: 2,
      name: "audio.mp3",
      size: binary.byteLength,
      ResourceFileType: "mp3",
      model_id: "8"
    })
  }, signal);
  const upload = object(create.data);
  const uploadUrls = Array.isArray(upload.upload_urls)
    ? upload.upload_urls.filter((url): url is string => typeof url === "string" && Boolean(url))
    : [];
  if (!uploadUrls.length) {
    throw new TranscriptionProviderError("BCUT_INVALID_RESPONSE", "BcutASR 没有返回音频上传地址");
  }
  const perSize = Math.max(1, Number(upload.per_size) || binary.byteLength);
  const etags: string[] = [];
  for (const [index, uploadUrl] of uploadUrls.entries()) {
    const request = requestSignal(signal, 180_000);
    try {
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: BCUT_HEADERS,
        body: binary.subarray(index * perSize, Math.min((index + 1) * perSize, binary.byteLength)),
        signal: request.signal
      });
      if (!response.ok) {
        throw new TranscriptionProviderError(
          "BCUT_UPLOAD_FAILED",
          `BcutASR 音频分片上传失败（${response.status}）`
        );
      }
      const etag = response.headers.get("etag");
      if (etag) etags.push(etag);
    } finally {
      request.cleanup();
    }
  }

  const complete = await fetchJson(BCUT_COMPLETE_RESOURCE, {
    method: "POST",
    headers: BCUT_HEADERS,
    body: JSON.stringify({
      InBossKey: upload.in_boss_key,
      ResourceId: upload.resource_id,
      Etags: etags.join(","),
      UploadId: upload.upload_id,
      model_id: "8"
    })
  }, signal);
  const downloadUrl = requiredString(object(complete.data).download_url, "BcutASR 音频上传提交失败");
  const task = await fetchJson(BCUT_CREATE_TASK, {
    method: "POST",
    headers: BCUT_HEADERS,
    body: JSON.stringify({ resource: downloadUrl, model_id: "8" })
  }, signal);
  const taskId = requiredString(object(task.data).task_id, "BcutASR 创建识别任务失败");

  for (let poll = 0; poll < 900; poll += 1) {
    const url = new URL(BCUT_TASK_RESULT);
    url.searchParams.set("model_id", "7");
    url.searchParams.set("task_id", taskId);
    const response = await fetchJson(url.toString(), { headers: BCUT_HEADERS }, signal);
    const data = object(response.data);
    const state = Number(data.state);
    if (state === 4) return parseBcutSegments(data.result);
    if (state === 5 || state === 6 || state === -1) {
      throw new TranscriptionProviderError("BCUT_TASK_FAILED", "BcutASR 识别任务失败，请重试");
    }
    await delay(1_000, signal);
  }
  throw new TranscriptionProviderError("BCUT_TIMEOUT", "BcutASR 识别等待超时，请稍后重试");
  } finally {
    binary.fill(0);
  }
}

function normalizedText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function diceSimilarity(leftValue: string, rightValue: string): number {
  const left = normalizedText(leftValue);
  const right = normalizedText(rightValue);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const counts = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  let matches = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2);
    const count = counts.get(pair) ?? 0;
    if (count > 0) {
      matches += 1;
      counts.set(pair, count - 1);
    }
  }
  return (2 * matches) / (left.length + right.length - 2);
}

/** Remove duplicate utterances introduced by the 10-second chunk overlap. */
export function mergeOverlappedSegments(segments: BcutSegment[]): BcutSegment[] {
  const merged: BcutSegment[] = [];
  for (const segment of [...segments].sort((left, right) => left.start - right.start || left.end - right.end)) {
    if (!segment.text.trim()) continue;
    const duplicate = merged.slice(-12).some((existing) => {
      const timeOverlap = Math.min(segment.end, existing.end) - Math.max(segment.start, existing.start);
      const nearOverlapWindow = Math.abs(segment.start - existing.start) <= OVERLAP_SECONDS;
      return (timeOverlap > 0 || nearOverlapWindow) && diceSimilarity(segment.text, existing.text) >= 0.82;
    });
    if (!duplicate) merged.push(segment);
  }
  return merged;
}

async function parallelMap<T, R>(
  values: T[],
  maximumConcurrency: number,
  worker: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(maximumConcurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index], index);
    }
  }));
  return results;
}

class BcutTranscriptionProvider implements InterviewTranscriptionProvider {
  readonly name = "bcut";
  readonly configured = true;

  constructor(private readonly config: ApiConfig) {}

  async transcribe(input: TranscriptionInput): Promise<string> {
    const workdir = await mkdtemp(join(tmpdir(), "offerflow-interview-"));
    try {
      const requestedExtension = extname(input.fileName).slice(0, 12);
      const sourceExtension = /^\.[a-z0-9]{1,10}$/i.test(requestedExtension)
        ? requestedExtension
        : ".audio";
      const source = join(workdir, `source${sourceExtension}`);
      const mono = join(workdir, "mono.mp3");
      await writeFile(source, input.audio);
      await command(this.config.ffmpegPath, [
        "-y", "-loglevel", "error", "-i", source,
        "-ac", "1", "-b:a", "64k", "-vn", mono
      ], input.signal);
      const durationText = await command(this.config.ffprobePath, [
        "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", mono
      ], input.signal, 60_000);
      const duration = Number(durationText.trim());
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new TranscriptionProviderError("INVALID_AUDIO", "无法读取录音时长，请检查文件是否损坏");
      }

      const chunks: AudioChunk[] = [];
      if (duration <= CHUNK_SECONDS) {
        chunks.push({ path: mono, offset: 0 });
      } else {
        const step = CHUNK_SECONDS - OVERLAP_SECONDS;
        for (let offset = 0, index = 0; offset < duration; offset += step, index += 1) {
          const chunkDuration = Math.min(CHUNK_SECONDS, duration - offset);
          if (chunkDuration < 1) break;
          const path = join(workdir, `chunk-${String(index).padStart(4, "0")}.mp3`);
          await command(this.config.ffmpegPath, [
            "-y", "-loglevel", "error", "-ss", offset.toFixed(3),
            "-t", chunkDuration.toFixed(3), "-i", mono,
            "-ac", "1", "-b:a", "64k", "-vn", path
          ], input.signal);
          chunks.push({ path, offset });
          if (offset + chunkDuration >= duration) break;
        }
      }

      const chunkResults = await parallelMap(chunks, MAX_CONCURRENCY, async (chunk) => {
        const segments = await transcribeBcutFile(chunk.path, input.signal);
        return segments.map((segment) => ({
          ...segment,
          start: segment.start + chunk.offset,
          end: segment.end + chunk.offset
        }));
      });
      const segments = mergeOverlappedSegments(chunkResults.flat());
      const transcript = segments.map((segment) => segment.text.trim()).filter(Boolean).join("\n");
      if (!transcript) {
        throw new TranscriptionProviderError("EMPTY_TRANSCRIPT", "录音中没有识别到可用文字");
      }
      return transcript;
    } catch (error) {
      if (error instanceof TranscriptionProviderError) throw error;
      throw new TranscriptionProviderError(
        "BCUT_TRANSCRIPTION_FAILED",
        `BcutASR 转写失败：${error instanceof Error ? error.message : "未知错误"}`
      );
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  }
}

class DisabledTranscriptionProvider implements InterviewTranscriptionProvider {
  readonly name = "disabled";
  readonly configured = false;

  async transcribe(): Promise<string> {
    throw new TranscriptionProviderError(
      "ASR_DISABLED",
      "录音转写已在服务端关闭；你仍可直接上传文字稿。"
    );
  }
}

export function createInterviewTranscriptionProvider(config: ApiConfig): InterviewTranscriptionProvider {
  return config.interviewAsrProvider === "disabled"
    ? new DisabledTranscriptionProvider()
    : new BcutTranscriptionProvider(config);
}
