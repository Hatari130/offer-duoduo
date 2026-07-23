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

export interface OfferFlowSettings {
  obsidianFolderName?: string;
  lastExportAt?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  autoMonitorEnabled?: boolean;
  opportunityFeedUrl?: string;
}

export type OpportunityStatus = "upcoming" | "open" | "closing" | "closed" | "ongoing";

export interface RecruitmentOpportunity {
  id: string;
  company: string;
  title: string;
  batch?: string;
  status?: OpportunityStatus;
  openAt?: string;
  deadline?: string;
  graduationYears: string[];
  roleTags: string[];
  cities: string[];
  officialUrl: string;
  sourceUrl?: string;
  sourceName?: string;
  verifiedAt?: string;
  updatedAt?: string;
}

export interface OpportunityFeedSnapshot {
  opportunities: RecruitmentOpportunity[];
  fetchedAt?: string;
  sourceUpdatedAt?: string;
  sourceUrl?: string;
}

export interface ProfileEducation {
  id: string;
  school: string;
  major: string;
  degree: string;
  startDate: string;
  endDate: string;
  gpa: string;
}

export interface ProfileExperience {
  id: string;
  organization: string;
  title: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface ProfileProject {
  id: string;
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface PersonalProfile {
  fullName: string;
  gender: string;
  phone: string;
  email: string;
  birthDate: string;
  currentCity: string;
  address: string;
  targetRole: string;
  targetCities: string;
  earliestStartDate: string;
  portfolioUrl: string;
  githubUrl: string;
  education: ProfileEducation[];
  experiences: ProfileExperience[];
  projects: ProfileProject[];
  selfIntroduction: string;
  strengths: string;
  careerPlan: string;
  updatedAt?: string;
}

export interface FormFieldMatch {
  id: string;
  label: string;
  key: keyof PersonalProfile | "school" | "major" | "degree" | "gpa";
  type: string;
  currentValue?: string;
}

export interface DeepSeekExtraction {
  pageType:
    | "job_posting"
    | "application_list"
    | "application_update"
    | "career_information"
    | "unknown";
  applications: ExtractedJob[];
}
