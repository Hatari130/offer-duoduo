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

export interface ProfileCampusExperience {
  id: string;
  type: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface ProfileAward {
  id: string;
  date: string;
  name: string;
  level: string;
  description: string;
}

export interface PersonalProfile {
  fullName: string;
  gender: string;
  phone: string;
  email: string;
  birthDate: string;
  graduationDate: string;
  currentCity: string;
  nativePlace: string;
  height: string;
  weight: string;
  recruitmentType: string;
  graduateStatus: string;
  address: string;
  targetRole: string;
  targetCities: string;
  earliestStartDate: string;
  portfolioUrl: string;
  githubUrl: string;
  education: ProfileEducation[];
  experiences: ProfileExperience[];
  projects: ProfileProject[];
  campusExperiences: ProfileCampusExperience[];
  awards: ProfileAward[];
  selfIntroduction: string;
  strengths: string;
  careerPlan: string;
  extraFields?: Record<string, string>;
  updatedAt?: string;
}

export type ProfileFieldKey =
  | keyof PersonalProfile
  | "school"
  | "major"
  | "degree"
  | "gpa"
  | "educationStartDate"
  | "educationEndDate"
  | "experienceOrganization"
  | "experienceTitle"
  | "experienceStartDate"
  | "experienceEndDate"
  | "experienceDescription"
  | "nationality"
  | "idType"
  | "idNumber"
  | "wechat"
  | "qq"
  | "politicalStatus"
  | "maritalStatus"
  | "healthStatus"
  | "specialty"
  | "workYears"
  | "emergencyContactName"
  | "emergencyContactPhone"
  | "countryRegion"
  | "expectedSalary"
  | "educationCollege"
  | "educationDegree"
  | "educationForm"
  | "educationCourses"
  | "educationResearchDirection"
  | "educationThesis"
  | "educationRank"
  | "overseasEducation"
  | "minorMajor"
  | "advisorName"
  | "experienceType"
  | "experienceDepartment"
  | "experienceSalary"
  | "experienceAchievements"
  | "refereeName"
  | "refereeTitle"
  | "refereeContact"
  | "leavingReason"
  | "subordinateCount"
  | "projectName"
  | "projectRole"
  | "projectStartDate"
  | "projectEndDate"
  | "projectDescription"
  | "projectAchievement"
  | "projectLink"
  | "campusExperienceType"
  | "campusExperienceRole"
  | "campusExperienceStartDate"
  | "campusExperienceEndDate"
  | "campusExperienceDescription"
  | "awardDate"
  | "awardName"
  | "awardLevel"
  | "awardDescription"
  | "languageName"
  | "languageCertificate"
  | "englishLevel"
  | "languageScore"
  | "languageProficiency"
  | "listeningSpeaking"
  | "readingWriting"
  | "computerSkillType"
  | "computerSkillProficiency"
  | "qualificationDate"
  | "qualificationName"
  | "qualificationNumber"
  | "qualificationDescription"
  | "familyName"
  | "familyRelation"
  | "familyPhone"
  | "familyCompany"
  | "familyPosition"
  | "familyPoliticalStatus"
  | "publicationDate"
  | "publicationJournal"
  | "publicationLevel"
  | "publicationTitle"
  | "publicationDescription"
  | "publicationAuthors"
  | "publicationImpactFactor"
  | "publicationLink"
  | "patentDate"
  | "patentName"
  | "patentNumber"
  | "patentType"
  | "patentAchievement"
  | "hobbies"
  | "workName"
  | "workLink"
  | "workDescription"
  | "competitionName"
  | "competitionDate"
  | "competitionDescription"
  | "referralCode"
  | "experienceCurrent";

export type FormPlatformId = "beisen" | "moka" | "nowcoder" | "tencent" | "generic" | string;

export interface FormPlatformInfo {
  id: FormPlatformId;
  name: string;
  version: string;
  total: number;
  ruleMatched: number;
  unknown: number;
}

export interface FormFieldMatch {
  id: string;
  label: string;
  key?: ProfileFieldKey;
  repeatGroup?: "education" | "experience" | "project" | "campus" | "award";
  repeatIndex?: number;
  type: string;
  currentValue?: string;
  section?: string;
  required?: boolean;
  options?: string[];
  confidence?: number;
  source?: "rules" | "deepseek" | "manual";
  evidence?: string[];
  adapterId?: FormPlatformId;
}

export interface FormScanResponse {
  ok: boolean;
  fields: FormFieldMatch[];
  platform?: FormPlatformInfo;
  repeatersExpanded?: boolean;
  error?: string;
}

export interface FormFieldResult {
  id: string;
  label: string;
  key?: ProfileFieldKey;
  status: "filled" | "missing" | "failed" | "skipped";
  expectedValue?: string;
  actualValue?: string;
  reason?: string;
}

export interface FormFillResponse {
  ok: boolean;
  filled: number;
  results: FormFieldResult[];
  error?: string;
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
