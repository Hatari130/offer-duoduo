import type {
  ApiResponse,
  ApplicationDetailResponse,
  ApplicationListResponse,
  ApplicationSyncRequest,
  ApplicationSyncResponse,
  AuthCapabilities,
  AuthDeviceSession,
  AuthSession,
  ChatStreamEvent,
  ConversationListResponse,
  ConversationResponse,
  CreateApplicationRequest,
  CreateTailorTaskRequest,
  CreateTailorTaskResponse,
  CreateConversationRequest,
  DeviceCodeResponse,
  ExchangeDeviceCodeRequest,
  ExchangeDeviceCodeResponse,
  ExchangeHandoffRequest,
  ExchangeHandoffResponse,
  GenerateTailorTaskResponse,
  HealthResponse,
  InterviewRecordListResponse,
  InterviewRecordResponse,
  LoginRequest,
  OpportunityDetailResponse,
  OpportunityImportStatusResponse,
  OpportunityListResponse,
  ProfileResponse,
  ResumeVersionResponse,
  ResumeVersionListResponse,
  RegisterRequest,
  RetryMessageRequest,
  SendMessageRequest,
  SessionResponse,
  TailorTaskDetailResponse,
  UpdateApplicationRequest,
  UpdateResumeVersionRequest
} from "@offerflow/contracts";
import type { CreateInterviewRecordFromTranscriptRequest } from "@offerflow/contracts";

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof globalThis.fetch;
  getAccessToken?: () => string | undefined | Promise<string | undefined>;
  onUnauthorized?: () => void;
  credentials?: RequestCredentials;
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

  function interviewAudioMimeType(file: File): string {
    if (file.type) return file.type;
    const extension = file.name.split(".").pop()?.toLowerCase();
    return ({
      aac: "audio/aac",
      flac: "audio/flac",
      m4a: "audio/mp4",
      mp3: "audio/mpeg",
      mp4: "audio/mp4",
      ogg: "audio/ogg",
      wav: "audio/wav",
      webm: "audio/webm"
    } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream";
  }

  async function createHeaders(init?: RequestInit): Promise<Headers> {
    const token = await options.getAccessToken?.();
    const headers = new Headers(init?.headers);
    headers.set("accept", "application/json");
    if (init?.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
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
    const response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers, credentials: options.credentials });
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
      signal,
      credentials: options.credentials
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
    capabilities: () => request<AuthCapabilities>("/v1/auth/capabilities"),
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
    refresh: () => request<AuthSession>("/v1/auth/refresh", { method: "POST" }),
    logout: () => request<{ loggedOut: true }>("/v1/auth/logout", { method: "POST" }),
    session: () => request<SessionResponse>("/v1/session"),
    listSessions: () => request<{ sessions: AuthDeviceSession[]; currentSessionId: string }>("/v1/auth/sessions"),
    revokeSession: (sessionId: string) => request<{ revoked: true }>(`/v1/auth/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
    createDeviceCode: () =>
      request<DeviceCodeResponse>("/v1/auth/device-codes", { method: "POST" }),
    exchangeDeviceCode: (body: ExchangeDeviceCodeRequest) =>
      request<ExchangeDeviceCodeResponse>("/v1/auth/device-token", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    exchangeHandoff: (body: ExchangeHandoffRequest) =>
      request<ExchangeHandoffResponse>("/v1/auth/handoff-token", {
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

  const resumes = {
    listVersions: () => request<ResumeVersionListResponse>("/v1/resume-versions"),
    createTailorTask: (body: CreateTailorTaskRequest) =>
      request<CreateTailorTaskResponse>("/v1/tailor-tasks", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    getTailorTask: (taskId: string) =>
      request<TailorTaskDetailResponse>(
        `/v1/tailor-tasks/${encodeURIComponent(taskId)}`
      ),
    generateTailorTask: (taskId: string) =>
      request<GenerateTailorTaskResponse>(
        `/v1/tailor-tasks/${encodeURIComponent(taskId)}`,
        { method: "POST" }
      ),
    getVersion: (versionId: string) =>
      request<ResumeVersionResponse>(
        `/v1/resume-versions/${encodeURIComponent(versionId)}`
      ),
    updateVersion: (versionId: string, body: UpdateResumeVersionRequest) =>
      request<ResumeVersionResponse>(
        `/v1/resume-versions/${encodeURIComponent(versionId)}`,
        { method: "PATCH", body: JSON.stringify(body) }
      )
  };

  const interviews = {
    list: (applicationId: string) =>
      request<InterviewRecordListResponse>(
        `/v1/applications/${encodeURIComponent(applicationId)}/interview-records`
      ),
    createFromTranscript: (
      applicationId: string,
      body: CreateInterviewRecordFromTranscriptRequest
    ) =>
      request<InterviewRecordResponse>(
        `/v1/applications/${encodeURIComponent(applicationId)}/interview-records`,
        { method: "POST", body: JSON.stringify(body) }
      ),
    uploadAudio: (
      applicationId: string,
      file: File,
      options: { title?: string } = {}
    ) => {
      const query = new URLSearchParams({ fileName: file.name });
      if (options.title?.trim()) query.set("title", options.title.trim());
      return request<InterviewRecordResponse>(
        `/v1/applications/${encodeURIComponent(applicationId)}/interview-records/audio?${query}`,
        {
          method: "POST",
          body: file,
          headers: { "content-type": interviewAudioMimeType(file) }
        }
      );
    }
  };

  const account = {
    exportData: () => request<Record<string, unknown>>("/v1/account/export"),
    delete: (body: { password: string; confirmation: "DELETE" }) =>
      request<{ deleted: true }>("/v1/account", {
        method: "DELETE",
        body: JSON.stringify(body)
      })
  };

  return {
    auth,
    account,
    chat,
    opportunities,
    applications,
    interviews,
    resumes,
    health: () => request<HealthResponse>("/health"),
    profile: { get: () => request<ProfileResponse>("/v1/profile") },
    // Compatibility aliases for the extension's existing call sites.
    listOpportunities: opportunities.list,
    getProfile: () => request<ProfileResponse>("/v1/profile"),
    syncApplications: applications.sync
  };
}
