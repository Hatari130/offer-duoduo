export type ChatRole = "user" | "assistant" | "system";

export type ChatMessageStatus = "streaming" | "complete" | "error";

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
}

export interface KnowledgeCitation {
  id: string;
  sourceId: string;
  title: string;
  excerpt: string;
  url?: string;
  score?: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  status: ChatMessageStatus;
  createdAt: string;
  attachments: ChatAttachment[];
  citations: KnowledgeCitation[];
}

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string;
}

export const CAREER_CHAT_SUGGESTIONS = [
  "帮我制定一份秋招时间规划",
  "如何把项目经历写得更有说服力？",
  "面试被问到职业规划时怎么回答？",
  "根据岗位描述帮我提炼准备重点"
] as const;
