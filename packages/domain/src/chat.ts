import type { RecruitmentOpportunity } from "./opportunities.ts";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessageStatus = "streaming" | "complete" | "error" | "stopped";

export type ChatContextKind = "application" | "resume" | "interview";

export interface ChatContextReference {
  kind: ChatContextKind;
  id: string;
  label: string;
  description?: string;
  updatedAt?: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** Extracted document text or OCR text only. Original files, image bytes,
   * base64 payloads and download URLs are never stored with a message. */
  content?: string;
}

export interface KnowledgeCitation {
  id: string;
  sourceId: string;
  title: string;
  excerpt: string;
  url?: string;
  score?: number;
}

export interface ChatOpportunityResults {
  query: string;
  total: number;
  items: RecruitmentOpportunity[];
  sourceAvailable: boolean;
  isBroadSearch: boolean;
  fetchedAt?: string;
  sourceUpdatedAt?: string;
}

export type ChatAgentName = "resume_coach";

/** One visible step of an agent turn, e.g. “读取简历” or a rejected rewrite. */
export interface ChatAgentStep {
  id: string;
  label: string;
  detail?: string;
  status: "done" | "rejected";
}

export interface ChatAgentRewrite {
  entryId: string;
  title: string;
  before: string;
  after: string;
  reason: string;
}

/** A named expert the user can see and call on, backed by a skill file. */
export interface ChatAgentExpert {
  id: string;
  name: string;
  role: string;
  /** When the main agent (or the user) should call this expert. */
  when: string;
}

export interface ChatAgentExpertNote {
  id: string;
  expertId: string;
  expertName: string;
  expertRole: string;
  request: string;
  content: string;
}

export interface ChatAgentRun {
  agent: ChatAgentName;
  steps: ChatAgentStep[];
  rewrites: ChatAgentRewrite[];
  /** Opinions from experts consulted during this turn. Missing on runs stored before experts existed. */
  notes?: ChatAgentExpertNote[];
  /** The model-side messages of this turn (tool calls and results), replayed
   * on the next turn so the agent can continue where it stopped. */
  trace: unknown[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  status: ChatMessageStatus;
  createdAt: string;
  attachments: ChatAttachment[];
  context?: ChatContextReference[];
  citations: KnowledgeCitation[];
  opportunityResults?: ChatOpportunityResults;
  agentRun?: ChatAgentRun;
  feedback?: "positive" | "negative";
}

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string;
}

export interface ChatContextOption extends ChatContextReference {
  selectable: boolean;
}

export const CAREER_CHAT_SUGGESTIONS = [
  "帮我制定一份秋招时间规划",
  "如何把项目经历写得更有说服力？",
  "面试被问到职业规划时怎么回答？",
  "根据岗位描述帮我提炼准备重点"
] as const;
