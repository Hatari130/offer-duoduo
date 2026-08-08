import type {
  OpportunityFeedSnapshot,
  OpportunityStatus,
  RecruitmentOpportunity
} from "@/shared/types";

export const OPPORTUNITY_CACHE_KEY = "offerflow.opportunities";
export const DEFAULT_OPPORTUNITY_FEED_URL =
  "https://zcnj0ltp8sdn.feishu.cn/wiki/MkhNwsXtXiugeEk81MMcs7RNnyh";

type RawOpportunity = Partial<RecruitmentOpportunity> & Record<string, unknown>;
type FeishuSheetPayload = {
  title?: string;
  sheetName?: string;
  rows: unknown[][];
};
type FeishuSheetResponse = {
  ok?: boolean;
  data?: FeishuSheetPayload;
  error?: string;
};

const clean = (value: unknown) => String(value ?? "").trim();

const list = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value)
    .split(/[,，、;；|｜]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const dateKey = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 24 * 60 * 60 * 1000);
    if (value >= 20000 && value <= 100000 && !Number.isNaN(date.getTime())) {
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
        date.getUTCDate()
      ).padStart(2, "0")}`;
    }
  }

  const text = clean(value);
  const numeric = Number(text);
  if (/^\d{4,6}(?:\.0+)?$/.test(text) && numeric >= 20000 && numeric <= 100000) {
    return dateKey(numeric);
  }

  // "2026-07-01 至 2026-08-20" means the campaign closes at the end of the
  // range, so prefer the last date found in the cell.
  const matches = [...text.matchAll(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/g)];
  if (!matches.length) return undefined;
  const [, year, month, day] = matches[matches.length - 1];
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

const hash = (value: string) => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
};

const validHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const isFeishuHost = (hostname: string) =>
  hostname === "feishu.cn" ||
  hostname.endsWith(".feishu.cn") ||
  hostname === "larksuite.com" ||
  hostname.endsWith(".larksuite.com");

export function isFeishuOpportunityFeed(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      isFeishuHost(url.hostname) &&
      /\/(wiki|sheets)\//i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function normalizeOpportunity(raw: RawOpportunity): RecruitmentOpportunity | undefined {
  const company = clean(raw.company || raw["公司"] || raw["公司名称"]);
  const title = clean(raw.title || raw["招聘项目"] || raw["招聘批次"] || raw["标题"]);
  const officialUrl = clean(
    raw.officialUrl || raw["官方链接"] || raw["招聘官网"] || raw["网申地址"]
  );
  if (!company || !title || !validHttpUrl(officialUrl)) return undefined;

  const batch = clean(raw.batch || raw["批次"]) || undefined;
  const openAt = dateKey(clean(raw.openAt || raw["开放日期"] || raw["开始时间"]));
  const deadline = dateKey(clean(raw.deadline || raw["截止日期"] || raw["截止时间"]));
  const sourceUrl = clean(raw.sourceUrl || raw["信息来源"] || raw["来源链接"]);
  const rawStatus = clean(raw.status || raw["状态"]);
  const statusAliases: Record<string, OpportunityStatus> = {
    upcoming: "upcoming",
    "即将开放": "upcoming",
    "未开放": "upcoming",
    open: "open",
    "开放中": "open",
    "正在招聘": "open",
    "招聘中": "open",
    closing: "closing",
    "即将截止": "closing",
    closed: "closed",
    "已结束": "closed",
    "已截止": "closed",
    ongoing: "ongoing",
    "长期招聘": "ongoing",
    "长期有效": "ongoing"
  };
  const status = statusAliases[rawStatus];
  const identity = `${company}|${title}|${batch || ""}|${officialUrl}`.toLowerCase();

  return {
    id: clean(raw.id) || `opp_${hash(identity)}`,
    company,
    title,
    batch,
    status,
    openAt,
    deadline,
    graduationYears: list(raw.graduationYears || raw["面向届次"] || raw["届次"]),
    roleTags: list(raw.roleTags || raw["岗位方向"] || raw["岗位"]),
    cities: list(raw.cities || raw["城市"] || raw["工作地点"]),
    officialUrl,
    sourceUrl: validHttpUrl(sourceUrl) ? sourceUrl : undefined,
    sourceName: clean(raw.sourceName || raw["来源名称"]) || undefined,
    verifiedAt: clean(raw.verifiedAt || raw["核验时间"]) || undefined,
    updatedAt: clean(raw.updatedAt || raw["更新时间"]) || undefined
  };
}

const normalizeHeader = (value: unknown) =>
  clean(value).replace(/\s+/g, "").replace(/[（）()]/g, "");

const cellText = (value: unknown) => {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return clean(record.text || record.value || record.displayValue);
  }
  return clean(value);
};

const columnIndex = (headers: unknown[], aliases: string[]) => {
  const normalizedHeaders = headers.map(normalizeHeader);
  const normalizedAliases = aliases.map(normalizeHeader);
  return normalizedHeaders.findIndex((header) =>
    normalizedAliases.some((alias) => header === alias || header.includes(alias))
  );
};

const roleTagsFromCell = (value: unknown) => {
  const roleText = cellText(value)
    .replace(/^行业\s*[：:]\s*[^；;]+[；;]\s*/i, "")
    .trim();
  return list(roleText).slice(0, 4);
};

export function normalizeFeishuRows(
  payload: FeishuSheetPayload,
  sourceUrl: string
): OpportunityFeedSnapshot {
  const [headers = [], ...rows] = payload.rows;
  const columns = {
    updatedAt: columnIndex(headers, ["更新时间"]),
    company: columnIndex(headers, ["公司名称", "公司"]),
    deadline: columnIndex(headers, ["投递起止时间", "截止时间", "截止日期"]),
    batch: columnIndex(headers, ["招聘类型", "批次"]),
    role: columnIndex(headers, ["招聘岗位", "岗位方向", "岗位"]),
    city: columnIndex(headers, ["城市", "工作地点"]),
    notice: columnIndex(headers, ["公告链接", "信息来源", "来源链接"]),
    apply: columnIndex(headers, ["投递链接", "网申地址", "官方链接", "招聘官网"])
  };
  const get = (row: unknown[], index: number) => (index >= 0 ? row[index] : undefined);
  const title = clean(payload.title || payload.sheetName || "校招机会")
    .replace(/\s*[-—]\s*飞书云文档\s*$/i, "")
    .trim();

  const opportunities = rows
    .filter((row) => row.some((value) => cellText(value)))
    .map((row) => {
      const noticeUrl = cellText(get(row, columns.notice));
      const applyUrl = cellText(get(row, columns.apply));
      const company = cellText(get(row, columns.company));
      const role = cellText(get(row, columns.role));
      const roleTitle = role.replace(/^行业\s*[：:]\s*[^；;]+[；;]\s*/i, "").trim() || role;
      return normalizeOpportunity({
        company,
        title: roleTitle,
        batch: cellText(get(row, columns.batch)),
        deadline: cellText(get(row, columns.deadline)),
        cities: list(cellText(get(row, columns.city))),
        roleTags: roleTagsFromCell(role),
        officialUrl: applyUrl || noticeUrl,
        sourceUrl: noticeUrl,
        sourceName: `飞书表格 · ${title}`,
        updatedAt: dateKey(get(row, columns.updatedAt))
      });
    })
    .filter((item): item is RecruitmentOpportunity => Boolean(item));
  const deduplicated = opportunities.filter(
    (item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index
  );

  return {
    opportunities: deduplicated,
    fetchedAt: new Date().toISOString(),
    sourceUpdatedAt: deduplicated.find((item) => item.updatedAt)?.updatedAt,
    sourceUrl
  };
}

async function readFeishuSheet(sourceUrl: string): Promise<FeishuSheetPayload> {
  if (typeof chrome === "undefined" || typeof chrome.runtime?.sendMessage !== "function") {
    throw new Error("飞书表格需要在 Chrome 扩展中同步");
  }
  const response = (await chrome.runtime.sendMessage({
    type: "OFFERFLOW_READ_FEISHU_SHEET",
    url: sourceUrl
  })) as FeishuSheetResponse;
  if (!response?.ok || !response.data?.rows) {
    throw new Error(response?.error || "飞书表格读取失败");
  }
  return response.data;
}

export { opportunityStatus } from "@offerflow/domain";

const hasChromeStorage = () =>
  typeof chrome !== "undefined" && Boolean(chrome.storage?.local);

export async function loadOpportunityCache(): Promise<OpportunityFeedSnapshot> {
  if (!hasChromeStorage()) {
    const value = localStorage.getItem(OPPORTUNITY_CACHE_KEY);
    return value ? JSON.parse(value) : { opportunities: [] };
  }
  const result = await chrome.storage.local.get(OPPORTUNITY_CACHE_KEY);
  return (result[OPPORTUNITY_CACHE_KEY] as OpportunityFeedSnapshot | undefined) ?? {
    opportunities: []
  };
}

export async function writeOpportunityCache(snapshot: OpportunityFeedSnapshot): Promise<void> {
  if (!hasChromeStorage()) {
    localStorage.setItem(OPPORTUNITY_CACHE_KEY, JSON.stringify(snapshot));
    return;
  }
  await chrome.storage.local.set({ [OPPORTUNITY_CACHE_KEY]: snapshot });
}

export function normalizeOpportunityFeed(
  payload: unknown,
  sourceUrl: string
): OpportunityFeedSnapshot {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const rawItems = Array.isArray(payload)
    ? payload
    : ([record.opportunities, record.items, record.records, record.data].find(Array.isArray) as
        | unknown[]
        | undefined) || [];
  const opportunities = rawItems
    .map((item) => {
      const itemRecord = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const fields = itemRecord && "fields" in itemRecord
        ? (itemRecord.fields as RawOpportunity)
        : (item as RawOpportunity);
      return normalizeOpportunity(fields);
    })
    .filter((item): item is RecruitmentOpportunity => Boolean(item));
  const deduplicated = opportunities.filter(
    (item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index
  );
  return {
    opportunities: deduplicated,
    fetchedAt: new Date().toISOString(),
    sourceUpdatedAt: Array.isArray(payload) ? undefined : clean(record.updatedAt) || undefined,
    sourceUrl
  };
}

export async function refreshOpportunityFeed(
  configuredUrl?: string
): Promise<OpportunityFeedSnapshot> {
  const configuredSourceUrl = configuredUrl?.trim();
  if (isFeishuOpportunityFeed(configuredSourceUrl)) {
    const sourceUrl = configuredSourceUrl!;
    const payload = await readFeishuSheet(sourceUrl);
    const snapshot = normalizeFeishuRows(payload, sourceUrl);
    await writeOpportunityCache(snapshot);
    return snapshot;
  }

  const sourceUrl = configuredSourceUrl || new URL("opportunities.json", window.location.href).href;
  const response = await fetch(sourceUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`机会数据源读取失败（${response.status}）`);
  const payload = (await response.json()) as unknown;
  const snapshot = normalizeOpportunityFeed(payload, sourceUrl);
  await writeOpportunityCache(snapshot);
  return snapshot;
}
