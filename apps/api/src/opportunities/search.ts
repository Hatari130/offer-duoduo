import { readFile } from "node:fs/promises";
import {
  normalizeCampusHiringFeed,
  opportunityStatus,
  type ChatOpportunityResults,
  type OpportunityFeedSnapshot,
  type RecruitmentOpportunity
} from "@offerflow/domain";

const AVAILABLE_STATUSES = new Set(["open", "ongoing", "closing"]);

const ROLE_FILTERS: Array<{
  pattern: RegExp;
  groups: string[][];
}> = [
  { pattern: /(?:ai|人工智能|大模型|智能)\s*产品|产品\s*(?:ai|人工智能|大模型)/i, groups: [["产品"], ["ai", "人工智能", "大模型", "智能"]] },
  { pattern: /产品经理|产品岗|产品方向|产品实习/i, groups: [["产品"]] },
  { pattern: /算法|机器学习|深度学习|nlp|自然语言|计算机视觉|cv岗/i, groups: [["算法", "机器学习", "深度学习", "nlp", "自然语言", "计算机视觉", "cv"]] },
  { pattern: /前端|web开发|网页开发/i, groups: [["前端", "web"]] },
  { pattern: /后端|服务端|java开发|go开发|c\+\+开发/i, groups: [["后端", "服务端", "java", "golang", "go开发", "c++"]] },
  { pattern: /软件开发|研发|开发工程师|程序员/i, groups: [["软件", "研发", "开发"]] },
  { pattern: /数据分析|商业分析|数据科学|数据岗|bi岗/i, groups: [["数据", "商业分析", "bi"]] },
  { pattern: /运营|用户增长|增长岗/i, groups: [["运营", "增长"]] },
  { pattern: /市场|营销|品牌|商务|销售/i, groups: [["市场", "营销", "品牌", "商务", "销售"]] },
  { pattern: /设计|交互|视觉|ui|ux/i, groups: [["设计", "交互", "视觉", "ui", "ux"]] },
  { pattern: /人力|人事|hr|招聘专员/i, groups: [["人力", "人事", "hr", "招聘"]] },
  { pattern: /财务|会计|审计|投行|金融/i, groups: [["财务", "会计", "审计", "投行", "金融"]] },
  { pattern: /供应链|采购|物流/i, groups: [["供应链", "采购", "物流"]] },
  { pattern: /硬件|嵌入式|芯片|电子|机械/i, groups: [["硬件", "嵌入式", "芯片", "电子", "机械"]] },
  { pattern: /咨询|战略/i, groups: [["咨询", "战略"]] }
];

const CITIES = [
  "北京", "上海", "广州", "深圳", "杭州", "成都", "重庆", "武汉", "南京", "苏州",
  "西安", "天津", "长沙", "郑州", "青岛", "厦门", "宁波", "合肥", "无锡", "东莞",
  "佛山", "珠海", "济南", "福州", "大连", "沈阳", "昆明", "南昌", "贵阳", "海口"
] as const;

interface OpportunityFilters {
  roleGroups: string[][];
  cities: string[];
  graduationYears: string[];
  batches: string[];
  companies: string[];
  updatedRange?: {
    start: number;
    end: number;
  };
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function normalized(value: string): string {
  return value.toLowerCase().replace(/[\s·•・—_（）()【】\[\]]+/g, "");
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function companyAliases(company: string): string[] {
  const compact = normalized(company);
  const short = compact.replace(/(?:股份)?有限公司$|集团$|公司$/g, "");
  return short.length >= 2 && short !== compact ? [compact, short] : [compact];
}

function shanghaiDayStart(now: Date, dayOffset = 0): number {
  const shanghai = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  return Date.UTC(
    shanghai.getUTCFullYear(),
    shanghai.getUTCMonth(),
    shanghai.getUTCDate() + dayOffset
  ) - SHANGHAI_OFFSET_MS;
}

function updatedRangeFor(prompt: string, now: Date): OpportunityFilters["updatedRange"] {
  const nowMs = now.getTime();
  if (/(?:昨天|昨日)(?:更新|发布|新增|上新)?/.test(prompt)) {
    return { start: shanghaiDayStart(now, -1), end: shanghaiDayStart(now) };
  }
  if (/(?:今天|今日)(?:更新|发布|新增|上新)?/.test(prompt)) {
    return { start: shanghaiDayStart(now), end: nowMs + 1 };
  }
  if (/(?:近|最近|过去)\s*24\s*(?:个)?小时|24\s*小时内/.test(prompt)) {
    return { start: nowMs - DAY_MS, end: nowMs + 1 };
  }
  if (/(?:近|最近|过去)\s*(?:1|一)\s*(?:周|星期)|(?:1|一)\s*(?:周|星期)内/.test(prompt)) {
    return { start: nowMs - 7 * DAY_MS, end: nowMs + 1 };
  }
  const recentDays = prompt.match(/(?:近|最近|过去)\s*(\d{1,2})\s*天/);
  if (recentDays) {
    const days = Math.max(1, Math.min(Number(recentDays[1]), 90));
    return { start: nowMs - days * DAY_MS, end: nowMs + 1 };
  }
  if (/本周(?:更新|发布|新增|上新)?/.test(prompt)) {
    const todayStart = shanghaiDayStart(now);
    const shanghaiToday = new Date(todayStart + SHANGHAI_OFFSET_MS);
    const daysSinceMonday = (shanghaiToday.getUTCDay() + 6) % 7;
    return { start: todayStart - daysSinceMonday * DAY_MS, end: nowMs + 1 };
  }
  return undefined;
}

function filtersFor(prompt: string, opportunities: RecruitmentOpportunity[], now: Date): OpportunityFilters {
  const compactPrompt = normalized(prompt);
  const role = ROLE_FILTERS.find((candidate) => candidate.pattern.test(prompt));
  const graduationYears = Array.from(prompt.matchAll(/(20\d{2})\s*届/g), (match) => `${match[1]}届`);
  const batches = ["春招", "秋招", "实习", "提前批", "补录"].filter((batch) => prompt.includes(batch));
  const companies = Array.from(new Set(opportunities
    .map((item) => item.company)
    .filter((company) => companyAliases(company).some((alias) => compactPrompt.includes(alias)))));
  return {
    roleGroups: role?.groups ?? [],
    cities: CITIES.filter((city) => prompt.includes(city)),
    graduationYears,
    batches,
    companies,
    updatedRange: updatedRangeFor(prompt, now)
  };
}

function mergedFilters(context: OpportunityFilters, current: OpportunityFilters): OpportunityFilters {
  return {
    roleGroups: current.roleGroups.length ? current.roleGroups : context.roleGroups,
    cities: current.cities.length ? current.cities : context.cities,
    graduationYears: current.graduationYears.length ? current.graduationYears : context.graduationYears,
    batches: current.batches.length ? current.batches : context.batches,
    companies: current.companies.length ? current.companies : context.companies,
    updatedRange: current.updatedRange ?? context.updatedRange
  };
}

function searchableText(opportunity: RecruitmentOpportunity): string {
  return normalized([
    opportunity.company,
    opportunity.title,
    opportunity.batch,
    ...opportunity.roleTags,
    ...opportunity.cities,
    ...opportunity.graduationYears
  ].filter(Boolean).join(" "));
}

function matchesFilters(opportunity: RecruitmentOpportunity, filters: OpportunityFilters): boolean {
  const haystack = searchableText(opportunity);
  if (filters.roleGroups.some((group) => !group.some((term) => haystack.includes(normalized(term))))) return false;
  if (filters.cities.length && !filters.cities.some((city) => opportunity.cities.some((item) => item.includes(city)))) return false;
  if (filters.graduationYears.length && !filters.graduationYears.some((year) => opportunity.graduationYears.some((item) => item.includes(year)))) return false;
  if (filters.batches.length && !filters.batches.some((batch) => `${opportunity.batch || ""} ${opportunity.title}`.includes(batch))) return false;
  if (filters.companies.length && !filters.companies.includes(opportunity.company)) return false;
  if (filters.updatedRange) {
    const updatedAt = Date.parse(opportunity.updatedAt || "");
    if (!Number.isFinite(updatedAt) || updatedAt < filters.updatedRange.start || updatedAt >= filters.updatedRange.end) return false;
  }
  return true;
}

function relevance(opportunity: RecruitmentOpportunity, filters: OpportunityFilters): number {
  const title = normalized(opportunity.title);
  const roles = normalized(opportunity.roleTags.join(" "));
  let score = 0;
  for (const group of filters.roleGroups) {
    if (group.some((term) => title.includes(normalized(term)))) score += 12;
    else if (group.some((term) => roles.includes(normalized(term)))) score += 9;
    else score += 4;
  }
  score += filters.cities.filter((city) => opportunity.cities.some((item) => item.includes(city))).length * 3;
  score += filters.graduationYears.filter((year) => opportunity.graduationYears.some((item) => item.includes(year))).length * 3;
  score += filters.batches.filter((batch) => `${opportunity.batch || ""} ${opportunity.title}`.includes(batch)).length * 2;
  if (filters.companies.includes(opportunity.company)) score += 10;
  if (opportunity.status === "closing") score += 1;
  return score;
}

export function searchOpportunitySnapshot(
  snapshot: OpportunityFeedSnapshot,
  prompt: string,
  options: { limit?: number; now?: Date; sourceAvailable?: boolean; contextPrompt?: string } = {}
): ChatOpportunityResults {
  // Chat answers show 5 cards; the job radar agent asks for more so it can filter them itself.
  // No upper cap: "companies I have not applied to" needs every match, not one page.
  const limit = Math.max(1, options.limit ?? 5);
  const now = options.now ?? new Date();
  const currentFilters = filtersFor(prompt, snapshot.opportunities, now);
  const filters = options.contextPrompt
    ? mergedFilters(filtersFor(options.contextPrompt, snapshot.opportunities, now), currentFilters)
    : currentFilters;
  const isBroadSearch = !filters.roleGroups.length
    && !filters.cities.length
    && !filters.graduationYears.length
    && !filters.batches.length
    && !filters.companies.length
    && !filters.updatedRange;
  const deduplicated = new Map<string, RecruitmentOpportunity>();

  for (const opportunity of snapshot.opportunities) {
    if (!validHttpUrl(opportunity.officialUrl)) continue;
    const status = opportunityStatus(opportunity, now);
    if (!AVAILABLE_STATUSES.has(status)) continue;
    const candidate = { ...opportunity, status };
    if (!matchesFilters(candidate, filters)) continue;
    const key = normalized(candidate.officialUrl.replace(/#.*$/, ""));
    if (!deduplicated.has(key)) deduplicated.set(key, candidate);
  }

  const matches = [...deduplicated.values()].sort((left, right) => {
    const score = relevance(right, filters) - relevance(left, filters);
    if (score) return score;
    const freshness = Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || "");
    if (Number.isFinite(freshness) && freshness) return freshness;
    return left.company.localeCompare(right.company, "zh-CN");
  });

  return {
    query: options.contextPrompt ? `${options.contextPrompt}\n${prompt}` : prompt,
    total: matches.length,
    items: matches.slice(0, limit),
    sourceAvailable: options.sourceAvailable ?? true,
    isBroadSearch,
    fetchedAt: snapshot.fetchedAt,
    sourceUpdatedAt: snapshot.sourceUpdatedAt
  };
}

export async function fetchCampusHiringSnapshot(
  sourceUrl: string,
  signal?: AbortSignal
): Promise<OpportunityFeedSnapshot> {
  const response = await fetch(sourceUrl, {
    headers: { accept: "application/json" },
    signal
  });
  if (!response.ok) throw new Error(`岗位数据源请求失败（${response.status}）`);
  return normalizeCampusHiringFeed(await response.json(), sourceUrl);
}

export async function loadCampusHiringSnapshot(
  seedPath: string,
  sourceUrl?: string
): Promise<OpportunityFeedSnapshot> {
  const payload = JSON.parse(await readFile(seedPath, "utf8")) as unknown;
  return normalizeCampusHiringFeed(payload, sourceUrl);
}
