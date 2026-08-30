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
  url?: string;
  /** Plain text extracted in the browser. PDFs are converted to text
   * client-side with pdf.js; other binary formats are not accepted. */
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
