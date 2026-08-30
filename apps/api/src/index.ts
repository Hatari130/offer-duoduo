import type { HealthResponse } from "@offerflow/contracts";

export const API_MODULES = [
  "auth",
  "chat",
  "knowledge",
  "profiles",
  "applications",
  "opportunities",
  "sync",
  "imports",
  "feedback"
] as const;

export type ApiModule = (typeof API_MODULES)[number];

export function createHealthResponse(version = "0.1.0"): HealthResponse {
  return {
    service: "offerflow-api",
    status: "ok",
    version
  };
}

export { createOfferFlowApp } from "./app.ts";
export { createOfferFlowServer } from "./server.ts";
