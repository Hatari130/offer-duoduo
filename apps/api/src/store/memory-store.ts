import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  AdminDashboardRangeDays,
  AdminDashboardResponse,
  ApplicationSyncChange,
  ApplicationSyncConflict,
  ApplicationSyncItem,
  ApplicationSyncRequest,
  ApplicationSyncResponse,
  AvatarKey,
  CreateResumeTemplateRequest,
  CreateTailorTaskRequest,
  ResumeTemplateRecord,
  ResumeVersionRecord,
  SessionUser,
  UpdateResumeTemplateRequest
} from "@offerflow/contracts";
import { isAvatarKey } from "@offerflow/contracts";
import {
  decideApplicationRevision,
  mergeAcceptedApplication,
  createResumeDocument,
  type ChatAttachment,
  type ChatContextReference,
  type ChatConversation,
  type ChatMessage,
  type ChatOpportunityResults,
  type InterviewQaPair,
  type InterviewRecord,
  type InterviewRecordSourceType,
  type JobApplication,
  type KnowledgeCitation,
  type OpportunityFeedSnapshot,
  type RecruitmentOpportunity,
  type ResumeDocument,
  type TailorTask
} from "@offerflow/domain";
import { hashPassword, verifyPassword } from "../auth/crypto.ts";
import {
  StoreError,
  type EmailVerificationCodeInput,
  type EmailVerificationPurpose,
  type InterviewRecordInput,
  type IssuedStoreSession,
  type OfferFlowStore,
  type ProductFeedbackInput,
  type SessionRecord,
  type SessionScope
} from "./store.ts";

interface StoredUser extends SessionUser {
  passwordHash: string;
  passwordSalt: string;
}

interface StoredConversation {
  userId: string;
  conversation: ChatConversation;
  deletedAt?: string;
}

interface StoredApplication {
  userId: string;
  item: ApplicationSyncItem;
}

interface SyncLogEntry {
  sequence: number;
  userId: string;
  item: ApplicationSyncItem;
}

interface DeviceCode {
  userId: string;
  expiresAt: string;
}

interface HandoffCode {
  userId: string;
  targetPath: string;
  expiresAt: string;
}

interface StoredSession extends SessionRecord {
  tokenHash: string;
}

interface StoredEmailVerificationCode extends EmailVerificationCodeInput {
  id: string;
  attemptCount: number;
  sentAt?: string;
  consumedAt?: string;
}

interface StoredResumeVersion {
  userId: string;
  item: ResumeVersionRecord;
}

interface StoredTailorTask {
  userId: string;
  task: TailorTask;
}

interface StoredInterviewRecord {
  userId: string;
  record: InterviewRecord;
}

interface StoredResumeTemplate {
  userId: string;
  template: ResumeTemplateRecord;
}

interface StoredProductFeedback extends ProductFeedbackInput {
  id: string;
  status: "new" | "reviewing" | "planned" | "resolved" | "closed";
  createdAt: string;
}

export interface MemoryStoreOptions {
  /**
   * Set false to keep the store fully in-memory (used by tests). Persistence is
   * enabled by default and can be pointed elsewhere with OFFERFLOW_DATA_FILE.
   */
  persistence?: boolean;
  dataFile?: string;
}

interface PersistedStoreState {
  version: 1;
  users: StoredUser[];
  usersByEmail: Record<string, string>;
  conversations: StoredConversation[];
  messages: Record<string, ChatMessage[]>;
  applications: StoredApplication[];
  resumeVersions?: StoredResumeVersion[];
  resumeTemplates?: StoredResumeTemplate[];
  tailorTasks?: StoredTailorTask[];
  interviewRecords?: StoredInterviewRecord[];
  productFeedback?: StoredProductFeedback[];
  appliedChanges: Record<string, number>;
  syncLog: SyncLogEntry[];
  sequence: number;
  opportunityFeed?: OpportunityFeedSnapshot;
  sessions?: StoredSession[];
  emailVerificationCodes?: StoredEmailVerificationCode[];
}

const DEFAULT_DATA_FILE = join(process.cwd(), ".offerflow-data", "state.json");

export class MemoryStoreError extends StoreError {
  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>
  ) {
    super(code, message, status, details);
    this.name = "MemoryStoreError";
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function maskEmail(email: string): string {
  const [name, domain = ""] = email.split("@");
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(2, Math.min(6, name.length - visible.length)))}@${domain}`;
}

function normalizeDeviceCode(code: string): string {
  return code.trim().replace(/[\s-]/g, "");
}

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function titleFromMessage(content: string): string {
  const title = content.trim().replace(/\s+/g, " ");
  return title.length > 24 ? `${title.slice(0, 24)}…` : title || "新的求职对话";
}

export class MemoryStore implements OfferFlowStore {
  private readonly users = new Map<string, StoredUser>();
  private readonly usersByEmail = new Map<string, string>();
  private readonly conversations = new Map<string, StoredConversation>();
  private readonly messages = new Map<string, ChatMessage[]>();
  private readonly applications = new Map<string, StoredApplication>();
  private readonly resumeVersions = new Map<string, StoredResumeVersion>();
  private readonly resumeTemplates = new Map<string, StoredResumeTemplate>();
  private readonly tailorTasks = new Map<string, StoredTailorTask>();
  private readonly interviewRecords = new Map<string, StoredInterviewRecord>();
  private readonly productFeedback: StoredProductFeedback[] = [];
  private readonly deviceCodes = new Map<string, DeviceCode>();
  private readonly handoffCodes = new Map<string, HandoffCode>();
  private readonly sessionsByHash = new Map<string, StoredSession>();
  private readonly sessionHashById = new Map<string, string>();
  private readonly emailVerificationCodes = new Map<string, StoredEmailVerificationCode>();
  private readonly appliedChanges = new Map<string, number>();
  private readonly syncLog: SyncLogEntry[] = [];
  private opportunityFeed?: OpportunityFeedSnapshot;
  private sequence = 0;
  private readonly dataFile?: string;

  constructor(options: MemoryStoreOptions = {}) {
    const persistenceEnabled = options.persistence ?? process.env.OFFERFLOW_PERSISTENCE !== "0";
    this.dataFile = persistenceEnabled
      ? options.dataFile ?? process.env.OFFERFLOW_DATA_FILE ?? DEFAULT_DATA_FILE
      : undefined;
    this.loadPersistedState();
    if (!this.usersByEmail.has("demo@offerflow.cn")) {
      this.createUser("demo@offerflow.cn", "林知夏", "offerflow2026", "sprout", "demo-user");
    }
  }

  private loadPersistedState(): void {
    if (!this.dataFile || !existsSync(this.dataFile)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.dataFile, "utf8")) as PersistedStoreState;
      if (!parsed || parsed.version !== 1) return;
      for (const user of parsed.users ?? []) {
        this.users.set(user.id, {
          ...user,
          avatarKey: isAvatarKey(user.avatarKey) ? user.avatarKey : "sprout",
          createdAt: typeof user.createdAt === "string" ? user.createdAt : new Date().toISOString()
        });
        this.usersByEmail.set(normalizeEmail(user.email), user.id);
      }
      for (const stored of parsed.conversations ?? []) {
        this.conversations.set(stored.conversation.id, stored);
      }
      for (const [conversationId, list] of Object.entries(parsed.messages ?? {})) {
        this.messages.set(conversationId, list);
      }
      for (const stored of parsed.applications ?? []) {
        this.applications.set(`${stored.userId}:${stored.item.application.id}`, stored);
      }
      for (const stored of parsed.resumeVersions ?? []) {
        this.resumeVersions.set(`${stored.userId}:${stored.item.version.id}`, stored);
      }
      for (const stored of parsed.resumeTemplates ?? []) {
        this.resumeTemplates.set(`${stored.userId}:${stored.template.id}`, stored);
      }
      for (const stored of parsed.tailorTasks ?? []) {
        this.tailorTasks.set(`${stored.userId}:${stored.task.id}`, stored);
      }
      for (const stored of parsed.interviewRecords ?? []) {
        const record = clone(stored.record);
        // Raw audio is deliberately never persisted. A process that was
        // interrupted by a restart therefore cannot safely resume the job.
        if (record.status === "processing") {
          record.status = "failed";
          record.error = "转写任务因服务重启而中断，请重新上传录音或直接上传文字稿。";
          record.updatedAt = new Date().toISOString();
        }
        this.interviewRecords.set(`${stored.userId}:${record.id}`, {
          userId: stored.userId,
          record
        });
      }
      for (const [key, revision] of Object.entries(parsed.appliedChanges ?? {})) {
        this.appliedChanges.set(key, revision);
      }
      this.syncLog.push(...(parsed.syncLog ?? []));
      this.sequence = parsed.sequence ?? 0;
      if (
        parsed.opportunityFeed &&
        Array.isArray(parsed.opportunityFeed.opportunities)
      ) {
        this.opportunityFeed = parsed.opportunityFeed;
      }
      for (const session of parsed.sessions ?? []) {
        this.sessionsByHash.set(session.tokenHash, session);
        this.sessionHashById.set(session.id, session.tokenHash);
      }
      this.productFeedback.push(...(parsed.productFeedback ?? []));
      for (const code of parsed.emailVerificationCodes ?? []) {
        this.emailVerificationCodes.set(code.id, code);
      }
    } catch {
      // A corrupt or partial state file must not prevent the API from starting.
    }
  }

  private persist(): void {
    if (!this.dataFile) return;
    const state: PersistedStoreState = {
      version: 1,
      users: [...this.users.values()],
      usersByEmail: Object.fromEntries(this.usersByEmail),
      conversations: [...this.conversations.values()],
      messages: Object.fromEntries(this.messages),
      applications: [...this.applications.values()],
      resumeVersions: [...this.resumeVersions.values()],
      resumeTemplates: [...this.resumeTemplates.values()],
      tailorTasks: [...this.tailorTasks.values()],
      interviewRecords: [...this.interviewRecords.values()],
      productFeedback: this.productFeedback,
      appliedChanges: Object.fromEntries(this.appliedChanges),
      syncLog: this.syncLog,
      sequence: this.sequence,
      opportunityFeed: this.opportunityFeed,
      sessions: [...this.sessionsByHash.values()],
      emailVerificationCodes: [...this.emailVerificationCodes.values()]
    };
    const temporary = `${this.dataFile}.tmp`;
    mkdirSync(dirname(this.dataFile), { recursive: true });
    writeFileSync(temporary, JSON.stringify(state, null, 2), "utf8");
    renameSync(temporary, this.dataFile);
  }

  createUser(email: string, displayName: string, password: string, avatarKey: AvatarKey = "sprout", fixedId?: string): SessionUser {
    const normalizedEmail = normalizeEmail(email);
    if (this.usersByEmail.has(normalizedEmail)) {
      throw new MemoryStoreError("EMAIL_EXISTS", "这个邮箱已经注册", 409);
    }
    const passwordValue = hashPassword(password);
    const user: StoredUser = {
      id: fixedId ?? randomUUID(),
      email: normalizedEmail,
      displayName: displayName.trim() || normalizedEmail.split("@")[0],
      avatarKey,
      createdAt: new Date().toISOString(),
      passwordHash: passwordValue.hash,
      passwordSalt: passwordValue.salt
    };
    this.users.set(user.id, user);
    this.usersByEmail.set(normalizedEmail, user.id);
    this.persist();
    return this.publicUser(user);
  }

  authenticate(email: string, password: string): SessionUser | undefined {
    const userId = this.usersByEmail.get(normalizeEmail(email));
    const user = userId ? this.users.get(userId) : undefined;
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) return undefined;
    return this.publicUser(user);
  }

  findUserByEmail(email: string): SessionUser | undefined {
    const userId = this.usersByEmail.get(normalizeEmail(email));
    const user = userId ? this.users.get(userId) : undefined;
    return user ? this.publicUser(user) : undefined;
  }

  resetPasswordAndRevokeSessions(userId: string, password: string): boolean {
    const user = this.users.get(userId);
    if (!user) return false;
    const passwordValue = hashPassword(password);
    user.passwordHash = passwordValue.hash;
    user.passwordSalt = passwordValue.salt;
    const now = new Date().toISOString();
    for (const session of this.sessionsByHash.values()) {
      if (session.userId === userId && !session.revokedAt) session.revokedAt = now;
    }
    this.persist();
    return true;
  }

  getUser(userId: string): SessionUser | undefined {
    const user = this.users.get(userId);
    return user ? this.publicUser(user) : undefined;
  }

  getDemoUser(): SessionUser {
    return this.publicUser(this.users.get("demo-user")!);
  }

  updateUserAvatar(userId: string, avatarKey: AvatarKey): SessionUser | undefined {
    const user = this.users.get(userId);
    if (!user) return undefined;
    user.avatarKey = avatarKey;
    this.persist();
    return this.publicUser(user);
  }

  recordConsent(_userId: string, _consentType: string, _policyVersion: string): void {
    // The development store intentionally carries no compliance guarantees;
    // production uses PostgreSQL, where consent is append-only and audited.
  }

  deleteUser(userId: string): boolean {
    const user = this.users.get(userId);
    if (!user) return false;
    this.users.delete(userId);
    this.usersByEmail.delete(normalizeEmail(user.email));
    for (const [id, value] of this.conversations) if (value.userId === userId) { this.conversations.delete(id); this.messages.delete(id); }
    for (const [key, value] of this.applications) if (value.userId === userId) this.applications.delete(key);
    for (const [key, value] of this.resumeVersions) if (value.userId === userId) this.resumeVersions.delete(key);
    for (const [key, value] of this.tailorTasks) if (value.userId === userId) this.tailorTasks.delete(key);
    for (const [key, value] of this.interviewRecords) if (value.userId === userId) this.interviewRecords.delete(key);
    for (const [hash, value] of this.sessionsByHash) if (value.userId === userId) { this.sessionsByHash.delete(hash); this.sessionHashById.delete(value.id); }
    for (const [hash, value] of this.deviceCodes) if (value.userId === userId) this.deviceCodes.delete(hash);
    for (const [hash, value] of this.handoffCodes) if (value.userId === userId) this.handoffCodes.delete(hash);
    for (const key of this.appliedChanges.keys()) if (key.startsWith(`${userId}:`)) this.appliedChanges.delete(key);
    for (let index = this.syncLog.length - 1; index >= 0; index -= 1) if (this.syncLog[index].userId === userId) this.syncLog.splice(index, 1);
    this.persist();
    return true;
  }

  reserveEmailVerificationCode(input: EmailVerificationCodeInput): { id: string } {
    const email = normalizeEmail(input.email);
    const now = Date.parse(input.createdAt);
    const recent = [...this.emailVerificationCodes.values()].filter(
      (item) => item.email === email && item.purpose === input.purpose
    );
    if (recent.some((item) => Date.parse(item.createdAt) > now - 60_000)) {
      throw new MemoryStoreError("EMAIL_CODE_RATE_LIMITED", "验证码发送得太频繁，请稍后再试", 429, {
        retryAfterSeconds: 60
      });
    }
    if (recent.filter((item) => Date.parse(item.createdAt) > now - 60 * 60_000).length >= 10) {
      throw new MemoryStoreError("EMAIL_CODE_RATE_LIMITED", "验证码发送得太频繁，请稍后再试", 429, {
        retryAfterSeconds: 3600
      });
    }
    if (input.requesterIp) {
      const fromIp = [...this.emailVerificationCodes.values()].filter(
        (item) => item.requesterIp === input.requesterIp && Date.parse(item.createdAt) > now - 60 * 60_000
      );
      if (fromIp.length >= 30) {
        throw new MemoryStoreError("EMAIL_CODE_RATE_LIMITED", "验证码发送得太频繁，请稍后再试", 429, {
          retryAfterSeconds: 3600
        });
      }
    }

    const id = randomUUID();
    this.emailVerificationCodes.set(id, {
      ...input,
      id,
      email,
      attemptCount: 0
    });
    this.persist();
    return { id };
  }

  markEmailVerificationCodeSent(id: string, sentAt: string): void {
    const current = this.emailVerificationCodes.get(id);
    if (!current) throw new MemoryStoreError("EMAIL_CODE_NOT_FOUND", "验证码记录不存在", 404);
    current.sentAt = sentAt;
    for (const item of this.emailVerificationCodes.values()) {
      if (
        item.id !== id
        && item.email === current.email
        && item.purpose === current.purpose
        && !item.consumedAt
      ) {
        item.consumedAt = sentAt;
      }
    }
    this.persist();
  }

  deleteEmailVerificationCode(id: string): void {
    this.emailVerificationCodes.delete(id);
    this.persist();
  }

  consumeEmailVerificationCode(
    rawEmail: string,
    purpose: EmailVerificationPurpose,
    codeHmac: string,
    now: string
  ): boolean {
    const email = normalizeEmail(rawEmail);
    const current = [...this.emailVerificationCodes.values()]
      .filter(
        (item) => item.email === email
          && item.purpose === purpose
          && item.sentAt
          && !item.consumedAt
          && Date.parse(item.expiresAt) > Date.parse(now)
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    if (!current || current.attemptCount >= 5) return false;

    const expected = Buffer.from(current.codeHmac, "hex");
    const received = Buffer.from(codeHmac, "hex");
    const correct = expected.length === received.length && timingSafeEqual(expected, received);
    if (!correct) {
      current.attemptCount += 1;
      if (current.attemptCount >= 5) current.consumedAt = now;
      this.persist();
      return false;
    }
    current.consumedAt = now;
    this.persist();
    return true;
  }

  createProductFeedback(input: ProductFeedbackInput): { id: string; createdAt: string } {
    const item: StoredProductFeedback = {
      ...clone(input),
      id: randomUUID(),
      status: "new",
      createdAt: new Date().toISOString()
    };
    this.productFeedback.push(item);
    this.persist();
    return { id: item.id, createdAt: item.createdAt };
  }

  getAdminDashboard(rangeDays: AdminDashboardRangeDays): AdminDashboardResponse {
    const end = new Date();
    const start = new Date(end);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - rangeDays + 1);
    const startMs = start.getTime();
    const realUsers = [...this.users.values()].filter((user) => user.email !== "demo@offerflow.cn");
    const realUserIds = new Set(realUsers.map((user) => user.id));
    const conversations = [...this.conversations.values()].filter(
      (item) => realUserIds.has(item.userId) && !item.deletedAt
    );
    const periodConversations = conversations.filter(
      (item) => Date.parse(item.conversation.createdAt) >= startMs
    );
    const periodMessages = conversations.flatMap((item) =>
      (this.messages.get(item.conversation.id) ?? []).map((message) => ({ userId: item.userId, message }))
    ).filter((item) => Date.parse(item.message.createdAt) >= startMs);
    const assistantMessages = periodMessages.filter((item) => item.message.role === "assistant");
    const ratedMessages = assistantMessages.filter((item) => item.message.feedback);
    const activeUsers = new Set(
      [...this.sessionsByHash.values()]
        .filter((session) => realUserIds.has(session.userId) && !session.revokedAt && Date.parse(session.lastSeenAt) >= startMs)
        .map((session) => session.userId)
    ).size;

    const dateKeys = Array.from({ length: rangeDays }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    const dayKey = (value: string) => new Date(value).toISOString().slice(0, 10);
    const daily = dateKeys.map((date) => ({
      date,
      registrations: realUsers.filter((user) => dayKey(user.createdAt) === date).length,
      activeChatUsers: new Set(periodMessages.filter((item) => dayKey(item.message.createdAt) === date).map((item) => item.userId)).size,
      conversations: periodConversations.filter((item) => dayKey(item.conversation.createdAt) === date).length,
      messages: periodMessages.filter((item) => dayKey(item.message.createdAt) === date).length
    }));

    const statusLabels: Record<string, string> = {
      complete: "已完成",
      error: "失败",
      stopped: "已停止",
      streaming: "生成中"
    };
    const messageStatuses = ["complete", "error", "stopped", "streaming"].map((status) => ({
      key: status,
      label: statusLabels[status],
      value: assistantMessages.filter((item) => item.message.status === status).length
    }));
    const periodFeedback = this.productFeedback.filter((item) => Date.parse(item.createdAt) >= startMs);
    const categoryLabels: Record<string, string> = { suggestion: "功能建议", issue: "问题反馈", content: "内容反馈", other: "其他" };
    const feedbackCategories = Object.entries(categoryLabels).map(([key, label]) => ({
      key,
      label,
      value: periodFeedback.filter((item) => item.category === key).length
    }));
    const feedbackStatuses = [
      ["new", "待处理"],
      ["reviewing", "处理中"],
      ["planned", "已规划"],
      ["resolved", "已解决"],
      ["closed", "已关闭"]
    ].map(([key, label]) => ({ key, label, value: periodFeedback.filter((item) => item.status === key).length }));
    const periodApplications = [...this.applications.values()].filter(
      (item) => realUserIds.has(item.userId) && Date.parse(item.item.application.createdAt) >= startMs && !item.item.deletedAt
    );
    const periodResumeVersions = [...this.resumeVersions.values()].filter(
      (item) => realUserIds.has(item.userId) && Date.parse(item.item.version.createdAt) >= startMs
    );
    const periodInterviewRecords = [...this.interviewRecords.values()].filter(
      (item) => realUserIds.has(item.userId) && Date.parse(item.record.createdAt) >= startMs
    );
    const lastActiveByUser = new Map<string, string>();
    for (const session of this.sessionsByHash.values()) {
      if (!realUserIds.has(session.userId)) continue;
      const current = lastActiveByUser.get(session.userId);
      if (!current || session.lastSeenAt > current) lastActiveByUser.set(session.userId, session.lastSeenAt);
    }

    return {
      generatedAt: end.toISOString(),
      rangeDays,
      overview: {
        totalUsers: realUsers.length,
        newUsers: realUsers.filter((user) => Date.parse(user.createdAt) >= startMs).length,
        activeUsers,
        conversations: periodConversations.length,
        userMessages: periodMessages.filter((item) => item.message.role === "user").length,
        assistantMessages: assistantMessages.length,
        chatSuccessRate: assistantMessages.length
          ? assistantMessages.filter((item) => item.message.status === "complete").length / assistantMessages.length
          : null,
        positiveFeedbackRate: ratedMessages.length
          ? ratedMessages.filter((item) => item.message.feedback === "positive").length / ratedMessages.length
          : null
      },
      daily,
      messageStatuses,
      feedbackCategories,
      feedbackStatuses,
      featureUsage: {
        applications: periodApplications.length,
        resumeVersions: periodResumeVersions.length,
        interviewRecords: periodInterviewRecords.length,
        usersWithApplications: new Set(periodApplications.map((item) => item.userId)).size
      },
      recentUsers: realUsers
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 8)
        .map((user) => ({
          id: user.id,
          displayName: user.displayName,
          maskedEmail: maskEmail(user.email),
          createdAt: user.createdAt,
          lastActiveAt: lastActiveByUser.get(user.id),
          conversationCount: conversations.filter((item) => item.userId === user.id).length,
          applicationCount: [...this.applications.values()].filter((item) => item.userId === user.id && !item.item.deletedAt).length
        }))
    };
  }

  createSession(
    userId: string,
    scope: SessionScope,
    expiresAt: string,
    deviceId?: string,
    deviceName?: string
  ): IssuedStoreSession {
    if (!this.users.has(userId)) {
      throw new MemoryStoreError("USER_NOT_FOUND", "账号不存在或已经停用", 404);
    }
    const accessToken = randomBytes(32).toString("base64url");
    const tokenHash = hashSecret(accessToken);
    const now = new Date().toISOString();
    const session: StoredSession = {
      id: randomUUID(),
      userId,
      scope,
      deviceId,
      deviceName,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      tokenHash
    };
    this.sessionsByHash.set(tokenHash, session);
    this.sessionHashById.set(session.id, tokenHash);
    this.persist();
    const { tokenHash: _tokenHash, ...publicSession } = session;
    return { accessToken, session: clone(publicSession) };
  }

  resolveSession(accessToken: string): SessionRecord | undefined {
    const stored = this.sessionsByHash.get(hashSecret(accessToken));
    if (!stored || stored.revokedAt || Date.parse(stored.expiresAt) <= Date.now()) return undefined;
    stored.lastSeenAt = new Date().toISOString();
    const { tokenHash: _tokenHash, ...session } = stored;
    return clone(session);
  }

  rotateSession(accessToken: string, expiresAt: string): IssuedStoreSession | undefined {
    const oldHash = hashSecret(accessToken);
    const stored = this.sessionsByHash.get(oldHash);
    if (!stored || stored.revokedAt || Date.parse(stored.expiresAt) <= Date.now()) return undefined;
    const nextToken = randomBytes(32).toString("base64url");
    const nextHash = hashSecret(nextToken);
    const next: StoredSession = {
      ...stored,
      tokenHash: nextHash,
      expiresAt,
      lastSeenAt: new Date().toISOString()
    };
    this.sessionsByHash.delete(oldHash);
    this.sessionsByHash.set(nextHash, next);
    this.sessionHashById.set(next.id, nextHash);
    this.persist();
    const { tokenHash: _tokenHash, ...session } = next;
    return { accessToken: nextToken, session: clone(session) };
  }

  revokeSession(accessToken: string): boolean {
    const stored = this.sessionsByHash.get(hashSecret(accessToken));
    if (!stored || stored.revokedAt) return false;
    stored.revokedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  listSessions(userId: string): SessionRecord[] {
    return [...this.sessionsByHash.values()]
      .filter((session) => session.userId === userId && !session.revokedAt && Date.parse(session.expiresAt) > Date.now())
      .map(({ tokenHash: _tokenHash, ...session }) => clone(session))
      .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
  }

  revokeUserSession(userId: string, sessionId: string): boolean {
    const tokenHash = this.sessionHashById.get(sessionId);
    const stored = tokenHash ? this.sessionsByHash.get(tokenHash) : undefined;
    if (!stored || stored.userId !== userId || stored.revokedAt) return false;
    stored.revokedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  private publicUser(user: StoredUser): SessionUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarKey: isAvatarKey(user.avatarKey) ? user.avatarKey : "sprout",
      createdAt: user.createdAt
    };
  }

  createDeviceCode(userId: string, now = Date.now()): { code: string; expiresAt: string } {
    let code = "";
    do {
      code = `${randomInt(1000, 10000)}-${randomInt(1000, 10000)}`;
    } while (this.deviceCodes.has(hashSecret(normalizeDeviceCode(code))));
    const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
    this.deviceCodes.set(hashSecret(normalizeDeviceCode(code)), { userId, expiresAt });
    return { code, expiresAt };
  }

  exchangeDeviceCode(code: string, now = Date.now()): SessionUser | undefined {
    const normalized = hashSecret(normalizeDeviceCode(code));
    const record = this.deviceCodes.get(normalized);
    if (!record || Date.parse(record.expiresAt) <= now) {
      this.deviceCodes.delete(normalized);
      return undefined;
    }
    this.deviceCodes.delete(normalized);
    return this.getUser(record.userId);
  }

  listConversations(userId: string): ChatConversation[] {
    return [...this.conversations.values()]
      .filter((item) => item.userId === userId && !item.deletedAt)
      .map((item) => clone(item.conversation))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  createConversation(userId: string, title = "新的求职对话"): ChatConversation {
    const now = new Date().toISOString();
    const conversation: ChatConversation = {
      id: randomUUID(),
      title: title.trim() || "新的求职对话",
      createdAt: now,
      updatedAt: now
    };
    this.conversations.set(conversation.id, { userId, conversation });
    this.messages.set(conversation.id, []);
    this.persist();
    return clone(conversation);
  }

  updateConversation(userId: string, conversationId: string, title: string): ChatConversation | undefined {
    const stored = this.conversations.get(conversationId);
    if (!stored || stored.userId !== userId || stored.deletedAt) return undefined;
    stored.conversation.title = title.trim().slice(0, 80);
    stored.conversation.updatedAt = new Date().toISOString();
    this.persist();
    return clone(stored.conversation);
  }

  getConversation(
    userId: string,
    conversationId: string
  ): { conversation: ChatConversation; messages: ChatMessage[] } | undefined {
    const stored = this.conversations.get(conversationId);
    if (!stored || stored.userId !== userId || stored.deletedAt) return undefined;
    return {
      conversation: clone(stored.conversation),
      messages: clone(this.messages.get(conversationId) ?? [])
    };
  }

  deleteConversation(userId: string, conversationId: string): boolean {
    const stored = this.conversations.get(conversationId);
    if (!stored || stored.userId !== userId || stored.deletedAt) return false;
    stored.deletedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  appendUserMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    content: string,
    attachments: ChatAttachment[] = [],
    context: ChatContextReference[] = []
  ): ChatMessage {
    const stored = this.conversations.get(conversationId);
    if (!stored || stored.userId !== userId || stored.deletedAt) {
      throw new MemoryStoreError("CONVERSATION_NOT_FOUND", "没有找到这段对话", 404);
    }
    const list = this.messages.get(conversationId) ?? [];
    const existing = list.find((message) => message.id === messageId);
    if (existing) return clone(existing);

    const message: ChatMessage = {
      id: messageId,
      conversationId,
      role: "user",
      content: content.trim(),
      status: "complete",
      createdAt: new Date().toISOString(),
      attachments: clone(attachments),
      context: clone(context),
      citations: []
    };
    list.push(message);
    this.messages.set(conversationId, list);
    stored.conversation.updatedAt = message.createdAt;
    stored.conversation.lastMessagePreview = message.content.slice(0, 80);
    if (stored.conversation.title === "新的求职对话") {
      stored.conversation.title = titleFromMessage(message.content);
    }
    this.persist();
    return clone(message);
  }

  beginAssistantMessage(userId: string, conversationId: string): ChatMessage {
    const stored = this.conversations.get(conversationId);
    if (!stored || stored.userId !== userId || stored.deletedAt) {
      throw new MemoryStoreError("CONVERSATION_NOT_FOUND", "没有找到这段对话", 404);
    }
    const message: ChatMessage = {
      id: randomUUID(),
      conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: new Date().toISOString(),
      attachments: [],
      citations: []
    };
    const list = this.messages.get(conversationId) ?? [];
    list.push(message);
    this.messages.set(conversationId, list);
    this.persist();
    return clone(message);
  }

  completeAssistantMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    content: string,
    citations: KnowledgeCitation[],
    status: ChatMessage["status"] = "complete",
    opportunityResults?: ChatOpportunityResults
  ): ChatMessage {
    const stored = this.conversations.get(conversationId);
    const list = this.messages.get(conversationId);
    const message = list?.find((item) => item.id === messageId);
    if (!stored || stored.userId !== userId || !message) {
      throw new MemoryStoreError("MESSAGE_NOT_FOUND", "没有找到这条消息", 404);
    }
    message.content = content;
    message.citations = clone(citations);
    message.opportunityResults = opportunityResults ? clone(opportunityResults) : undefined;
    message.status = status;
    stored.conversation.updatedAt = new Date().toISOString();
    stored.conversation.lastMessagePreview = content.slice(0, 80);
    this.persist();
    return clone(message);
  }

  findRetryPrompt(userId: string, conversationId: string, messageId: string): string | undefined {
    const stored = this.conversations.get(conversationId);
    const list = this.messages.get(conversationId);
    if (!stored || stored.userId !== userId || !list) return undefined;
    const index = list.findIndex((message) => message.id === messageId);
    if (index < 0) return undefined;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (list[cursor].role === "user") return list[cursor].content;
    }
    return undefined;
  }

  setMessageFeedback(
    userId: string,
    conversationId: string,
    messageId: string,
    feedback: "positive" | "negative"
  ): ChatMessage | undefined {
    const stored = this.conversations.get(conversationId);
    const message = this.messages.get(conversationId)?.find((item) => item.id === messageId);
    if (!stored || stored.userId !== userId || stored.deletedAt || message?.role !== "assistant") return undefined;
    message.feedback = feedback;
    this.persist();
    return clone(message);
  }

  getConversationHistory(userId: string, conversationId: string): ChatMessage[] {
    return this.getConversation(userId, conversationId)?.messages ?? [];
  }

  listOpportunities(): RecruitmentOpportunity[] {
    return clone(this.opportunityFeed?.opportunities ?? []);
  }

  getOpportunity(id: string): RecruitmentOpportunity | undefined {
    const opportunity = this.opportunityFeed?.opportunities.find((item) => item.id === id);
    return opportunity ? clone(opportunity) : undefined;
  }

  getOpportunityFeed(): OpportunityFeedSnapshot {
    return clone(this.opportunityFeed ?? { opportunities: [] });
  }

  replaceOpportunityFeed(snapshot: OpportunityFeedSnapshot): OpportunityFeedSnapshot {
    const deduplicated = snapshot.opportunities.filter(
      (item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index
    );
    this.opportunityFeed = {
      opportunities: deduplicated,
      fetchedAt: snapshot.fetchedAt ?? new Date().toISOString(),
      sourceUpdatedAt: snapshot.sourceUpdatedAt,
      sourceUrl: snapshot.sourceUrl
    };
    this.persist();
    return clone(this.opportunityFeed);
  }

  listApplications(userId: string): ApplicationSyncItem[] {
    return [...this.applications.values()]
      .filter((stored) => stored.userId === userId && !stored.item.deletedAt)
      .map((stored) => clone(stored.item))
      .sort((left, right) => right.application.updatedAt.localeCompare(left.application.updatedAt));
  }

  getApplication(userId: string, id: string, includeDeleted = false): ApplicationSyncItem | undefined {
    const stored = this.applications.get(`${userId}:${id}`);
    if (!stored || (!includeDeleted && stored.item.deletedAt)) return undefined;
    return clone(stored.item);
  }

  listInterviewRecords(userId: string, applicationId: string): InterviewRecord[] {
    return [...this.interviewRecords.values()]
      .filter(
        (stored) =>
          stored.userId === userId && stored.record.applicationId === applicationId
      )
      .map((stored) => clone(stored.record))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  createInterviewRecord(
    userId: string,
    applicationId: string,
    input: InterviewRecordInput
  ): InterviewRecord {
    const application = this.getApplication(userId, applicationId);
    if (!application) {
      throw new MemoryStoreError("APPLICATION_NOT_FOUND", "没有找到这条投递", 404);
    }
    const now = new Date().toISOString();
    const record: InterviewRecord = {
      id: randomUUID(),
      applicationId,
      title:
        input.title?.trim() ||
        `${application.application.company} · ${application.application.position} 面试问答`,
      sourceType: input.sourceType,
      status: input.status ?? "processing",
      transcript: input.transcript?.trim() ?? "",
      qaPairs: clone(input.qaPairs ?? []),
      error: input.error,
      createdAt: now,
      updatedAt: now
    };
    this.interviewRecords.set(`${userId}:${record.id}`, { userId, record: clone(record) });
    this.persist();
    return clone(record);
  }

  completeInterviewRecord(
    userId: string,
    recordId: string,
    transcript: string,
    qaPairs: InterviewQaPair[]
  ): InterviewRecord {
    return this.updateInterviewRecord(userId, recordId, {
      status: "ready",
      transcript: transcript.trim(),
      qaPairs,
      error: undefined
    });
  }

  failInterviewRecord(userId: string, recordId: string, error: string): InterviewRecord {
    return this.updateInterviewRecord(userId, recordId, {
      status: "failed",
      error: error.trim() || "录音处理失败，请重试或直接上传文字稿。"
    });
  }

  private updateInterviewRecord(
    userId: string,
    recordId: string,
    changes: Partial<Pick<InterviewRecord, "status" | "transcript" | "qaPairs" | "error">>
  ): InterviewRecord {
    const key = `${userId}:${recordId}`;
    const stored = this.interviewRecords.get(key);
    if (!stored) {
      throw new MemoryStoreError("INTERVIEW_RECORD_NOT_FOUND", "没有找到这份面试问答记录", 404);
    }
    const record: InterviewRecord = {
      ...stored.record,
      ...clone(changes),
      updatedAt: new Date().toISOString()
    };
    if (changes.error === undefined && changes.status === "ready") delete record.error;
    this.interviewRecords.set(key, { userId, record: clone(record) });
    this.persist();
    return clone(record);
  }

  createApplication(userId: string, application: JobApplication): ApplicationSyncItem {
    return this.applyApplicationChange(userId, {
      changeId: `web:${randomUUID()}`,
      application,
      baseRevision: 0
    });
  }

  updateApplication(
    userId: string,
    application: JobApplication,
    expectedRevision: number
  ): ApplicationSyncItem {
    return this.applyApplicationChange(userId, {
      changeId: `web:${randomUUID()}`,
      application,
      baseRevision: expectedRevision
    });
  }

  deleteApplication(userId: string, id: string, expectedRevision: number): ApplicationSyncItem {
    const current = this.getApplication(userId, id, true);
    if (!current) throw new MemoryStoreError("APPLICATION_NOT_FOUND", "没有找到这条投递", 404);
    return this.applyApplicationChange(userId, {
      changeId: `web:${randomUUID()}`,
      application: current.application,
      baseRevision: expectedRevision,
      deletedAt: new Date().toISOString()
    });
  }

  private applyApplicationChange(userId: string, change: ApplicationSyncChange): ApplicationSyncItem {
    const key = `${userId}:${change.application.id}`;
    const current = this.applications.get(key)?.item;
    const alreadyApplied = this.appliedChanges.has(`${userId}:${change.changeId}`);
    const decision = decideApplicationRevision(current?.revision, change.baseRevision, alreadyApplied);
    if (decision.kind === "duplicate") return clone(current!);
    if (decision.kind === "conflict") {
      throw new MemoryStoreError(
        "REVISION_CONFLICT",
        "这条投递已在其他设备更新，请刷新后重试",
        409,
        { serverRevision: decision.serverRevision, server: current }
      );
    }

    const application = mergeAcceptedApplication(current?.application, change.application);
    const item: ApplicationSyncItem = {
      application,
      revision: decision.nextRevision,
      deletedAt: change.deletedAt
    };
    this.applications.set(key, { userId, item: clone(item) });
    this.appliedChanges.set(`${userId}:${change.changeId}`, item.revision);
    this.appendSyncLog(userId, item);
    this.persist();
    return clone(item);
  }

  syncApplications(userId: string, request: ApplicationSyncRequest): ApplicationSyncResponse {
    const acceptedChangeIds: string[] = [];
    const conflicts: ApplicationSyncConflict[] = [];

    for (const change of request.changes) {
      const current = this.getApplication(userId, change.application.id, true);
      const alreadyApplied = this.appliedChanges.has(`${userId}:${change.changeId}`);
      const decision = decideApplicationRevision(current?.revision, change.baseRevision, alreadyApplied);
      if (decision.kind === "duplicate") {
        acceptedChangeIds.push(change.changeId);
        continue;
      }
      if (decision.kind === "conflict") {
        conflicts.push({
          changeId: change.changeId,
          entityId: change.application.id,
          code: current?.deletedAt && !change.deletedAt ? "deleted_on_server" : "revision_conflict",
          message: current?.deletedAt
            ? "这条投递已在其他设备删除"
            : "这条投递已在其他设备更新",
          server: current,
          local: clone(change)
        });
        continue;
      }
      this.applyApplicationChange(userId, change);
      acceptedChangeIds.push(change.changeId);
    }

    const cursor = Number.parseInt(request.cursor || "0", 10) || 0;
    const pulled = this.changesSince(userId, cursor);

    // Include the server's current version for conflicted entities so the
    // client can see what changed on other devices and stay in sync.
    const changesById = new Map(pulled.changes.map((item) => [item.application.id, item]));
    for (const conflict of conflicts) {
      if (conflict.server && !changesById.has(conflict.entityId)) {
        changesById.set(conflict.entityId, conflict.server);
      }
    }
    const allChanges = [...changesById.values()].sort(
      (left, right) => left.application.updatedAt.localeCompare(right.application.updatedAt)
    );

    return {
      cursor: String(pulled.cursor),
      changes: allChanges,
      acceptedChangeIds,
      conflicts
    };
  }

  private appendSyncLog(userId: string, item: ApplicationSyncItem): void {
    this.sequence += 1;
    this.syncLog.push({ sequence: this.sequence, userId, item: clone(item) });
  }

  private changesSince(userId: string, cursor: number): {
    cursor: number;
    changes: ApplicationSyncItem[];
  } {
    const entries = this.syncLog.filter(
      (entry) => entry.userId === userId && entry.sequence > cursor
    );
    const latest = new Map<string, SyncLogEntry>();
    for (const entry of entries) latest.set(entry.item.application.id, entry);
    const userCursor = this.syncLog
      .filter((entry) => entry.userId === userId)
      .reduce((maximum, entry) => Math.max(maximum, entry.sequence), cursor);
    return {
      cursor: userCursor,
      changes: [...latest.values()]
        .sort((left, right) => left.sequence - right.sequence)
        .map((entry) => clone(entry.item))
    };
  }

  createTailorTask(userId: string, request: CreateTailorTaskRequest): {
    task: TailorTask;
    version: ResumeVersionRecord;
  } {
    const now = new Date().toISOString();
    const taskId = randomUUID();
    const versionId = randomUUID();
    const document = createResumeDocument({
      id: randomUUID(),
      title: `${request.job.company} · ${request.job.position}`,
      profile: request.sourceProfile,
      assets: request.sourceAssets,
      portraitAssetId: request.sourcePortraitAssetId,
      sourceEvidence: request.sourceEvidence,
      now
    });
    document.profile.targetRole = request.job.position;
    document.updatedAt = now;

    const version: ResumeVersionRecord = {
      revision: 1,
      version: {
        id: versionId,
        tailorTaskId: taskId,
        sourceResumeId: request.sourceResumeId,
        sourceResumeName: request.sourceResumeName,
        applicationId: request.applicationId,
        company: request.job.company,
        position: request.job.position,
        document,
        status: "draft",
        createdAt: now,
        updatedAt: now
      }
    };
    const task: TailorTask = {
      id: taskId,
      sourceResumeId: request.sourceResumeId,
      applicationId: request.applicationId,
      job: clone(request.job),
      sourceEvidence: request.sourceEvidence ? clone(request.sourceEvidence) : undefined,
      versionId,
      status: "draft",
      createdAt: now,
      updatedAt: now
    };
    this.resumeVersions.set(`${userId}:${versionId}`, { userId, item: clone(version) });
    this.tailorTasks.set(`${userId}:${taskId}`, { userId, task: clone(task) });
    if (request.applicationId) {
      const linked = this.getApplication(userId, request.applicationId);
      if (linked) {
        this.updateApplication(userId, {
          ...linked.application,
          tailorTaskId: taskId,
          tailoredResumeVersionId: versionId,
          tailoredResumeName: `${request.job.company} · ${request.job.position}`,
          tailoredResumeUpdatedAt: now,
          updatedAt: now,
          events: [
            ...linked.application.events,
            {
              id: randomUUID(),
              type: "updated",
              title: "已创建岗位定制简历",
              occurredAt: now
            }
          ]
        }, linked.revision);
      }
    }
    this.persist();
    return { task: clone(task), version: clone(version) };
  }

  getTailorTask(userId: string, taskId: string): {
    task: TailorTask;
    version: ResumeVersionRecord;
  } | undefined {
    const stored = this.tailorTasks.get(`${userId}:${taskId}`);
    if (!stored) return undefined;
    const version = this.resumeVersions.get(`${userId}:${stored.task.versionId}`)?.item;
    if (!version) return undefined;
    return { task: clone(stored.task), version: clone(version) };
  }

  getResumeVersion(userId: string, versionId: string): ResumeVersionRecord | undefined {
    const stored = this.resumeVersions.get(`${userId}:${versionId}`);
    return stored ? clone(stored.item) : undefined;
  }

  listResumeVersions(userId: string): ResumeVersionRecord[] {
    return [...this.resumeVersions.values()]
      .filter((stored) => stored.userId === userId && stored.item.version.status !== "archived")
      .map((stored) => clone(stored.item))
      .sort((left, right) => right.version.updatedAt.localeCompare(left.version.updatedAt));
  }

  listResumeTemplates(userId: string, includeDeleted = false): ResumeTemplateRecord[] {
    return [...this.resumeTemplates.values()]
      .filter((stored) => stored.userId === userId && (includeDeleted || !stored.template.deletedAt))
      .map((stored) => clone(stored.template))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  createResumeTemplate(userId: string, request: CreateResumeTemplateRequest): ResumeTemplateRecord {
    const key = `${userId}:${request.id}`;
    if (this.resumeTemplates.has(key)) {
      throw new MemoryStoreError("RESUME_TEMPLATE_EXISTS", "这份简历已经存在", 409);
    }
    const now = new Date().toISOString();
    const template: ResumeTemplateRecord = {
      id: request.id,
      name: request.name.trim(),
      profile: clone(request.document.profile),
      document: {
        ...clone(request.document),
        id: request.id,
        title: request.name.trim(),
        createdAt: now,
        updatedAt: now
      },
      origin: "web",
      createdAt: now,
      updatedAt: now
    };
    this.resumeTemplates.set(key, { userId, template });
    this.persist();
    return clone(template);
  }

  getResumeTemplate(userId: string, templateId: string): ResumeTemplateRecord | undefined {
    const stored = this.resumeTemplates.get(`${userId}:${templateId}`);
    return stored && !stored.template.deletedAt ? clone(stored.template) : undefined;
  }

  updateResumeTemplate(userId: string, templateId: string, request: UpdateResumeTemplateRequest): ResumeTemplateRecord {
    const key = `${userId}:${templateId}`;
    const stored = this.resumeTemplates.get(key);
    if (!stored) throw new MemoryStoreError("RESUME_TEMPLATE_NOT_FOUND", "没有找到这份通用简历", 404);
    if (request.document.id !== templateId) {
      throw new MemoryStoreError("INVALID_RESUME_DOCUMENT", "简历文档与当前通用简历不匹配", 400);
    }
    const now = new Date().toISOString();
    const template: ResumeTemplateRecord = {
      ...stored.template,
      name: request.name.trim(),
      profile: clone(request.document.profile),
      document: {
        ...clone(request.document),
        id: templateId,
        title: request.name.trim(),
        updatedAt: now
      },
      updatedAt: now
    };
    this.resumeTemplates.set(key, { userId, template });
    this.persist();
    return clone(template);
  }

  deleteResumeTemplate(userId: string, templateId: string): void {
    const key = `${userId}:${templateId}`;
    const stored = this.resumeTemplates.get(key);
    if (!stored || stored.template.deletedAt) {
      throw new MemoryStoreError("RESUME_TEMPLATE_NOT_FOUND", "没有找到这份通用简历", 404);
    }
    const now = new Date(Math.max(Date.now(), Date.parse(stored.template.updatedAt) + 1)).toISOString();
    this.resumeTemplates.set(key, {
      userId,
      template: { ...stored.template, updatedAt: now, deletedAt: now }
    });
    this.persist();
  }

  syncResumeTemplates(userId: string, templates: ResumeTemplateRecord[]): ResumeTemplateRecord[] {
    for (const template of templates) {
      const key = `${userId}:${template.id}`;
      const current = this.resumeTemplates.get(key)?.template;
      if (current && current.updatedAt.localeCompare(template.updatedAt) > 0) continue;
      const mergedDocument = template.document
        ? clone(template.document)
        : current?.document
          ? {
              ...clone(current.document),
              title: template.name,
              profile: clone(template.profile),
              updatedAt: template.updatedAt
            }
          : undefined;
      this.resumeTemplates.set(key, {
        userId,
        template: clone({
          ...current,
          ...template,
          document: mergedDocument,
          origin: current?.origin || template.origin || "extension"
        })
      });
    }
    this.persist();
    return this.listResumeTemplates(userId, true);
  }

  updateResumeVersion(
    userId: string,
    versionId: string,
    document: ResumeDocument,
    expectedRevision: number
  ): ResumeVersionRecord {
    const key = `${userId}:${versionId}`;
    const stored = this.resumeVersions.get(key);
    if (!stored) {
      throw new MemoryStoreError("RESUME_VERSION_NOT_FOUND", "没有找到这份简历版本", 404);
    }
    if (stored.item.revision !== expectedRevision) {
      throw new MemoryStoreError(
        "REVISION_CONFLICT",
        "这份简历已在其他页面更新，请刷新后重试",
        409,
        { serverRevision: stored.item.revision, server: stored.item }
      );
    }
    if (document.id !== stored.item.version.document.id) {
      throw new MemoryStoreError("INVALID_RESUME_DOCUMENT", "简历文档与当前版本不匹配", 400);
    }
    const now = new Date().toISOString();
    const item: ResumeVersionRecord = {
      revision: expectedRevision + 1,
      version: {
        ...stored.item.version,
        document: { ...clone(document), updatedAt: now },
        updatedAt: now
      }
    };
    this.resumeVersions.set(key, { userId, item: clone(item) });
    this.persist();
    return clone(item);
  }

  deleteResumeVersion(userId: string, versionId: string, expectedRevision: number): void {
    const key = `${userId}:${versionId}`;
    const stored = this.resumeVersions.get(key);
    if (!stored) throw new MemoryStoreError("RESUME_VERSION_NOT_FOUND", "没有找到这份简历版本", 404);
    if (stored.item.revision !== expectedRevision) {
      throw new MemoryStoreError("REVISION_CONFLICT", "这份简历已在其他页面更新，请刷新后重试", 409);
    }
    this.resumeVersions.delete(key);
    this.tailorTasks.delete(`${userId}:${stored.item.version.tailorTaskId}`);
    this.persist();
  }

  createHandoffCode(userId: string, targetPath: string): { code: string; expiresAt: string } {
    const code = randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    this.handoffCodes.set(hashSecret(code), { userId, targetPath, expiresAt });
    return { code, expiresAt };
  }

  exchangeHandoffCode(code: string): { user: SessionUser; targetPath: string } | undefined {
    const normalized = hashSecret(code.trim());
    const stored = this.handoffCodes.get(normalized);
    this.handoffCodes.delete(normalized);
    if (!stored || new Date(stored.expiresAt).getTime() <= Date.now()) return undefined;
    const user = this.getUser(stored.userId);
    return user ? { user, targetPath: stored.targetPath } : undefined;
  }
}
