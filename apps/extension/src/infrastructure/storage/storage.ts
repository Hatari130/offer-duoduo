import type { JobApplication, OfferFlowSettings, PersonalProfile } from "@/shared/types";

export const JOBS_KEY = "offerflow.jobs";
export const SETTINGS_KEY = "offerflow.settings";
export const AUTO_SYNC_NOTICE_KEY = "offerflow.autoSyncNotice";
export const PROFILE_KEY = "offerflow.profile";

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

export async function saveJobs(jobs: JobApplication[]): Promise<void> {
  if (!hasChromeStorage()) {
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
    return;
  }
  await chrome.storage.local.set({ [JOBS_KEY]: jobs });
}

export async function loadSettings(): Promise<OfferFlowSettings> {
  if (!hasChromeStorage()) {
    const value = localStorage.getItem(SETTINGS_KEY);
    return value ? JSON.parse(value) : {};
  }
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return (result[SETTINGS_KEY] as OfferFlowSettings | undefined) ?? {};
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
