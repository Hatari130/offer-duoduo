import { loadJobs, loadSettings, saveJobs } from "@/infrastructure/storage/storage";
import {
  STAGE_LABELS,
  type ApplicationStage,
  type ExtractedJob,
  type JobApplication,
  type ProgressEvidence
} from "@/shared/types";

const PROCESSED_SIGNATURE_TTL = 30 * 60 * 1000;
const processedSignatures = new Map<number, Map<string, number>>();
const processingTabs = new Set<number>();
const pendingUpdates = new Map<
  number,
  { signature: string; pageData: ExtractedJob }
>();

type FeishuSheetPayload = {
  title?: string;
  sheetName?: string;
  rows: unknown[][];
};

function isFeishuSheetUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const supportedHost =
      host === "feishu.cn" ||
      host.endsWith(".feishu.cn") ||
      host === "larksuite.com" ||
      host.endsWith(".larksuite.com");
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      supportedHost &&
      /\/(wiki|sheets)\//i.test(url.pathname)
    );
  } catch {
    return false;
  }
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

async function waitForTabComplete(tabId: number): Promise<void> {
  const timeoutAt = Date.now() + 30_000;
  while (Date.now() < timeoutAt) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("飞书页面加载超时，请确认链接可公开访问");
}

async function extractFeishuSheetRows(): Promise<FeishuSheetPayload> {
  const timeoutAt = Date.now() + 25_000;
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

    if (
      dataModel &&
      typeof dataModel.getValue === "function" &&
      lastRow > 0 &&
      lastColumn > 0
    ) {
      const rows: unknown[][] = [];
      const rowCount = Math.min(lastRow, 1000);
      const columnCount = Math.min(lastColumn, 100);
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const row: unknown[] = [];
        let hasValue = false;
        for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
          const value = dataModel.getValue(rowIndex, columnIndex);
          row.push(value ?? null);
          if (value !== null && value !== undefined && String(value).trim()) {
            hasValue = true;
          }
        }
        if (hasValue || rowIndex === 0) rows.push(row);
      }

      const headers = rows[0]?.map((value) => String(value ?? "")).join("|") || "";
      if (rows.length > 1 && /公司名称|招聘岗位|公告链接/.test(headers)) {
        return {
          title: typeof document !== "undefined" ? document.title : undefined,
          sheetName: String(sheet._name || ""),
          rows
        };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("没有读到飞书表格内容，请确认页面有可见的表格数据");
}

async function readFeishuSheet(sourceUrl: string): Promise<FeishuSheetPayload> {
  if (!isFeishuSheetUrl(sourceUrl)) throw new Error("只支持飞书云表格链接");

  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(
    (tab) => tab.id !== undefined && tab.url && sameFeishuDocument(tab.url, sourceUrl)
  );
  let tabId = existing?.id;
  let createdTab = false;

  if (tabId === undefined) {
    const tab = await chrome.tabs.create({ url: sourceUrl, active: false });
    if (tab.id === undefined) throw new Error("无法打开飞书页面");
    tabId = tab.id;
    createdTab = true;
  }

  try {
    await waitForTabComplete(tabId);
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

function createEventId(): string {
  return `evt_${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeStage(value?: string): ApplicationStage | undefined {
  const stage = (value || "").toLowerCase();
  if (!stage) return undefined;
  if (/offer|录用|待入职|已入职/.test(stage)) return "offer";
  if (/终止|结束|拒绝|淘汰|不合适|不通过|未通过|未录用|已撤回/.test(stage)) {
    return "closed";
  }
  if (/面试|一面|二面|三面|hr面|复试/.test(stage)) return "interview";
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

async function updateProgressFromPage(
  tabId: number,
  signature: string,
  pageData: ExtractedJob
): Promise<void> {
  if (isProcessed(tabId, signature)) return;
  const settings = await loadSettings();
  if (settings.autoMonitorEnabled === false) return;

  const evidenceItems = (pageData.progressEvidence || []).filter(
    (evidence) => evidence.confidence >= 0.8 && evidence.jobId && stageFromEvidence(evidence)
  );
  if (!evidenceItems.length) {
    markProcessed(tabId, signature);
    return;
  }

  const jobs = await loadJobs();
  const now = new Date().toISOString();
  let nextJobs = [...jobs];
  let updatedCount = 0;

  for (const evidence of evidenceItems) {
    const normalizedJobId = evidence.jobId!.trim().toLowerCase();
    const matches = nextJobs.filter(
      (job) => job.jobId?.trim().toLowerCase() === normalizedJobId
    );
    if (matches.length !== 1) continue;

    const job = matches[0];
    const nextStage = stageFromEvidence(evidence)!;
    const externalStage = evidence.terminalStatus || evidence.currentStage;
    const stageChanged = job.stage !== nextStage;
    const externalStageChanged = Boolean(externalStage) && job.externalStage !== externalStage;
    const appliedAt = evidenceItems.length === 1 ? pageData.appliedAt : undefined;
    const appliedAtChanged = Boolean(appliedAt) && job.appliedAt !== appliedAt;
    if (!stageChanged && !externalStageChanged && !appliedAtChanged) continue;

    const eventTitle = stageChanged
      ? `自动同步：${STAGE_LABELS[job.stage]} → ${STAGE_LABELS[nextStage]}`
      : externalStageChanged
        ? `网站进度：${job.externalStage || STAGE_LABELS[job.stage]} → ${externalStage}`
        : `补充投递时间：${appliedAt}`;
    const updated: JobApplication = {
      ...job,
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
    updatedCount += 1;
  }

  if (!updatedCount) {
    markProcessed(tabId, signature);
    return;
  }

  await saveJobs(nextJobs);
  markProcessed(tabId, signature);
  await chrome.storage.local.set({
    "offerflow.autoSyncNotice": {
      count: updatedCount,
      message: `自动发现 ${updatedCount} 条投递进度更新`,
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
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url?.startsWith("http")) return;

  const toggle = () =>
    chrome.tabs.sendMessage(tab.id!, { type: "OFFERFLOW_TOGGLE_OVERLAY" });

  try {
    await toggle();
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["form-adapters.js", "content.js"]
    });
    await toggle();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
