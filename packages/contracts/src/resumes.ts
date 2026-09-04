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
  /** Web-authored resumes keep their presentation settings here while
   * `profile` remains the canonical field payload consumed by the extension. */
  document?: ResumeDocument;
  origin?: "web" | "extension";
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ResumeTemplateListResponse {
  templates: ResumeTemplateRecord[];
}

export interface SyncResumeTemplatesRequest {
  templates: ResumeTemplateRecord[];
}

export interface CreateResumeTemplateRequest {
  id: string;
  name: string;
  document: ResumeDocument;
}

export interface UpdateResumeTemplateRequest {
  name: string;
  document: ResumeDocument;
}

export interface ResumeTemplateResponse {
  template: ResumeTemplateRecord;
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

function isResumeDocument(value: unknown): value is ResumeDocument {
  return isRecord(value)
    && value.schemaVersion === 1
    && typeof value.id === "string"
    && typeof value.title === "string"
    && isRecord(value.profile)
    && isRecord(value.template);
}

export function isCreateResumeTemplateRequest(value: unknown): value is CreateResumeTemplateRequest {
  return isRecord(value)
    && typeof value.id === "string"
    && value.id.trim().length > 0
    && value.id.length <= 160
    && typeof value.name === "string"
    && value.name.trim().length > 0
    && value.name.length <= 120
    && isResumeDocument(value.document)
    && value.document.id === value.id;
}

export function isUpdateResumeTemplateRequest(value: unknown): value is UpdateResumeTemplateRequest {
  return isRecord(value)
    && typeof value.name === "string"
    && value.name.trim().length > 0
    && value.name.length <= 120
    && isResumeDocument(value.document);
}

export function isSyncResumeTemplatesRequest(value: unknown): value is SyncResumeTemplatesRequest {
  return isRecord(value)
    && Array.isArray(value.templates)
    && value.templates.length <= 50
    && value.templates.every((template) => isRecord(template)
      && typeof template.id === "string"
      && typeof template.name === "string"
      && isRecord(template.profile)
      && (template.document === undefined || isResumeDocument(template.document))
      && (template.origin === undefined || template.origin === "web" || template.origin === "extension")
      && typeof template.createdAt === "string"
      && typeof template.updatedAt === "string"
      && (template.sourceFileName === undefined || typeof template.sourceFileName === "string"));
}

export function isExchangeHandoffRequest(value: unknown): value is ExchangeHandoffRequest {
  return isRecord(value) && typeof value.code === "string" && value.code.trim().length > 0;
}
