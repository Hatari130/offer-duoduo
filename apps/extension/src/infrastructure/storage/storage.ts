import {
  inferRecruitmentType,
  resolveProfileExperienceKind,
  type JobApplication,
  type OfferFlowSettings,
  type PersonalProfile,
  type ResumeAsset
} from "@/shared/types";
import type { TailoredResumeBundle, TailoredResumeEntry } from "@/features/tailor/types";
import { captureApplicationFields, composeApplicationProfile, toCloudResumeProfile, type LocalApplicationProfile, type ResumeTemplateSettings, type TailorJobContext } from "@offerflow/domain";
import type { ResumeTemplateRecord } from "@offerflow/contracts";
import {
  cloudDataScope,
  enqueueApplicationChanges,
  loadCloudConnection,
  loadCloudDataOwner
} from "@/infrastructure/sync/syncState";
import {
  countResumeFields,
  migrateResumeLibrary,
  resolveActiveResumeId,
  stripResumeDiagnosticFields
} from "@/features/resumes/resumeLifecycle";

export const JOBS_KEY = "offerflow.jobs";
export const GUEST_JOBS_KEY = "offerflow.jobs.guest";
export const SETTINGS_KEY = "offerflow.settings";
export const PROFILE_KEY = "offerflow.localApplicationProfile";
export const APPLICATION_PROFILE_KEY = "offerflow.applicationProfile";
export const RESUME_USAGE_KEY = "offerflow.resumeUsage";
export const TAILORED_RESUMES_KEY = "offerflow.tailoredResumes";
export const TAILORED_PDF_KEY = "offerflow.tailoredPdf";
export const BASE_PROFILE_KEY = "offerflow.baseProfile";
export const RESUMES_KEY = "offerflow.localApplicationProfiles.v1";
export const ACTIVE_RESUME_KEY = "offerflow.localApplicationActiveId";
export const RESUME_LIBRARY_UI_KEY = "offerflow.resumeLibraryUi";
export const PENDING_DELETED_RESUMES_KEY = "offerflow.pendingDeletedResumeIds";

export type StoredResumeKind = "base" | "job";
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
  localRevision?: number;
  cloudRevision?: number;
  cloudBaseline?: string;
  syncConflict?: ResumeTemplateRecord;
  cloudVersionId?: string;
  cloudVersionRevision?: number;
  applicationId?: string;
  tailorTaskId?: string;
  template?: ResumeTemplateSettings;
  jobSnapshot?: TailorJobContext;
  name: string;
  kind?: StoredResumeKind;
  /** Legacy relationship key retained only while old libraries are migrated. */
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
  /** Extracted PDF images live on the general resume and are inherited by job versions. */
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

export interface ResumeUsageSnapshot {
  id: string;
  resumeId: string;
  name: string;
  versionId?: string;
  revision?: number;
  applicationId?: string;
  filledAt: string;
  filledCount: number;
  pageUrl: string;
  /** Resume fields only, never the values sent to private form fields. */
  profile: ReturnType<typeof toCloudResumeProfile>;
}

export async function loadResumeUsage(): Promise<ResumeUsageSnapshot[]> {
  return await readLocalValue<ResumeUsageSnapshot[]>(RESUME_USAGE_KEY) || [];
}

export async function recordResumeUsage(resumeId: string, profile: PersonalProfile, pageUrl: string, filledCount: number): Promise<void> {
  if (filledCount < 1) return;
  await withProfileWrite(async () => {
    const resume = (await readStoredResumeLibrary())?.find(item => item.id === resumeId);
    let safeUrl = "";
    try { const url = new URL(pageUrl); if (["http:", "https:"].includes(url.protocol)) safeUrl = `${url.origin}${url.pathname}`; } catch { /* optional source */ }
    const snapshot: ResumeUsageSnapshot = {
      id: globalThis.crypto.randomUUID(), resumeId, name: resume?.name || "网申资料",
      versionId: resume?.cloudVersionId, revision: resume?.cloudVersionRevision,
      applicationId: resume?.applicationId, filledAt: new Date().toISOString(),
      filledCount, pageUrl: safeUrl, profile: toCloudResumeProfile(profile)
    };
    await writeLocalValues({ [RESUME_USAGE_KEY]: [...await loadResumeUsage(), snapshot] });
  });
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

export function isStarterProfile(profile: Partial<PersonalProfile> | undefined): boolean {
  if (!profile) return false;
  return profile.fullName === "林知夏" || profile.email === "lin.zhixia@example.com";
}

async function pendingResumeDeletionKey(scope?: string): Promise<string | undefined> {
  const owner = scope ? undefined : await loadCloudDataOwner();
  const resolved = scope || (owner && cloudDataScope(owner));
  return resolved ? `${PENDING_DELETED_RESUMES_KEY}.${encodeURIComponent(resolved)}` : undefined;
}

export async function loadPendingDeletedResumeIds(scope?: string): Promise<string[]> {
  const key = await pendingResumeDeletionKey(scope);
  if (!key) return [];
  if (!hasChromeStorage()) {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : [];
  }
  const result = await chrome.storage.local.get(key);
  return (result[key] as string[] | undefined) ?? [];
}

export async function savePendingDeletedResumeIds(ids: string[], scope?: string): Promise<void> {
  const key = await pendingResumeDeletionKey(scope);
  if (!key) return;
  if (!hasChromeStorage()) {
    localStorage.setItem(key, JSON.stringify(ids));
    return;
  }
  await chrome.storage.local.set({ [key]: ids });
}

export async function recordPendingDeletedResumeId(id: string, scope?: string): Promise<void> {
  const current = await loadPendingDeletedResumeIds(scope);
  if (!current.includes(id)) {
    await savePendingDeletedResumeIds([...current, id], scope);
  }
}

export async function removePendingDeletedResumeIds(idsToRemove: string[], scope?: string): Promise<void> {
  const set = new Set(idsToRemove);
  const current = await loadPendingDeletedResumeIds(scope);
  await savePendingDeletedResumeIds(current.filter((id) => !set.has(id)), scope);
}

/** Attribute old unscoped deletion IDs only while the old account is still
 * connected. Never attach an ambiguous queue to a newly connected account. */
export async function migrateLegacyResumeDeletions(scope: string): Promise<void> {
  const legacy = hasChromeStorage()
    ? (await chrome.storage.local.get(PENDING_DELETED_RESUMES_KEY))[PENDING_DELETED_RESUMES_KEY]
    : JSON.parse(localStorage.getItem(PENDING_DELETED_RESUMES_KEY) || "[]");
  if (!Array.isArray(legacy) || !legacy.length) return;
  const current = await loadPendingDeletedResumeIds(scope);
  await savePendingDeletedResumeIds([...new Set([...current, ...legacy.filter((id): id is string => typeof id === "string")])], scope);
  if (hasChromeStorage()) await chrome.storage.local.remove(PENDING_DELETED_RESUMES_KEY);
  else localStorage.removeItem(PENDING_DELETED_RESUMES_KEY);
}

export async function clearLocalProfileAndResumes(): Promise<void> {
  const pendingKey = await pendingResumeDeletionKey();
  if (hasChromeStorage()) {
    const all = await chrome.storage.local.get(null);
    const tailoredPdfKeys = Object.keys(all).filter((key) => key.startsWith(`${TAILORED_PDF_KEY}.`));
    await chrome.storage.local.remove([
      "offerflow.resumes", "offerflow.profile", "offerflow.activeResumeId",
      BASE_PROFILE_KEY,
      RESUME_USAGE_KEY,
      TAILORED_RESUMES_KEY,
      RESUME_LIBRARY_UI_KEY,
      PENDING_DELETED_RESUMES_KEY,
      ...(pendingKey ? [pendingKey] : []),
      ...tailoredPdfKeys
    ]);
  } else {
    for (const key of ["offerflow.resumes", "offerflow.profile", "offerflow.activeResumeId"]) localStorage.removeItem(key);
    localStorage.removeItem(BASE_PROFILE_KEY);
    localStorage.removeItem(RESUME_USAGE_KEY);
    localStorage.removeItem(TAILORED_RESUMES_KEY);
    localStorage.removeItem(RESUME_LIBRARY_UI_KEY);
    localStorage.removeItem(PENDING_DELETED_RESUMES_KEY);
    if (pendingKey) localStorage.removeItem(pendingKey);
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${TAILORED_PDF_KEY}.`)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }
  await Promise.all([
    saveResumeLibrary([]),
    setActiveResumeId(""),
    saveProfile({ ...EMPTY_PROFILE })
  ]);
  if (hasChromeStorage()) await chrome.storage.local.remove(APPLICATION_PROFILE_KEY);
  else localStorage.removeItem(APPLICATION_PROFILE_KEY);
}

export async function getActiveJobsKey(): Promise<string> {
  const connection = await loadCloudConnection();
  if (connection?.user?.id) {
    return `offerflow.jobs.${connection.user.id}`;
  }
  return GUEST_JOBS_KEY;
}

export async function clearUserJobs(userId: string): Promise<void> {
  const key = `offerflow.jobs.${userId}`;
  if (!hasChromeStorage()) {
    localStorage.removeItem(key);
    return;
  }
  await chrome.storage.local.remove([key]);
}

export async function clearGuestJobs(): Promise<void> {
  if (!hasChromeStorage()) {
    localStorage.removeItem(GUEST_JOBS_KEY);
    localStorage.removeItem(JOBS_KEY);
    return;
  }
  await chrome.storage.local.remove([GUEST_JOBS_KEY, JOBS_KEY]);
}

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
  const connection = await loadCloudConnection();
  if (!connection?.user?.id) {
    if (!hasChromeStorage()) {
      localStorage.removeItem(GUEST_JOBS_KEY);
      localStorage.removeItem(JOBS_KEY);
      return [];
    }
    const result = await chrome.storage.local.get([GUEST_JOBS_KEY, JOBS_KEY]);
    if (result[GUEST_JOBS_KEY] || result[JOBS_KEY]) {
      await chrome.storage.local.remove([GUEST_JOBS_KEY, JOBS_KEY]);
    }
    return [];
  }

  const activeKey = `offerflow.jobs.${connection.user.id}`;
  if (!hasChromeStorage()) {
    const value = localStorage.getItem(activeKey);
    return normalize(value ? JSON.parse(value) : []);
  }
  const result = await chrome.storage.local.get([activeKey, JOBS_KEY]);
  const jobs = result[activeKey] as JobApplication[] | undefined;
  if (result[JOBS_KEY]) {
    await chrome.storage.local.remove([JOBS_KEY]);
  }
  return normalize(jobs ?? []);
}

export async function saveJobs(
  jobs: JobApplication[],
  options: { origin?: "local" | "cloud" } = {}
): Promise<void> {
  const activeKey = await getActiveJobsKey();
  const previous = options.origin === "cloud" ? [] : await loadJobs();
  if (!hasChromeStorage()) {
    localStorage.setItem(activeKey, JSON.stringify(jobs));
  } else {
    await chrome.storage.local.set({ [activeKey]: jobs });
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
  const normalized: OfferFlowSettings = {};
  if (typeof settings.deepseekApiKey === "string") {
    normalized.deepseekApiKey = settings.deepseekApiKey;
  }
  if (typeof settings.deepseekModel === "string") {
    normalized.deepseekModel = settings.deepseekModel === "deepseek-v4-flash"
      ? "deepseek-chat"
      : settings.deepseekModel;
  }
  if (typeof settings.opportunityFeedUrl === "string") {
    normalized.opportunityFeedUrl = settings.opportunityFeedUrl;
  }
  return normalized;
}

export async function saveSettings(settings: OfferFlowSettings): Promise<void> {
  if (!hasChromeStorage()) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return;
  }
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

async function readLocalValue<T>(key: string): Promise<T | undefined> {
  if (hasChromeStorage()) return (await chrome.storage.local.get(key))[key] as T | undefined;
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) as T : undefined;
}

async function writeLocalValues(values: Record<string, unknown>): Promise<void> {
  if (hasChromeStorage()) { await chrome.storage.local.set(values); return; }
  for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value));
}

let profileWriteQueue: Promise<unknown> = Promise.resolve();
function withProfileWrite<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request("offerflow-profile", work);
  const result = profileWriteQueue.then(work, work);
  profileWriteQueue = result.catch(() => undefined);
  return result;
}

/** One-time copy into a separate local namespace. Old keys remain intact as a
 * recovery backup; no cloud requests or deletion queues are involved. The new
 * library itself is the commit marker (including an intentionally empty array). */
async function ensureLocalProfiles(): Promise<void> {
  if (await readLocalValue<StoredResume[]>(RESUMES_KEY) !== undefined) return;
  await withProfileWrite(async () => {
    if (await readLocalValue<StoredResume[]>(RESUMES_KEY) !== undefined) return;
    const legacy = await readLocalValue<StoredResume[]>("offerflow.resumes") || [];
    const raw = await readLocalValue<PersonalProfile>("offerflow.profile");
    const oldActive = hasChromeStorage()
      ? await readLocalValue<string>("offerflow.activeResumeId")
      : localStorage.getItem("offerflow.activeResumeId") || undefined;
    let archive = await readLocalValue<LocalApplicationProfile>(APPLICATION_PROFILE_KEY);
    if (raw) archive = captureApplicationFields(archive, raw);
    for (const resume of legacy) archive = captureApplicationFields(archive, resume.profile);
    const normalized = migrateResumeLibrary(legacy);
    // Older lifecycle migrations folded master rows into bases. Preserve those
    // rows too, since they may contain independently authored text.
    const rows = [...normalized, ...legacy.filter(row => !normalized.some(item => item.id === row.id))];
    const library: StoredResume[] = rows.map(row => independentLocalResume({
      ...row, profile: composeApplicationProfile(row.profile, captureApplicationFields(archive, row.profile), row.id)
    }));
    for (const row of legacy) {
      if (row.syncConflict && !row.syncConflict.deletedAt) {
        const remote = row.syncConflict;
        library.push(independentLocalResume({
          ...row, id: `local_conflict_${row.id}`, name: `${row.name}（旧云端冲突副本）`,
          profile: composeApplicationProfile(remote.profile as PersonalProfile, archive),
          assets: remote.document?.assets || row.assets,
          template: remote.document?.template || row.template
        }));
      }
    }
    if (!library.length && raw && Object.values(raw).some(value =>
      typeof value === "string" ? Boolean(value) : Array.isArray(value) ? value.length > 0 : value && Object.keys(value).length > 0
    )) {
      const now = new Date().toISOString();
      library.push({ id: `local_${globalThis.crypto.randomUUID()}`, name: "原有网申资料", kind: "base",
        profile: composeApplicationProfile(raw, archive), createdAt: now, updatedAt: now });
    }
    const activeId = resolveActiveResumeId(library, oldActive);
    await writeLocalValues({
      [ACTIVE_RESUME_KEY]: activeId,
      [PROFILE_KEY]: library.find(row => row.id === activeId)?.profile || structuredClone(EMPTY_PROFILE),
      ...(archive ? { [APPLICATION_PROFILE_KEY]: archive } : {}),
      [RESUMES_KEY]: library
    });
  });
}

function independentLocalResume(resume: StoredResume): StoredResume {
  const { cloudRevision, cloudBaseline, syncConflict, cloudVersionId, cloudVersionRevision,
    masterResumeId, parentResumeId, sourcePdfInherited, sourceAssetsInherited, ...local } = resume;
  return { ...local, kind: "base", localRevision: resume.localRevision || 1, profile: structuredClone(resume.profile) };
}

/** Historical supplements are available for explicit recovery only. */
export async function loadLocalApplicationProfile(): Promise<LocalApplicationProfile> {
  await ensureLocalProfiles();
  return await readLocalValue<LocalApplicationProfile>(APPLICATION_PROFILE_KEY) || { schemaVersion: 1, fields: {}, entries: {} };
}

export async function loadProfile(): Promise<PersonalProfile> {
  await ensureLocalProfiles();
  const library = await readStoredResumeLibrary() || [];
  const activeId = await readLocalValue<string>(ACTIVE_RESUME_KEY);
  const current = library.find(row => row.id === activeId) || library[0];
  return structuredClone(current?.profile || EMPTY_PROFILE);
}

/** Selection cache only. Edits must target a specific local profile. */
export async function saveProfile(profile: PersonalProfile, _options: { selection?: boolean } = {}): Promise<void> {
  await ensureLocalProfiles();
  await withProfileWrite(() => writeLocalValues({ [PROFILE_KEY]: structuredClone(profile) }));
}

export async function saveApplicationProfile(profile: PersonalProfile, activeId?: string, sourceFileName?: string, expectedRevision?: number): Promise<StoredResume[]> {
  await ensureLocalProfiles();
  return withProfileWrite(async () => {
    const library = await readStoredResumeLibrary() || [];
    const selected = library.find(row => row.id === activeId);
    if (activeId && !selected) throw new Error("这份网申资料已被删除，请刷新后重试；当前编辑内容仍保留在页面中");
    if (selected && expectedRevision !== undefined && (selected.localRevision || 1) !== expectedRevision) throw new Error("另一页面已更新这份资料，请复制当前修改后刷新，避免覆盖新内容");
    const now = new Date().toISOString();
    const saved: StoredResume = {
      ...(selected || { id: `local_${globalThis.crypto.randomUUID()}`, name: "我的网申资料", kind: "base", createdAt: now }),
      profile: structuredClone(profile), localRevision: (selected?.localRevision || 0) + 1, sourceFileName: sourceFileName || selected?.sourceFileName, updatedAt: now
    };
    const next = selected ? library.map(row => row.id === selected.id ? saved : row) : [...library, saved];
    await writeLocalValues({ [RESUMES_KEY]: next, [PROFILE_KEY]: saved.profile, [ACTIVE_RESUME_KEY]: saved.id });
    return next;
  });
}

export async function createLocalApplicationProfile(name: string): Promise<StoredResume> {
  await ensureLocalProfiles();
  return withProfileWrite(async () => {
    const now = new Date().toISOString();
    const created: StoredResume = { id: `local_${globalThis.crypto.randomUUID()}`, name: name.trim() || "新的网申资料",
      kind: "base", localRevision: 1, lifecycleStatus: "active", profile: structuredClone(EMPTY_PROFILE), createdAt: now, updatedAt: now };
    await writeLocalValues({ [RESUMES_KEY]: [...await readStoredResumeLibrary() || [], created],
      [ACTIVE_RESUME_KEY]: created.id, [PROFILE_KEY]: created.profile });
    return created;
  });
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
      kind: resolveProfileExperienceKind(
        sourceProfile.experiences.find((experience) => experience.id === item.id) || { type: "" }
      ),
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
  await ensureLocalProfiles();
  return structuredClone(await readStoredResumeLibrary() || []);
}

export async function saveResumeLibrary(resumes: StoredResume[], options: { origin?: "local" | "cloud" } = {}): Promise<void> {
  if (options.origin === "cloud") throw new Error("网申资料仅保存在本地，不能由云端同步写入");
  await ensureLocalProfiles();
  await withProfileWrite(() => writeLocalValues({ [RESUMES_KEY]: resumes.map(independentLocalResume) }));
}

/** Single-record writes preserve additions/edits from other open plugin tabs. */
export async function saveLocalApplicationRecord(resume: StoredResume, expectedRevision?: number): Promise<StoredResume[]> {
  await ensureLocalProfiles();
  return withProfileWrite(async () => {
    const library = await readStoredResumeLibrary() || [];
    const current = library.find(row => row.id === resume.id);
    if (expectedRevision !== undefined && (!current || (current.localRevision || 1) !== expectedRevision)) {
      throw new Error("这份资料已被其他页面修改或删除，请保留当前修改并刷新后重试");
    }
    const saved = independentLocalResume({ ...resume, localRevision: (current?.localRevision || 0) + 1 });
    const next = current ? library.map(row => row.id === saved.id ? saved : row) : [...library, saved];
    await writeLocalValues({ [RESUMES_KEY]: next });
    return next;
  });
}

export async function deleteLocalApplicationRecord(id: string): Promise<StoredResume[]> {
  await ensureLocalProfiles();
  return withProfileWrite(async () => {
    const next = (await readStoredResumeLibrary() || []).filter(row => row.id !== id);
    const active = await readLocalValue<string>(ACTIVE_RESUME_KEY);
    const activeId = resolveActiveResumeId(next, active === id ? undefined : active);
    await writeLocalValues({ [RESUMES_KEY]: next, [ACTIVE_RESUME_KEY]: activeId,
      [PROFILE_KEY]: next.find(row => row.id === activeId)?.profile || structuredClone(EMPTY_PROFILE) });
    return next;
  });
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
  const baseResumeId = owner.kind === "base" ? owner.id : owner.parentResumeId;
  const linkedIds = new Set(
    library
      .filter((resume) => (
        resume.id === owner.id
        || Boolean(baseResumeId && (resume.id === baseResumeId || resume.parentResumeId === baseResumeId))
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
    const sourcePdf = resume.kind === "base" && resume.sourcePdf
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
  const baseResumeId = owner.kind === "base" ? owner.id : owner.parentResumeId;
  const linkedIds = new Set(
    library
      .filter((resume) => (
        resume.id === owner.id
        || Boolean(baseResumeId && (resume.id === baseResumeId || resume.parentResumeId === baseResumeId))
      ))
      .map((resume) => resume.id)
  );
  const next = library.map((resume) => linkedIds.has(resume.id)
    ? {
        ...resume,
        assets: structuredClone(assets),
        portraitAssetId,
        sourceAssetsInherited: resume.kind === "job" && Boolean(baseResumeId && assets.length)
      }
    : resume);
  await saveResumeLibrary(next);
}

export async function loadActiveResumeId(): Promise<string | undefined> {
  await ensureLocalProfiles();
  const storedId = await readLocalValue<string>(ACTIVE_RESUME_KEY);
  const library = await readStoredResumeLibrary() || [];
  const repairedId = resolveActiveResumeId(library, storedId);
  if (repairedId !== (storedId || "")) await setActiveResumeId(repairedId);
  return repairedId || undefined;
}

export async function setActiveResumeId(id: string): Promise<void> {
  await ensureLocalProfiles();
  await withProfileWrite(async () => {
    const library = await readStoredResumeLibrary() || [];
    if (id && !library.some(row => row.id === id)) throw new Error("这份网申资料已被删除，请刷新后重试");
    await writeLocalValues({ [ACTIVE_RESUME_KEY]: id });
  });
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
