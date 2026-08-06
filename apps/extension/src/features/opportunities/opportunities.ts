import type {
  OpportunityFeedSnapshot,
  OpportunityStatus,
  RecruitmentOpportunity
} from "@/shared/types";

export const OPPORTUNITY_CACHE_KEY = "offerflow.opportunities";
export const OPPORTUNITY_UPDATE_META_KEY = "offerflow.opportunityUpdates";
export const OPPORTUNITY_SYNC_ALARM_NAME = "offerflow.syncOpportunities";
export const OPPORTUNITY_SYNC_INTERVAL_MINUTES = 5;
export const DEFAULT_OPPORTUNITY_FEED_URL =
  "https://zcnj0ltp8sdn.feishu.cn/wiki/MkhNwsXtXiugeEk81MMcs7RNnyh";

type RawOpportunity = Partial<RecruitmentOpportunity> & Record<string, unknown>;
export type FeishuSheetPayload = {
  title?: string;
  sheetName?: string;
  rows: unknown[][];
};
type FeishuSheetResponse = {
  ok?: boolean;
  snapshot?: OpportunityFeedSnapshot;
  updateMeta?: OpportunityUpdateMeta;
  error?: string;
};

export interface OpportunityUpdateMeta {
  unreadCount: number;
  unreadOpportunityIds: string[];
  unreadRemovedOpportunityIds: string[];
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  lastChangedAt?: string;
  lastSyncedAt?: string;
}

export interface OpportunitySnapshotDiff {
  addedIds: string[];
  updatedIds: string[];
  removedIds: string[];
}

export const EMPTY_OPPORTUNITY_UPDATE_META: OpportunityUpdateMeta = {
  unreadCount: 0,
  unreadOpportunityIds: [],
  unreadRemovedOpportunityIds: [],
  addedCount: 0,
  updatedCount: 0,
  removedCount: 0
};

const clean = (value: unknown) => String(value ?? "").trim();

const list = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value)
    .split(/[,，、;；|｜]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const dateKey = (value: unknown, preferLast = false) => {
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
    return dateKey(numeric, preferLast);
  }

  const matches = Array.from(
    text.matchAll(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/g)
  );
  const match = preferLast ? matches.at(-1) : matches[0];
  if (!match) return undefined;
  const [, year, month, day] = match;
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
  const deadline = dateKey(
    clean(raw.deadline || raw["截止日期"] || raw["截止时间"]),
    true
  );
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
    sourceUpdatedAt: deduplicated
      .map((item) => item.updatedAt)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => right.localeCompare(left))[0],
    sourceUrl
  };
}

const splitRoleText = (value: string) =>
  value
    .replace(/^行业\s*[：:]\s*[^；;]+[；;]\s*/i, "")
    .split(/[,，、;；|｜/\\\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

/** Keep the full source value in storage and only shorten it for card presentation. */
export function opportunityDisplayTitle(opportunity: RecruitmentOpportunity): string {
  const rawTitle = opportunity.title.trim();
  if (rawTitle.length <= 28) return rawTitle;

  const roleParts = splitRoleText(rawTitle);
  if (roleParts.length > 1) {
    const visibleParts = roleParts.slice(0, 2).map((item) =>
      item.length > 18 ? `${item.slice(0, 18)}…` : item
    );
    return `${visibleParts.join("、")}${roleParts.length > 2 ? `等 ${roleParts.length} 类岗位` : ""}`;
  }

  const conciseTags = opportunity.roleTags
    .flatMap(splitRoleText)
    .filter((item) => item.length <= 22)
    .slice(0, 2);
  if (conciseTags.length) {
    return `${conciseTags.join("、")}${opportunity.roleTags.length > conciseTags.length ? "等岗位" : ""}`;
  }
  return `${rawTitle.slice(0, 30)}…`;
}

export function opportunityStatus(opportunity: RecruitmentOpportunity): OpportunityStatus {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const soon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
  const soonKey = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;

  if (opportunity.status === "closed") return "closed";
  if (opportunity.openAt && opportunity.openAt > todayKey) return "upcoming";
  if (opportunity.deadline && opportunity.deadline < todayKey) return "closed";
  if (opportunity.deadline && opportunity.deadline <= soonKey) return "closing";
  if (opportunity.status === "upcoming") return "upcoming";
  if (opportunity.status === "closing") return "closing";
  if (opportunity.status === "open") return "open";
  if (opportunity.status === "ongoing") return "ongoing";
  if (!opportunity.openAt && !opportunity.deadline) return "ongoing";
  return "open";
}

const hasChromeStorage = () =>
  typeof chrome !== "undefined" && Boolean(chrome.storage?.local);

const comparableOpportunity = (opportunity: RecruitmentOpportunity) =>
  JSON.stringify({
    company: opportunity.company,
    title: opportunity.title,
    batch: opportunity.batch || "",
    status: opportunity.status || "",
    openAt: opportunity.openAt || "",
    deadline: opportunity.deadline || "",
    graduationYears: opportunity.graduationYears,
    roleTags: opportunity.roleTags,
    cities: opportunity.cities,
    officialUrl: opportunity.officialUrl,
    sourceUrl: opportunity.sourceUrl || "",
    sourceName: opportunity.sourceName || "",
    verifiedAt: opportunity.verifiedAt || "",
    updatedAt: opportunity.updatedAt || ""
  });

export function diffOpportunitySnapshots(
  previous: OpportunityFeedSnapshot,
  next: OpportunityFeedSnapshot
): OpportunitySnapshotDiff {
  const previousById = new Map(previous.opportunities.map((item) => [item.id, item]));
  const nextById = new Map(next.opportunities.map((item) => [item.id, item]));
  const addedIds: string[] = [];
  const updatedIds: string[] = [];
  const removedIds: string[] = [];

  for (const [id, item] of nextById) {
    const oldItem = previousById.get(id);
    if (!oldItem) addedIds.push(id);
    else if (comparableOpportunity(oldItem) !== comparableOpportunity(item)) updatedIds.push(id);
  }
  for (const id of previousById.keys()) {
    if (!nextById.has(id)) removedIds.push(id);
  }
  return { addedIds, updatedIds, removedIds };
}

export function nextOpportunityUpdateMeta(
  previousSnapshot: OpportunityFeedSnapshot,
  nextSnapshot: OpportunityFeedSnapshot,
  previousMeta: OpportunityUpdateMeta = EMPTY_OPPORTUNITY_UPDATE_META
): OpportunityUpdateMeta {
  const diff = diffOpportunitySnapshots(previousSnapshot, nextSnapshot);
  const hasBaseline = Boolean(
    previousSnapshot.fetchedAt || previousSnapshot.sourceUrl || previousSnapshot.opportunities.length
  );
  const changedAt = nextSnapshot.fetchedAt || new Date().toISOString();
  const newChangedIds = hasBaseline ? [...diff.addedIds, ...diff.updatedIds] : [];
  const newRemovedIds = hasBaseline ? diff.removedIds : [];
  const unreadOpportunityIds = Array.from(
    new Set([...(previousMeta.unreadOpportunityIds || []), ...newChangedIds])
  );
  const unreadRemovedOpportunityIds = Array.from(
    new Set([...(previousMeta.unreadRemovedOpportunityIds || []), ...newRemovedIds])
  );
  const hasChanges = newChangedIds.length > 0 || newRemovedIds.length > 0;

  return {
    unreadCount: unreadOpportunityIds.length + unreadRemovedOpportunityIds.length,
    unreadOpportunityIds,
    unreadRemovedOpportunityIds,
    addedCount: hasBaseline ? diff.addedIds.length : 0,
    updatedCount: hasBaseline ? diff.updatedIds.length : 0,
    removedCount: hasBaseline ? diff.removedIds.length : 0,
    lastChangedAt: hasChanges ? changedAt : previousMeta.lastChangedAt,
    lastSyncedAt: changedAt
  };
}

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

export async function loadOpportunityUpdateMeta(): Promise<OpportunityUpdateMeta> {
  if (!hasChromeStorage()) {
    const value = localStorage.getItem(OPPORTUNITY_UPDATE_META_KEY);
    return value
      ? { ...EMPTY_OPPORTUNITY_UPDATE_META, ...JSON.parse(value) }
      : { ...EMPTY_OPPORTUNITY_UPDATE_META };
  }
  const result = await chrome.storage.local.get(OPPORTUNITY_UPDATE_META_KEY);
  return {
    ...EMPTY_OPPORTUNITY_UPDATE_META,
    ...(result[OPPORTUNITY_UPDATE_META_KEY] as OpportunityUpdateMeta | undefined)
  };
}

export async function saveOpportunitySnapshot(
  snapshot: OpportunityFeedSnapshot
): Promise<OpportunityUpdateMeta> {
  const [previousSnapshot, previousMeta] = await Promise.all([
    loadOpportunityCache(),
    loadOpportunityUpdateMeta()
  ]);
  const updateMeta = nextOpportunityUpdateMeta(previousSnapshot, snapshot, previousMeta);
  if (!hasChromeStorage()) {
    localStorage.setItem(OPPORTUNITY_CACHE_KEY, JSON.stringify(snapshot));
    localStorage.setItem(OPPORTUNITY_UPDATE_META_KEY, JSON.stringify(updateMeta));
    return updateMeta;
  }
  await chrome.storage.local.set({
    [OPPORTUNITY_CACHE_KEY]: snapshot,
    [OPPORTUNITY_UPDATE_META_KEY]: updateMeta
  });
  return updateMeta;
}

export async function markOpportunityUpdatesRead(): Promise<void> {
  const previous = await loadOpportunityUpdateMeta();
  const next: OpportunityUpdateMeta = {
    ...previous,
    unreadCount: 0,
    unreadOpportunityIds: [],
    unreadRemovedOpportunityIds: []
  };
  if (!hasChromeStorage()) {
    localStorage.setItem(OPPORTUNITY_UPDATE_META_KEY, JSON.stringify(next));
    return;
  }
  await chrome.storage.local.set({ [OPPORTUNITY_UPDATE_META_KEY]: next });
}

export async function refreshOpportunityFeed(
  configuredUrl?: string
): Promise<OpportunityFeedSnapshot> {
  const configuredSourceUrl = configuredUrl?.trim();
  if (isFeishuOpportunityFeed(configuredSourceUrl)) {
    const sourceUrl = configuredSourceUrl!;
    if (typeof chrome === "undefined" || typeof chrome.runtime?.sendMessage !== "function") {
      throw new Error("飞书表格需要在 Chrome 扩展中同步");
    }
    const response = (await chrome.runtime.sendMessage({
      type: "OFFERFLOW_SYNC_OPPORTUNITY_FEED",
      url: sourceUrl
    })) as FeishuSheetResponse;
    if (!response?.ok || !response.snapshot) {
      throw new Error(response?.error || "飞书表格读取失败");
    }
    return response.snapshot;
  }

  const sourceUrl = configuredSourceUrl || new URL("opportunities.json", window.location.href).href;
  const response = await fetch(sourceUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`机会数据源读取失败（${response.status}）`);
  const payload = (await response.json()) as RawOpportunity[] | Record<string, unknown>;
  const rawItems = Array.isArray(payload)
    ? payload
    : ([payload.opportunities, payload.items, payload.records, payload.data].find(Array.isArray) as
        | RawOpportunity[]
        | undefined) || [];
  const opportunities = rawItems
    .map((item) => {
      const fields = item && typeof item === "object" && "fields" in item
        ? (item.fields as RawOpportunity)
        : item;
      return normalizeOpportunity(fields);
    })
    .filter((item): item is RecruitmentOpportunity => Boolean(item));
  const deduplicated = opportunities.filter(
    (item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index
  );
  const snapshot: OpportunityFeedSnapshot = {
    opportunities: deduplicated,
    fetchedAt: new Date().toISOString(),
    sourceUpdatedAt: Array.isArray(payload) ? undefined : clean(payload.updatedAt) || undefined,
    sourceUrl
  };
  await saveOpportunitySnapshot(snapshot);
  return snapshot;
}
