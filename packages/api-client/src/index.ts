import type {
  ApiResponse,
  ApplicationSyncRequest,
  ApplicationSyncResponse,
  HealthResponse,
  OpportunityListResponse,
  ProfileResponse
} from "@offerflow/contracts";

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof globalThis.fetch;
  getAccessToken?: () => string | undefined | Promise<string | undefined>;
}

export class OfferFlowApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = "OfferFlowApiError";
  }
}

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await options.getAccessToken?.();
    const headers = new Headers(init?.headers);
    headers.set("accept", "application/json");
    if (init?.body) headers.set("content-type", "application/json");
    if (token) headers.set("authorization", `Bearer ${token}`);

    const response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers });
    const payload = (await response.json()) as ApiResponse<T>;
    if (!response.ok || !payload.ok) {
      const error = payload.ok
        ? { code: "HTTP_ERROR", message: `Request failed with ${response.status}` }
        : payload.error;
      throw new OfferFlowApiError(error.message, error.code, response.status);
    }
    return payload.data;
  }

  return {
    health: () => request<HealthResponse>("/health"),
    listOpportunities: () => request<OpportunityListResponse>("/v1/opportunities"),
    getProfile: () => request<ProfileResponse>("/v1/profile"),
    syncApplications: (body: ApplicationSyncRequest) =>
      request<ApplicationSyncResponse>("/v1/applications/sync", {
        method: "POST",
        body: JSON.stringify(body)
      })
  };
}
