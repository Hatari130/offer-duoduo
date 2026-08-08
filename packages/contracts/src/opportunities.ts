import type {
  OpportunityFeedSnapshot,
  RecruitmentOpportunity
} from "@offerflow/domain";
import { isRecord } from "./common.ts";

export interface OpportunityListResponse extends OpportunityFeedSnapshot {
  nextCursor?: string;
}

export interface OpportunityDetailResponse {
  opportunity: RecruitmentOpportunity;
}

export interface OpportunitySyncRequest extends OpportunityFeedSnapshot {}

export interface OpportunitySyncResponse {
  accepted: number;
  fetchedAt?: string;
}

export interface OpportunityImportStatusResponse {
  status: "not_configured" | "ready" | "running" | "failed";
  message: string;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOpportunity(value: unknown): value is RecruitmentOpportunity {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.company === "string" &&
    typeof value.title === "string" &&
    typeof value.officialUrl === "string" &&
    isOptionalString(value.batch) &&
    isOptionalString(value.status) &&
    isOptionalString(value.openAt) &&
    isOptionalString(value.deadline) &&
    Array.isArray(value.graduationYears) &&
    value.graduationYears.every((item) => typeof item === "string") &&
    Array.isArray(value.roleTags) &&
    value.roleTags.every((item) => typeof item === "string") &&
    Array.isArray(value.cities) &&
    value.cities.every((item) => typeof item === "string") &&
    isOptionalString(value.sourceUrl) &&
    isOptionalString(value.sourceName) &&
    isOptionalString(value.verifiedAt) &&
    isOptionalString(value.updatedAt)
  );
}

export function isOpportunitySyncRequest(value: unknown): value is OpportunitySyncRequest {
  return (
    isRecord(value) &&
    Array.isArray(value.opportunities) &&
    value.opportunities.every(isOpportunity) &&
    isOptionalString(value.fetchedAt) &&
    isOptionalString(value.sourceUpdatedAt) &&
    isOptionalString(value.sourceUrl)
  );
}
