export const INTERVIEW_RECORD_SOURCE_TYPES = ["transcript", "audio"] as const;

export type InterviewRecordSourceType = (typeof INTERVIEW_RECORD_SOURCE_TYPES)[number];

export const INTERVIEW_RECORD_STATUSES = ["processing", "ready", "failed"] as const;

export type InterviewRecordStatus = (typeof INTERVIEW_RECORD_STATUSES)[number];

export interface InterviewQaPair {
  id: string;
  question: string;
  answer: string;
  /** One-based display order within the interview record. */
  order: number;
  /** A short verbatim excerpt retained so answers can be traced to the transcript. */
  evidence?: string;
}

/**
 * A private, user-owned interview artefact attached to one job application.
 * Ownership is enforced by the API/store rather than exposed in this client shape.
 */
export interface InterviewRecord {
  id: string;
  applicationId: string;
  title: string;
  sourceType: InterviewRecordSourceType;
  status: InterviewRecordStatus;
  transcript: string;
  qaPairs: InterviewQaPair[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}
