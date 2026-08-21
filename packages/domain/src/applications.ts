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

export const RECRUITMENT_TYPES = [
  "daily_internship",
  "summer_internship",
  "autumn_early",
  "autumn",
  "spring"
] as const;

export type RecruitmentType = (typeof RECRUITMENT_TYPES)[number];

export const RECRUITMENT_TYPE_LABELS: Record<RecruitmentType, string> = {
  daily_internship: "日常实习",
  summer_internship: "暑期实习",
  autumn_early: "秋招提前批",
  autumn: "秋招",
  spring: "春招"
};

export function normalizeRecruitmentType(value?: string): RecruitmentType | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  const exact = RECRUITMENT_TYPES.find(
    (type) => type === normalized || RECRUITMENT_TYPE_LABELS[type] === value?.trim()
  );
  return exact;
}

/** Infer the recruiting campaign from page copy without conflating it with jobType. */
export function inferRecruitmentType(
  ...sources: Array<string | null | undefined>
): RecruitmentType | undefined {
  for (const [sourceIndex, source] of sources.entries()) {
    const text = source?.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (/(?:秋招|秋季(?:校园)?招聘|校园招聘|校招).{0,16}提前批|提前批.{0,16}(?:秋招|秋季(?:校园)?招聘|校园招聘|校招)|\bautumn\s+early\b/i.test(text)) {
      return "autumn_early";
    }
    if (/暑期实习|暑假实习|暑期(?:项目|项目制)|\bsummer\s+intern(?:ship)?\b/i.test(text)) {
      return "summer_internship";
    }
    if (/春招|春季(?:校园)?招聘|\bspring\s+(?:campus\s+)?recruit(?:ment)?\b/i.test(text)) {
      return "spring";
    }
    const explicitInternship = /日常实习|长期实习|滚动实习|\boff[- ]?cycle\s+intern(?:ship)?\b/i.test(text);
    const titleOrTypeInternship = sourceIndex <= 1 && /实习生(?:招聘|岗位|职位)?|(?:^|[^暑])实习(?:岗位|职位|招聘)?/i.test(text);
    if (explicitInternship || titleOrTypeInternship) {
      return "daily_internship";
    }
    if (/秋招|秋季(?:校园)?招聘|校园招聘|校招|\bautumn\s+(?:campus\s+)?recruit(?:ment)?\b|\bcampus\s+recruit(?:ment)?\b/i.test(text)) {
      return "autumn";
    }
  }
  return undefined;
}

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
  recruitmentType?: RecruitmentType;
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
  tailorTaskId?: string;
  tailoredResumeVersionId?: string;
  tailoredResumeName?: string;
  tailoredResumeUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
  events: ApplicationEvent[];
  /**
   * Stable observations remembered by the extension so the same application can
   * be recognised across job-detail and progress-list URLs.
   */
  identityAliases?: string[];
  obsidianPath?: string;
}

export interface ExtractedJob {
  company: string;
  position: string;
  department?: string;
  jobId?: string;
  city?: string;
  jobType?: string;
  recruitmentType?: RecruitmentType;
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
  recordUrl?: string;
  jobId?: string;
  company?: string;
  position?: string;
  city?: string;
  appliedAt?: string;
  currentStage?: string;
  terminalStatus?: string;
  context?: string;
  steps: Array<{
    label: string;
    state: "completed" | "current" | "pending" | "failed" | "unknown";
  }>;
  confidence: number;
}
