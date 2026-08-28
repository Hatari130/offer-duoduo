import type {
  ApplicationSyncItem,
  ApplicationSyncRequest,
  ApplicationSyncResponse,
  CreateTailorTaskRequest,
  ResumeVersionRecord,
  SessionUser
} from "@offerflow/contracts";
import type {
  ChatAttachment,
  ChatContextReference,
  ChatConversation,
  ChatMessage,
  ChatOpportunityResults,
  InterviewQaPair,
  InterviewRecord,
  InterviewRecordSourceType,
  JobApplication,
  KnowledgeCitation,
  OpportunityFeedSnapshot,
  RecruitmentOpportunity,
  ResumeDocument,
  TailorTask
} from "@offerflow/domain";

export type Awaitable<T> = T | Promise<T>;
export type SessionScope = "user" | "device";

export interface SessionRecord {
  id: string;
  userId: string;
  scope: SessionScope;
  deviceId?: string;
  deviceName?: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface IssuedStoreSession {
  accessToken: string;
  session: SessionRecord;
}

export interface InterviewRecordInput {
  title?: string;
  sourceType: InterviewRecordSourceType;
  transcript?: string;
  qaPairs?: InterviewQaPair[];
  status?: InterviewRecord["status"];
  error?: string;
}

export class StoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "StoreError";
  }
}

export interface OfferFlowStore {
  initialize?(): Awaitable<void>;
  close?(): Awaitable<void>;

  createUser(email: string, displayName: string, password: string, fixedId?: string): Awaitable<SessionUser>;
  authenticate(email: string, password: string): Awaitable<SessionUser | undefined>;
  getUser(userId: string): Awaitable<SessionUser | undefined>;
  getDemoUser(): Awaitable<SessionUser | undefined>;
  recordConsent(userId: string, consentType: string, policyVersion: string): Awaitable<void>;
  deleteUser(userId: string): Awaitable<boolean>;

  createSession(
    userId: string,
    scope: SessionScope,
    expiresAt: string,
    deviceId?: string,
    deviceName?: string
  ): Awaitable<IssuedStoreSession>;
  resolveSession(accessToken: string): Awaitable<SessionRecord | undefined>;
  rotateSession(accessToken: string, expiresAt: string): Awaitable<IssuedStoreSession | undefined>;
  revokeSession(accessToken: string): Awaitable<boolean>;
  listSessions(userId: string): Awaitable<SessionRecord[]>;
  revokeUserSession(userId: string, sessionId: string): Awaitable<boolean>;

  createDeviceCode(userId: string, now?: number): Awaitable<{ code: string; expiresAt: string }>;
  exchangeDeviceCode(code: string, now?: number): Awaitable<SessionUser | undefined>;
  createHandoffCode(userId: string, targetPath: string): Awaitable<{ code: string; expiresAt: string }>;
  exchangeHandoffCode(code: string): Awaitable<{ user: SessionUser; targetPath: string } | undefined>;

  listConversations(userId: string): Awaitable<ChatConversation[]>;
  createConversation(userId: string, title?: string): Awaitable<ChatConversation>;
  updateConversation(userId: string, conversationId: string, title: string): Awaitable<ChatConversation | undefined>;
  getConversation(
    userId: string,
    conversationId: string
  ): Awaitable<{ conversation: ChatConversation; messages: ChatMessage[] } | undefined>;
  deleteConversation(userId: string, conversationId: string): Awaitable<boolean>;
  appendUserMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    content: string,
    attachments?: ChatAttachment[],
    context?: ChatContextReference[]
  ): Awaitable<ChatMessage>;
  beginAssistantMessage(userId: string, conversationId: string): Awaitable<ChatMessage>;
  completeAssistantMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    content: string,
    citations: KnowledgeCitation[],
    status?: ChatMessage["status"],
    opportunityResults?: ChatOpportunityResults
  ): Awaitable<ChatMessage>;
  findRetryPrompt(userId: string, conversationId: string, messageId: string): Awaitable<string | undefined>;
  setMessageFeedback(
    userId: string,
    conversationId: string,
    messageId: string,
    feedback: "positive" | "negative"
  ): Awaitable<ChatMessage | undefined>;
  getConversationHistory(userId: string, conversationId: string): Awaitable<ChatMessage[]>;

  listOpportunities(): Awaitable<RecruitmentOpportunity[]>;
  getOpportunity(id: string): Awaitable<RecruitmentOpportunity | undefined>;
  getOpportunityFeed(): Awaitable<OpportunityFeedSnapshot>;
  replaceOpportunityFeed(snapshot: OpportunityFeedSnapshot): Awaitable<OpportunityFeedSnapshot>;

  listApplications(userId: string): Awaitable<ApplicationSyncItem[]>;
  getApplication(userId: string, id: string, includeDeleted?: boolean): Awaitable<ApplicationSyncItem | undefined>;
  createApplication(userId: string, application: JobApplication): Awaitable<ApplicationSyncItem>;
  updateApplication(
    userId: string,
    application: JobApplication,
    expectedRevision: number
  ): Awaitable<ApplicationSyncItem>;
  deleteApplication(userId: string, id: string, expectedRevision: number): Awaitable<ApplicationSyncItem>;
  syncApplications(userId: string, request: ApplicationSyncRequest): Awaitable<ApplicationSyncResponse>;

  listInterviewRecords(userId: string, applicationId: string): Awaitable<InterviewRecord[]>;
  createInterviewRecord(
    userId: string,
    applicationId: string,
    input: InterviewRecordInput
  ): Awaitable<InterviewRecord>;
  completeInterviewRecord(
    userId: string,
    recordId: string,
    transcript: string,
    qaPairs: InterviewQaPair[]
  ): Awaitable<InterviewRecord>;
  failInterviewRecord(userId: string, recordId: string, error: string): Awaitable<InterviewRecord>;

  createTailorTask(
    userId: string,
    request: CreateTailorTaskRequest
  ): Awaitable<{ task: TailorTask; version: ResumeVersionRecord }>;
  getTailorTask(
    userId: string,
    taskId: string
  ): Awaitable<{ task: TailorTask; version: ResumeVersionRecord } | undefined>;
  getResumeVersion(userId: string, versionId: string): Awaitable<ResumeVersionRecord | undefined>;
  listResumeVersions(userId: string): Awaitable<ResumeVersionRecord[]>;
  updateResumeVersion(
    userId: string,
    versionId: string,
    document: ResumeDocument,
    expectedRevision: number
  ): Awaitable<ResumeVersionRecord>;
}
