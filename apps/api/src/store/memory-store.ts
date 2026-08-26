import { randomInt, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  ApplicationSyncChange,
  ApplicationSyncConflict,
  ApplicationSyncItem,
  ApplicationSyncRequest,
  ApplicationSyncResponse,
  CreateTailorTaskRequest,
  ResumeVersionRecord,
  SessionUser
} from "@offerflow/contracts";
import {
  decideApplicationRevision,
  mergeAcceptedApplication,
  createResumeDocument,
  type ChatAttachment,
  type ChatConversation,
  type ChatMessage,
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

export interface StoredUser extends SessionUser {
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

export interface MemoryStoreOptions {
  /**
   * Set false to keep the store fully in-memory (used by tests). Persistence is
   * enabled by default and can be pointed elsewhere with OFFERFLOW_DATA_FILE.
   */
  persistence?: boolean;
  dataFile?: string;
  initialState?: PersistedStoreState;
}

export interface PersistedStoreState {
  version: 1;
  users: StoredUser[];
  usersByEmail: Record<string, string>;
  conversations: StoredConversation[];
  messages: Record<string, ChatMessage[]>;
  applications: StoredApplication[];
  resumeVersions?: StoredResumeVersion[];
  tailorTasks?: StoredTailorTask[];
  interviewRecords?: StoredInterviewRecord[];
  appliedChanges: Record<string, number>;
  syncLog: SyncLogEntry[];
  sequence: number;
  opportunityFeed?: OpportunityFeedSnapshot;
}

const DEFAULT_DATA_FILE = join(process.cwd(), ".offerflow-data", "state.json");

export class MemoryStoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "MemoryStoreError";
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeDeviceCode(code: string): string {
  return code.trim().replace(/[\s-]/g, "");
}

function titleFromMessage(content: string): string {
  const title = content.trim().replace(/\s+/g, " ");
  return title.length > 24 ? `${title.slice(0, 24)}…` : title || "新的求职对话";
}

export class MemoryStore {
  private readonly users = new Map<string, StoredUser>();
  private readonly usersByEmail = new Map<string, string>();
  private readonly conversations = new Map<string, StoredConversation>();
  private readonly messages = new Map<string, ChatMessage[]>();
  private readonly applications = new Map<string, StoredApplication>();
  private readonly resumeVersions = new Map<string, StoredResumeVersion>();
  private readonly tailorTasks = new Map<string, StoredTailorTask>();
  private readonly interviewRecords = new Map<string, StoredInterviewRecord>();
  private readonly deviceCodes = new Map<string, DeviceCode>();
  private readonly handoffCodes = new Map<string, HandoffCode>();
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
    if (options.initialState) {
      this.replaceState(options.initialState);
    } else {
      this.loadPersistedState();
    }
    if (!this.usersByEmail.has("demo@offerflow.cn")) {
      this.createUser("demo@offerflow.cn", "林知夏", "offerflow2026", "demo-user");
    }
  }

  snapshot(): PersistedStoreState {
    return clone({
      version: 1,
      users: [...this.users.values()],
      usersByEmail: Object.fromEntries(this.usersByEmail),
      conversations: [...this.conversations.values()],
      messages: Object.fromEntries(this.messages),
      applications: [...this.applications.values()],
      resumeVersions: [...this.resumeVersions.values()],
      tailorTasks: [...this.tailorTasks.values()],
      interviewRecords: [...this.interviewRecords.values()],
      appliedChanges: Object.fromEntries(this.appliedChanges),
      syncLog: this.syncLog,
      sequence: this.sequence,
      opportunityFeed: this.opportunityFeed
    });
  }

  replaceState(state: PersistedStoreState): void {
    this.users.clear();
    this.usersByEmail.clear();
    this.conversations.clear();
    this.messages.clear();
    this.applications.clear();
    this.resumeVersions.clear();
    this.tailorTasks.clear();
    this.interviewRecords.clear();
    this.deviceCodes.clear();
    this.handoffCodes.clear();
    this.appliedChanges.clear();
    this.syncLog.splice(0, this.syncLog.length);
    this.sequence = 0;
    this.opportunityFeed = undefined;

    this.loadState(clone(state));
  }

  private loadState(parsed: PersistedStoreState): void {
    if (!parsed || parsed.version !== 1) return;

    for (const user of parsed.users ?? []) {
      this.users.set(user.id, user);
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

    for (const stored of parsed.tailorTasks ?? []) {
      this.tailorTasks.set(`${stored.userId}:${stored.task.id}`, stored);
    }

    for (const stored of parsed.interviewRecords ?? []) {
      const record = clone(stored.record);

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
  }

  private loadPersistedState(): void {
    if (!this.dataFile || !existsSync(this.dataFile)) return;

    try {
      const parsed = JSON.parse(
        readFileSync(this.dataFile, "utf8")
      ) as PersistedStoreState;

      this.replaceState(parsed);
    } catch {
      // Corrupt local fallback state must not prevent API startup.
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
      tailorTasks: [...this.tailorTasks.values()],
      interviewRecords: [...this.interviewRecords.values()],
      appliedChanges: Object.fromEntries(this.appliedChanges),
      syncLog: this.syncLog,
      sequence: this.sequence,
      opportunityFeed: this.opportunityFeed
    };
    const temporary = `${this.dataFile}.tmp`;
    mkdirSync(dirname(this.dataFile), { recursive: true });
    writeFileSync(temporary, JSON.stringify(state, null, 2), "utf8");
    renameSync(temporary, this.dataFile);
  }

  createUser(email: string, displayName: string, password: string, fixedId?: string): SessionUser {
    const normalizedEmail = normalizeEmail(email);
    if (this.usersByEmail.has(normalizedEmail)) {
      throw new MemoryStoreError("EMAIL_EXISTS", "这个邮箱已经注册", 409);
    }
    const passwordValue = hashPassword(password);
    const user: StoredUser = {
      id: fixedId ?? randomUUID(),
      email: normalizedEmail,
      displayName: displayName.trim() || normalizedEmail.split("@")[0],
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

  getUser(userId: string): SessionUser | undefined {
    const user = this.users.get(userId);
    return user ? this.publicUser(user) : undefined;
  }

  getDemoUser(): SessionUser {
    return this.publicUser(this.users.get("demo-user")!);
  }

  private publicUser(user: StoredUser): SessionUser {
    return { id: user.id, email: user.email, displayName: user.displayName };
  }

  createDeviceCode(userId: string, now = Date.now()): { code: string; expiresAt: string } {
    let code = "";
    do {
      code = `${randomInt(1000, 10000)}-${randomInt(1000, 10000)}`;
    } while (this.deviceCodes.has(code));
    const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
    this.deviceCodes.set(normalizeDeviceCode(code), { userId, expiresAt });
    return { code, expiresAt };
  }

  exchangeDeviceCode(code: string, now = Date.now()): SessionUser | undefined {
    const normalized = normalizeDeviceCode(code);
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
    attachments: ChatAttachment[] = []
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
    status: ChatMessage["status"] = "complete"
  ): ChatMessage {
    const stored = this.conversations.get(conversationId);
    const list = this.messages.get(conversationId);
    const message = list?.find((item) => item.id === messageId);
    if (!stored || stored.userId !== userId || !message) {
      throw new MemoryStoreError("MESSAGE_NOT_FOUND", "没有找到这条消息", 404);
    }
    message.content = content;
    message.citations = clone(citations);
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
    input: {
      title?: string;
      sourceType: InterviewRecordSourceType;
      transcript?: string;
      qaPairs?: InterviewQaPair[];
      status?: InterviewRecord["status"];
      error?: string;
    }
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
          server: current
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

  createHandoffCode(userId: string, targetPath: string): { code: string; expiresAt: string } {
    const code = randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    this.handoffCodes.set(code, { userId, targetPath, expiresAt });
    return { code, expiresAt };
  }

  exchangeHandoffCode(code: string): { user: SessionUser; targetPath: string } | undefined {
    const normalized = code.trim();
    const stored = this.handoffCodes.get(normalized);
    this.handoffCodes.delete(normalized);
    if (!stored || new Date(stored.expiresAt).getTime() <= Date.now()) return undefined;
    const user = this.getUser(stored.userId);
    return user ? { user, targetPath: stored.targetPath } : undefined;
  }
}
