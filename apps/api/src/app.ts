import type { IncomingMessage, ServerResponse } from "node:http";
import { once } from "node:events";
import type {
  ApiError,
  ApiResponse,
  AuthSession,
  ChatStreamEvent,
  CreateApplicationRequest,
  CreateInterviewRecordFromTranscriptRequest,
  CreateTailorTaskRequest,
  CreateConversationRequest,
  RetryMessageRequest,
  SendMessageRequest,
  UpdateApplicationRequest
} from "@offerflow/contracts";
import {
  MAX_INTERVIEW_AUDIO_BYTES,
  isApplicationSyncRequest,
  isCreateInterviewRecordFromTranscriptRequest,
  isCreateTailorTaskRequest,
  isExchangeHandoffRequest,
  isExchangeDeviceCodeRequest,
  isLoginRequest,
  isRecord,
  isRegisterRequest,
  isOpportunitySyncRequest,
  isRetryMessageRequest,
  isSendMessageRequest,
  isSupportedInterviewAudioMimeType,
  normalizeMimeType,
  isUpdateResumeVersionRequest
} from "@offerflow/contracts";
import type { ChatMessage, JobApplication, KnowledgeCitation } from "@offerflow/domain";
import { opportunityStatus, RECRUITMENT_TYPES } from "@offerflow/domain";
import { createAccessToken, verifyAccessToken, type AccessTokenClaims } from "./auth/crypto.ts";
import { createAssistantProvider, type AssistantProvider } from "./ai/assistant.ts";
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
import { MemoryStore, MemoryStoreError } from "./store/memory-store.ts";
import type { OfferFlowStore } from "./store/store.ts";

export interface OfferFlowAppOptions {
  config?: ApiConfig;
  store?: OfferFlowStore;
  assistant?: AssistantProvider;
  resumeTailor?: ResumeTailorProvider;
  knowledge?: KnowledgeService;
  interviewQaParser?: InterviewQaParser;
  transcriber?: InterviewTranscriptionProvider;
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
    typeof value.company === "string" &&
    typeof value.position === "string" &&
    typeof value.stage === "string" &&
    typeof value.sourceUrl === "string" &&
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

function setCors(request: IncomingMessage, response: ServerResponse, config: ApiConfig): void {
  const origin = request.headers.origin;
  const extensionOriginAllowed =
    Boolean(origin?.startsWith("chrome-extension://")) &&
    config.allowedOrigins.includes("chrome-extension://*");
  if (origin && (config.allowedOrigins.includes(origin) || extensionOriginAllowed)) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "Origin");
  }
  response.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.setHeader("access-control-allow-headers", "Authorization,Content-Type");
  response.setHeader("access-control-max-age", "86400");
}

export function createOfferFlowApp(options: OfferFlowAppOptions = {}) {
  const config = options.config ?? loadApiConfig();
  const store = options.store ?? new MemoryStore();
  const assistant = options.assistant ?? createAssistantProvider(config);
  const resumeTailor = options.resumeTailor ?? createResumeTailorProvider(config);
  const knowledge = options.knowledge ?? new KnowledgeService();
  const interviewQaParser = options.interviewQaParser ?? createInterviewQaParser(config);
  const transcriber = options.transcriber ?? createInterviewTranscriptionProvider(config);

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
    const entries: KnowledgeEntry[] = [];
    const applications = await store.listApplications(userId);

    for (const { application } of applications) {
      const records = await store.listInterviewRecords(userId, application.id);

      for (const record of records) {
        if (record.status !== "ready") continue;

        const sourceId = `interview-record:${record.id}`;
        const title =
          `个人面试记录｜${application.company} · ${application.position}｜${record.title}`;

        for (const [index, content] of transcriptChunks(record.transcript).entries()) {
          entries.push({
            id: `${sourceId}:transcript:${index}`,
            sourceId,
            title,
            content
          });
        }

        for (const pair of record.qaPairs) {
          entries.push({
            id: `${sourceId}:qa:${pair.id}`,
            sourceId,
            title,
            content: (
              `问题：${pair.question}\n回答：${pair.answer}` +
              `${pair.evidence ? `\n原文依据：${pair.evidence}` : ""}`
            ).slice(0, 1800)
          });
        }
      }
    }

    return entries;
  }

  async function requireClaims(request: IncomingMessage): Promise<AccessTokenClaims> {
    const token = bearerToken(request);
    const claims = token ? verifyAccessToken(token, config.tokenSecret) : undefined;
    if (!claims || !await store.getUser(claims.sub)) {
      throw new HttpError(401, "UNAUTHORIZED", "登录状态已失效，请重新登录");
    }
    return claims;
  }

  function issueSession(
    user: { id: string; email: string; displayName: string },
    scope: "user" | "device" = "user",
    deviceId?: string
  ): AuthSession {
    const issued = createAccessToken(
      { sub: user.id, email: user.email, scope, deviceId },
      config.tokenSecret,
      config.tokenTtlSeconds
    );
    return { user, accessToken: issued.token, expiresAt: issued.expiresAt };
  }

  async function streamAnswer(
    request: IncomingMessage,
    response: ServerResponse,
    userId: string,
    conversationId: string,
    prompt: string,
    history: ChatMessage[]
  ): Promise<void> {
    const citations = knowledge.search(prompt, 3, await privateInterviewKnowledge(userId));
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
      const completed = await store.completeAssistantMessage(
        userId,
        conversationId,
        assistantMessage.id,
        content,
        citations
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
        aborted ? "complete" : "error"
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
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }

    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const path = url.pathname;
    const method = request.method || "GET";

    try {
      if (method === "GET" && path === "/health") {
        success(response, {
          service: "offerflow-api" as const,
          status: "ok" as const,
          version: "0.1.0"
        });
        return;
      }

      if (method === "POST" && path === "/v1/auth/login") {
        const body = await readJson(request);
        if (!isLoginRequest(body)) {
          throw new HttpError(400, "INVALID_LOGIN", "请输入邮箱和密码");
        }
        const user = await store.authenticate(body.email, body.password);
        if (!user) throw new HttpError(401, "INVALID_CREDENTIALS", "邮箱或密码不正确");
        success(response, issueSession(user));
        return;
      }

      if (method === "POST" && path === "/v1/auth/register") {
        const body = await readJson(request);
        if (!isRegisterRequest(body)) {
          throw new HttpError(400, "INVALID_REGISTRATION", "请完整填写姓名、邮箱和密码");
        }
        if (body.password.length < 8) {
          throw new HttpError(400, "WEAK_PASSWORD", "密码至少需要 8 个字符");
        }
        const user = await store.createUser(body.email, body.displayName, body.password);
        success(response, issueSession(user), 201);
        return;
      }

      if (method === "POST" && path === "/v1/auth/demo") {
        if (!config.allowDemoAuth) {
          throw new HttpError(404, "NOT_FOUND", "体验账号没有开启");
        }
        success(response, issueSession(await store.getDemoUser()));
        return;
      }

      if (method === "POST" && path === "/v1/auth/device-token") {
        const body = await readJson(request);
        if (!isExchangeDeviceCodeRequest(body)) {
          throw new HttpError(400, "INVALID_DEVICE_CODE", "请输入有效的设备配对码");
        }
        const user = await store.exchangeDeviceCode(body.code);
        if (!user) {
          throw new HttpError(401, "DEVICE_CODE_EXPIRED", "配对码无效或已经过期");
        }
        success(response, {
          ...issueSession(user, "device", body.deviceId),
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
        success(response, {
          ...issueSession(exchanged.user),
          targetPath: exchanged.targetPath
        });
        return;
      }

      // Paired devices (the browser extension) hold long-lived tokens. A
      // refresh endpoint lets them renew before expiry so background syncs
      // never silently stop after the token TTL elapses.
      if (method === "POST" && path === "/v1/auth/refresh") {
        const claims = await requireClaims(request);
        const user = await store.getUser(claims.sub);
        if (!user) throw new HttpError(401, "UNAUTHORIZED", "登录状态已失效，请重新登录");
        success(
          response,
          issueSession(
            user,
            claims.scope === "device" ? "device" : "user",
            claims.deviceId
          )
        );
        return;
      }

      // The campus opportunity catalogue is shared, public data: read and
      // ingest routes live before the authentication gate so the website and
      // the extension can exchange snapshots without a user session.
      if (method === "GET" && path === "/v1/opportunities") {
        const feed = await store.getOpportunityFeed();
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

      const claims = await requireClaims(request);
      const userId = claims.sub;

      if (method === "GET" && path === "/v1/session") {
        success(response, { user: await store.getUser(userId)! });
        return;
      }

      if (method === "POST" && path === "/v1/auth/device-codes") {
        success(response, await store.createDeviceCode(userId), 201);
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
        await streamAnswer(request, response, userId, conversationId, prompt, history);
        return;
      }

      const sendMatch = path.match(/^\/v1\/conversations\/([^/]+)\/messages$/);
      if (method === "POST" && sendMatch) {
        const body = await readJson(request);
        if (!isSendMessageRequest(body) || !body.content.trim()) {
          throw new HttpError(400, "EMPTY_MESSAGE", "输入问题后再发送");
        }
        const conversationId = decodePath(sendMatch[1]);
        const history = await store.getConversationHistory(userId, conversationId);
        await store.appendUserMessage(
          userId,
          conversationId,
          body.clientMessageId,
          body.content,
          body.attachments
        );
        await streamAnswer(request, response, userId, conversationId, body.content, history);
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
        if (method === "DELETE") {
          if (!await store.deleteConversation(userId, conversationId)) {
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
        success(response, await store.syncApplications(userId, body));
        return;
      }

      const interviewRecordsMatch = path.match(
        /^\/v1\/applications\/([^/]+)\/interview-records$/
      );
      if (interviewRecordsMatch) {
        const applicationId = decodePath(interviewRecordsMatch[1]);
        if (!await store.getApplication(userId, applicationId)) {
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
        if (!await store.getApplication(userId, applicationId)) {
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
      if (error instanceof HttpError || error instanceof MemoryStoreError) {
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
