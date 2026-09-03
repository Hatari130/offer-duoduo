import type {
  PersonalProfile,
  ResumeAsset,
  ResumeTailorProposal,
  ResumeDocument,
  ResumeSourceEvidence,
  ResumeVersion,
  TailorJobContext,
  TailorTask
} from "@offerflow/domain";
import { isRecord } from "./common.ts";
import type { SessionUser } from "./auth.ts";

export interface ResumeVersionRecord {
  version: ResumeVersion;
  revision: number;
}

export interface ResumeVersionListResponse {
  versions: ResumeVersionRecord[];
}

/** A reusable source resume mirrored from the browser extension.  It contains
 * structured content only: original files stay on the user's device. */
export interface ResumeTemplateRecord {
  id: string;
  name: string;
  sourceFileName?: string;
  profile: PersonalProfile;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeTemplateListResponse {
  templates: ResumeTemplateRecord[];
}

export interface SyncResumeTemplatesRequest {
  templates: ResumeTemplateRecord[];
}

export interface CreateTailorTaskRequest {
  sourceResumeId: string;
  sourceResumeName: string;
  sourceProfile: PersonalProfile;
  sourceAssets?: ResumeAsset[];
  sourcePortraitAssetId?: string;
  sourceEvidence?: ResumeSourceEvidence;
  applicationId?: string;
  job: TailorJobContext;
}

export interface TailorHandoff {
  code: string;
  expiresAt: string;
}

export interface CreateTailorTaskResponse {
  task: TailorTask;
  version: ResumeVersionRecord;
  handoff: TailorHandoff;
}

export interface TailorTaskDetailResponse {
  task: TailorTask;
  version: ResumeVersionRecord;
}

export interface GenerateTailorTaskResponse {
  proposal: ResumeTailorProposal;
}

export interface UpdateResumeVersionRequest {
  document: ResumeDocument;
  expectedRevision: number;
}

export interface ResumeVersionResponse {
  item: ResumeVersionRecord;
}

export interface ExchangeHandoffRequest {
  code: string;
}

export interface ExchangeHandoffResponse {
  accessToken: string;
  expiresAt: string;
  user: SessionUser;
  targetPath: string;
}

export function isCreateTailorTaskRequest(value: unknown): value is CreateTailorTaskRequest {
  if (!isRecord(value) || !isRecord(value.sourceProfile) || !isRecord(value.job)) return false;
  const job = value.job;
  return (
    typeof value.sourceResumeId === "string" &&
    typeof value.sourceResumeName === "string" &&
    (value.sourceAssets === undefined || (Array.isArray(value.sourceAssets) && value.sourceAssets.every(isRecord))) &&
    (value.sourcePortraitAssetId === undefined || typeof value.sourcePortraitAssetId === "string") &&
    (value.sourceEvidence === undefined || isRecord(value.sourceEvidence)) &&
    (value.applicationId === undefined || typeof value.applicationId === "string") &&
    typeof job.company === "string" &&
    typeof job.position === "string" &&
    typeof job.sourceUrl === "string" &&
    Array.isArray(job.responsibilities) &&
    Array.isArray(job.requirements)
  );
}

export function isUpdateResumeVersionRequest(value: unknown): value is UpdateResumeVersionRequest {
  return (
    isRecord(value) &&
    typeof value.expectedRevision === "number" &&
    isRecord(value.document) &&
    value.document.schemaVersion === 1 &&
    isRecord(value.document.profile) &&
    isRecord(value.document.template)
  );
}

export function isSyncResumeTemplatesRequest(value: unknown): value is SyncResumeTemplatesRequest {
  return isRecord(value)
    && Array.isArray(value.templates)
    && value.templates.length <= 50
    && value.templates.every((template) => isRecord(template)
      && typeof template.id === "string"
      && typeof template.name === "string"
      && isRecord(template.profile)
      && typeof template.createdAt === "string"
      && typeof template.updatedAt === "string"
      && (template.sourceFileName === undefined || typeof template.sourceFileName === "string"));
}

export function isExchangeHandoffRequest(value: unknown): value is ExchangeHandoffRequest {
  return isRecord(value) && typeof value.code === "string" && value.code.trim().length > 0;
}
