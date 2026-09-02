import { createApiClient } from "@offerflow/api-client";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:8787";

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  credentials: "include"
});
