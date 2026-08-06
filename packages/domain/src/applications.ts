export const STAGES = [
  "interested",
  "to_apply",
  "applied",
  "assessment",
  "interview",
  "offer",
  "closed"
] as const;

export type ApplicationStage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  interested: "感兴趣",
  to_apply: "待投递",
  applied: "已投递",
  assessment: "笔试测评",
  interview: "面试",
  offer: "Offer",
  closed: "已结束"
};

export interface ApplicationEvent {
  id: string;
  type: "created" | "stage_changed" | "updated" | "captured";
  title: string;
  occurredAt: string;
  sourceUrl?: string;
}

export interface JobApplication {
  id: string;
  company: string;
  position: string;
  isFavorite?: boolean;
  department?: string;
  jobId?: string;
  city?: string;
  jobType?: string;
  stage: ApplicationStage;
  externalStage?: string;
  appliedAt?: string;
  deadline?: string;
  nextAction?: string;
  sourceUrl: string;
  sourceHost: string;
  summary?: string;
  responsibilities: string[];
  requirements: string[];
  rawExcerpt?: string;
  createdAt: string;
  updatedAt: string;
  events: ApplicationEvent[];
  obsidianPath?: string;
}

export interface ExtractedJob {
  company: string;
  position: string;
  department?: string;
  jobId?: string;
  city?: string;
  jobType?: string;
  deadline?: string;
  appliedAt?: string;
  nextAction?: string;
  summary?: string;
  responsibilities: string[];
  requirements: string[];
  sourceUrl: string;
  sourceHost: string;
  rawExcerpt?: string;
  progressEvidence?: ProgressEvidence[];
  suggestedStage?: ApplicationStage;
  externalStage?: string;
  extractionSource?: "rules" | "deepseek";
  confidence: number;
}

export interface ProgressEvidence {
  jobId?: string;
  position?: string;
  currentStage?: string;
  terminalStatus?: string;
  context?: string;
  steps: Array<{
    label: string;
    state: "completed" | "current" | "pending" | "failed" | "unknown";
  }>;
  confidence: number;
}
