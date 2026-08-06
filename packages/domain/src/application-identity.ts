import type { ApplicationStage, JobApplication, ProgressEvidence } from "./applications";

export type ApplicationObservation = {
  sourceHost?: string;
  sourceUrl?: string;
  recordUrl?: string;
  jobId?: string;
  company?: string;
  position?: string;
  city?: string;
  appliedAt?: string;
};

export type ApplicationMatchReason =
  | "application_id"
  | "remembered_alias"
  | "source_record"
  | "platform_company_position"
  | "city"
  | "applied_at";

export interface ApplicationMatchCandidate {
  job: JobApplication;
  score: number;
  confidence: number;
  reasons: ApplicationMatchReason[];
}

export interface ApplicationMatchResult {
  kind: "matched" | "ambiguous" | "none";
  best?: ApplicationMatchCandidate;
  alternatives: ApplicationMatchCandidate[];
}

export interface PendingApplicationMatch {
  id: string;
  signature: string;
  observation: ApplicationObservation;
  externalStage?: string;
  suggestedStage: ApplicationStage;
  candidates: Array<{
    localJobId: string;
    company: string;
    position: string;
    city?: string;
    currentStage: ApplicationStage;
    externalStage?: string;
    score: number;
    reasons: ApplicationMatchReason[];
  }>;
  createdAt: string;
}

const TRACKING_QUERY_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "from",
  "source"
]);

const COMPANY_ALIASES: Array<[string, string]> = [
  ["alibaba", "阿里巴巴"],
  ["jd", "京东"],
  ["baidu", "百度"],
  ["tencent", "腾讯"],
  ["bytedance", "字节跳动"],
  ["meituan", "美团"],
  ["huawei", "华为"]
];

const CITY_NAMES = [
  "北京",
  "上海",
  "天津",
  "重庆",
  "广州",
  "深圳",
  "杭州",
  "南京",
  "苏州",
  "武汉",
  "成都",
  "西安",
  "长沙",
  "厦门",
  "合肥",
  "郑州",
  "济南",
  "青岛",
  "福州",
  "昆明",
  "沈阳",
  "大连",
  "长春",
  "哈尔滨"
];

function compact(value?: string): string {
  return (value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\-_—–|｜·•,，。./\\()[\]{}:：;；'"`]/g, "");
}

export function normalizeApplicationCompany(value?: string): string {
  let normalized = compact(value)
    .replace(/(有限责任公司|股份有限公司|有限公司|集团公司|集团)$/g, "")
    .replace(/招聘官网|校园招聘|社会招聘|招聘平台$/g, "");
  for (const [alias, canonical] of COMPANY_ALIASES) {
    const canonicalKey = compact(canonical);
    if (normalized === alias || normalized === canonicalKey) return alias;
  }
  return normalized;
}

export function normalizeApplicationCity(value?: string): string {
  const normalized = compact(value).replace(/(省|市|自治区|特别行政区)$/g, "");
  return normalized || "";
}

export function normalizeApplicationPosition(value?: string): string {
  let normalized = compact(value)
    .replace(/\b[A-Z]\d{5,}\b/gi, "")
    .replace(/\d{4}届/g, "")
    .replace(/(校园招聘|社会招聘|校招|社招|实习生计划|实习生|应届生|全职|兼职)$/g, "");
  for (const city of CITY_NAMES) {
    const cityKey = compact(city);
    if (normalized.startsWith(cityKey)) {
      normalized = normalized.slice(cityKey.length);
      break;
    }
  }
  return normalized;
}

export function normalizeApplicationDate(value?: string): string {
  const match = (value || "").match(/20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}/);
  if (!match) return "";
  return match[0].replace(/[年月./]/g, "-").replace(/-$/, "");
}

export function normalizeApplicationHost(value?: string): string {
  const host = (value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0]
    .replace(/^www\./, "");
  if (!host) return "";

  const known = [
    "jd.com",
    "baidu.com",
    "alibaba.com",
    "alibaba.com.cn",
    "tencent.com",
    "bytedance.com",
    "meituan.com",
    "huawei.com",
    "nowcoder.com"
  ].find((domain) => host === domain || host.endsWith(`.${domain}`));
  if (known) return known;

  const parts = host.split(".").filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join(".") : host;
}

export function normalizeApplicationUrl(value?: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_QUERY_KEYS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/\/$/, "");
  }
}

function observationFromJob(job: JobApplication): ApplicationObservation {
  return {
    sourceHost: job.sourceHost,
    sourceUrl: job.sourceUrl,
    jobId: job.jobId,
    company: job.company,
    position: job.position,
    city: job.city,
    appliedAt: job.appliedAt
  };
}

function siteForObservation(observation: ApplicationObservation): string {
  return normalizeApplicationHost(observation.sourceHost || observation.sourceUrl);
}

function identityKey(observation: ApplicationObservation): string {
  return [
    "application",
    siteForObservation(observation),
    normalizeApplicationCompany(observation.company),
    normalizeApplicationPosition(observation.position),
    normalizeApplicationCity(observation.city),
    normalizeApplicationDate(observation.appliedAt)
  ].join("|");
}

function observationAliases(observation: ApplicationObservation): string[] {
  const aliases = [identityKey(observation)];
  const recordUrl = normalizeApplicationUrl(observation.recordUrl);
  if (recordUrl) aliases.push(`record|${recordUrl}`);
  const site = siteForObservation(observation);
  const company = normalizeApplicationCompany(observation.company);
  const position = normalizeApplicationPosition(observation.position);
  const city = normalizeApplicationCity(observation.city);
  if (site && company && position && city) {
    aliases.push(["application", site, company, position, city].join("|"));
  }
  return aliases.filter(Boolean);
}

export function applicationIdentityAliases(
  value: JobApplication | ApplicationObservation
): string[] {
  const observation = "id" in value ? observationFromJob(value) : value;
  return observationAliases(observation);
}

export function rememberApplicationObservation(
  job: JobApplication,
  observation: ApplicationObservation
): JobApplication {
  const aliases = new Set([...(job.identityAliases || []), ...observationAliases(observation)]);
  const nextAliases = [...aliases].slice(-12);
  if (nextAliases.length === (job.identityAliases || []).length &&
      nextAliases.every((alias, index) => alias === job.identityAliases?.[index])) {
    return job;
  }
  return { ...job, identityAliases: nextAliases };
}

function scoreApplication(
  job: JobApplication,
  observation: ApplicationObservation
): ApplicationMatchCandidate | undefined {
  const jobSite = normalizeApplicationHost(job.sourceHost || job.sourceUrl);
  const observationSite = siteForObservation(observation);
  if (jobSite && observationSite && jobSite !== observationSite) return undefined;

  const company = normalizeApplicationCompany(observation.company);
  const position = normalizeApplicationPosition(observation.position);
  const jobCompany = normalizeApplicationCompany(job.company);
  const jobPosition = normalizeApplicationPosition(job.position);
  const jobId = compact(job.jobId);
  const observationId = compact(observation.jobId);
  const sameApplicationId = Boolean(jobId && observationId && jobId === observationId);
  if (!sameApplicationId && (!company || !position || company !== jobCompany || position !== jobPosition)) {
    return undefined;
  }

  const reasons: ApplicationMatchReason[] = sameApplicationId
    ? ["application_id"]
    : ["platform_company_position"];
  let score = sameApplicationId ? 115 : 80;
  if (sameApplicationId && company && position && company === jobCompany && position === jobPosition) {
    reasons.push("platform_company_position");
  }

  const city = normalizeApplicationCity(observation.city);
  const jobCity = normalizeApplicationCity(job.city);
  if (city && jobCity) {
    if (city !== jobCity) score -= 18;
    else {
      score += 10;
      reasons.push("city");
    }
  }

  const appliedAt = normalizeApplicationDate(observation.appliedAt);
  const jobAppliedAt = normalizeApplicationDate(job.appliedAt);
  if (appliedAt && jobAppliedAt) {
    if (appliedAt !== jobAppliedAt) score -= 10;
    else {
      score += 10;
      reasons.push("applied_at");
    }
  }

  const recordUrl = normalizeApplicationUrl(observation.recordUrl);
  if (recordUrl && (job.identityAliases || []).includes(`record|${recordUrl}`)) {
    score += 25;
    reasons.unshift("source_record");
  }

  const aliases = new Set(job.identityAliases || []);
  if (observationAliases(observation).some((alias) => aliases.has(alias))) {
    score += 20;
    reasons.unshift("remembered_alias");
  }

  return {
    job,
    score,
    confidence: Math.min(0.99, Math.max(0, score / 125)),
    reasons
  };
}

export function matchExistingApplication(
  jobs: JobApplication[],
  observation: ApplicationObservation
): ApplicationMatchResult {
  const candidates = jobs
    .map((job) => scoreApplication(job, observation))
    .filter((candidate): candidate is ApplicationMatchCandidate => Boolean(candidate))
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best) return { kind: "none", alternatives: [] };

  const second = candidates[1];
  const unique = !second || best.score - second.score >= 12;
  const safe = best.score >= 80 && unique;
  return {
    kind: safe ? "matched" : "ambiguous",
    best,
    alternatives: candidates.slice(1, 4)
  };
}

export function observationFromProgress(
  page: Pick<ApplicationObservation, "sourceHost" | "sourceUrl">,
  evidence: ProgressEvidence
): ApplicationObservation {
  return {
    sourceHost: page.sourceHost,
    sourceUrl: page.sourceUrl,
    recordUrl: evidence.recordUrl,
    jobId: evidence.jobId,
    company: evidence.company,
    position: evidence.position,
    city: evidence.city,
    appliedAt: evidence.appliedAt
  };
}
