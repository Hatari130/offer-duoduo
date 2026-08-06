import {
  loadJobs,
  loadPendingProgressMatches,
  loadSettings,
  saveJobs,
  savePendingProgressMatches
} from "@/infrastructure/storage/storage";
import {
  DEFAULT_OPPORTUNITY_FEED_URL,
  OPPORTUNITY_SYNC_ALARM_NAME,
  OPPORTUNITY_SYNC_INTERVAL_MINUTES,
  isFeishuOpportunityFeed,
  normalizeFeishuRows,
  saveOpportunitySnapshot,
  type FeishuSheetPayload
} from "@/features/opportunities/opportunities";
import {
  STAGE_LABELS,
  matchExistingApplication,
  observationFromProgress,
  rememberApplicationObservation,
  type ApplicationStage,
  type ExtractedJob,
  type JobApplication,
  type PendingApplicationMatch,
  type ProgressEvidence
} from "@/shared/types";

const PROCESSED_SIGNATURE_TTL = 30 * 60 * 1000;
const processedSignatures = new Map<number, Map<string, number>>();
const processingTabs = new Set<number>();
const pendingUpdates = new Map<
  number,
  { signature: string; pageData: ExtractedJob }
>();

function isFeishuSheetUrl(value: string): boolean {
  return isFeishuOpportunityFeed(value);
}

function sameFeishuDocument(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return (
      leftUrl.hostname === rightUrl.hostname &&
      leftUrl.pathname.replace(/\/$/, "") === rightUrl.pathname.replace(/\/$/, "")
    );
  } catch {
    return false;
  }
}

async function waitForTabReady(tabId: number): Promise<void> {
  const startedAt = Date.now();
  const timeoutAt = startedAt + 30_000;
  while (Date.now() < timeoutAt) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete" || Date.now() - startedAt > 3_000) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("飞书页面加载超时，请确认链接可公开访问");
}

async function extractFeishuSheetRows(): Promise<FeishuSheetPayload> {
  const timeoutAt = Date.now() + 35_000;
  let diagnostic = "飞书表格尚未完成加载";
  const serializableCell = (value: unknown): unknown => {
    if (!value || typeof value !== "object") return value ?? null;
    const record = value as Record<string, unknown>;
    const linkCandidates = [record.url, record.href, record.link, record.hyperlink];
    for (const candidate of linkCandidates) {
      if (typeof candidate === "string" && /^https?:\/\//i.test(candidate)) return candidate;
      if (candidate && typeof candidate === "object") {
        const link = candidate as Record<string, unknown>;
        const url = link.url ?? link.href;
        if (typeof url === "string" && /^https?:\/\//i.test(url)) return url;
      }
    }
    for (const candidate of [record.value, record.text, record.displayValue]) {
      if (typeof candidate === "string" && /^https?:\/\//i.test(candidate)) return candidate;
    }
    for (const candidate of [record.text, record.displayValue, record.value]) {
      if (["string", "number", "boolean"].includes(typeof candidate)) return candidate;
    }
    return null;
  };
  const textOf = (value: unknown) => {
    return String(serializableCell(value) ?? "").trim();
  };

  while (Date.now() < timeoutAt) {
    const app = (globalThis as Record<string, any>).spreadApp;
    const workbook = app?.collaborativeSpread?._spread;
    const activeSheetIndex = Number(workbook?._activeSheetIndex);
    const sheet =
      workbook?.sheets?.[Number.isFinite(activeSheetIndex) ? activeSheetIndex : 0] ||
      workbook?.sheets?.[0];
    const dataModel = sheet?._dataModel;
    const lastRow = Number(sheet?.getLastBlankRowPos?.());
    const lastColumn = Number(sheet?.getLastBlankColPos?.());
    const modelRowCount = Math.max(
      0,
      ...[
        Number(dataModel?.rowCount),
        Number(dataModel?._rowCount),
        Number(dataModel?.getRowCount?.())
      ].filter((value) => Number.isFinite(value) && value > 0)
    );
    const modelColumnCount = Math.max(
      0,
      ...[
        Number(dataModel?.colCount),
        Number(dataModel?.columnCount),
        Number(dataModel?._colCount),
        Number(dataModel?.getColumnCount?.())
      ].filter((value) => Number.isFinite(value) && value > 0)
    );
    const rowCount = Math.min(
      Math.max(
        Number.isFinite(modelRowCount) ? modelRowCount : 0,
        Number.isFinite(lastRow) && lastRow > 0 ? lastRow : 0
      ),
      10_000
    );
    const columnCount = Math.min(
      Math.max(
        Number.isFinite(modelColumnCount) ? modelColumnCount : 0,
        Number.isFinite(lastColumn) && lastColumn > 0 ? lastColumn : 0
      ),
      100
    );

    if (
      dataModel &&
      typeof dataModel.getValue === "function" &&
      rowCount > 0 &&
      columnCount > 0
    ) {
      const rows: unknown[][] = [];
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const row: unknown[] = [];
        let hasValue = false;
        for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
          const value = dataModel.getValue(rowIndex, columnIndex);
          row.push(serializableCell(value));
          if (textOf(value)) hasValue = true;
        }
        if (hasValue || rowIndex < 20) rows.push(row);
      }

      const headerIndex = rows.slice(0, 20).findIndex((row) => {
        const headers = row.map(textOf).join("|");
        return (
          /公司名称|公司/.test(headers) &&
          /招聘岗位|岗位方向|岗位/.test(headers) &&
          /投递链接|网申地址|官方链接|招聘官网|公告链接/.test(headers)
        );
      });
      if (headerIndex >= 0 && rows.length > headerIndex + 1) {
        return {
          title: typeof document !== "undefined" ? document.title : undefined,
          sheetName: String(sheet._name || ""),
          rows: rows.slice(headerIndex)
        };
      }
      diagnostic = `已读取 ${rowCount} 行，但没有识别到“公司、岗位、投递链接”表头`;
    } else if (dataModel) {
      diagnostic = `表格模型已加载，但行列数异常（${rowCount} × ${columnCount}）`;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${diagnostic}，请确认链接可公开访问且表格列名未被修改`);
}

async function readFeishuSheet(sourceUrl: string): Promise<FeishuSheetPayload> {
  if (!isFeishuSheetUrl(sourceUrl)) throw new Error("只支持飞书云表格链接");

  const tabs = await chrome.tabs.query({});
  const existing = tabs
    .filter((tab) => tab.id !== undefined && tab.url && sameFeishuDocument(tab.url, sourceUrl))
    .sort((left, right) => {
      if (left.status === "complete" && right.status !== "complete") return -1;
      if (right.status === "complete" && left.status !== "complete") return 1;
      return Number(Boolean(right.active)) - Number(Boolean(left.active));
    })[0];
  let tabId = existing?.id;
  let createdTab = false;

  if (tabId === undefined) {
    const tab = await chrome.tabs.create({ url: sourceUrl, active: false });
    if (tab.id === undefined) throw new Error("无法打开飞书页面");
    tabId = tab.id;
    createdTab = true;
  }

  try {
    await waitForTabReady(tabId);
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: extractFeishuSheetRows
    });
    if (!result?.result) throw new Error("没有读到飞书表格内容");
    return result.result;
  } finally {
    if (createdTab) {
      await chrome.tabs.remove(tabId).catch(() => undefined);
    }
  }
}

type OpportunitySyncResult = {
  snapshot: ReturnType<typeof normalizeFeishuRows>;
  updateMeta: Awaited<ReturnType<typeof saveOpportunitySnapshot>>;
};

let opportunitySyncInFlight: Promise<OpportunitySyncResult> | null = null;
let opportunitySyncSourceUrl = "";

async function syncOpportunityFeed(sourceUrl: string): Promise<OpportunitySyncResult> {
  if (!isFeishuSheetUrl(sourceUrl)) throw new Error("自动同步目前仅支持飞书云表格链接");
  if (opportunitySyncInFlight) {
    if (opportunitySyncSourceUrl === sourceUrl) return opportunitySyncInFlight;
    await opportunitySyncInFlight.catch(() => undefined);
    return syncOpportunityFeed(sourceUrl);
  }

  const currentSync = (async () => {
    const payload = await readFeishuSheet(sourceUrl);
    const snapshot = normalizeFeishuRows(payload, sourceUrl);
    if (payload.rows.length > 1 && snapshot.opportunities.length === 0) {
      throw new Error("飞书表格已读取，但没有形成有效岗位；已保留上一次缓存");
    }
    const updateMeta = await saveOpportunitySnapshot(snapshot);
    return { snapshot, updateMeta };
  })();
  opportunitySyncInFlight = currentSync;
  opportunitySyncSourceUrl = sourceUrl;

  try {
    return await currentSync;
  } finally {
    if (opportunitySyncInFlight === currentSync) {
      opportunitySyncInFlight = null;
      opportunitySyncSourceUrl = "";
    }
  }
}

async function syncConfiguredOpportunityFeed() {
  const settings = await loadSettings();
  const sourceUrl = settings.opportunityFeedUrl?.trim() || DEFAULT_OPPORTUNITY_FEED_URL;
  if (!isFeishuSheetUrl(sourceUrl)) return;
  await syncOpportunityFeed(sourceUrl);
}

async function ensureOpportunitySyncAlarm() {
  const existing = await chrome.alarms.get(OPPORTUNITY_SYNC_ALARM_NAME);
  if (existing?.periodInMinutes === OPPORTUNITY_SYNC_INTERVAL_MINUTES) return;
  await chrome.alarms.create(OPPORTUNITY_SYNC_ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: OPPORTUNITY_SYNC_INTERVAL_MINUTES
  });
}

function createEventId(): string {
  return `evt_${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeStage(value?: string): ApplicationStage | undefined {
  const stage = (value || "").toLowerCase();
  if (!stage) return undefined;
  if (/offer|录用|待入职|已入职|背调|背景调查|体检|薪酬|签约|审批|发放|意向书/.test(stage)) return "offer";
  if (/终止|结束|拒绝|淘汰|不合适|不通过|未通过|未录用|已撤回/.test(stage)) {
    return "closed";
  }
  if (/面试|一面|二面|三面|hr面|复试|群面|业务面|主管面|终面/.test(stage)) return "interview";
  if (/笔试|测评|在线测试/.test(stage)) return "assessment";
  if (/初筛|复筛|筛选|简历评估|简历审核|资格审核|已投递|投递简历|简历处理中/.test(stage)) {
    return "applied";
  }
  return undefined;
}

function nextActionForStage(stage: ApplicationStage): string {
  if (stage === "assessment") return "完成笔试或测评";
  if (stage === "interview") return "准备下一轮面试";
  if (stage === "offer") return "确认 Offer 与入职安排";
  if (stage === "closed") return "归档本次申请";
  return "关注后续筛选结果";
}

function isProcessed(tabId: number, signature: string): boolean {
  const now = Date.now();
  const cache = processedSignatures.get(tabId);
  if (!cache) return false;
  for (const [cachedSignature, timestamp] of cache) {
    if (now - timestamp > PROCESSED_SIGNATURE_TTL) cache.delete(cachedSignature);
  }
  return cache.has(signature);
}

function markProcessed(tabId: number, signature: string): void {
  const cache = processedSignatures.get(tabId) || new Map<string, number>();
  cache.set(signature, Date.now());
  processedSignatures.set(tabId, cache);
}

function stageFromEvidence(evidence: ProgressEvidence): ApplicationStage | undefined {
  return normalizeStage(evidence.terminalStatus || evidence.currentStage);
}

function normalizeExternalStage(value?: string): string {
  return (value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/(?:进行中|中)$/g, "");
}

function pendingMatchKey(match: PendingApplicationMatch): string {
  return [
    match.signature,
    match.observation.position,
    match.observation.city,
    match.externalStage,
    match.candidates.map((candidate) => candidate.localJobId).join(",")
  ].join("|");
}

async function appendPendingProgressMatches(
  matches: PendingApplicationMatch[]
): Promise<void> {
  if (!matches.length) return;
  const existing = await loadPendingProgressMatches();
  const incomingKeys = new Set(matches.map(pendingMatchKey));
  const next = [
    ...existing.filter((match) => !incomingKeys.has(pendingMatchKey(match))),
    ...matches
  ].slice(-20);
  await savePendingProgressMatches(next);
}

function createPendingProgressMatch(
  signature: string,
  observation: ReturnType<typeof observationFromProgress>,
  evidence: ProgressEvidence,
  match: ReturnType<typeof matchExistingApplication>,
  suggestedStage: ApplicationStage,
  createdAt: string
): PendingApplicationMatch | undefined {
  if (match.kind !== "ambiguous" || !match.best) return undefined;
  const candidates = [match.best, ...match.alternatives].map((candidate) => ({
    localJobId: candidate.job.id,
    company: candidate.job.company,
    position: candidate.job.position,
    city: candidate.job.city,
    currentStage: candidate.job.stage,
    externalStage: candidate.job.externalStage,
    score: candidate.score,
    reasons: candidate.reasons
  }));
  return {
    id: createEventId(),
    signature,
    observation,
    externalStage: evidence.terminalStatus || evidence.currentStage,
    suggestedStage,
    candidates,
    createdAt
  };
}

async function updateProgressFromPage(
  tabId: number,
  signature: string,
  pageData: ExtractedJob
): Promise<void> {
  if (isProcessed(tabId, signature)) return;
  const settings = await loadSettings();
  if (settings.autoMonitorEnabled === false) return;

  const evidenceItems = (pageData.progressEvidence || []).filter(
    (evidence) =>
      evidence.confidence >= 0.8 &&
      evidence.position &&
      stageFromEvidence(evidence)
  );
  if (!evidenceItems.length) {
    markProcessed(tabId, signature);
    return;
  }

  const jobs = await loadJobs();
  const now = new Date().toISOString();
  let nextJobs = [...jobs];
  let updatedCount = 0;
  let ambiguousCount = 0;
  const updatedJobIds = new Set<string>();
  const pendingMatches: PendingApplicationMatch[] = [];

  for (const evidence of evidenceItems) {
    const observation = observationFromProgress(pageData, {
      ...evidence,
      company: evidence.company || pageData.company,
      city: evidence.city || pageData.city,
      appliedAt: evidence.appliedAt || pageData.appliedAt
    });
    const match = matchExistingApplication(nextJobs, observation);
    if (match.kind === "ambiguous") {
      ambiguousCount += 1;
      const pending = createPendingProgressMatch(
        signature,
        observation,
        evidence,
        match,
        stageFromEvidence(evidence)!,
        now
      );
      if (pending) pendingMatches.push(pending);
      continue;
    }
    if (match.kind !== "matched" || !match.best || updatedJobIds.has(match.best.job.id)) continue;

    const job = match.best.job;
    const nextStage = stageFromEvidence(evidence)!;
    const externalStage = evidence.terminalStatus || evidence.currentStage;
    const stageChanged = job.stage !== nextStage;
    const externalStageChanged =
      Boolean(externalStage) &&
      normalizeExternalStage(job.externalStage) !== normalizeExternalStage(externalStage);
    const appliedAt = evidenceItems.length === 1 ? pageData.appliedAt : undefined;
    const appliedAtChanged = Boolean(appliedAt) && job.appliedAt !== appliedAt;
    if (!stageChanged && !externalStageChanged && !appliedAtChanged) continue;

    const eventTitle = stageChanged
      ? `自动同步：${STAGE_LABELS[job.stage]} → ${STAGE_LABELS[nextStage]}`
      : externalStageChanged
        ? `网站进度：${job.externalStage || STAGE_LABELS[job.stage]} → ${externalStage}`
        : `补充投递时间：${appliedAt}`;
    const updated: JobApplication = {
      ...rememberApplicationObservation(job, observation),
      stage: nextStage,
      externalStage: externalStage || job.externalStage,
      appliedAt: appliedAt || job.appliedAt,
      nextAction: stageChanged ? nextActionForStage(nextStage) : job.nextAction,
      updatedAt: now,
      events: [
        ...job.events,
        {
          id: createEventId(),
          type: stageChanged || externalStageChanged ? "stage_changed" : "updated",
          title: eventTitle,
          occurredAt: now,
          sourceUrl: pageData.sourceUrl
        }
      ]
    };
    nextJobs = nextJobs.map((item) => (item.id === job.id ? updated : item));
    updatedJobIds.add(job.id);
    updatedCount += 1;
  }

  if (!updatedCount) {
    markProcessed(tabId, signature);
    await appendPendingProgressMatches(pendingMatches);
    if (ambiguousCount > 0) {
      await chrome.storage.local.set({
        "offerflow.autoSyncNotice": {
          count: ambiguousCount,
          message: `发现 ${ambiguousCount} 条进度变化，但无法唯一关联已有岗位，请手动确认`,
          occurredAt: now
        }
      });
    }
    return;
  }

  await saveJobs(nextJobs);
  markProcessed(tabId, signature);
  await appendPendingProgressMatches(pendingMatches);
  await chrome.storage.local.set({
    "offerflow.autoSyncNotice": {
      count: updatedCount,
      message: `自动发现 ${updatedCount} 条投递进度更新${ambiguousCount ? `，另有 ${ambiguousCount} 条需要确认` : ""}`,
      occurredAt: now
    }
  });
  await chrome.action.setBadgeBackgroundColor({ color: "#D9FF43", tabId });
  await chrome.action.setBadgeText({ text: String(updatedCount), tabId });
}

async function enqueueProgressUpdate(
  tabId: number,
  signature: string,
  pageData: ExtractedJob
): Promise<void> {
  if (isProcessed(tabId, signature)) return;
  pendingUpdates.set(tabId, { signature, pageData });
  if (processingTabs.has(tabId)) return;

  processingTabs.add(tabId);
  let lastError: unknown;
  try {
    while (pendingUpdates.has(tabId)) {
      const pending = pendingUpdates.get(tabId)!;
      pendingUpdates.delete(tabId);
      try {
        await updateProgressFromPage(tabId, pending.signature, pending.pageData);
      } catch (error) {
        lastError = error;
      }
    }
  } finally {
    processingTabs.delete(tabId);
  }
  if (lastError) throw lastError;
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  await ensureOpportunitySyncAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  await ensureOpportunitySyncAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== OPPORTUNITY_SYNC_ALARM_NAME) return;
  void syncConfiguredOpportunityFeed().catch((error) => {
    console.warn("OfferFlow opportunity sync failed", error);
  });
});

void ensureOpportunitySyncAlarm().catch((error) => {
  console.warn("OfferFlow could not schedule opportunity sync", error);
});

function isInjectableWebPage(url?: string): boolean {
  return Boolean(url && /^https?:\/\//i.test(url));
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !isInjectableWebPage(tab.url)) {
    console.info("OfferFlow skipped an unsupported page", { url: tab.url });
    return;
  }

  const toggle = () =>
    chrome.tabs.sendMessage(tab.id!, { type: "OFFERFLOW_TOGGLE_OVERLAY" });

  try {
    await toggle();
  } catch (initialError) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["extraction-rules.js", "form-adapters.js", "content.js"]
      });
      await toggle();
    } catch (injectionError) {
      console.warn("OfferFlow could not inject into the current page", {
        url: tab.url,
        initialError,
        injectionError
      });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OFFERFLOW_SYNC_OPPORTUNITY_FEED" && typeof message.url === "string") {
    syncOpportunityFeed(message.url)
      .then(({ snapshot, updateMeta }) => sendResponse({ ok: true, snapshot, updateMeta }))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "飞书表格同步失败"
        });
      });
    return true;
  }

  if (message?.type === "OFFERFLOW_READ_FEISHU_SHEET" && typeof message.url === "string") {
    readFeishuSheet(message.url)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "飞书表格同步失败"
        });
      });
    return true;
  }

  if (
    message?.type !== "OFFERFLOW_PROGRESS_PAGE_CHANGED" ||
    !sender.tab?.id ||
    !message.data ||
    !message.signature
  ) {
    return;
  }

  enqueueProgressUpdate(sender.tab.id, message.signature, message.data)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.warn("OfferFlow auto monitor failed", error);
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "自动同步失败"
      });
    });
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  processedSignatures.delete(tabId);
  processingTabs.delete(tabId);
  pendingUpdates.delete(tabId);
});
