import type {
  ChatAttachment,
  ChatConversation,
  ChatMessage,
  KnowledgeCitation
} from "@offerflow/domain";
import type { ApiError } from "./common.ts";
import { isRecord } from "./common.ts";

export interface ConversationListResponse {
  conversations: ChatConversation[];
}

export interface CreateConversationRequest {
  title?: string;
}

export interface ConversationResponse {
  conversation: ChatConversation;
  messages: ChatMessage[];
}

export interface SendMessageRequest {
  content: string;
  clientMessageId: string;
  attachments?: ChatAttachment[];
}

export interface RetryMessageRequest {
  clientMessageId: string;
}

export type ChatStreamEvent =
  | { type: "message.started"; message: ChatMessage }
  | { type: "message.delta"; messageId: string; delta: string }
  | { type: "citation"; messageId: string; citation: KnowledgeCitation }
  | { type: "message.completed"; message: ChatMessage }
  | { type: "error"; error: ApiError }
  | { type: "done" };

export function isSendMessageRequest(value: unknown): value is SendMessageRequest {
  return (
    isRecord(value) &&
    typeof value.content === "string" &&
    typeof value.clientMessageId === "string" &&
    (value.attachments === undefined || Array.isArray(value.attachments))
  );
}

export function isRetryMessageRequest(value: unknown): value is RetryMessageRequest {
  return isRecord(value) && typeof value.clientMessageId === "string";
}
