import {
  inferRecruitmentType,
  type JobApplication,
  type OfferFlowSettings,
  type PersonalProfile,
  type ResumeAsset
} from "@/shared/types";
import type { TailoredResumeBundle, TailoredResumeEntry } from "@/features/tailor/types";
import { enqueueApplicationChanges } from "@/infrastructure/sync/syncState";
import {
  countResumeFields,
  dehydrateResumeLibrary,
  migrateResumeLibrary,
  resolveActiveResumeId
} from "@/features/resumes/resumeLifecycle";

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

export type StoredResumeKind = "master" | "base" | "job";
export type ResumeLifecycleStatus = "active" | "archived" | "invalid";
export type ResumeParseStatus = "pending" | "ready" | "needs-review" | "failed" | "unknown";

export interface StoredResumeParseMetadata {
  schemaVersion: 1;
  status: ResumeParseStatus;
  coverage: number;
  extractedFieldCount: number;
  textLength: number;
  warnings: string[];
  parsedAt?: string;
  parserVersion?: string;
  /** Geometry-normalized source text retained for evidence-based repair and tailoring. */
  sourceText?: string;
  unclassifiedText?: string;
}

export interface StoredResumeSourceMetadata {
  revisionId: string;
  fileName: string;
  mimeType: string;
  size: number;
  importedAt: string;
  sha256?: string;
  pageCount?: number;
  characterCount?: number;
  storageStatus: "stored" | "referenced" | "missing";
  layoutStatus: "pending" | "ready" | "failed" | "unknown";
}

export interface StoredResume {
  id: string;
  name: string;
  kind?: StoredResumeKind;
  masterResumeId?: string;
  parentResumeId?: string;
  versionNumber?: number;
  jobKey?: string;
  lifecycleStatus?: ResumeLifecycleStatus;
  invalidReason?: string;
  company?: string;
  position?: string;
  archiveNameSource?: "filename" | "manual";
  sourceFileName?: string;
  sourcePdf?: StoredResumePdf;
  /** Runtime marker: inherited PDF blobs are never duplicated in persistent storage. */
  sourcePdfInherited?: boolean;
  /** Extracted PDF images live on the master and are inherited by versions. */
  assets?: ResumeAsset[];
  portraitAssetId?: string;
  /** Runtime marker: inherited image data is not duplicated in persistent storage. */
  sourceAssetsInherited?: boolean;
  source?: StoredResumeSourceMetadata;
  parse?: StoredResumeParseMetadata;
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

/** Candidate-level identity shared between versions. Resume evidence such as
 * campus work, awards and skills intentionally remains version-local. */
export interface ResumeFixedProfile extends ResumeBasics {
  /** Legacy fields are retained only so old storage can be read safely. */
  campusExperiences?: PersonalProfile["campusExperiences"];
  awards?: PersonalProfile["awards"];
  extraFields?: Record<string, string>;
  fixedSectionsVersion?: 1;
}

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

/**
 * A parsed resume is the strongest source for its own identity fields. The
 * candidate-level profile only fills gaps caused by a sparse or imperfect
 * extraction; it must never overwrite evidence from a newly uploaded file.
 */
export function applyResumeBasics(profile: PersonalProfile, basics: ResumeBasics): PersonalProfile {
  const resolved = Object.fromEntries(
    RESUME_BASICS_KEYS.map((key) => [
      key,
      String(profile[key] || "").trim() ? profile[key] : basics[key]
    ])
  ) as ResumeBasics;
  return { ...profile, ...resolved };
}

export function hasResumeBasics(basics: ResumeBasics): boolean {
  return RESUME_BASICS_KEYS.some((key) => Boolean(basics[key]?.trim()));
}

export function extractResumeFixedProfile(profile: PersonalProfile): ResumeFixedProfile {
  return {
    ...extractResumeBasics(profile),
    fixedSectionsVersion: 1
  };
}

export function applyResumeFixedProfile(profile: PersonalProfile, fixed: ResumeFixedProfile): PersonalProfile {
  return applyResumeBasics(profile, fixed);
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
  const normalize = (jobs: JobApplication[]) => jobs.map((job) => ({
    ...job,
    recruitmentType: job.recruitmentType || inferRecruitmentType(
      job.position,
      job.jobType,
      job.summary,
      job.rawExcerpt
    )
  }));
  if (!hasChromeStorage()) {
    const value = localStorage.getItem(JOBS_KEY);
    return normalize(value ? JSON.parse(value) : []);
  }
  const result = await chrome.storage.local.get(JOBS_KEY);
  return normalize((result[JOBS_KEY] as JobApplication[] | undefined) ?? []);
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
  sha256?: string;
  pageCount?: number;
  characterCount?: number;
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

function tailoredResumeProfile(
  sourceProfile: PersonalProfile,
  bundle: TailoredResumeBundle
): PersonalProfile {
  const resume = bundle.resume;
  const github = resume.header.links.find((link) => /github/i.test(`${link.label} ${link.href}`))?.href;
  const portfolio = resume.header.links.find((link) => !/github/i.test(`${link.label} ${link.href}`) && link.href)?.href;
  return {
    ...sourceProfile,
    fullName: resume.header.name || sourceProfile.fullName,
    email: resume.header.email || sourceProfile.email,
    phone: resume.header.phone || sourceProfile.phone,
    currentCity: resume.header.city || sourceProfile.currentCity,
    targetRole: resume.targetRole || bundle.context.position || sourceProfile.targetRole,
    githubUrl: github || sourceProfile.githubUrl,
    portfolioUrl: portfolio || sourceProfile.portfolioUrl,
    selfIntroduction: resume.summary || sourceProfile.selfIntroduction,
    education: resume.education.map((item, index) => ({
      id: item.id || `tailored_education_${index + 1}`,
      school: item.school,
      major: item.major,
      degree: item.degree,
      educationDegree: item.degree,
      courses: item.courses,
      rank: item.rank,
      startDate: item.start,
      endDate: item.end,
      gpa: item.gpa
    })),
    experiences: resume.experience.map((item, index) => ({
      id: item.id || `tailored_experience_${index + 1}`,
      organization: item.company,
      title: item.title,
      startDate: item.start,
      endDate: item.end === "至今" ? "" : item.end,
      description: item.bullets.join("\n"),
      achievements: item.bullets.join("\n"),
      isCurrent: item.end === "至今"
    })),
    projects: resume.projects.map((item, index) => ({
      id: item.id || `tailored_project_${index + 1}`,
      name: item.name,
      role: item.role,
      startDate: item.start,
      endDate: item.end,
      description: item.summary,
      achievement: item.bullets.join("\n"),
      link: item.link
    })),
    campusExperiences: resume.campus.map((item, index) => ({
      id: item.id || `tailored_campus_${index + 1}`,
      type: item.type,
      role: item.role,
      startDate: item.start,
      endDate: item.end,
      description: item.description
    })),
    awards: resume.awards.map((item, index) => ({
      id: item.id || `tailored_award_${index + 1}`,
      date: item.date,
      name: item.name,
      level: item.level,
      description: ""
    })),
    computerSkills: resume.skills.length
      ? resume.skills.map((group) => ({ type: group.label, proficiency: group.items.join("、") }))
      : sourceProfile.computerSkills,
    hobbies: resume.interests.length ? resume.interests.join("、") : sourceProfile.hobbies,
    extraFields: {
      ...(sourceProfile.extraFields || {}),
      tailoredJobKey: entrySafeValue(bundle.context.jobKey),
      tailoredGeneratedAt: entrySafeValue(bundle.generatedAt),
      tailoredCompany: entrySafeValue(bundle.context.company),
      tailoredPosition: entrySafeValue(bundle.context.position)
    }
  };
}

function entrySafeValue(value: string | undefined): string {
  return String(value || "").trim();
}

async function upsertJobResumeVersion(entry: TailoredResumeEntry): Promise<void> {
  const sourceResumeId = entry.bundle.context.sourceResumeId;
  if (!sourceResumeId) return;
  const library = await loadResumeLibrary();
  const sourceResume = library.find((resume) => resume.id === sourceResumeId);
  if (!sourceResume) return;
  const existing = library.find((resume) => resume.kind === "job" && resume.jobKey === entry.jobKey);
  const masterResumeId = sourceResume.kind === "master" ? sourceResume.id : sourceResume.masterResumeId;
  const now = entry.savedAt || new Date().toISOString();
  const profile = tailoredResumeProfile(sourceResume.profile, entry.bundle);
  const nextJob: StoredResume = {
    id: existing?.id || `resume_job_${entry.jobKey.replace(/[^a-z0-9_-]/gi, "_")}`,
    name: [entry.bundle.context.company, entry.bundle.context.position].filter(Boolean).join(" · ") || "岗位定制简历",
    kind: "job",
    masterResumeId,
    parentResumeId: sourceResume.id,
    versionNumber: (existing?.versionNumber || 0) + 1,
    jobKey: entry.jobKey,
    lifecycleStatus: "active",
    company: entry.bundle.context.company,
    position: entry.bundle.context.position,
    archiveNameSource: "manual",
    sourceFileName: sourceResume.sourceFileName,
    source: sourceResume.source
      ? {
          ...sourceResume.source,
          storageStatus: masterResumeId ? "referenced" : sourceResume.source.storageStatus
        }
      : undefined,
    parse: sourceResume.parse
      ? {
          ...sourceResume.parse,
          extractedFieldCount: countResumeFields({ profile }),
          warnings: [...sourceResume.parse.warnings]
        }
      : undefined,
    profile,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastUsedAt: existing?.lastUsedAt
  };
  await saveResumeLibrary([nextJob, ...library.filter((resume) => resume.id !== nextJob.id)]);
}

export async function saveTailoredResume(entry: TailoredResumeEntry): Promise<void> {
  const current = await loadTailoredResumes();
  await Promise.all([
    saveTailoredResumes({ ...current, [entry.jobKey]: entry }),
    upsertJobResumeVersion(entry)
  ]);
}

export async function getTailoredResume(jobKey: string): Promise<TailoredResumeBundle | undefined> {
  const all = await loadTailoredResumes();
  return all[jobKey]?.bundle;
}

export async function dropTailoredResume(jobKey: string): Promise<void> {
  const current = await loadTailoredResumes();
  if (current[jobKey]) delete current[jobKey];
  const library = await loadResumeLibrary();
  const removedIds = new Set(
    library.filter((resume) => resume.kind === "job" && resume.jobKey === jobKey).map((resume) => resume.id)
  );
  const nextLibrary = removedIds.size ? library.filter((resume) => !removedIds.has(resume.id)) : library;
  const activeId = await loadActiveResumeId();
  const nextActiveId = resolveActiveResumeId(nextLibrary, removedIds.has(activeId || "") ? undefined : activeId);
  const nextActiveResume = nextLibrary.find((resume) => resume.id === nextActiveId);
  await Promise.all([
    saveTailoredResumes(current),
    removedIds.size ? saveResumeLibrary(nextLibrary) : Promise.resolve(),
    removedIds.size ? setActiveResumeId(nextActiveId) : Promise.resolve(),
    removedIds.size && nextActiveResume ? saveProfile(nextActiveResume.profile) : Promise.resolve()
  ]);
}

/** Removes job drafts that were generated from deleted resume versions. */
export async function dropTailoredResumesForSourceResumeIds(
  resumeIds: Iterable<string>,
  explicitJobKeys: Iterable<string> = []
): Promise<number> {
  const ids = new Set(resumeIds);
  const jobKeys = new Set(explicitJobKeys);
  if (!ids.size && !jobKeys.size) return 0;
  const current = await loadTailoredResumes();
  const removedJobKeys = Object.entries(current)
    .filter(([jobKey, entry]) => {
      const sourceResumeId = entry.bundle.context.sourceResumeId;
      return jobKeys.has(jobKey) || Boolean(sourceResumeId && ids.has(sourceResumeId));
    })
    .map(([jobKey]) => jobKey);
  if (!removedJobKeys.length) return 0;
  removedJobKeys.forEach((jobKey) => delete current[jobKey]);
  await Promise.all([
    saveTailoredResumes(current),
    ...removedJobKeys.map((jobKey) => dropTailoredPdf(jobKey))
  ]);
  return removedJobKeys.length;
}

/** One-time/ongoing repair for historical job drafts whose source resume was deleted. */
export async function pruneOrphanedTailoredResumes(validResumeIds: Iterable<string>): Promise<number> {
  const validIds = new Set(validResumeIds);
  const current = await loadTailoredResumes();
  const removedJobKeys = Object.entries(current)
    .filter(([, entry]) => {
      const sourceResumeId = entry.bundle.context.sourceResumeId;
      return Boolean(sourceResumeId && !validIds.has(sourceResumeId));
    })
    .map(([jobKey]) => jobKey);
  if (!removedJobKeys.length) return 0;
  removedJobKeys.forEach((jobKey) => delete current[jobKey]);
  await Promise.all([
    saveTailoredResumes(current),
    ...removedJobKeys.map((jobKey) => dropTailoredPdf(jobKey))
  ]);
  return removedJobKeys.length;
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

async function readStoredResumeLibrary(): Promise<StoredResume[] | undefined> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(RESUMES_KEY);
    const stored = result[RESUMES_KEY] as StoredResume[] | undefined;
    if (Array.isArray(stored)) return stored;
  } else {
    const value = localStorage.getItem(RESUMES_KEY);
    if (value) return JSON.parse(value) as StoredResume[];
  }
  return undefined;
}

export async function loadResumeLibrary(): Promise<StoredResume[]> {
  const stored = await readStoredResumeLibrary();
  if (stored) return migrateResumeLibrary(stored);

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
      kind: "base",
      versionNumber: 1,
      lifecycleStatus: "active",
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
  const persisted = dehydrateResumeLibrary(resumes);
  if (!hasChromeStorage()) {
    localStorage.setItem(RESUMES_KEY, JSON.stringify(persisted));
    return;
  }
  await chrome.storage.local.set({ [RESUMES_KEY]: persisted });
}

export async function updateResumeSourceLayoutMetadata(
  resumeId: string,
  patch: {
    layoutStatus: StoredResumeSourceMetadata["layoutStatus"];
    pageCount?: number;
    characterCount?: number;
  }
): Promise<void> {
  const library = await loadResumeLibrary();
  const owner = library.find((resume) => resume.id === resumeId);
  if (!owner) return;
  const masterResumeId = owner.kind === "master" ? owner.id : owner.masterResumeId;
  const linkedIds = new Set(
    library
      .filter((resume) => (
        resume.id === owner.id
        || Boolean(masterResumeId && (resume.id === masterResumeId || resume.masterResumeId === masterResumeId))
      ))
      .map((resume) => resume.id)
  );
  const next = library.map((resume) => {
    if (!linkedIds.has(resume.id)) return resume;
    const source = resume.source
      ? {
          ...resume.source,
          layoutStatus: patch.layoutStatus,
          pageCount: patch.pageCount ?? resume.source.pageCount,
          characterCount: patch.characterCount ?? resume.source.characterCount
        }
      : resume.source;
    const sourcePdf = resume.kind === "master" && resume.sourcePdf
      ? {
          ...resume.sourcePdf,
          pageCount: patch.pageCount ?? resume.sourcePdf.pageCount,
          characterCount: patch.characterCount ?? resume.sourcePdf.characterCount
        }
      : resume.sourcePdf;
    const parse = resume.parse && patch.characterCount !== undefined
      ? { ...resume.parse, textLength: patch.characterCount }
      : resume.parse;
    return { ...resume, source, sourcePdf, parse };
  });
  await saveResumeLibrary(next);
}

export async function updateResumeSourceAssets(
  resumeId: string,
  assets: ResumeAsset[],
  portraitAssetId?: string
): Promise<void> {
  const library = await loadResumeLibrary();
  const owner = library.find((resume) => resume.id === resumeId);
  if (!owner) return;
  const masterResumeId = owner.kind === "master" ? owner.id : owner.masterResumeId;
  const linkedIds = new Set(
    library
      .filter((resume) => (
        resume.id === owner.id
        || Boolean(masterResumeId && (resume.id === masterResumeId || resume.masterResumeId === masterResumeId))
      ))
      .map((resume) => resume.id)
  );
  const next = library.map((resume) => linkedIds.has(resume.id)
    ? {
        ...resume,
        assets: structuredClone(assets),
        portraitAssetId,
        sourceAssetsInherited: resume.kind !== "master" && Boolean(masterResumeId && assets.length)
      }
    : resume);
  await saveResumeLibrary(next);
}

export async function loadActiveResumeId(): Promise<string | undefined> {
  let storedId: string | undefined;
  if (!hasChromeStorage()) {
    storedId = localStorage.getItem(ACTIVE_RESUME_KEY) || undefined;
  } else {
    const result = await chrome.storage.local.get(ACTIVE_RESUME_KEY);
    storedId = typeof result[ACTIVE_RESUME_KEY] === "string" ? result[ACTIVE_RESUME_KEY] : undefined;
  }
  const storedLibrary = await readStoredResumeLibrary();
  if (!storedLibrary?.length) return storedId || undefined;
  const repairedId = resolveActiveResumeId(migrateResumeLibrary(storedLibrary), storedId);
  if (repairedId !== (storedId || "")) await setActiveResumeId(repairedId);
  return repairedId || undefined;
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
