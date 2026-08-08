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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
