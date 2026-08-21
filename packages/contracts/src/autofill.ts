import type {
  ApplicationStage,
  ExtractedJob,
  PersonalProfile,
  ProfileFieldKey
} from "@offerflow/domain";

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
  /** Stable identity derived from page structure rather than a scan timestamp. */
  fingerprint?: string;
  /** Best-effort selector used to recover a control after a framework rerender. */
  domPath?: string;
  label: string;
  key?: ProfileFieldKey;
  repeatGroup?: "education" | "experience" | "project" | "campus" | "award";
  repeatIndex?: number;
  /** Profile record selected for this field when one ATS splits a shared group into sub-sections. */
  profileRepeatIndex?: number;
  repeatIndexSource?: "attribute" | "structural" | "occurrence";
  repeatEntryFingerprint?: string;
  domOrder?: number;
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
  fingerprint?: string;
  label: string;
  key?: ProfileFieldKey;
  status: "filled" | "missing" | "failed" | "skipped";
  expectedValue?: string;
  actualValue?: string;
  reason?: string;
  attempts?: number;
  controlDriver?: string;
  commitMethod?: "button" | "enter" | "none";
}

export interface FormFillResponse {
  ok: boolean;
  filled: number;
  results: FormFieldResult[];
  rounds?: number;
  rescanned?: boolean;
  finalFields?: FormFieldMatch[];
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

export interface MatchFormFieldsRequest {
  fields: FormFieldMatch[];
  profile: PersonalProfile;
}

export interface ExtractPageRequest {
  url: string;
  title?: string;
  text: string;
  suggestedStage?: ApplicationStage;
}
