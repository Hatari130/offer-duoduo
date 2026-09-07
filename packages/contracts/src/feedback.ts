import { isRecord } from "./common.ts";

export const PRODUCT_FEEDBACK_CATEGORIES = ["suggestion", "issue", "content", "other"] as const;

export type ProductFeedbackCategory = (typeof PRODUCT_FEEDBACK_CATEGORIES)[number];

export interface CreateProductFeedbackRequest {
  category: ProductFeedbackCategory;
  content: string;
  contact?: string;
  pagePath?: string;
}
export interface CreateProductFeedbackResponse {
  feedbackId: string;
  submittedAt: string;
}

export function isCreateProductFeedbackRequest(value: unknown): value is CreateProductFeedbackRequest {
  return (
    isRecord(value)
    && PRODUCT_FEEDBACK_CATEGORIES.includes(value.category as ProductFeedbackCategory)
    && typeof value.content === "string"
    && (value.contact === undefined || typeof value.contact === "string")
    && (value.pagePath === undefined || typeof value.pagePath === "string")
  );
}

export const PRODUCT_FEEDBACK_STATUSES = ["new", "reviewing", "planned", "resolved", "closed"] as const;

export type ProductFeedbackStatus = (typeof PRODUCT_FEEDBACK_STATUSES)[number];

export function isProductFeedbackStatus(value: unknown): value is ProductFeedbackStatus {
  return typeof value === "string" && PRODUCT_FEEDBACK_STATUSES.includes(value as ProductFeedbackStatus);
}

export interface AdminFeedbackItem {
  id: string;
  userId?: string;
  userEmail?: string;
  userDisplayName?: string;
  category: ProductFeedbackCategory;
  content: string;
  contact?: string;
  pagePath?: string;
  status: ProductFeedbackStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface AdminFeedbackStatusCounts {
  all: number;
  new: number;
  reviewing: number;
  planned: number;
  resolved: number;
  closed: number;
}

export interface AdminFeedbackListResponse {
  items: AdminFeedbackItem[];
  total: number;
  counts: AdminFeedbackStatusCounts;
}

export interface AdminFeedbackListQuery {
  status?: ProductFeedbackStatus | "all";
  category?: ProductFeedbackCategory | "all";
  keyword?: string;
  limit?: number;
  offset?: number;
}

export interface UpdateAdminFeedbackStatusRequest {
  status: ProductFeedbackStatus;
}

export function isUpdateAdminFeedbackStatusRequest(value: unknown): value is UpdateAdminFeedbackStatusRequest {
  return isRecord(value) && isProductFeedbackStatus(value.status);
}
