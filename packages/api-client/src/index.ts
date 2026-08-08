import type {
  ApiResponse,
  ApplicationDetailResponse,
  ApplicationListResponse,
  ApplicationSyncRequest,
  ApplicationSyncResponse,
  AuthSession,
  ChatStreamEvent,
  ConversationListResponse,
  ConversationResponse,
  CreateApplicationRequest,
  CreateConversationRequest,
  DeviceCodeResponse,
  ExchangeDeviceCodeRequest,
  ExchangeDeviceCodeResponse,
  HealthResponse,
  LoginRequest,
  OpportunityDetailResponse,
  OpportunityImportStatusResponse,
  OpportunityListResponse,
  OpportunitySyncRequest,
  OpportunitySyncResponse,
  ProfileResponse,
  RegisterRequest,
  RetryMessageRequest,
  SendMessageRequest,
  SessionResponse,
  UpdateApplicationRequest
} from "@offerflow/contracts";

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof globalThis.fetch;
  getAccessToken?: () => string | undefined | Promise<string | undefined>;
  onUnauthorized?: () => void;
}

export class OfferFlowApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "OfferFlowApiError";
  }
}

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function createHeaders(init?: RequestInit): Promise<Headers> {
    const token = await options.getAccessToken?.();
    const headers = new Headers(init?.headers);
    headers.set("accept", "application/json");
    if (init?.body) headers.set("content-type", "application/json");
    if (token) headers.set("authorization", `Bearer ${token}`);
    return headers;
  }

  async function readError(response: Response): Promise<OfferFlowApiError> {
    let code = "HTTP_ERROR";
    let message = `Request failed with ${response.status}`;
    let details: Record<string, unknown> | undefined;
    try {
      const payload = (await response.json()) as ApiResponse<unknown>;
      if (!payload.ok) {
        code = payload.error.code;
        message = payload.error.message;
        details = payload.error.details;
      }
    } catch {
      // Keep the status-derived fallback for non-JSON failures.
    }
    if (response.status === 401) options.onUnauthorized?.();
    return new OfferFlowApiError(message, code, response.status, details);
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = await createHeaders(init);
    const response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers });
    if (!response.ok) throw await readError(response);

    const payload = (await response.json()) as ApiResponse<T>;
    if (!payload.ok) {
      throw new OfferFlowApiError(
        payload.error.message,
        payload.error.code,
        response.status,
        payload.error.details
      );
    }
    return payload.data;
  }

  async function* streamChat(
    path: string,
    body: SendMessageRequest | RetryMessageRequest,
    signal?: AbortSignal
  ): AsyncGenerator<ChatStreamEvent> {
    const headers = await createHeaders({ body: "{}" });
    headers.set("accept", "text/event-stream");
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers,
      signal
    });
    if (!response.ok) throw await readError(response);
    if (!response.body) {
      throw new OfferFlowApiError("浏览器没有提供流式响应", "STREAM_UNAVAILABLE", 500);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const data = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!data) continue;
          yield JSON.parse(data) as ChatStreamEvent;
        }
        if (done) break;
      }
    } finally {
      reader.releaseLock();
    }
  }

  const auth = {
    login: (body: LoginRequest) =>
      request<AuthSession>("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    register: (body: RegisterRequest) =>
      request<AuthSession>("/v1/auth/register", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    demo: () => request<AuthSession>("/v1/auth/demo", { method: "POST" }),
    session: () => request<SessionResponse>("/v1/session"),
    createDeviceCode: () =>
      request<DeviceCodeResponse>("/v1/auth/device-codes", { method: "POST" }),
    exchangeDeviceCode: (body: ExchangeDeviceCodeRequest) =>
      request<ExchangeDeviceCodeResponse>("/v1/auth/device-token", {
        method: "POST",
        body: JSON.stringify(body)
      })
  };

  const chat = {
    listConversations: () =>
      request<ConversationListResponse>("/v1/conversations"),
    createConversation: (body: CreateConversationRequest = {}) =>
      request<ConversationResponse>("/v1/conversations", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    getConversation: (conversationId: string) =>
      request<ConversationResponse>(`/v1/conversations/${encodeURIComponent(conversationId)}`),
    deleteConversation: (conversationId: string) =>
      request<{ deleted: true }>(`/v1/conversations/${encodeURIComponent(conversationId)}`, {
        method: "DELETE"
      }),
    sendMessage: (conversationId: string, body: SendMessageRequest, signal?: AbortSignal) =>
      streamChat(
        `/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
        body,
        signal
      ),
    retryMessage: (
      conversationId: string,
      messageId: string,
      body: RetryMessageRequest,
      signal?: AbortSignal
    ) =>
      streamChat(
        `/v1/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/retry`,
        body,
        signal
      )
  };

  const opportunities = {
    list: (query = "") =>
      request<OpportunityListResponse>(`/v1/opportunities${query ? `?${query}` : ""}`),
    get: (opportunityId: string) =>
      request<OpportunityDetailResponse>(
        `/v1/opportunities/${encodeURIComponent(opportunityId)}`
      ),
    sync: (body: OpportunitySyncRequest) =>
      request<OpportunitySyncResponse>("/v1/opportunities/sync", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    importStatus: () =>
      request<OpportunityImportStatusResponse>("/v1/imports/opportunities/status")
  };

  const applications = {
    list: () => request<ApplicationListResponse>("/v1/applications"),
    get: (applicationId: string) =>
      request<ApplicationDetailResponse>(
        `/v1/applications/${encodeURIComponent(applicationId)}`
      ),
    create: (body: CreateApplicationRequest) =>
      request<ApplicationDetailResponse>("/v1/applications", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    update: (applicationId: string, body: UpdateApplicationRequest) =>
      request<ApplicationDetailResponse>(
        `/v1/applications/${encodeURIComponent(applicationId)}`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),
    remove: (applicationId: string, expectedRevision: number) =>
      request<ApplicationDetailResponse>(
        `/v1/applications/${encodeURIComponent(applicationId)}?expectedRevision=${expectedRevision}`,
        { method: "DELETE" }
      ),
    sync: (body: ApplicationSyncRequest) =>
      request<ApplicationSyncResponse>("/v1/applications/sync", {
        method: "POST",
        body: JSON.stringify(body)
      })
  };

  return {
    auth,
    chat,
    opportunities,
    applications,
    health: () => request<HealthResponse>("/health"),
    profile: { get: () => request<ProfileResponse>("/v1/profile") },
    // Compatibility aliases for the extension's existing call sites.
    listOpportunities: opportunities.list,
    getProfile: () => request<ProfileResponse>("/v1/profile"),
    syncApplications: applications.sync
  };
}
