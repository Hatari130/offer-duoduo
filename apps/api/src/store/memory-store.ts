import { randomInt, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  ApplicationSyncChange,
  ApplicationSyncConflict,
  ApplicationSyncItem,
  ApplicationSyncRequest,
  ApplicationSyncResponse,
  SessionUser
} from "@offerflow/contracts";
import {
  decideApplicationRevision,
  mergeAcceptedApplication,
  type ChatAttachment,
  type ChatConversation,
  type ChatMessage,
  type JobApplication,
  type KnowledgeCitation,
  type OpportunityFeedSnapshot,
  type RecruitmentOpportunity
} from "@offerflow/domain";
import { hashPassword, verifyPassword } from "../auth/crypto.ts";

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
  private readonly deviceCodes = new Map<string, DeviceCode>();
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
      this.createUser("demo@offerflow.cn", "林知夏", "offerflow2026", "demo-user");
    }
  }

  private loadPersistedState(): void {
    if (!this.dataFile || !existsSync(this.dataFile)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.dataFile, "utf8")) as PersistedStoreState;
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
    return {
      cursor: String(pulled.cursor),
      changes: pulled.changes,
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
}
