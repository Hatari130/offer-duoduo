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
