import type {
  JobApplication,
  OpportunityFeedSnapshot,
  PersonalProfile,
  RecruitmentOpportunity
} from "@offerflow/domain";

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export interface HealthResponse {
  service: "offerflow-api";
  status: "ok";
  version: string;
}

export interface OpportunityListResponse extends OpportunityFeedSnapshot {
  nextCursor?: string;
}

export interface OpportunityDetailResponse {
  opportunity: RecruitmentOpportunity;
}

export interface ApplicationSyncItem {
  application: JobApplication;
  revision: number;
  deletedAt?: string;
}

export interface ApplicationSyncRequest {
  deviceId: string;
  cursor?: string;
  changes: ApplicationSyncItem[];
}

export interface ApplicationSyncResponse {
  cursor: string;
  changes: ApplicationSyncItem[];
}

export interface ProfileResponse {
  profile: PersonalProfile;
  revision: number;
}
