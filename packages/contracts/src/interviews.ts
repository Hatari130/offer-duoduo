import type { InterviewRecord } from "@offerflow/domain";
import { isRecord } from "./common.ts";

export const MAX_INTERVIEW_AUDIO_BYTES = 50 * 1024 * 1024;

export const SUPPORTED_INTERVIEW_AUDIO_MIME_TYPES = [
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav"
] as const;

export interface InterviewRecordListResponse {
  records: InterviewRecord[];
}

export interface InterviewRecordResponse {
  record: InterviewRecord;
}

export interface CreateInterviewRecordFromTranscriptRequest {
  title?: string;
  transcript: string;
}

export interface UploadInterviewAudioOptions {
  title?: string;
  fileName: string;
}

export function isCreateInterviewRecordFromTranscriptRequest(
  value: unknown
): value is CreateInterviewRecordFromTranscriptRequest {
  return (
    isRecord(value) &&
    typeof value.transcript === "string" &&
    (value.title === undefined || typeof value.title === "string")
  );
}

export function normalizeMimeType(value: string | undefined): string {
  return (value ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

export function isSupportedInterviewAudioMimeType(value: string | undefined): boolean {
  const normalized = normalizeMimeType(value);
  return SUPPORTED_INTERVIEW_AUDIO_MIME_TYPES.includes(
    normalized as (typeof SUPPORTED_INTERVIEW_AUDIO_MIME_TYPES)[number]
  );
}
