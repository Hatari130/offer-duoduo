import type { JobApplication, OfferFlowSettings, PersonalProfile } from "@/shared/types";
import type { TailoredResumeBundle, TailoredResumeEntry } from "@/features/tailor/types";
import { enqueueApplicationChanges } from "@/infrastructure/sync/syncState";

export const JOBS_KEY = "offerflow.jobs";
export const SETTINGS_KEY = "offerflow.settings";
export const AUTO_SYNC_NOTICE_KEY = "offerflow.autoSyncNotice";
export const PROFILE_KEY = "offerflow.profile";
export const TAILORED_RESUMES_KEY = "offerflow.tailoredResumes";
export const TAILORED_PDF_KEY = "offerflow.tailoredPdf";
export const BASE_PROFILE_KEY = "offerflow.baseProfile";
export const RESUMES_KEY = "offerflow.resumes";
export const ACTIVE_RESUME_KEY = "offerflow.activeResumeId";
export const RESUME_LIBRARY_UI_KEY = "offerflow.resumeLibraryUi";

export interface StoredResume {
  id: string;
  name: string;
  company?: string;
  position?: string;
  archiveNameSource?: "filename" | "manual";
  sourceFileName?: string;
  sourcePdf?: StoredResumePdf;
  profile: PersonalProfile;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface ResumeLibraryUiState {
  collapsed: boolean;
  pinned: boolean;
}

export const DEFAULT_RESUME_LIBRARY_UI: ResumeLibraryUiState = {
  collapsed: false,
  pinned: false
};

export type ResumeBasics = Pick<
  PersonalProfile,
  | "fullName"
  | "gender"
  | "phone"
  | "email"
  | "birthDate"
  | "graduationDate"
  | "currentCity"
  | "nativePlace"
  | "height"
  | "weight"
  | "recruitmentType"
  | "graduateStatus"
  | "address"
>;

/**
 * User-level profile data that should survive importing another resume.
 * `fixedSectionsVersion` lets us distinguish the older basics-only payload.
 */
export interface ResumeFixedProfile extends ResumeBasics {
  campusExperiences?: PersonalProfile["campusExperiences"];
  awards?: PersonalProfile["awards"];
  extraFields?: Record<string, string>;
  fixedSectionsVersion?: 1;
}

const FIXED_PROFILE_INTERNAL_EXTRA_KEYS = new Set(["resumeSourceName", "parseMode"]);

const RESUME_BASICS_KEYS: Array<keyof ResumeBasics> = [
  "fullName",
  "gender",
  "phone",
  "email",
  "birthDate",
  "graduationDate",
  "currentCity",
  "nativePlace",
  "height",
  "weight",
  "recruitmentType",
  "graduateStatus",
  "address"
];

export function extractResumeBasics(profile: PersonalProfile): ResumeBasics {
  return Object.fromEntries(RESUME_BASICS_KEYS.map((key) => [key, profile[key]])) as ResumeBasics;
}

export function applyResumeBasics(profile: PersonalProfile, basics: ResumeBasics): PersonalProfile {
  return { ...profile, ...basics };
}

export function hasResumeBasics(basics: ResumeBasics): boolean {
  return RESUME_BASICS_KEYS.some((key) => Boolean(basics[key]?.trim()));
}

export function extractResumeFixedProfile(profile: PersonalProfile): ResumeFixedProfile {
  return {
    ...extractResumeBasics(profile),
    campusExperiences: (profile.campusExperiences || []).map((item) => ({ ...item })),
    awards: (profile.awards || []).map((item) => ({ ...item })),
    extraFields: Object.fromEntries(
      Object.entries(profile.extraFields || {}).filter(([key]) => !FIXED_PROFILE_INTERNAL_EXTRA_KEYS.has(key))
    ),
    fixedSectionsVersion: 1
  };
}

export function applyResumeFixedProfile(profile: PersonalProfile, fixed: ResumeFixedProfile): PersonalProfile {
  if (fixed.fixedSectionsVersion !== 1) return applyResumeBasics(profile, fixed);
  const internalFields = Object.fromEntries(
    Object.entries(profile.extraFields || {}).filter(([key]) => FIXED_PROFILE_INTERNAL_EXTRA_KEYS.has(key))
  );
  return {
    ...applyResumeBasics(profile, fixed),
    campusExperiences: (fixed.campusExperiences || []).map((item) => ({ ...item })),
    awards: (fixed.awards || []).map((item) => ({ ...item })),
    extraFields: { ...(fixed.extraFields || {}), ...internalFields }
  };
}
export const EMPTY_PROFILE: PersonalProfile = {
  fullName: "",
  gender: "",
  phone: "",
  email: "",
  birthDate: "",
  graduationDate: "",
  currentCity: "",
  nativePlace: "",
  height: "",
  weight: "",
  recruitmentType: "",
  graduateStatus: "",
  address: "",
  targetRole: "",
  targetCities: "",
  earliestStartDate: "",
  portfolioUrl: "",
  githubUrl: "",
  education: [],
  experiences: [],
  projects: [],
  campusExperiences: [],
  awards: [],
  selfIntroduction: "",
  strengths: "",
  careerPlan: "",
  extraFields: {}
};

const hasChromeStorage = () =>
  typeof chrome !== "undefined" && Boolean(chrome.storage?.local);

export async function loadJobs(): Promise<JobApplication[]> {
  if (!hasChromeStorage()) {
    const value = localStorage.getItem(JOBS_KEY);
    return value ? JSON.parse(value) : [];
  }
  const result = await chrome.storage.local.get(JOBS_KEY);
  return (result[JOBS_KEY] as JobApplication[] | undefined) ?? [];
}

export async function saveJobs(
  jobs: JobApplication[],
  options: { origin?: "local" | "cloud" } = {}
): Promise<void> {
  const previous = options.origin === "cloud" ? [] : await loadJobs();
  if (!hasChromeStorage()) {
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
  } else {
    await chrome.storage.local.set({ [JOBS_KEY]: jobs });
  }
  if (options.origin !== "cloud") {
    await enqueueApplicationChanges(previous, jobs);
  }
}

export interface StoredResumePdf {
  fileName: string;
  size: number;
  importedAt: string;
  base64: string;
}

export async function loadSettings(): Promise<OfferFlowSettings> {
  if (!hasChromeStorage()) {
    const value = localStorage.getItem(SETTINGS_KEY);
    return normalizeSettings(value ? JSON.parse(value) : {});
  }
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings((result[SETTINGS_KEY] as OfferFlowSettings | undefined) ?? {});
}

function normalizeSettings(settings: OfferFlowSettings): OfferFlowSettings {
  return settings.deepseekModel === "deepseek-v4-flash"
    ? { ...settings, deepseekModel: "deepseek-chat" }
    : settings;
}

export async function saveSettings(settings: OfferFlowSettings): Promise<void> {
  if (!hasChromeStorage()) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return;
  }
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function loadProfile(): Promise<PersonalProfile> {
  if (!hasChromeStorage()) {
    const value = localStorage.getItem(PROFILE_KEY);
    return value ? { ...EMPTY_PROFILE, ...JSON.parse(value) } : { ...EMPTY_PROFILE };
  }
  const result = await chrome.storage.local.get(PROFILE_KEY);
  return { ...EMPTY_PROFILE, ...(result[PROFILE_KEY] as PersonalProfile | undefined) };
}

export async function saveProfile(profile: PersonalProfile): Promise<void> {
  const next = { ...profile, updatedAt: new Date().toISOString() };
  if (!hasChromeStorage()) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    return;
  }
  await chrome.storage.local.set({ [PROFILE_KEY]: next });
}

export async function loadTailoredResumes(): Promise<Record<string, TailoredResumeEntry>> {
  if (!hasChromeStorage()) {
    const value = localStorage.getItem(TAILORED_RESUMES_KEY);
    return value ? JSON.parse(value) : {};
  }
  const result = await chrome.storage.local.get(TAILORED_RESUMES_KEY);
  return (result[TAILORED_RESUMES_KEY] as Record<string, TailoredResumeEntry> | undefined) ?? {};
}

export async function saveTailoredResumes(
  next: Record<string, TailoredResumeEntry>
): Promise<void> {
  if (!hasChromeStorage()) {
    localStorage.setItem(TAILORED_RESUMES_KEY, JSON.stringify(next));
    return;
  }
  await chrome.storage.local.set({ [TAILORED_RESUMES_KEY]: next });
}

export async function saveTailoredResume(entry: TailoredResumeEntry): Promise<void> {
  const current = await loadTailoredResumes();
  await saveTailoredResumes({ ...current, [entry.jobKey]: entry });
}

export async function getTailoredResume(jobKey: string): Promise<TailoredResumeBundle | undefined> {
  const all = await loadTailoredResumes();
  return all[jobKey]?.bundle;
}

export async function dropTailoredResume(jobKey: string): Promise<void> {
  const current = await loadTailoredResumes();
  if (!current[jobKey]) return;
  delete current[jobKey];
  await saveTailoredResumes(current);
}

export interface TailoredPdfSnapshot {
  jobKey: string;
  fileName: string;
  size: number;
  uploadedAt: string;
  base64: string;
}

export async function loadTailoredPdf(jobKey: string): Promise<TailoredPdfSnapshot | undefined> {
  if (!hasChromeStorage()) {
    const raw = localStorage.getItem(`${TAILORED_PDF_KEY}.${jobKey}`);
    return raw ? (JSON.parse(raw) as TailoredPdfSnapshot) : undefined;
  }
  const result = await chrome.storage.local.get(`${TAILORED_PDF_KEY}.${jobKey}`);
  return result[`${TAILORED_PDF_KEY}.${jobKey}`] as TailoredPdfSnapshot | undefined;
}

export async function saveTailoredPdf(
  jobKey: string,
  snapshot: TailoredPdfSnapshot
): Promise<void> {
  const storageKey = `${TAILORED_PDF_KEY}.${jobKey}`;
  if (!hasChromeStorage()) {
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
    return;
  }
  await chrome.storage.local.set({ [storageKey]: snapshot });
}

export async function dropTailoredPdf(jobKey: string): Promise<void> {
  const storageKey = `${TAILORED_PDF_KEY}.${jobKey}`;
  if (!hasChromeStorage()) {
    localStorage.removeItem(storageKey);
    return;
  }
  await chrome.storage.local.remove(storageKey);
}

export async function loadBaseProfile(): Promise<ResumeFixedProfile | undefined> {
  if (!hasChromeStorage()) {
    const value = localStorage.getItem(BASE_PROFILE_KEY);
    return value ? (JSON.parse(value) as ResumeFixedProfile) : undefined;
  }
  const result = await chrome.storage.local.get(BASE_PROFILE_KEY);
  return result[BASE_PROFILE_KEY] as ResumeFixedProfile | undefined;
}

export async function saveBaseProfile(basics: ResumeFixedProfile): Promise<void> {
  if (!hasChromeStorage()) {
    localStorage.setItem(BASE_PROFILE_KEY, JSON.stringify(basics));
    return;
  }
  await chrome.storage.local.set({ [BASE_PROFILE_KEY]: basics });
}

export async function loadResumeLibraryUi(): Promise<ResumeLibraryUiState> {
  if (!hasChromeStorage()) {
    const value = localStorage.getItem(RESUME_LIBRARY_UI_KEY);
    return value ? { ...DEFAULT_RESUME_LIBRARY_UI, ...(JSON.parse(value) as Partial<ResumeLibraryUiState>) } : { ...DEFAULT_RESUME_LIBRARY_UI };
  }
  const result = await chrome.storage.local.get(RESUME_LIBRARY_UI_KEY);
  return {
    ...DEFAULT_RESUME_LIBRARY_UI,
    ...((result[RESUME_LIBRARY_UI_KEY] as Partial<ResumeLibraryUiState> | undefined) || {})
  };
}

export async function saveResumeLibraryUi(state: ResumeLibraryUiState): Promise<void> {
  if (!hasChromeStorage()) {
    localStorage.setItem(RESUME_LIBRARY_UI_KEY, JSON.stringify(state));
    return;
  }
  await chrome.storage.local.set({ [RESUME_LIBRARY_UI_KEY]: state });
}

export async function loadResumeLibrary(): Promise<StoredResume[]> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(RESUMES_KEY);
    const stored = result[RESUMES_KEY] as StoredResume[] | undefined;
    if (Array.isArray(stored)) return stored;
  } else {
    const value = localStorage.getItem(RESUMES_KEY);
    if (value) return JSON.parse(value) as StoredResume[];
  }

  const profile = await loadProfile();
  const hasProfile = Boolean(
    profile.fullName ||
      profile.phone ||
      profile.email ||
      profile.education.length ||
      profile.experiences.length ||
      profile.projects.length
  );
  if (!hasProfile) return [];

  const now = new Date().toISOString();
  const migrated: StoredResume[] = [
    {
      id: `resume_${Date.now().toString(36)}`,
      name: "我的简历",
      sourceFileName: profile.extraFields?.resumeSourceName,
      profile,
      createdAt: now,
      updatedAt: profile.updatedAt || now,
      lastUsedAt: now
    }
  ];
  await saveResumeLibrary(migrated);
  await setActiveResumeId(migrated[0].id);
  return migrated;
}

export async function saveResumeLibrary(resumes: StoredResume[]): Promise<void> {
  if (!hasChromeStorage()) {
    localStorage.setItem(RESUMES_KEY, JSON.stringify(resumes));
    return;
  }
  await chrome.storage.local.set({ [RESUMES_KEY]: resumes });
}

export async function loadActiveResumeId(): Promise<string | undefined> {
  if (!hasChromeStorage()) return localStorage.getItem(ACTIVE_RESUME_KEY) || undefined;
  const result = await chrome.storage.local.get(ACTIVE_RESUME_KEY);
  return typeof result[ACTIVE_RESUME_KEY] === "string" ? result[ACTIVE_RESUME_KEY] : undefined;
}

export async function setActiveResumeId(id: string): Promise<void> {
  if (!hasChromeStorage()) {
    localStorage.setItem(ACTIVE_RESUME_KEY, id);
    return;
  }
  await chrome.storage.local.set({ [ACTIVE_RESUME_KEY]: id });
}

export function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "from",
      "source"
    ].forEach((key) => url.searchParams.delete(key));
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/\/$/, "");
  }
}

const normalizeText = (value?: string) =>
  value?.toLowerCase().replace(/[\s\-—_｜|（）()]/g, "") ?? "";

const normalizePosition = (value?: string) =>
  normalizeText(
    value
      ?.trim()
      .replace(/\s+(?:实习|全职|兼职|校招|社招|应届)$/i, "")
      .replace(/(实习生)实习$/i, "$1")
  );

export function findDuplicate(
  jobs: JobApplication[],
  candidate: Pick<
    JobApplication,
    "company" | "position" | "jobId" | "city" | "sourceUrl"
  >
): JobApplication | undefined {
  const normalizedUrl = normalizeUrl(candidate.sourceUrl);
  return jobs.find((job) => {
    if (job.jobId && candidate.jobId) {
      return (
        normalizeText(job.company) === normalizeText(candidate.company) &&
        normalizeText(job.jobId) === normalizeText(candidate.jobId)
      );
    }

    if (
      normalizeUrl(job.sourceUrl) === normalizedUrl &&
      normalizeText(job.company) === normalizeText(candidate.company) &&
      normalizePosition(job.position) === normalizePosition(candidate.position)
    ) return true;

    return (
      normalizeText(job.company) === normalizeText(candidate.company) &&
      normalizePosition(job.position) === normalizePosition(candidate.position) &&
      normalizeText(job.city) === normalizeText(candidate.city)
    );
  });
}
