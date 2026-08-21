import { loadJobs, loadSettings, saveJobs } from "@/infrastructure/storage/storage";
import { runCloudSync } from "@/infrastructure/sync/cloudSync";
import { publishOpportunityFeed } from "@/infrastructure/sync/opportunitySync";
import { CLOUD_SYNC_OUTBOX_KEY } from "@/infrastructure/sync/syncState";
import { normalizeExternalStage } from "@/features/workspace/workspaceUtils";
import {
  DEFAULT_OPPORTUNITY_FEED_URL,
  normalizeOpportunityFeed,
  writeOpportunityCache
} from "@/features/opportunities/opportunities";
import {
  STAGE_LABELS,
  type ApplicationStage,
  type ExtractedJob,
  type JobApplication,
  type OpportunityFeedSnapshot,
  type ProgressEvidence
} from "@/shared/types";

const PROCESSED_SIGNATURE_TTL = 30 * 60 * 1000;
const CLOUD_SYNC_ALARM_NAME = "offerflow-cloud-sync";
const CLOUD_SYNC_PERIOD_MINUTES = 5;
const OPPORTUNITY_FEED_ALARM_NAME = "offerflow-opportunity-feed";
const OPPORTUNITY_FEED_PERIOD_MINUTES = 15;
const processedSignatures = new Map<number, Map<string, number>>();
const processingTabs = new Set<number>();
const pendingUpdates = new Map<
  number,
  { signature: string; pageData: ExtractedJob }
>();

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

const APPLICATION_PAGE_PATTERN =
  /(?:personal|account|user)\/|delivery|application|投递记录|申请记录|my[-_]?applications/i;
const OFFERFLOW_WEB_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"];

function isOfferFlowWebOrigin(sourceUrl?: string): boolean {
  try {
    return OFFERFLOW_WEB_ORIGINS.includes(new URL(sourceUrl || "").origin);
  } catch {
    return false;
  }
}

async function updateProgressFromPage(
  tabId: number,
  signature: string,
  pageData: ExtractedJob
): Promise<void> {
  if (isProcessed(tabId, signature)) return;
  // Never auto-update jobs from the OfferFlow web app itself: its stage
  // selects contain “已结束” options which would close records in a loop.
  if (isOfferFlowWebOrigin(pageData.sourceUrl)) return;
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
    // “已结束” on a job-detail page means the position stopped recruiting, not
    // that the application was terminated. Never auto-close a record from a
    // page that is not an application-record page.
    if (nextStage === "closed" && !APPLICATION_PAGE_PATTERN.test(pageData.sourceUrl || "")) {
      continue;
    }
    const externalStage =
      normalizeExternalStage(evidence.terminalStatus || evidence.currentStage) ||
      evidence.terminalStatus ||
      evidence.currentStage;
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

async function syncCloudInBackground(): Promise<void> {
  try {
    await runCloudSync();
  } catch (error) {
    console.warn("OfferFlow cloud sync failed", error);
  }
}

async function syncOpportunityFeedInBackground(): Promise<void> {
  try {
    const settings = await loadSettings();
    const configuredUrl = settings.opportunityFeedUrl?.trim();
    const sourceUrl = configuredUrl || DEFAULT_OPPORTUNITY_FEED_URL;

    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`机会数据源读取失败（${response.status}）`);
    const snapshot: OpportunityFeedSnapshot = normalizeOpportunityFeed(
      await response.json(),
      sourceUrl
    );

    await writeOpportunityCache(snapshot);
    await publishOpportunityFeed(snapshot);
  } catch (error) {
    console.warn("OfferFlow opportunity feed sync failed", error);
  }
}

async function initializeBackground(): Promise<void> {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  await chrome.alarms.create(CLOUD_SYNC_ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: CLOUD_SYNC_PERIOD_MINUTES
  });
  await chrome.alarms.create(OPPORTUNITY_FEED_ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: OPPORTUNITY_FEED_PERIOD_MINUTES
  });
  await syncCloudInBackground();
  await syncOpportunityFeedInBackground();
}

chrome.runtime.onInstalled.addListener(() => {
  void initializeBackground();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeBackground();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CLOUD_SYNC_ALARM_NAME) void syncCloudInBackground();
  if (alarm.name === OPPORTUNITY_FEED_ALARM_NAME) void syncOpportunityFeedInBackground();
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url?.startsWith("http")) return;

  const toggle = () =>
    chrome.tabs.sendMessage(tab.id!, { type: "OFFERFLOW_TOGGLE_OVERLAY" });

  try {
    await toggle();
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["extraction-rules.js", "form-adapters.js", "content.js"]
      });
      await toggle();
    } catch (error) {
      console.warn("OfferFlow could not open the page overlay", error);
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OFFERFLOW_CLOUD_SYNC_NOW") {
    runCloudSync()
      .then((overview) => sendResponse({ ok: true, data: overview }))
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "云端同步失败"
      }));
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

let cloudSyncDebounce: ReturnType<typeof setTimeout> | undefined;
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[CLOUD_SYNC_OUTBOX_KEY]) return;
  if (cloudSyncDebounce) clearTimeout(cloudSyncDebounce);
  cloudSyncDebounce = setTimeout(() => {
    cloudSyncDebounce = undefined;
    void syncCloudInBackground();
  }, 600);
});
