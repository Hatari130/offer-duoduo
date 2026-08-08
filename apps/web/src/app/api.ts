import { createApiClient } from "@offerflow/api-client";

export const ACCESS_TOKEN_KEY = "offerflow.web.accessToken";
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:8787";

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => window.localStorage.getItem(ACCESS_TOKEN_KEY) || undefined,
  onUnauthorized: () => window.dispatchEvent(new Event("offerflow:unauthorized"))
});
