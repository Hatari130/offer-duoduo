import type { IncomingMessage, ServerResponse } from "node:http";
import { once } from "node:events";
import { isIP } from "node:net";
import type {
  ApiError,
  ApiResponse,
  AuthSession,
  AuthDeviceSession,
  ChatContextResponse,
  ChatStreamEvent,
  CreateApplicationRequest,
  CreateInterviewRecordFromTranscriptRequest,
  CreateTailorTaskRequest,
  CreateConversationRequest,
  MessageFeedbackRequest,
  RetryMessageRequest,
  SendMessageRequest,
  SessionUser,
  UpdateConversationRequest,
  UpdateApplicationRequest
} from "@offerflow/contracts";
import {
  MAX_INTERVIEW_AUDIO_BYTES,
  isApplicationSyncRequest,
  isCreateProductFeedbackRequest,
  isCreateInterviewRecordFromTranscriptRequest,
  isCreateTailorTaskRequest,
  isExchangeHandoffRequest,
  isExchangeDeviceCodeRequest,
  isSendEmailVerificationCodeRequest,
  isVerifyEmailVerificationCodeRequest,
  isLoginRequest,
  isRecord,
  isRegisterRequest,
  isResetPasswordRequest,
  isOpportunitySyncRequest,
  isMessageFeedbackRequest,
  isRetryMessageRequest,
  isSendMessageRequest,
  isSupportedInterviewAudioMimeType,
  isUpdateAccountAvatarRequest,
  normalizeMimeType,
  isUpdateConversationRequest,
  isUpdateResumeVersionRequest
} from "@offerflow/contracts";
import type {
  ChatAttachment,
  ChatContextOption,
  ChatContextReference,
  ChatMessage,
  ChatOpportunityResults,
  JobApplication,
  KnowledgeCitation,
  OpportunityFeedSnapshot,
  PersonalProfile
} from "@offerflow/domain";
import { opportunityStatus, RECRUITMENT_TYPES, STAGE_LABELS } from "@offerflow/domain";
import { createAssistantProvider, type AssistantProvider } from "./ai/assistant.ts";
import { createDirectMailMailer, type EmailMailer } from "./auth/direct-mail.ts";
import { createEmailVerificationService } from "./auth/email-verification.ts";
import { opportunityCapabilityAnswer } from "./ai/capabilities.ts";
import { createResumeTailorProvider, type ResumeTailorProvider } from "./ai/resume-tailor.ts";
import { loadApiConfig, type ApiConfig } from "./config.ts";
import {
  createInterviewQaParser,
  type InterviewQaParser
} from "./interviews/qa-parser.ts";
import {
  createInterviewTranscriptionProvider,
  type InterviewTranscriptionProvider
} from "./interviews/transcription.ts";
import { KnowledgeService, type KnowledgeEntry } from "./knowledge/service.ts";
import {
  fetchCampusHiringSnapshot,
  loadCampusHiringSnapshot,
  opportunitySearchAnswer,
  resolveOpportunitySearchPrompt,
  searchOpportunitySnapshot
} from "./opportunities/search.ts";
import { MemoryStore } from "./store/memory-store.ts";
import { PostgresStore } from "./store/postgres-store.ts";
import { StoreError, type OfferFlowStore, type SessionRecord } from "./store/store.ts";

export interface OfferFlowAppOptions {
  config?: ApiConfig;
  store?: OfferFlowStore;
  assistant?: AssistantProvider;
  resumeTailor?: ResumeTailorProvider;
  knowledge?: KnowledgeService;
  interviewQaParser?: InterviewQaParser;
  transcriber?: InterviewTranscriptionProvider;
  emailMailer?: EmailMailer;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function sendJson<T>(response: ServerResponse, status: number, payload: ApiResponse<T>): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function success<T>(response: ServerResponse, data: T, status = 200): void {
  sendJson(response, status, { ok: true, data });
}

function failure(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): void {
  const error: ApiError = { code, message, details };
  sendJson(response, status, { ok: false, error });
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 1_000_000) {
      throw new HttpError(413, "BODY_TOO_LARGE", "请求内容不能超过 1 MB");
    }
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "INVALID_JSON", "请求内容不是有效的 JSON");
  }
}

function requestIp(request: IncomingMessage): string | undefined {
  const forwarded = request.headers["x-forwarded-for"];
  const candidate = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim()
    || request.socket.remoteAddress;
  return candidate && isIP(candidate) ? candidate : undefined;
}

async function readBinary(request: IncomingMessage, maximumBytes: number): Promise<Buffer> {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new HttpError(
      413,
      "AUDIO_TOO_LARGE",
      `录音文件不能超过 ${Math.floor(maximumBytes / 1024 / 1024)} MB`
    );
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maximumBytes) {
      throw new HttpError(
        413,
        "AUDIO_TOO_LARGE",
        `录音文件不能超过 ${Math.floor(maximumBytes / 1024 / 1024)} MB`
      );
    }
    chunks.push(buffer);
  }
  if (!bytes) throw new HttpError(400, "EMPTY_AUDIO", "请选择一份非空录音文件");
  const audio = Buffer.concat(chunks);
  for (const chunk of chunks) chunk.fill(0);
  return audio;
}

function bearerToken(request: IncomingMessage): string | undefined {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return undefined;
  return authorization.slice(7).trim();
}

function cookieToken(request: IncomingMessage, name: string): string | undefined {
  for (const part of (request.headers.cookie || "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      try { return decodeURIComponent(value.join("=")); } catch { return undefined; }
    }
  }
  return undefined;
}

function requestToken(request: IncomingMessage, cookieName: string): string | undefined {
  return bearerToken(request) || cookieToken(request, cookieName);
}

function setSessionCookie(response: ServerResponse, config: ApiConfig, token: string, expiresAt: string): void {
  const secure = config.requireHttps ? "; Secure" : "";
  response.setHeader(
    "set-cookie",
    `${config.cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${secure}`
  );
}

function clearSessionCookie(response: ServerResponse, config: ApiConfig): void {
  const secure = config.requireHttps ? "; Secure" : "";
  response.setHeader("set-cookie", `${config.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "INVALID_PATH", "请求路径无法解析");
  }
}

function isJobApplication(value: unknown): value is JobApplication {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 && value.id.length <= 128 &&
    typeof value.company === "string" &&
    value.company.length <= 200 &&
    typeof value.position === "string" &&
    value.position.length <= 200 &&
    typeof value.stage === "string" &&
    typeof value.sourceUrl === "string" &&
    value.sourceUrl.length <= 2_000 &&
    typeof value.sourceHost === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (value.recruitmentType === undefined ||
      RECRUITMENT_TYPES.includes(value.recruitmentType as (typeof RECRUITMENT_TYPES)[number])) &&
    Array.isArray(value.responsibilities) &&
    Array.isArray(value.requirements) &&
    Array.isArray(value.events)
  );
}

async function writeSse(response: ServerResponse, event: ChatStreamEvent): Promise<void> {
  if (response.destroyed || response.writableEnded) return;
  if (!response.write(`data: ${JSON.stringify(event)}\n\n`)) {
    await once(response, "drain");
  }
}

function isOriginAllowed(origin: string, config: ApiConfig): boolean {
  return config.allowedOrigins.includes(origin)
    || (origin.startsWith("chrome-extension://") && config.allowedOrigins.includes("chrome-extension://*"));
}

function setCors(request: IncomingMessage, response: ServerResponse, config: ApiConfig): void {
  const origin = request.headers.origin;
  if (origin && isOriginAllowed(origin, config)) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("access-control-allow-credentials", "true");
    response.setHeader("vary", "Origin");
  }
  response.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.setHeader("access-control-allow-headers", "Authorization,Content-Type,X-OfferFlow-Ingest-Key");
  response.setHeader("access-control-max-age", "86400");
}

function setSecurityHeaders(response: ServerResponse, secure: boolean): void {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
  response.setHeader("cache-control", "no-store");
  if (secure) response.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
}

export function createOfferFlowApp(options: OfferFlowAppOptions = {}) {
  const config = options.config ?? loadApiConfig();
  const store: OfferFlowStore = options.store ?? (config.databaseUrl
    ? new PostgresStore({ connectionString: config.databaseUrl, allowDemoAuth: config.allowDemoAuth })
    : new MemoryStore());
  const assistant = options.assistant ?? createAssistantProvider(config);
  const resumeTailor = options.resumeTailor ?? createResumeTailorProvider(config);
  const knowledge = options.knowledge ?? new KnowledgeService();
  const interviewQaParser = options.interviewQaParser ?? createInterviewQaParser(config);
  const transcriber = options.transcriber ?? createInterviewTranscriptionProvider(config);
  const emailMailer = options.emailMailer ?? createDirectMailMailer(config);
  const emailVerification = createEmailVerificationService(config, store, emailMailer);
  const authAttempts = new Map<string, { count: number; resetAt: number }>();
  const feedbackAttempts = new Map<string, { count: number; resetAt: number }>();
  let opportunityRefresh: Promise<Awaited<ReturnType<OfferFlowStore["getOpportunityFeed"]>>> | undefined;

  async function refreshOpportunitySnapshot(preferSeed: boolean): Promise<OpportunityFeedSnapshot> {
    let seedError: unknown;
    if (preferSeed && config.opportunitySeedPath) {
      try {
        return await loadCampusHiringSnapshot(config.opportunitySeedPath, config.opportunitySourceUrl);
      } catch (error) {
        seedError = error;
      }
    }

    let sourceError: unknown;
    if (config.opportunitySourceUrl) {
      try {
        return await fetchCampusHiringSnapshot(
          config.opportunitySourceUrl,
          AbortSignal.timeout(config.opportunityFetchTimeoutSeconds * 1_000)
        );
      } catch (error) {
        sourceError = error;
      }
    }

    if (!preferSeed && config.opportunitySeedPath) {
      try {
        return await loadCampusHiringSnapshot(config.opportunitySeedPath, config.opportunitySourceUrl);
      } catch (error) {
        seedError = error;
      }
    }
    throw sourceError ?? seedError ?? new Error("没有配置可用的岗位数据源");
  }

  async function freshOpportunitySnapshot(): Promise<{
    snapshot: OpportunityFeedSnapshot;
    sourceAvailable: boolean;
  }> {
    let snapshot = await store.getOpportunityFeed();
    let sourceAvailable = snapshot.opportunities.length > 0 || !config.opportunitySourceUrl;
    const fetchedAt = snapshot.fetchedAt ? Date.parse(snapshot.fetchedAt) : Number.NaN;
    const stale = !Number.isFinite(fetchedAt)
      || Date.now() - fetchedAt >= config.opportunityRefreshSeconds * 1_000;

    if ((config.opportunitySourceUrl || config.opportunitySeedPath) && (snapshot.opportunities.length === 0 || stale)) {
      opportunityRefresh ??= refreshOpportunitySnapshot(snapshot.opportunities.length === 0)
        .then((fresh) => store.replaceOpportunityFeed(fresh))
        .finally(() => { opportunityRefresh = undefined; });
      try {
        snapshot = await opportunityRefresh;
        sourceAvailable = true;
      } catch (error) {
        console.warn("[opportunities] refresh failed; using the last stored snapshot", error);
      }
    }

    return { snapshot, sourceAvailable };
  }

  async function searchChatOpportunities(prompt: string, history: ChatMessage[]): Promise<ChatOpportunityResults | undefined> {
    const resolution = resolveOpportunitySearchPrompt(prompt, history);
    if (!resolution) return undefined;
    const { snapshot, sourceAvailable } = await freshOpportunitySnapshot();

    return searchOpportunitySnapshot(snapshot, resolution.prompt, {
      limit: 5,
      sourceAvailable,
      contextPrompt: resolution.contextPrompt
    });
  }

  function enforceAuthRateLimit(request: IncomingMessage): void {
    const forwarded = request.headers["x-forwarded-for"];
    const address = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim()
      || request.socket.remoteAddress
      || "unknown";
    const now = Date.now();
    const current = authAttempts.get(address);
    if (!current || current.resetAt <= now) {
      authAttempts.set(address, { count: 1, resetAt: now + 15 * 60 * 1000 });
      return;
    }
    current.count += 1;
    if (current.count > 20) {
      throw new HttpError(429, "RATE_LIMITED", "尝试次数过多，请 15 分钟后再试");
    }
  }

  function transcriptChunks(transcript: string, maximumCharacters = 1_200): string[] {
    const paragraphs = transcript
      .replace(/\r/g, "")
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
    const chunks: string[] = [];
    for (const paragraph of paragraphs.length ? paragraphs : [transcript.trim()]) {
      for (let offset = 0; offset < paragraph.length; offset += maximumCharacters) {
        chunks.push(paragraph.slice(offset, offset + maximumCharacters));
      }
    }
    return chunks.filter(Boolean);
  }

  async function privateInterviewKnowledge(userId: string): Promise<KnowledgeEntry[]> {
    // Both lookups are user-scoped before content is materialised. Never put
    // raw audio or another user's interview records into retrieval candidates.
    const applications = (await store.listApplications(userId)).filter((item) => !item.deletedAt);
    const recordGroups = await Promise.all(applications.map(async ({ application }) => ({
      application,
      records: await store.listInterviewRecords(userId, application.id)
    })));
    return recordGroups.flatMap(({ application, records }) =>
      records
        .filter((record) => record.status === "ready")
        .flatMap((record) => {
          const sourceId = `interview-record:${record.id}`;
          const title = `个人面试记录｜${application.company} · ${application.position}｜${record.title}`;
          const transcriptEntries = transcriptChunks(record.transcript).map((content, index) => ({
            id: `${sourceId}:transcript:${index}`,
            sourceId,
            title,
            content
          }));
          const qaEntries = record.qaPairs.map((pair) => ({
            id: `${sourceId}:qa:${pair.id}`,
            sourceId,
            title,
            content: `问题：${pair.question}\n回答：${pair.answer}${pair.evidence ? `\n原文依据：${pair.evidence}` : ""}`.slice(0, 1_800)
          }));
          return [...qaEntries, ...transcriptEntries];
        })
    );
  }

  function profileKnowledge(profile: PersonalProfile): string {
    const education = profile.education.map((item) =>
      `${item.school}｜${item.degree} ${item.major}｜${item.startDate}—${item.endDate}`
    );
    const experiences = profile.experiences.map((item) =>
      `${item.organization}｜${item.title}\n${item.description}${item.achievements ? `\n成果：${item.achievements}` : ""}`
    );
    const projects = profile.projects.map((item) =>
      `${item.name}｜${item.role}\n${item.description}${item.achievement ? `\n成果：${item.achievement}` : ""}`
    );
    return [
      profile.targetRole && `目标岗位：${profile.targetRole}`,
      profile.targetCities && `目标城市：${profile.targetCities}`,
      profile.graduationDate && `毕业时间：${profile.graduationDate}`,
      education.length && `教育经历：\n${education.join("\n")}`,
      experiences.length && `工作与实习：\n${experiences.join("\n\n")}`,
      projects.length && `项目经历：\n${projects.join("\n\n")}`,
      profile.strengths && `优势：${profile.strengths}`,
      profile.selfIntroduction && `自我介绍：${profile.selfIntroduction}`,
      profile.careerPlan && `职业规划：${profile.careerPlan}`
    ].filter(Boolean).join("\n\n").slice(0, 12_000);
  }

  function applicationKnowledge(application: JobApplication): string {
    return [
      `公司：${application.company}`,
      `岗位：${application.position}`,
      application.city && `城市：${application.city}`,
      `投递阶段：${STAGE_LABELS[application.stage]}`,
      application.deadline && `截止时间：${application.deadline}`,
      application.nextAction && `下一步：${application.nextAction}`,
      application.summary && `岗位摘要：${application.summary}`,
      application.responsibilities.length && `岗位职责：\n${application.responsibilities.join("\n")}`,
      application.requirements.length && `岗位要求：\n${application.requirements.join("\n")}`,
      application.rawExcerpt && `岗位原文：\n${application.rawExcerpt}`
    ].filter(Boolean).join("\n\n").slice(0, 10_000);
  }

  async function chatContextCatalog(userId: string): Promise<ChatContextResponse> {
    const applications = (await store.listApplications(userId)).filter((item) => !item.deletedAt);
    const versions = await store.listResumeVersions(userId);
    const interviewGroups = await Promise.all(applications.map(async ({ application }) => ({
      application,
      records: await store.listInterviewRecords(userId, application.id)
    })));
    const contexts: ChatContextOption[] = [
      ...applications.map(({ application }) => ({
        kind: "application" as const,
        id: application.id,
        label: `${application.company} · ${application.position}`,
        description: `${STAGE_LABELS[application.stage]}${application.nextAction ? `｜${application.nextAction}` : ""}`,
        updatedAt: application.updatedAt,
        selectable: true
      })),
      ...versions.map(({ version }) => ({
        kind: "resume" as const,
        id: version.id,
        label: version.sourceResumeName || version.document.title,
        description: `${version.company} · ${version.position}`,
        updatedAt: version.updatedAt,
        selectable: true
      })),
      ...interviewGroups.flatMap(({ application, records }) => records
        .filter((record) => record.status === "ready")
        .map((record) => ({
          kind: "interview" as const,
          id: record.id,
          label: record.title,
          description: `${application.company} · ${application.position}`,
          updatedAt: record.updatedAt,
          selectable: true
        })))
    ].sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || ""));
    return { contexts: contexts.slice(0, 60) };
  }

  async function canonicalContextReferences(
    userId: string,
    references: ChatContextReference[] = []
  ): Promise<ChatContextReference[]> {
    if (!references.length) return [];
    const { contexts } = await chatContextCatalog(userId);
    return references.flatMap((reference) => {
      const option = contexts.find((item) => item.kind === reference.kind && item.id === reference.id);
      return option ? [{
        kind: option.kind,
        id: option.id,
        label: option.label,
        description: option.description,
        updatedAt: option.updatedAt
      }] : [];
    });
  }

  async function selectedContextKnowledge(
    userId: string,
    references: ChatContextReference[] = []
  ): Promise<KnowledgeEntry[]> {
    if (!references.length) return [];
    const applications = await store.listApplications(userId);
    const versions = await store.listResumeVersions(userId);
    const interviewEntries = references.some((item) => item.kind === "interview")
      ? await privateInterviewKnowledge(userId)
      : [];
    return references.flatMap((reference) => {
      if (reference.kind === "application") {
        const application = applications.find((item) => !item.deletedAt && item.application.id === reference.id)?.application;
        return application ? [{
          id: `application:${application.id}`,
          sourceId: `application:${application.id}`,
          title: `投递记录｜${application.company} · ${application.position}`,
          content: applicationKnowledge(application),
          url: application.sourceUrl
        }] : [];
      }
      if (reference.kind === "resume") {
        const version = versions.find((item) => item.version.id === reference.id)?.version;
        return version ? [{
          id: `resume:${version.id}`,
          sourceId: `resume:${version.id}`,
          title: `简历｜${version.sourceResumeName || version.document.title}`,
          content: profileKnowledge(version.document.profile)
        }] : [];
      }
      return interviewEntries.filter((entry) => entry.sourceId === `interview-record:${reference.id}`);
    });
  }

  function attachmentKnowledge(attachments: ChatAttachment[] = []): KnowledgeEntry[] {
    return attachments.flatMap((attachment) => transcriptChunks(attachment.content || "").map((content, index) => ({
      id: `attachment:${attachment.id}:${index}`,
      sourceId: `attachment:${attachment.id}`,
      title: `本次资料｜${attachment.name}`,
      content
    })));
  }

  function explicitCitations(entries: KnowledgeEntry[]): KnowledgeCitation[] {
    const seen = new Set<string>();
    return entries.flatMap((entry) => {
      if (seen.has(entry.sourceId)) return [];
      seen.add(entry.sourceId);
      return [{
        id: entry.id,
        sourceId: entry.sourceId,
        title: entry.title,
        excerpt: entry.content.slice(0, 1_800),
        url: entry.url,
        score: 100
      }];
    }).slice(0, 4);
  }

  async function requireSession(request: IncomingMessage): Promise<SessionRecord> {
    const token = requestToken(request, config.cookieName);
    const session = token ? await store.resolveSession(token) : undefined;
    if (!session || !(await store.getUser(session.userId))) {
      throw new HttpError(401, "UNAUTHORIZED", "登录状态已失效，请重新登录");
    }
    return session;
  }

  async function optionalSession(request: IncomingMessage): Promise<SessionRecord | undefined> {
    const token = requestToken(request, config.cookieName);
    if (!token) return undefined;
    const session = await store.resolveSession(token);
    return session && await store.getUser(session.userId) ? session : undefined;
  }

  function enforceFeedbackRateLimit(request: IncomingMessage): void {
    const key = String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown").split(",")[0].trim();
    const now = Date.now();
    const current = feedbackAttempts.get(key);
    if (!current || current.resetAt <= now) {
      feedbackAttempts.set(key, { count: 1, resetAt: now + 10 * 60_000 });
      return;
    }
    current.count += 1;
    if (current.count > 5) throw new HttpError(429, "FEEDBACK_RATE_LIMITED", "提交得有点频繁，请稍后再试");
  }

  async function issueSession(
    user: SessionUser,
    scope: "user" | "device" = "user",
    deviceId?: string,
    deviceName?: string
  ): Promise<AuthSession> {
    const ttl = scope === "device" ? config.deviceSessionTtlSeconds : config.webSessionTtlSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    const issued = await store.createSession(
      user.id,
      scope,
      expiresAt,
      deviceId,
      deviceName
    );
    return { user, accessToken: issued.accessToken, expiresAt };
  }

  async function streamAnswer(
    request: IncomingMessage,
    response: ServerResponse,
    userId: string,
    conversationId: string,
    prompt: string,
    history: ChatMessage[],
    attachments: ChatAttachment[] = [],
    context: ChatContextReference[] = []
  ): Promise<void> {
    const opportunityResults = await searchChatOpportunities(prompt, history);
    const capabilityAnswer = opportunityResults ? undefined : opportunityCapabilityAnswer(prompt);
    const selectedEntries = await selectedContextKnowledge(userId, context);
    const attachmentEntries = attachmentKnowledge(attachments);
    const contextualEntries = [...selectedEntries, ...attachmentEntries];
    const explicitlySelectedEntries = [...(context.length ? selectedEntries : []), ...attachmentEntries];
    const citations = opportunityResults || capabilityAnswer
      ? []
      : [...explicitCitations(explicitlySelectedEntries), ...knowledge.search(prompt, 4, contextualEntries)]
        .filter((citation, index, items) => items.findIndex((item) => item.id === citation.id) === index)
        .slice(0, 6);
    const assistantMessage = await store.beginAssistantMessage(userId, conversationId);
    const abortController = new AbortController();
    response.on("close", () => {
      if (!response.writableEnded) abortController.abort();
    });

    response.statusCode = 200;
    response.setHeader("content-type", "text/event-stream; charset=utf-8");
    response.setHeader("cache-control", "no-cache, no-transform");
    response.setHeader("connection", "keep-alive");
    response.setHeader("x-accel-buffering", "no");
    response.flushHeaders();

    await writeSse(response, { type: "message.started", message: assistantMessage });
    for (const citation of citations) {
      await writeSse(response, {
        type: "citation",
        messageId: assistantMessage.id,
        citation
      });
    }

    let content = "";
    try {
      if (opportunityResults) {
        content = opportunitySearchAnswer(opportunityResults);
        await writeSse(response, {
          type: "message.delta",
          messageId: assistantMessage.id,
          delta: content
        });
      } else if (capabilityAnswer) {
        content = capabilityAnswer;
        await writeSse(response, {
          type: "message.delta",
          messageId: assistantMessage.id,
          delta: content
        });
      } else {
        for await (const delta of assistant.generate({
          prompt,
          history,
          citations,
          signal: abortController.signal
        })) {
          content += delta;
          await writeSse(response, {
            type: "message.delta",
            messageId: assistantMessage.id,
            delta
          });
        }
      }
      const completed = await store.completeAssistantMessage(
        userId,
        conversationId,
        assistantMessage.id,
        content,
        citations,
        "complete",
        opportunityResults
      );
      await writeSse(response, { type: "message.completed", message: completed });
      await writeSse(response, { type: "done" });
    } catch (error) {
      const aborted = abortController.signal.aborted;
      await store.completeAssistantMessage(
        userId,
        conversationId,
        assistantMessage.id,
        content,
        citations,
        aborted ? "stopped" : "error",
        opportunityResults
      );
      if (!aborted) {
        await writeSse(response, {
          type: "error",
          error: {
            code: "CHAT_GENERATION_FAILED",
            message: error instanceof Error ? error.message : "回答生成失败，请重试"
          }
        });
      }
    } finally {
      if (!response.writableEnded) response.end();
    }
  }

  async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
    setCors(request, response, config);
    const forwardedProtocol = request.headers["x-forwarded-proto"];
    const secure = (Array.isArray(forwardedProtocol) ? forwardedProtocol[0] : forwardedProtocol) === "https";
    setSecurityHeaders(response, secure);
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }

    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const path = url.pathname;
    const method = request.method || "GET";

    try {
      if (config.requireHttps && !secure) {
        throw new HttpError(426, "HTTPS_REQUIRED", "此服务只接受 HTTPS 请求");
      }
      if (["POST", "PATCH", "DELETE"].includes(method) && cookieToken(request, config.cookieName)) {
        const origin = request.headers.origin;
        if (origin && !isOriginAllowed(origin, config)) {
          throw new HttpError(403, "ORIGIN_FORBIDDEN", "请求来源不受信任");
        }
      }
      if (method === "GET" && path === "/health") {
        success(response, {
          service: "offerflow-api" as const,
          status: "ok" as const,
          version: "0.1.0"
        });
        return;
      }

      if (method === "GET" && path === "/v1/auth/capabilities") {
        success(response, {
          registrationMode: config.registrationMode,
          demoEnabled: config.allowDemoAuth,
          emailVerificationEnabled: config.emailVerificationEnabled
        });
        return;
      }

      if (method === "POST" && path === "/v1/auth/email-code/send") {
        const body = await readJson(request);
        if (!isSendEmailVerificationCodeRequest(body) || !/^\S+@\S+\.\S+$/.test(body.email.trim()) || body.email.length > 254) {
          throw new HttpError(400, "INVALID_EMAIL_CODE_REQUEST", "请输入有效的邮箱地址");
        }
        if (!["register", "reset_password"].includes(body.purpose)) {
          throw new HttpError(400, "EMAIL_CODE_PURPOSE_UNAVAILABLE", "当前不支持此邮箱验证类型");
        }
        if (!config.emailVerificationEnabled) {
          throw new HttpError(404, "NOT_FOUND", "邮箱验证功能没有开启");
        }
        if (body.purpose === "register" && config.registrationMode === "closed") {
          throw new HttpError(403, "REGISTRATION_CLOSED", "当前仅限受邀用户注册");
        }
        const email = body.email.trim().toLowerCase();
        if (body.purpose === "register" && config.registrationMode === "allowlist" && !config.allowedRegistrationEmails.includes(email)) {
          throw new HttpError(403, "REGISTRATION_NOT_ALLOWED", "这个邮箱尚未获得注册权限");
        }
        if (body.purpose === "register" || await store.findUserByEmail(email)) {
          await emailVerification.sendCode(email, body.purpose, requestIp(request));
        }
        success(response, { sent: true as const, retryAfterSeconds: 60 });
        return;
      }

      if (method === "POST" && path === "/v1/auth/email-code/verify") {
        const body = await readJson(request);
        if (!isVerifyEmailVerificationCodeRequest(body) || body.purpose !== "register") {
          throw new HttpError(400, "INVALID_EMAIL_CODE", "验证码无效或已过期");
        }
        if (!config.emailVerificationEnabled) {
          throw new HttpError(404, "NOT_FOUND", "邮箱验证功能没有开启");
        }
        const ticket = await emailVerification.verifyCode(body.email, body.purpose, body.code.trim());
        if (!ticket) throw new HttpError(400, "INVALID_EMAIL_CODE", "验证码无效或已过期");
        success(response, ticket);
        return;
      }

      if (method === "POST" && path === "/v1/feedback") {
        enforceFeedbackRateLimit(request);
        const body = await readJson(request);
        if (!isCreateProductFeedbackRequest(body)) {
          throw new HttpError(400, "INVALID_FEEDBACK", "请选择反馈类型并填写反馈内容");
        }
        const content = body.content.trim();
        const contact = body.contact?.trim() || undefined;
        const pagePath = body.pagePath?.trim() || undefined;
        if (content.length < 4 || content.length > 2000) {
          throw new HttpError(400, "INVALID_FEEDBACK_CONTENT", "反馈内容请填写 4 至 2000 个字符");
        }
        if ((contact?.length ?? 0) > 160 || (pagePath?.length ?? 0) > 500) {
          throw new HttpError(400, "INVALID_FEEDBACK_METADATA", "联系方式或页面地址过长");
        }
        const session = await optionalSession(request);
        const saved = await store.createProductFeedback({
          userId: session?.userId,
          category: body.category,
          content,
          contact,
          pagePath
        });
        success(response, { feedbackId: saved.id, submittedAt: saved.createdAt }, 201);
        return;
      }

      if (method === "POST" && path === "/v1/auth/login") {
        enforceAuthRateLimit(request);
        const body = await readJson(request);
        if (!isLoginRequest(body)) {
          throw new HttpError(400, "INVALID_LOGIN", "请输入邮箱和密码");
        }
        if (body.email.length > 254 || body.password.length > 256) {
          throw new HttpError(400, "INVALID_LOGIN", "邮箱或密码格式不正确");
        }
        const user = await store.authenticate(body.email, body.password);
        if (!user) throw new HttpError(401, "INVALID_CREDENTIALS", "邮箱或密码不正确");
        const session = await issueSession(user);
        setSessionCookie(response, config, session.accessToken, session.expiresAt);
        success(response, session);
        return;
      }

      if (method === "POST" && path === "/v1/auth/register") {
        enforceAuthRateLimit(request);
        const body = await readJson(request);
        if (!isRegisterRequest(body)) {
          throw new HttpError(400, "INVALID_REGISTRATION", "请完整填写称呼、头像、邮箱和密码");
        }
        if (body.password.length < 8) {
          throw new HttpError(400, "WEAK_PASSWORD", "密码至少需要 8 个字符");
        }
        if (!/^\S+@\S+\.\S+$/.test(body.email.trim()) || body.email.length > 254 || body.password.length > 256 || body.displayName.trim().length > 80) {
          throw new HttpError(400, "INVALID_REGISTRATION", "姓名、邮箱或密码格式不正确");
        }
        if (config.registrationMode === "closed") {
          throw new HttpError(403, "REGISTRATION_CLOSED", "当前仅限受邀用户注册");
        }
        if (config.registrationMode === "allowlist" && !config.allowedRegistrationEmails.includes(body.email.trim().toLowerCase())) {
          throw new HttpError(403, "REGISTRATION_NOT_ALLOWED", "这个邮箱尚未获得注册权限");
        }
        if (
          config.emailVerificationEnabled
          && (
            !body.emailVerificationToken
            || !emailVerification.verifyTicket(body.emailVerificationToken, body.email, "register")
          )
        ) {
          throw new HttpError(403, "EMAIL_VERIFICATION_REQUIRED", "请先完成邮箱验证");
        }
        const user = await store.createUser(body.email, body.displayName, body.password, body.avatarKey ?? "sprout");
        await store.recordConsent(user.id, "privacy_and_terms", "2026-08-26");
        const session = await issueSession(user);
        setSessionCookie(response, config, session.accessToken, session.expiresAt);
        success(response, session, 201);
        return;
      }

      if (method === "POST" && path === "/v1/auth/reset-password") {
        const body = await readJson(request);
        if (!isResetPasswordRequest(body) || !/^\S+@\S+\.\S+$/.test(body.email.trim()) || body.email.length > 254 || body.password.length > 256 || !/^\d{6}$/.test(body.code)) {
          throw new HttpError(400, "INVALID_PASSWORD_RESET", "请填写有效的邮箱和新密码");
        }
        if (body.password.length < 8) {
          throw new HttpError(400, "WEAK_PASSWORD", "新密码至少需要 8 个字符");
        }
        if (!config.emailVerificationEnabled || !(await emailVerification.verifyCode(body.email, "reset_password", body.code))) {
          throw new HttpError(400, "INVALID_PASSWORD_RESET", "验证码无效或已过期，请重新获取验证码");
        }
        const user = await store.findUserByEmail(body.email);
        if (!user || !(await store.resetPasswordAndRevokeSessions(user.id, body.password))) {
          throw new HttpError(400, "INVALID_PASSWORD_RESET", "重置链接已失效，请重新验证邮箱");
        }
        clearSessionCookie(response, config);
        success(response, { passwordReset: true as const });
        return;
      }

      if (method === "POST" && path === "/v1/auth/demo") {
        enforceAuthRateLimit(request);
        if (!config.allowDemoAuth) {
          throw new HttpError(404, "NOT_FOUND", "体验账号没有开启");
        }
        const user = await store.getDemoUser();
        if (!user) throw new HttpError(404, "NOT_FOUND", "体验账号没有开启");
        const session = await issueSession(user);
        setSessionCookie(response, config, session.accessToken, session.expiresAt);
        success(response, session);
        return;
      }

      if (method === "POST" && path === "/v1/auth/device-token") {
        const body = await readJson(request);
        if (!isExchangeDeviceCodeRequest(body)) {
          throw new HttpError(400, "INVALID_DEVICE_CODE", "插件授权请求无效");
        }
        if (body.deviceId.length > 128 || (body.deviceName?.length ?? 0) > 120) {
          throw new HttpError(400, "INVALID_DEVICE", "设备标识或名称过长");
        }
        const user = await store.exchangeDeviceCode(body.code);
        if (!user) {
          throw new HttpError(401, "DEVICE_CODE_EXPIRED", "插件授权已失效，请重新登录");
        }
        success(response, {
          ...await issueSession(user, "device", body.deviceId, body.deviceName),
          deviceId: body.deviceId
        });
        return;
      }

      if (method === "POST" && path === "/v1/auth/handoff-token") {
        const body = await readJson(request);
        if (!isExchangeHandoffRequest(body)) {
          throw new HttpError(400, "INVALID_HANDOFF", "交接码无效");
        }
        const exchanged = await store.exchangeHandoffCode(body.code);
        if (!exchanged) {
          throw new HttpError(401, "HANDOFF_EXPIRED", "交接码无效或已经过期");
        }
        const handoffSession = await issueSession(exchanged.user);
        setSessionCookie(response, config, handoffSession.accessToken, handoffSession.expiresAt);
        success(response, {
          ...handoffSession,
          targetPath: exchanged.targetPath
        });
        return;
      }

      // Paired devices (the browser extension) hold long-lived tokens. A
      // refresh endpoint lets them renew before expiry so background syncs
      // never silently stop after the token TTL elapses.
      if (method === "POST" && path === "/v1/auth/refresh") {
        const token = requestToken(request, config.cookieName);
        const sessionRecord = await requireSession(request);
        const user = await store.getUser(sessionRecord.userId);
        if (!user) throw new HttpError(401, "UNAUTHORIZED", "登录状态已失效，请重新登录");
        const ttl = sessionRecord.scope === "device" ? config.deviceSessionTtlSeconds : config.webSessionTtlSeconds;
        const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
        const rotated = token ? await store.rotateSession(token, expiresAt) : undefined;
        if (!rotated) throw new HttpError(401, "UNAUTHORIZED", "登录状态已失效，请重新登录");
        if (sessionRecord.scope === "user") setSessionCookie(response, config, rotated.accessToken, expiresAt);
        success(response, { user, accessToken: rotated.accessToken, expiresAt });
        return;
      }

      if (method === "POST" && path === "/v1/auth/logout") {
        const token = requestToken(request, config.cookieName);
        if (token) await store.revokeSession(token);
        clearSessionCookie(response, config);
        success(response, { loggedOut: true as const });
        return;
      }

      // The campus opportunity catalogue is shared, public data: read and
      // ingest routes live before the authentication gate so the website and
      // the extension can exchange snapshots without a user session.
      if (method === "GET" && path === "/v1/opportunities") {
        const { snapshot: feed } = await freshOpportunitySnapshot();
        success(response, {
          opportunities: feed.opportunities.map((opportunity) => ({
            ...opportunity,
            status: opportunityStatus(opportunity)
          })),
          fetchedAt: feed.fetchedAt ?? new Date().toISOString(),
          sourceUpdatedAt: feed.sourceUpdatedAt,
          sourceUrl: feed.sourceUrl
        });
        return;
      }

      if (method === "GET" && path === "/v1/imports/opportunities/status") {
        const feed = await store.getOpportunityFeed();
        success(
          response,
          feed.opportunities.length
            ? {
                status: "ready" as const,
                message: `已载入 ${feed.opportunities.length} 条校招机会`
              }
            : {
                status: "not_configured" as const,
                message: "校招表格导入模块等待数据方案接入"
              }
        );
        return;
      }

      if (method === "POST" && path === "/v1/opportunities/sync") {
        const ingestKey = request.headers["x-offerflow-ingest-key"];
        if (!config.opportunityIngestKey || ingestKey !== config.opportunityIngestKey) {
          throw new HttpError(403, "INGEST_FORBIDDEN", "没有机会数据写入权限");
        }
        const body = await readJson(request);
        if (!isOpportunitySyncRequest(body)) {
          throw new HttpError(400, "INVALID_OPPORTUNITY_SYNC", "机会数据格式不正确");
        }
        const feed = await store.replaceOpportunityFeed({
          opportunities: body.opportunities,
          fetchedAt: body.fetchedAt,
          sourceUpdatedAt: body.sourceUpdatedAt,
          sourceUrl: body.sourceUrl
        });
        success(response, {
          accepted: feed.opportunities.length,
          fetchedAt: feed.fetchedAt
        });
        return;
      }

      const opportunityMatch = path.match(/^\/v1\/opportunities\/([^/]+)$/);
      if (method === "GET" && opportunityMatch) {
        const opportunity = await store.getOpportunity(decodePath(opportunityMatch[1]));
        if (!opportunity) throw new HttpError(404, "OPPORTUNITY_NOT_FOUND", "没有找到这条校招信息");
        success(response, {
          opportunity: { ...opportunity, status: opportunityStatus(opportunity) }
        });
        return;
      }

      const authenticatedSession = await requireSession(request);
      const userId = authenticatedSession.userId;

      if (method === "GET" && path === "/v1/session") {
        success(response, { user: (await store.getUser(userId))! });
        return;
      }

      if (method === "GET" && path === "/v1/admin/dashboard") {
        const user = await store.getUser(userId);
        if (!user || !config.adminEmails.includes(user.email.trim().toLowerCase())) {
          throw new HttpError(403, "ADMIN_FORBIDDEN", "当前账号没有运营后台访问权限");
        }
        const days = Number(url.searchParams.get("days") || "30");
        if (days !== 7 && days !== 30 && days !== 90) {
          throw new HttpError(400, "INVALID_ADMIN_RANGE", "统计周期仅支持 7、30 或 90 天");
        }
        success(response, await store.getAdminDashboard(days));
        return;
      }

      if (method === "PATCH" && path === "/v1/account/avatar") {
        const body = await readJson(request);
        if (!isUpdateAccountAvatarRequest(body)) {
          throw new HttpError(400, "INVALID_AVATAR", "请选择一个伙伴形象");
        }
        const user = await store.updateUserAvatar(userId, body.avatarKey);
        if (!user) throw new HttpError(404, "USER_NOT_FOUND", "账号不存在或已经停用");
        success(response, { user });
        return;
      }

      if (method === "GET" && path === "/v1/account/export") {
        const user = (await store.getUser(userId))!;
        const applications = await store.listApplications(userId);
        const conversations = await store.listConversations(userId);
        const conversationData = await Promise.all(conversations.map((item) => store.getConversation(userId, item.id)));
        const interviewRecords = (await Promise.all(applications.map((item) => store.listInterviewRecords(userId, item.application.id)))).flat();
        success(response, {
          exportedAt: new Date().toISOString(),
          user,
          applications,
          conversations: conversationData.filter(Boolean),
          interviewRecords,
          resumeVersions: await store.listResumeVersions(userId),
          sessions: (await store.listSessions(userId)).map(({ userId: _userId, revokedAt: _revokedAt, ...session }) => session)
        });
        return;
      }

      if (method === "DELETE" && path === "/v1/account") {
        const body = await readJson(request);
        const user = (await store.getUser(userId))!;
        if (!isRecord(body) || body.confirmation !== "DELETE" || typeof body.password !== "string") {
          throw new HttpError(400, "DELETE_CONFIRMATION_REQUIRED", "请输入当前密码并确认删除账号");
        }
        if (user.email === "demo@offerflow.cn") throw new HttpError(403, "DEMO_ACCOUNT", "体验账号不能删除");
        if (!(await store.authenticate(user.email, body.password))) {
          throw new HttpError(401, "INVALID_CREDENTIALS", "当前密码不正确");
        }
        await store.deleteUser(userId);
        clearSessionCookie(response, config);
        success(response, { deleted: true as const });
        return;
      }

      if (method === "POST" && path === "/v1/auth/device-codes") {
        success(response, await store.createDeviceCode(userId), 201);
        return;
      }

      if (method === "GET" && path === "/v1/auth/sessions") {
        const sessions = (await store.listSessions(userId)).map(({ userId: _userId, revokedAt: _revokedAt, ...session }) => session satisfies AuthDeviceSession);
        success(response, { sessions, currentSessionId: authenticatedSession.id });
        return;
      }

      const sessionMatch = path.match(/^\/v1\/auth\/sessions\/([^/]+)$/);
      if (method === "DELETE" && sessionMatch) {
        const sessionId = decodePath(sessionMatch[1]);
        if (!(await store.revokeUserSession(userId, sessionId))) {
          throw new HttpError(404, "SESSION_NOT_FOUND", "没有找到这个登录设备");
        }
        if (sessionId === authenticatedSession.id) clearSessionCookie(response, config);
        success(response, { revoked: true as const });
        return;
      }

      if (method === "POST" && path === "/v1/tailor-tasks") {
        const body = (await readJson(request)) as CreateTailorTaskRequest;
        if (!isCreateTailorTaskRequest(body)) {
          throw new HttpError(400, "INVALID_TAILOR_TASK", "岗位或简历资料不完整");
        }
        const created = await store.createTailorTask(userId, body);
        const targetPath = `/app/resumes/tailor/${encodeURIComponent(created.task.id)}`;
        success(response, {
          ...created,
          handoff: await store.createHandoffCode(userId, targetPath)
        }, 201);
        return;
      }

      const tailorTaskMatch = path.match(/^\/v1\/tailor-tasks\/([^/]+)$/);
      if (tailorTaskMatch) {
        const taskId = decodePath(tailorTaskMatch[1]);
        const task = await store.getTailorTask(userId, taskId);
        if (!task) throw new HttpError(404, "TAILOR_TASK_NOT_FOUND", "没有找到这次定制任务");
        if (method === "GET") {
          success(response, task);
          return;
        }
        if (method === "POST") {
          if (!resumeTailor.configured) {
            throw new HttpError(503, "AI_NOT_CONFIGURED", "官网 AI 服务尚未配置，请设置服务端 DEEPSEEK_API_KEY");
          }
          success(response, {
            proposal: await resumeTailor.generate(
              task.task.job,
              task.version.version.document.profile,
              task.task.sourceEvidence || task.version.version.document.sourceEvidence
            )
          });
          return;
        }
      }

      const resumeVersionMatch = path.match(/^\/v1\/resume-versions\/([^/]+)$/);
      if (method === "GET" && path === "/v1/resume-versions") {
        success(response, { versions: await store.listResumeVersions(userId) });
        return;
      }
      if (resumeVersionMatch) {
        const versionId = decodePath(resumeVersionMatch[1]);
        if (method === "GET") {
          const item = await store.getResumeVersion(userId, versionId);
          if (!item) throw new HttpError(404, "RESUME_VERSION_NOT_FOUND", "没有找到这份简历版本");
          success(response, { item });
          return;
        }
        if (method === "PATCH") {
          const body = await readJson(request);
          if (!isUpdateResumeVersionRequest(body)) {
            throw new HttpError(400, "INVALID_RESUME_VERSION", "简历保存内容不完整");
          }
          success(response, {
            item: await store.updateResumeVersion(userId, versionId, body.document, body.expectedRevision)
          });
          return;
        }
      }

      if (method === "GET" && path === "/v1/chat-context") {
        success(response, await chatContextCatalog(userId));
        return;
      }

      if (method === "GET" && path === "/v1/conversations") {
        success(response, { conversations: await store.listConversations(userId) });
        return;
      }

      if (method === "POST" && path === "/v1/conversations") {
        const body = (await readJson(request)) as CreateConversationRequest;
        const conversation = await store.createConversation(
          userId,
          typeof body.title === "string" ? body.title : undefined
        );
        success(response, { conversation, messages: [] }, 201);
        return;
      }

      const feedbackMatch = path.match(/^\/v1\/conversations\/([^/]+)\/messages\/([^/]+)\/feedback$/);
      if (method === "PATCH" && feedbackMatch) {
        const body = (await readJson(request)) as MessageFeedbackRequest;
        if (!isMessageFeedbackRequest(body)) {
          throw new HttpError(400, "INVALID_FEEDBACK", "请选择有帮助或没帮助");
        }
        const message = await store.setMessageFeedback(
          userId,
          decodePath(feedbackMatch[1]),
          decodePath(feedbackMatch[2]),
          body.feedback
        );
        if (!message) throw new HttpError(404, "MESSAGE_NOT_FOUND", "没有找到这条回答");
        success(response, { message });
        return;
      }

      const retryMatch = path.match(/^\/v1\/conversations\/([^/]+)\/messages\/([^/]+)\/retry$/);
      if (method === "POST" && retryMatch) {
        const body = await readJson(request);
        if (!isRetryMessageRequest(body)) {
          throw new HttpError(400, "INVALID_RETRY", "无法重试这条回答");
        }
        const conversationId = decodePath(retryMatch[1]);
        const messageId = decodePath(retryMatch[2]);
        const prompt = await store.findRetryPrompt(userId, conversationId, messageId);
        if (!prompt) throw new HttpError(404, "MESSAGE_NOT_FOUND", "没有找到可重试的问题");
        const history = await store.getConversationHistory(userId, conversationId);
        const messageIndex = history.findIndex((message) => message.id === messageId);
        const sourceMessage = history.slice(0, messageIndex).reverse().find((message) => message.role === "user");
        await streamAnswer(
          request,
          response,
          userId,
          conversationId,
          prompt,
          history,
          sourceMessage?.attachments,
          sourceMessage?.context
        );
        return;
      }

      const sendMatch = path.match(/^\/v1\/conversations\/([^/]+)\/messages$/);
      if (method === "POST" && sendMatch) {
        const body = await readJson(request);
        if (!isSendMessageRequest(body) || !body.content.trim()) {
          throw new HttpError(400, "EMPTY_MESSAGE", "输入问题后再发送");
        }
        const conversationId = decodePath(sendMatch[1]);
        const context = await canonicalContextReferences(userId, body.context);
        if (context.length !== (body.context?.length || 0)) {
          throw new HttpError(400, "CHAT_CONTEXT_NOT_FOUND", "选中的个人材料已不可用，请重新选择");
        }
        const history = await store.getConversationHistory(userId, conversationId);
        await store.appendUserMessage(
          userId,
          conversationId,
          body.clientMessageId,
          body.content,
          body.attachments,
          context
        );
        await streamAnswer(request, response, userId, conversationId, body.content, history, body.attachments, context);
        return;
      }

      const conversationMatch = path.match(/^\/v1\/conversations\/([^/]+)$/);
      if (conversationMatch) {
        const conversationId = decodePath(conversationMatch[1]);
        if (method === "GET") {
          const result = await store.getConversation(userId, conversationId);
          if (!result) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "没有找到这段对话");
          success(response, result);
          return;
        }
        if (method === "PATCH") {
          const body = (await readJson(request)) as UpdateConversationRequest;
          if (!isUpdateConversationRequest(body)) {
            throw new HttpError(400, "INVALID_CONVERSATION_TITLE", "请输入 1—80 个字符的对话名称");
          }
          const conversation = await store.updateConversation(userId, conversationId, body.title);
          if (!conversation) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "没有找到这段对话");
          const result = await store.getConversation(userId, conversationId);
          success(response, result!);
          return;
        }
        if (method === "DELETE") {
          if (!(await store.deleteConversation(userId, conversationId))) {
            throw new HttpError(404, "CONVERSATION_NOT_FOUND", "没有找到这段对话");
          }
          success(response, { deleted: true as const });
          return;
        }
      }

      if (method === "GET" && path === "/v1/applications") {
        success(response, { applications: await store.listApplications(userId) });
        return;
      }

      if (method === "POST" && path === "/v1/applications") {
        const body = (await readJson(request)) as CreateApplicationRequest;
        if (!isRecord(body) || !isJobApplication(body.application)) {
          throw new HttpError(400, "INVALID_APPLICATION", "投递信息不完整");
        }
        success(response, { item: await store.createApplication(userId, body.application) }, 201);
        return;
      }

      if (method === "POST" && path === "/v1/applications/sync") {
        const body = await readJson(request);
        if (!isApplicationSyncRequest(body)) {
          throw new HttpError(400, "INVALID_SYNC_REQUEST", "同步请求格式不正确");
        }
        if (authenticatedSession.scope === "device" && authenticatedSession.deviceId !== body.deviceId) {
          throw new HttpError(403, "DEVICE_MISMATCH", "设备身份与同步请求不一致");
        }
        success(response, await store.syncApplications(userId, body));
        return;
      }

      const interviewRecordsMatch = path.match(
        /^\/v1\/applications\/([^/]+)\/interview-records$/
      );
      if (interviewRecordsMatch) {
        const applicationId = decodePath(interviewRecordsMatch[1]);
        if (!(await store.getApplication(userId, applicationId))) {
          throw new HttpError(404, "APPLICATION_NOT_FOUND", "没有找到这条投递");
        }
        if (method === "GET") {
          success(response, { records: await store.listInterviewRecords(userId, applicationId) });
          return;
        }
        if (method === "POST") {
          const body = (await readJson(request)) as CreateInterviewRecordFromTranscriptRequest;
          if (!isCreateInterviewRecordFromTranscriptRequest(body) || !body.transcript.trim()) {
            throw new HttpError(400, "INVALID_TRANSCRIPT", "请上传或粘贴非空的面试文字稿");
          }
          if (body.title !== undefined && body.title.trim().length > 120) {
            throw new HttpError(400, "TITLE_TOO_LONG", "面试记录标题不能超过 120 个字符");
          }
          const processing = await store.createInterviewRecord(userId, applicationId, {
            title: body.title,
            sourceType: "transcript",
            status: "processing",
            transcript: body.transcript
          });
          try {
            const qaPairs = await interviewQaParser.parse(body.transcript);
            success(response, {
              record: await store.completeInterviewRecord(
                userId,
                processing.id,
                body.transcript,
                qaPairs
              )
            }, 201);
          } catch (error) {
            success(response, {
              record: await store.failInterviewRecord(
                userId,
                processing.id,
                error instanceof Error
                  ? `文字稿问答解析失败：${error.message}`
                  : "文字稿问答解析失败，请稍后重试。"
              )
            }, 201);
          }
          return;
        }
      }

      const interviewAudioMatch = path.match(
        /^\/v1\/applications\/([^/]+)\/interview-records\/audio$/
      );
      if (method === "POST" && interviewAudioMatch) {
        const applicationId = decodePath(interviewAudioMatch[1]);
        if (!(await store.getApplication(userId, applicationId))) {
          throw new HttpError(404, "APPLICATION_NOT_FOUND", "没有找到这条投递");
        }
        const title = url.searchParams.get("title")?.trim() || undefined;
        const fileName = url.searchParams.get("fileName")?.trim();
        const mimeType = normalizeMimeType(request.headers["content-type"]);
        if (!fileName || fileName.length > 255) {
          throw new HttpError(400, "INVALID_AUDIO_FILE_NAME", "录音文件名缺失或过长");
        }
        if (title && title.length > 120) {
          throw new HttpError(400, "TITLE_TOO_LONG", "面试记录标题不能超过 120 个字符");
        }
        if (!isSupportedInterviewAudioMimeType(mimeType)) {
          throw new HttpError(
            415,
            "UNSUPPORTED_AUDIO_TYPE",
            "暂不支持这种录音格式，请上传 MP3、M4A、WAV、WebM、OGG、AAC 或 FLAC"
          );
        }
        const audio = await readBinary(request, MAX_INTERVIEW_AUDIO_BYTES);
        const record = await store.createInterviewRecord(userId, applicationId, {
          title,
          sourceType: "audio",
          status: "processing"
        });
        success(response, { record }, 202);

        setImmediate(() => {
          void (async () => {
            try {
              const transcript = (await transcriber.transcribe({
                audio,
                fileName,
                mimeType
              })).trim();
              if (!transcript) throw new Error("语音转写服务没有返回文字稿");
              await store.completeInterviewRecord(
                userId,
                record.id,
                transcript,
                await interviewQaParser.parse(transcript)
              );
            } catch (error) {
              await store.failInterviewRecord(
                userId,
                record.id,
                error instanceof Error ? error.message : "录音转写失败，请重试或上传文字稿。"
              );
            } finally {
              // Audio is sensitive and only needed for this transient ASR job.
              // Zero the in-memory buffer; it is never persisted or indexed.
              audio.fill(0);
            }
          })();
        });
        return;
      }

      const applicationMatch = path.match(/^\/v1\/applications\/([^/]+)$/);
      if (applicationMatch) {
        const applicationId = decodePath(applicationMatch[1]);
        if (method === "GET") {
          const item = await store.getApplication(userId, applicationId);
          if (!item) throw new HttpError(404, "APPLICATION_NOT_FOUND", "没有找到这条投递");
          success(response, { item });
          return;
        }
        if (method === "PATCH") {
          const body = (await readJson(request)) as UpdateApplicationRequest;
          if (
            !isRecord(body) ||
            typeof body.expectedRevision !== "number" ||
            !isJobApplication(body.application) ||
            body.application.id !== applicationId
          ) {
            throw new HttpError(400, "INVALID_APPLICATION", "投递更新格式不正确");
          }
          success(response, {
            item: await store.updateApplication(userId, body.application, body.expectedRevision)
          });
          return;
        }
        if (method === "DELETE") {
          const expectedRevision = Number(url.searchParams.get("expectedRevision"));
          if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
            throw new HttpError(400, "INVALID_REVISION", "缺少要删除的投递版本");
          }
          success(response, {
            item: await store.deleteApplication(userId, applicationId, expectedRevision)
          });
          return;
        }
      }

      throw new HttpError(404, "NOT_FOUND", "接口不存在");
    } catch (error) {
      if (response.headersSent) {
        if (!response.writableEnded) response.end();
        return;
      }
      if (error instanceof HttpError || error instanceof StoreError) {
        const retryAfterSeconds = error.details?.retryAfterSeconds;
        if (error.status === 429 && typeof retryAfterSeconds === "number") {
          response.setHeader("Retry-After", String(Math.max(1, Math.ceil(retryAfterSeconds))));
        }
        failure(response, error.status, error.code, error.message, error.details);
        return;
      }
      console.error("JobKoI API request failed", error);
      failure(response, 500, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试");
    }
  }

  return {
    handler,
    store,
    config,
    assistant,
    knowledge,
    interviewQaParser,
    transcriber
  };
}
