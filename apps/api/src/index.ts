import type { HealthResponse } from "@offerflow/contracts";

export const API_MODULES = [
  "auth",
  "profiles",
  "applications",
  "opportunities",
  "sync",
  "imports"
] as const;

export type ApiModule = (typeof API_MODULES)[number];

export function createHealthResponse(version = "0.1.0"): HealthResponse {
  return {
    service: "offerflow-api",
    status: "ok",
    version
  };
}
