import type { JobApplication } from "@offerflow/domain";
import { isRecord } from "./common.ts";

export interface ApplicationSyncItem {
  application: JobApplication;
  revision: number;
  deletedAt?: string;
}

export interface ApplicationListResponse {
  applications: ApplicationSyncItem[];
}

export interface ApplicationDetailResponse {
  item: ApplicationSyncItem;
}

export interface CreateApplicationRequest {
  application: JobApplication;
}

export interface UpdateApplicationRequest {
  application: JobApplication;
  expectedRevision: number;
}

export interface ApplicationSyncChange {
  changeId: string;
  application: JobApplication;
  baseRevision: number;
  deletedAt?: string;
}

export interface ApplicationSyncRequest {
  deviceId: string;
  cursor?: string;
  changes: ApplicationSyncChange[];
}

export interface ApplicationSyncConflict {
  changeId: string;
  entityId: string;
  code: "revision_conflict" | "deleted_on_server";
  message: string;
  server?: ApplicationSyncItem;
  /** The rejected local change is returned so clients never lose a draft. */
  local?: ApplicationSyncChange;
}

export interface ApplicationSyncResponse {
  cursor: string;
  changes: ApplicationSyncItem[];
  acceptedChangeIds: string[];
  conflicts: ApplicationSyncConflict[];
}

export function isApplicationSyncRequest(value: unknown): value is ApplicationSyncRequest {
  return (
    isRecord(value) &&
    typeof value.deviceId === "string" &&
    (value.cursor === undefined || typeof value.cursor === "string") &&
    Array.isArray(value.changes) &&
    value.changes.every(
      (change) =>
        isRecord(change) &&
        typeof change.changeId === "string" &&
        typeof change.baseRevision === "number" &&
        isRecord(change.application)
    )
  );
}
