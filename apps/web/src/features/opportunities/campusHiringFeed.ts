import {
  opportunityStatus,
  type OpportunityFeedSnapshot,
  type RecruitmentOpportunity
} from "@offerflow/domain";

export const CAMPUS_HIRING_FEED_URL =
  import.meta.env.VITE_CAMPUS_HIRING_FEED_URL ||
  "https://shouna12358-png.github.io/campus-hiring/campus-hiring.json";

export interface CampusHiringOpportunity extends RecruitmentOpportunity {
  deadlineLabel?: string;
  industry?: string;
  companyType?: string;
}

interface CampusHiringPayload {
  updatedAt?: string;
  count?: number;
  items?: unknown[];
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function list(value: unknown): string[] {
  return text(value)
    .split(/[,，、;；/|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizedDeadline(value: unknown): string | undefined {
  const deadline = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : undefined;
}

function normalizeItem(value: unknown): CampusHiringOpportunity | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const company = text(item.company);
  const applyUrlValue = text(item.applyUrl);
  const announcementUrlValue = text(item.announcementUrl);
  const cityValue = text(item.city);
  const applyUrl = validHttpUrl(applyUrlValue) ? applyUrlValue : "";
  const announcementUrl = validHttpUrl(announcementUrlValue) ? announcementUrlValue : "";
  const cityUrl = validHttpUrl(cityValue) ? cityValue : "";
  const positions = list(item.positions);
  const usesShiftedFields = Boolean(cityUrl)
    || (!cityValue && applyUrlValue === "待投递" && Boolean(announcementUrl));
  const officialUrl = applyUrl || announcementUrl || cityUrl;
  if (!company || !officialUrl) return undefined;

  const deadlineLabel = text(item.deadline) || undefined;
  const deadline = normalizedDeadline(item.deadline);
  const sourceUpdatedAt = text(item.updatedAt) || undefined;
  const openAt = normalizedDeadline(sourceUpdatedAt);
  const targetCohort = text(item.targetCohort);
  const industry = text(item.industry);
  const companyType = text(item.companyType);
  const opportunity: CampusHiringOpportunity = {
    id: text(item.id) || `${company}-${officialUrl}`,
    company,
    title: targetCohort || "校园招聘",
    batch: text(item.type) || undefined,
    openAt,
    deadline,
    deadlineLabel,
    graduationYears: list(targetCohort),
    roleTags: usesShiftedFields ? [] : positions,
    cities: usesShiftedFields ? positions : list(cityValue),
    officialUrl,
    sourceUrl: cityUrl || announcementUrl || undefined,
    sourceName: "Campus Hiring 公开数据",
    updatedAt: sourceUpdatedAt,
    industry: industry || undefined,
    companyType: companyType || undefined
  };
  opportunity.status = opportunityStatus(opportunity);
  return opportunity;
}

export function normalizeCampusHiringFeed(
  payload: unknown,
  sourceUrl = CAMPUS_HIRING_FEED_URL
): OpportunityFeedSnapshot & { opportunities: CampusHiringOpportunity[] } {
  if (!payload || typeof payload !== "object") {
    throw new Error("校招数据格式不正确");
  }
  const record = payload as CampusHiringPayload;
  if (!Array.isArray(record.items)) {
    throw new Error("校招数据缺少 items 列表");
  }

  const opportunities = record.items
    .map(normalizeItem)
    .filter((item): item is CampusHiringOpportunity => Boolean(item));
  if (record.items.length > 0 && opportunities.length === 0) {
    throw new Error("校招数据中没有可用的投递链接");
  }

  return {
    opportunities,
    fetchedAt: new Date().toISOString(),
    sourceUpdatedAt: text(record.updatedAt) || undefined,
    sourceUrl
  };
}

export async function fetchCampusHiringFeed(
  signal?: AbortSignal
): Promise<ReturnType<typeof normalizeCampusHiringFeed>> {
  const response = await fetch(CAMPUS_HIRING_FEED_URL, {
    cache: "no-cache",
    headers: { accept: "application/json" },
    signal
  });
  if (!response.ok) {
    throw new Error(`校招数据接口暂时不可用（${response.status}）`);
  }
  return normalizeCampusHiringFeed(await response.json(), CAMPUS_HIRING_FEED_URL);
}
