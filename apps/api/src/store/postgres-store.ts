import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
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
  createResumeDocument,
  decideApplicationRevision,
  mergeAcceptedApplication,
  type ChatAttachment,
  type ChatConversation,
  type ChatMessage,
  type InterviewQaPair,
  type InterviewRecord,
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
  type InterviewRecordInput,
  type IssuedStoreSession,
  type OfferFlowStore,
  type SessionRecord,
  type SessionScope
} from "./store.ts";

const DEMO_EMAIL = "demo@offerflow.cn";

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeDeviceCode(value: string): string {
  return value.trim().replace(/[\s-]/g, "");
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function titleFromMessage(content: string): string {
  const title = content.trim().replace(/\s+/g, " ");
  return title.length > 24 ? `${title.slice(0, 24)}…` : title || "新的求职对话";
}

function sessionFromRow(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    scope: row.scope as SessionScope,
    deviceId: row.device_id ? String(row.device_id) : undefined,
    deviceName: row.device_name ? String(row.device_name) : undefined,
    createdAt: new Date(row.created_at as string).toISOString(),
    lastSeenAt: new Date(row.last_seen_at as string).toISOString(),
    expiresAt: new Date(row.expires_at as string).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at as string).toISOString() : undefined
  };
}

function userFromRow(row: Record<string, unknown>): SessionUser {
  return {
    id: String(row.id),
    email: String(row.email || ""),
    displayName: String(row.display_name || row.email || "用户")
  };
}

export interface PostgresStoreOptions {
  connectionString: string;
  allowDemoAuth?: boolean;
}

export class PostgresStore implements OfferFlowStore {
  private readonly pool: Pool;
  private readonly allowDemoAuth: boolean;

  constructor(options: PostgresStoreOptions) {
    this.pool = new Pool({ connectionString: options.connectionString, max: 12 });
    this.allowDemoAuth = options.allowDemoAuth ?? false;
  }

  async initialize(): Promise<void> {
    const result = await this.pool.query<{ ready: string | null }>(
      "SELECT to_regclass('public.auth_sessions')::text AS ready"
    );
    if (!result.rows[0]?.ready) {
      throw new Error("PostgreSQL 尚未迁移，请先运行 pnpm --filter @offerflow/api db:migrate");
    }
    await this.pool.query("DELETE FROM auth_sessions WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'");
    await this.pool.query("DELETE FROM device_pairing_codes WHERE expires_at < now() - interval '1 day' OR consumed_at < now() - interval '1 day'");
    await this.pool.query("DELETE FROM handoff_codes WHERE expires_at < now() - interval '1 day' OR consumed_at < now() - interval '1 day'");
    if (this.allowDemoAuth && !(await this.getDemoUser())) {
      await this.createUser(DEMO_EMAIL, "林知夏", "offerflow2026");
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createUser(email: string, displayName: string, password: string, fixedId?: string): Promise<SessionUser> {
    const normalized = normalizeEmail(email);
    const databaseId = fixedId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fixedId) ? fixedId : null;
    const passwordValue = hashPassword(password);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO users (id, external_auth_id, email, display_name)
         VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4)
         RETURNING id, email, display_name`,
        [databaseId, `password:${normalized}`, normalized, displayName.trim() || normalized.split("@")[0]]
      );
      await client.query(
        "INSERT INTO auth_credentials (user_id, password_hash, password_salt) VALUES ($1, $2, $3)",
        [result.rows[0].id, passwordValue.hash, passwordValue.salt]
      );
      await client.query("COMMIT");
      return userFromRow(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") {
        throw new StoreError("EMAIL_EXISTS", "这个邮箱已经注册", 409);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async authenticate(email: string, password: string): Promise<SessionUser | undefined> {
    const result = await this.pool.query(
      `SELECT u.id, u.email, u.display_name, c.password_hash, c.password_salt
       FROM users u JOIN auth_credentials c ON c.user_id = u.id
       WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [normalizeEmail(email)]
    );
    const row = result.rows[0];
    if (!row || !verifyPassword(password, row.password_salt, row.password_hash)) return undefined;
    return userFromRow(row);
  }

  async getUser(userId: string): Promise<SessionUser | undefined> {
    const result = await this.pool.query(
      "SELECT id, email, display_name FROM users WHERE id = $1 AND deleted_at IS NULL",
      [userId]
    );
    return result.rows[0] ? userFromRow(result.rows[0]) : undefined;
  }

  async getDemoUser(): Promise<SessionUser | undefined> {
    const result = await this.pool.query(
      "SELECT id, email, display_name FROM users WHERE email = $1 AND deleted_at IS NULL",
      [DEMO_EMAIL]
    );
    return result.rows[0] ? userFromRow(result.rows[0]) : undefined;
  }

  async recordConsent(userId: string, consentType: string, policyVersion: string): Promise<void> {
    await this.pool.query(
      "INSERT INTO consent_records (user_id,consent_type,policy_version) VALUES ($1,$2,$3)",
      [userId, consentType, policyVersion]
    );
  }

  async deleteUser(userId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO audit_logs (user_id,action) VALUES ($1,'account_deleted')", [userId]);
      const result = await client.query("DELETE FROM users WHERE id=$1", [userId]);
      await client.query("COMMIT");
      return Boolean(result.rowCount);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async createSession(userId: string, scope: SessionScope, expiresAt: string, deviceId?: string, deviceName?: string): Promise<IssuedStoreSession> {
    const accessToken = randomBytes(32).toString("base64url");
    const result = await this.pool.query(
      `INSERT INTO auth_sessions (user_id, token_hash, scope, device_id, device_name, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, hashSecret(accessToken), scope, deviceId || null, deviceName?.trim() || null, expiresAt]
    );
    return { accessToken, session: sessionFromRow(result.rows[0]) };
  }

  async resolveSession(accessToken: string): Promise<SessionRecord | undefined> {
    const result = await this.pool.query(
      `UPDATE auth_sessions SET last_seen_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
       RETURNING *`,
      [hashSecret(accessToken)]
    );
    return result.rows[0] ? sessionFromRow(result.rows[0]) : undefined;
  }

  async rotateSession(accessToken: string, expiresAt: string): Promise<IssuedStoreSession | undefined> {
    const nextToken = randomBytes(32).toString("base64url");
    const result = await this.pool.query(
      `UPDATE auth_sessions SET token_hash = $2, expires_at = $3, last_seen_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() RETURNING *`,
      [hashSecret(accessToken), hashSecret(nextToken), expiresAt]
    );
    return result.rows[0] ? { accessToken: nextToken, session: sessionFromRow(result.rows[0]) } : undefined;
  }

  async revokeSession(accessToken: string): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
      [hashSecret(accessToken)]
    );
    return Boolean(result.rowCount);
  }

  async listSessions(userId: string): Promise<SessionRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY last_seen_at DESC`,
      [userId]
    );
    return result.rows.map(sessionFromRow);
  }

  async revokeUserSession(userId: string, sessionId: string): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE auth_sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL",
      [sessionId, userId]
    );
    return Boolean(result.rowCount);
  }

  async createDeviceCode(userId: string, now = Date.now()): Promise<{ code: string; expiresAt: string }> {
    const code = `${randomInt(1000, 10000)}-${randomInt(1000, 10000)}`;
    const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
    await this.pool.query(
      "INSERT INTO device_pairing_codes (code_hash, user_id, expires_at) VALUES ($1, $2, $3)",
      [hashSecret(normalizeDeviceCode(code)), userId, expiresAt]
    );
    return { code, expiresAt };
  }

  async exchangeDeviceCode(code: string, now = Date.now()): Promise<SessionUser | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE device_pairing_codes SET consumed_at = now()
         WHERE code_hash = $1 AND consumed_at IS NULL AND expires_at > $2
         RETURNING user_id`,
        [hashSecret(normalizeDeviceCode(code)), new Date(now).toISOString()]
      );
      const user = result.rows[0] ? await client.query(
        "SELECT id, email, display_name FROM users WHERE id = $1 AND deleted_at IS NULL",
        [result.rows[0].user_id]
      ) : undefined;
      await client.query("COMMIT");
      return user?.rows[0] ? userFromRow(user.rows[0]) : undefined;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createHandoffCode(userId: string, targetPath: string): Promise<{ code: string; expiresAt: string }> {
    const code = randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    await this.pool.query(
      "INSERT INTO handoff_codes (code_hash, user_id, target_path, expires_at) VALUES ($1, $2, $3, $4)",
      [hashSecret(code), userId, targetPath, expiresAt]
    );
    return { code, expiresAt };
  }

  async exchangeHandoffCode(code: string): Promise<{ user: SessionUser; targetPath: string } | undefined> {
    const result = await this.pool.query(
      `UPDATE handoff_codes h SET consumed_at = now()
       FROM users u WHERE h.code_hash = $1 AND h.user_id = u.id
       AND h.consumed_at IS NULL AND h.expires_at > now() AND u.deleted_at IS NULL
       RETURNING u.id, u.email, u.display_name, h.target_path`,
      [hashSecret(code.trim())]
    );
    return result.rows[0] ? { user: userFromRow(result.rows[0]), targetPath: result.rows[0].target_path } : undefined;
  }

  async listConversations(userId: string): Promise<ChatConversation[]> {
    const result = await this.pool.query(
      "SELECT payload FROM conversations WHERE user_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC",
      [userId]
    );
    return result.rows.map((row) => row.payload as ChatConversation);
  }

  async createConversation(userId: string, title = "新的求职对话"): Promise<ChatConversation> {
    const now = new Date().toISOString();
    const conversation: ChatConversation = { id: randomUUID(), title: title.trim() || "新的求职对话", createdAt: now, updatedAt: now };
    await this.pool.query(
      "INSERT INTO conversations (id, user_id, title, payload, created_at, updated_at) VALUES ($1, $2, $3, $4::jsonb, $5, $5)",
      [conversation.id, userId, conversation.title, json(conversation), now]
    );
    return conversation;
  }

  async getConversation(userId: string, conversationId: string): Promise<{ conversation: ChatConversation; messages: ChatMessage[] } | undefined> {
    const conversation = await this.pool.query(
      "SELECT payload FROM conversations WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
      [conversationId, userId]
    );
    if (!conversation.rows[0]) return undefined;
    const messages = await this.pool.query(
      "SELECT payload FROM messages WHERE conversation_id = $1 AND user_id = $2 ORDER BY created_at",
      [conversationId, userId]
    );
    return { conversation: conversation.rows[0].payload, messages: messages.rows.map((row) => row.payload) };
  }

  async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE conversations SET deleted_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
      [conversationId, userId]
    );
    return Boolean(result.rowCount);
  }

  private async saveMessage(userId: string, message: ChatMessage): Promise<void> {
    await this.pool.query(
      `INSERT INTO messages (id, conversation_id, user_id, role, status, content, attachments, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, content = EXCLUDED.content, payload = EXCLUDED.payload`,
      [message.id, message.conversationId, userId, message.role, message.status, message.content, json(message.attachments), json(message), message.createdAt]
    );
  }

  async appendUserMessage(userId: string, conversationId: string, messageId: string, content: string, attachments: ChatAttachment[] = []): Promise<ChatMessage> {
    const existing = await this.pool.query("SELECT payload FROM messages WHERE id = $1 AND user_id = $2", [messageId, userId]);
    if (existing.rows[0]) return existing.rows[0].payload;
    const current = await this.getConversation(userId, conversationId);
    if (!current) throw new StoreError("CONVERSATION_NOT_FOUND", "没有找到这段对话", 404);
    const message: ChatMessage = { id: messageId, conversationId, role: "user", content: content.trim(), status: "complete", createdAt: new Date().toISOString(), attachments, citations: [] };
    await this.saveMessage(userId, message);
    const conversation: ChatConversation = {
      ...current.conversation,
      title: current.conversation.title === "新的求职对话" ? titleFromMessage(message.content) : current.conversation.title,
      updatedAt: message.createdAt,
      lastMessagePreview: message.content.slice(0, 80)
    };
    await this.pool.query("UPDATE conversations SET title = $3, payload = $4::jsonb, updated_at = $5 WHERE id = $1 AND user_id = $2", [conversationId, userId, conversation.title, json(conversation), message.createdAt]);
    return message;
  }

  async beginAssistantMessage(userId: string, conversationId: string): Promise<ChatMessage> {
    if (!(await this.getConversation(userId, conversationId))) throw new StoreError("CONVERSATION_NOT_FOUND", "没有找到这段对话", 404);
    const message: ChatMessage = { id: randomUUID(), conversationId, role: "assistant", content: "", status: "streaming", createdAt: new Date().toISOString(), attachments: [], citations: [] };
    await this.saveMessage(userId, message);
    return message;
  }

  async completeAssistantMessage(userId: string, conversationId: string, messageId: string, content: string, citations: KnowledgeCitation[], status: ChatMessage["status"] = "complete"): Promise<ChatMessage> {
    const result = await this.pool.query("SELECT payload FROM messages WHERE id = $1 AND conversation_id = $2 AND user_id = $3", [messageId, conversationId, userId]);
    if (!result.rows[0]) throw new StoreError("MESSAGE_NOT_FOUND", "没有找到这条消息", 404);
    const message: ChatMessage = { ...result.rows[0].payload, content, citations, status };
    await this.saveMessage(userId, message);
    const current = await this.getConversation(userId, conversationId);
    if (current) {
      const conversation = { ...current.conversation, updatedAt: new Date().toISOString(), lastMessagePreview: content.slice(0, 80) };
      await this.pool.query("UPDATE conversations SET payload = $3::jsonb, updated_at = $4 WHERE id = $1 AND user_id = $2", [conversationId, userId, json(conversation), conversation.updatedAt]);
    }
    return message;
  }

  async findRetryPrompt(userId: string, conversationId: string, messageId: string): Promise<string | undefined> {
    const history = await this.getConversationHistory(userId, conversationId);
    const index = history.findIndex((message) => message.id === messageId);
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) if (history[cursor].role === "user") return history[cursor].content;
    return undefined;
  }

  async getConversationHistory(userId: string, conversationId: string): Promise<ChatMessage[]> {
    return (await this.getConversation(userId, conversationId))?.messages ?? [];
  }

  async getOpportunityFeed(): Promise<OpportunityFeedSnapshot> {
    const result = await this.pool.query("SELECT payload FROM opportunity_feed_snapshots WHERE singleton = true");
    return result.rows[0]?.payload ?? { opportunities: [] };
  }

  async listOpportunities(): Promise<RecruitmentOpportunity[]> {
    return (await this.getOpportunityFeed()).opportunities;
  }

  async getOpportunity(id: string): Promise<RecruitmentOpportunity | undefined> {
    return (await this.getOpportunityFeed()).opportunities.find((item) => item.id === id);
  }

  async replaceOpportunityFeed(snapshot: OpportunityFeedSnapshot): Promise<OpportunityFeedSnapshot> {
    const deduplicated = snapshot.opportunities.filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);
    const feed = { ...snapshot, opportunities: deduplicated, fetchedAt: snapshot.fetchedAt ?? new Date().toISOString() };
    await this.pool.query(
      `INSERT INTO opportunity_feed_snapshots (singleton, payload) VALUES (true, $1::jsonb)
       ON CONFLICT (singleton) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
      [json(feed)]
    );
    return feed;
  }

  async listApplications(userId: string): Promise<ApplicationSyncItem[]> {
    const result = await this.pool.query("SELECT payload, revision, deleted_at FROM applications WHERE user_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC", [userId]);
    return result.rows.map((row) => ({ application: row.payload, revision: Number(row.revision), deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : undefined }));
  }

  async getApplication(userId: string, id: string, includeDeleted = false): Promise<ApplicationSyncItem | undefined> {
    const result = await this.pool.query(
      `SELECT payload, revision, deleted_at FROM applications WHERE user_id = $1 AND id = $2 ${includeDeleted ? "" : "AND deleted_at IS NULL"}`,
      [userId, id]
    );
    const row = result.rows[0];
    return row ? { application: row.payload, revision: Number(row.revision), deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : undefined } : undefined;
  }

  private async applyApplicationChange(client: PoolClient, userId: string, change: ApplicationSyncChange): Promise<ApplicationSyncItem> {
    const currentResult = await client.query("SELECT payload, revision, deleted_at FROM applications WHERE user_id = $1 AND id = $2 FOR UPDATE", [userId, change.application.id]);
    const currentRow = currentResult.rows[0];
    const applied = await client.query("SELECT revision FROM sync_applied_changes WHERE user_id = $1 AND change_id = $2", [userId, change.changeId]);
    const current: ApplicationSyncItem | undefined = currentRow ? { application: currentRow.payload, revision: Number(currentRow.revision), deletedAt: currentRow.deleted_at ? new Date(currentRow.deleted_at).toISOString() : undefined } : undefined;
    const decision = decideApplicationRevision(current?.revision, change.baseRevision, Boolean(applied.rows[0]));
    if (decision.kind === "duplicate") return current!;
    if (decision.kind === "conflict") throw new StoreError("REVISION_CONFLICT", "这条投递已在其他设备更新，请刷新后重试", 409, { serverRevision: decision.serverRevision, server: current });
    const application = mergeAcceptedApplication(current?.application, change.application);
    const item: ApplicationSyncItem = { application, revision: decision.nextRevision, deletedAt: change.deletedAt };
    await client.query(
      `INSERT INTO applications
       (id, user_id, stage, external_stage, company_name_snapshot, position_snapshot, department_snapshot, city_snapshot, job_type_snapshot,
        source_url, source_host, summary_snapshot, responsibilities_snapshot, requirements_snapshot, raw_excerpt_snapshot, is_favorite,
        applied_at, deadline_at, next_action, revision, created_at, updated_at, deleted_at, identity_aliases, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25::jsonb)
       ON CONFLICT (user_id, id) DO UPDATE SET stage=EXCLUDED.stage, external_stage=EXCLUDED.external_stage,
       company_name_snapshot=EXCLUDED.company_name_snapshot, position_snapshot=EXCLUDED.position_snapshot,
       department_snapshot=EXCLUDED.department_snapshot, city_snapshot=EXCLUDED.city_snapshot, job_type_snapshot=EXCLUDED.job_type_snapshot,
       source_url=EXCLUDED.source_url, source_host=EXCLUDED.source_host, summary_snapshot=EXCLUDED.summary_snapshot,
       responsibilities_snapshot=EXCLUDED.responsibilities_snapshot, requirements_snapshot=EXCLUDED.requirements_snapshot,
       raw_excerpt_snapshot=EXCLUDED.raw_excerpt_snapshot, is_favorite=EXCLUDED.is_favorite, applied_at=EXCLUDED.applied_at,
       deadline_at=EXCLUDED.deadline_at, next_action=EXCLUDED.next_action, revision=EXCLUDED.revision, updated_at=EXCLUDED.updated_at,
       deleted_at=EXCLUDED.deleted_at, identity_aliases=EXCLUDED.identity_aliases, payload=EXCLUDED.payload`,
      [application.id,userId,application.stage,application.externalStage||null,application.company,application.position,application.department||null,application.city||null,application.jobType||null,application.sourceUrl,application.sourceHost,application.summary||null,json(application.responsibilities),json(application.requirements),application.rawExcerpt||null,application.isFavorite??false,application.appliedAt||null,application.deadline||null,application.nextAction||null,item.revision,application.createdAt,application.updatedAt,item.deletedAt||null,json(application.identityAliases??[]),json(application)]
    );
    await client.query(
      `INSERT INTO sync_applied_changes (user_id, change_id, entity_type, entity_id, revision)
       VALUES ($1,$2,'application',$3,$4) ON CONFLICT (user_id, change_id) DO NOTHING`,
      [userId, change.changeId, application.id, item.revision]
    );
    await client.query(
      "INSERT INTO sync_changes (user_id, entity_type, entity_id, operation, revision, payload) VALUES ($1,'application',$2,$3,$4,$5::jsonb)",
      [userId, application.id, item.deletedAt ? "delete" : "upsert", item.revision, json(item)]
    );
    return item;
  }

  private async withApplicationChange(userId: string, change: ApplicationSyncChange): Promise<ApplicationSyncItem> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const item = await this.applyApplicationChange(client, userId, change);
      await client.query("COMMIT");
      return item;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async createApplication(userId: string, application: JobApplication): Promise<ApplicationSyncItem> {
    return this.withApplicationChange(userId, { changeId: `web:${randomUUID()}`, application, baseRevision: 0 });
  }

  async updateApplication(userId: string, application: JobApplication, expectedRevision: number): Promise<ApplicationSyncItem> {
    return this.withApplicationChange(userId, { changeId: `web:${randomUUID()}`, application, baseRevision: expectedRevision });
  }

  async deleteApplication(userId: string, id: string, expectedRevision: number): Promise<ApplicationSyncItem> {
    const current = await this.getApplication(userId, id, true);
    if (!current) throw new StoreError("APPLICATION_NOT_FOUND", "没有找到这条投递", 404);
    return this.withApplicationChange(userId, { changeId: `web:${randomUUID()}`, application: current.application, baseRevision: expectedRevision, deletedAt: new Date().toISOString() });
  }

  async syncApplications(userId: string, request: ApplicationSyncRequest): Promise<ApplicationSyncResponse> {
    const acceptedChangeIds: string[] = [];
    const conflicts: ApplicationSyncConflict[] = [];
    for (const change of request.changes) {
      try {
        await this.withApplicationChange(userId, change);
        acceptedChangeIds.push(change.changeId);
      } catch (error) {
        if (!(error instanceof StoreError) || error.code !== "REVISION_CONFLICT") throw error;
        const server = await this.getApplication(userId, change.application.id, true);
        conflicts.push({
          changeId: change.changeId,
          entityId: change.application.id,
          code: server?.deletedAt && !change.deletedAt ? "deleted_on_server" : "revision_conflict",
          message: server?.deletedAt ? "这条投递已在其他设备删除" : "这条投递已在其他设备更新",
          server,
          local: change
        });
      }
    }
    const cursor = Number.parseInt(request.cursor || "0", 10) || 0;
    const pulled = await this.pool.query(
      `SELECT DISTINCT ON (entity_id) sequence_id, payload FROM sync_changes
       WHERE user_id = $1 AND sequence_id > $2 AND entity_type = 'application'
       ORDER BY entity_id, sequence_id DESC`,
      [userId, cursor]
    );
    const max = await this.pool.query("SELECT COALESCE(max(sequence_id), $2)::text AS cursor FROM sync_changes WHERE user_id = $1", [userId, cursor]);
    const changes = pulled.rows.sort((a,b) => Number(a.sequence_id)-Number(b.sequence_id)).map((row) => row.payload as ApplicationSyncItem);
    return { cursor: max.rows[0].cursor, changes, acceptedChangeIds, conflicts };
  }

  async listInterviewRecords(userId: string, applicationId: string): Promise<InterviewRecord[]> {
    const result = await this.pool.query("SELECT payload FROM interview_records WHERE user_id=$1 AND application_id=$2 ORDER BY created_at DESC", [userId, applicationId]);
    return result.rows.map((row) => row.payload);
  }

  async createInterviewRecord(userId: string, applicationId: string, input: InterviewRecordInput): Promise<InterviewRecord> {
    const application = await this.getApplication(userId, applicationId);
    if (!application) throw new StoreError("APPLICATION_NOT_FOUND", "没有找到这条投递", 404);
    const now = new Date().toISOString();
    const record: InterviewRecord = { id: randomUUID(), applicationId, title: input.title?.trim() || `${application.application.company} · ${application.application.position} 面试问答`, sourceType: input.sourceType, status: input.status ?? "processing", transcript: input.transcript?.trim() ?? "", qaPairs: input.qaPairs ?? [], error: input.error, createdAt: now, updatedAt: now };
    await this.pool.query(
      `INSERT INTO interview_records (id,user_id,application_id,title,source_type,status,transcript,error,payload,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$10)`,
      [record.id,userId,applicationId,record.title,record.sourceType,record.status,record.transcript,record.error||null,json(record),now]
    );
    return record;
  }

  private async updateInterviewRecord(userId: string, recordId: string, changes: Partial<Pick<InterviewRecord,"status"|"transcript"|"qaPairs"|"error">>): Promise<InterviewRecord> {
    const result = await this.pool.query("SELECT payload FROM interview_records WHERE id=$1 AND user_id=$2", [recordId,userId]);
    if (!result.rows[0]) throw new StoreError("INTERVIEW_RECORD_NOT_FOUND", "没有找到这份面试问答记录", 404);
    const record: InterviewRecord = { ...result.rows[0].payload, ...changes, updatedAt: new Date().toISOString() };
    if (changes.status === "ready" && changes.error === undefined) delete record.error;
    await this.pool.query("UPDATE interview_records SET status=$3, transcript=$4, error=$5, payload=$6::jsonb, updated_at=$7 WHERE id=$1 AND user_id=$2", [recordId,userId,record.status,record.transcript,record.error||null,json(record),record.updatedAt]);
    return record;
  }

  async completeInterviewRecord(userId: string, recordId: string, transcript: string, qaPairs: InterviewQaPair[]): Promise<InterviewRecord> {
    return this.updateInterviewRecord(userId, recordId, { status: "ready", transcript: transcript.trim(), qaPairs, error: undefined });
  }

  async failInterviewRecord(userId: string, recordId: string, error: string): Promise<InterviewRecord> {
    return this.updateInterviewRecord(userId, recordId, { status: "failed", error: error.trim() || "录音处理失败，请重试或直接上传文字稿。" });
  }

  async createTailorTask(userId: string, request: CreateTailorTaskRequest): Promise<{ task: TailorTask; version: ResumeVersionRecord }> {
    const now = new Date().toISOString();
    const taskId = randomUUID();
    const versionId = randomUUID();
    const document = createResumeDocument({ id: randomUUID(), title: `${request.job.company} · ${request.job.position}`, profile: request.sourceProfile, assets: request.sourceAssets, portraitAssetId: request.sourcePortraitAssetId, sourceEvidence: request.sourceEvidence, now });
    document.profile.targetRole = request.job.position;
    const version: ResumeVersionRecord = { revision: 1, version: { id: versionId, tailorTaskId: taskId, sourceResumeId: request.sourceResumeId, sourceResumeName: request.sourceResumeName, applicationId: request.applicationId, company: request.job.company, position: request.job.position, document, status: "draft", createdAt: now, updatedAt: now } };
    const task: TailorTask = { id: taskId, sourceResumeId: request.sourceResumeId, applicationId: request.applicationId, job: structuredClone(request.job), sourceEvidence: request.sourceEvidence ? structuredClone(request.sourceEvidence) : undefined, versionId, status: "draft", createdAt: now, updatedAt: now };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO tailor_tasks (id,user_id,payload,created_at,updated_at) VALUES ($1,$2,$3::jsonb,$4,$4)", [taskId,userId,json(task),now]);
      await client.query("INSERT INTO resume_versions (id,user_id,tailor_task_id,revision,payload,created_at,updated_at) VALUES ($1,$2,$3,1,$4::jsonb,$5,$5)", [versionId,userId,taskId,json(version),now]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    if (request.applicationId) {
      const linked = await this.getApplication(userId, request.applicationId);
      if (linked) {
        await this.updateApplication(userId, {
          ...linked.application,
          tailorTaskId: taskId,
          tailoredResumeVersionId: versionId,
          tailoredResumeName: `${request.job.company} · ${request.job.position}`,
          tailoredResumeUpdatedAt: now,
          updatedAt: now,
          events: [...linked.application.events, { id: randomUUID(), type: "updated", title: "已创建岗位定制简历", occurredAt: now }]
        }, linked.revision);
      }
    }
    return { task, version };
  }

  async getTailorTask(userId: string, taskId: string): Promise<{ task: TailorTask; version: ResumeVersionRecord } | undefined> {
    const result = await this.pool.query(`SELECT t.payload AS task, v.payload AS version FROM tailor_tasks t JOIN resume_versions v ON v.tailor_task_id=t.id AND v.user_id=t.user_id WHERE t.id=$1 AND t.user_id=$2`, [taskId,userId]);
    return result.rows[0] ? { task: result.rows[0].task, version: result.rows[0].version } : undefined;
  }

  async getResumeVersion(userId: string, versionId: string): Promise<ResumeVersionRecord | undefined> {
    const result = await this.pool.query("SELECT payload FROM resume_versions WHERE id=$1 AND user_id=$2", [versionId,userId]);
    return result.rows[0]?.payload;
  }

  async listResumeVersions(userId: string): Promise<ResumeVersionRecord[]> {
    const result = await this.pool.query("SELECT payload FROM resume_versions WHERE user_id=$1 AND payload->'version'->>'status' <> 'archived' ORDER BY updated_at DESC", [userId]);
    return result.rows.map((row) => row.payload);
  }

  async updateResumeVersion(userId: string, versionId: string, document: ResumeDocument, expectedRevision: number): Promise<ResumeVersionRecord> {
    const current = await this.getResumeVersion(userId, versionId);
    if (!current) throw new StoreError("RESUME_VERSION_NOT_FOUND", "没有找到这份简历版本", 404);
    if (current.revision !== expectedRevision) throw new StoreError("REVISION_CONFLICT", "这份简历已在其他页面更新，请刷新后重试", 409, { serverRevision: current.revision, server: current });
    if (document.id !== current.version.document.id) throw new StoreError("INVALID_RESUME_DOCUMENT", "简历文档与当前版本不匹配", 400);
    const now = new Date().toISOString();
    const item: ResumeVersionRecord = { revision: expectedRevision + 1, version: { ...current.version, document: { ...structuredClone(document), updatedAt: now }, updatedAt: now } };
    const result = await this.pool.query("UPDATE resume_versions SET revision=$3,payload=$4::jsonb,updated_at=$5 WHERE id=$1 AND user_id=$2 AND revision=$6", [versionId,userId,item.revision,json(item),now,expectedRevision]);
    if (!result.rowCount) throw new StoreError("REVISION_CONFLICT", "这份简历已在其他页面更新，请刷新后重试", 409);
    return item;
  }
}
