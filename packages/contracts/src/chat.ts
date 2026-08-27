import type {
  ChatAttachment,
  ChatContextOption,
  ChatContextReference,
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

export interface UpdateConversationRequest {
  title: string;
}

export interface ChatContextResponse {
  contexts: ChatContextOption[];
}

export interface ConversationResponse {
  conversation: ChatConversation;
  messages: ChatMessage[];
}

export interface SendMessageRequest {
  content: string;
  clientMessageId: string;
  attachments?: ChatAttachment[];
  context?: ChatContextReference[];
}

export interface RetryMessageRequest {
  clientMessageId: string;
}

export interface MessageFeedbackRequest {
  feedback: "positive" | "negative";
}

export interface MessageFeedbackResponse {
  message: ChatMessage;
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
    (value.attachments === undefined || (
      Array.isArray(value.attachments) &&
      value.attachments.length <= 2 &&
      value.attachments.every((attachment) =>
        isRecord(attachment) &&
        typeof attachment.id === "string" &&
        attachment.id.length > 0 &&
        attachment.id.length <= 128 &&
        typeof attachment.name === "string" &&
        attachment.name.trim().length > 0 &&
        attachment.name.length <= 255 &&
        (attachment.mimeType === "text/plain" || attachment.mimeType === "text/markdown") &&
        typeof attachment.size === "number" &&
        Number.isFinite(attachment.size) &&
        attachment.size >= 0 &&
        attachment.size <= 200_000 &&
        typeof attachment.content === "string" &&
        attachment.content.length <= 200_000
      ) &&
      new Set(value.attachments.map((attachment) => isRecord(attachment) ? attachment.id : undefined)).size === value.attachments.length
    )) &&
    (value.context === undefined || (
      Array.isArray(value.context) &&
      value.context.length <= 4 &&
      value.context.every(isChatContextReference) &&
      new Set(value.context.map((item) => isRecord(item) ? `${item.kind}:${item.id}` : undefined)).size === value.context.length
    ))
  );
}

export function isRetryMessageRequest(value: unknown): value is RetryMessageRequest {
  return isRecord(value) && typeof value.clientMessageId === "string";
}


export function isUpdateConversationRequest(value: unknown): value is UpdateConversationRequest {
  return isRecord(value) && typeof value.title === "string" && value.title.trim().length > 0 && value.title.trim().length <= 80;
}

export function isMessageFeedbackRequest(value: unknown): value is MessageFeedbackRequest {
  return isRecord(value) && (value.feedback === "positive" || value.feedback === "negative");
}

function isChatContextReference(value: unknown): value is ChatContextReference {
  return (
    isRecord(value) &&
    (value.kind === "application" || value.kind === "resume" || value.kind === "interview") &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    value.id.trim().length > 0 &&
    value.label.trim().length > 0 &&
    value.id.length <= 128 &&
    value.label.length <= 160 &&
    (value.description === undefined || (typeof value.description === "string" && value.description.length <= 240)) &&
    (value.updatedAt === undefined || (typeof value.updatedAt === "string" && value.updatedAt.length <= 64))
  );
}
