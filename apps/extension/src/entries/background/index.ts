import { loadSettings } from "@/infrastructure/storage/storage";
import { runCloudSync } from "@/infrastructure/sync/cloudSync";
import { CLOUD_SYNC_OUTBOX_KEY } from "@/infrastructure/sync/syncState";
import {
  DEFAULT_OPPORTUNITY_FEED_URL,
  normalizeOpportunityFeed,
  writeOpportunityCache
} from "@/features/opportunities/opportunities";
import type { OpportunityFeedSnapshot } from "@/shared/types";

const CLOUD_SYNC_ALARM_NAME = "offerflow-cloud-sync";
const CLOUD_SYNC_PERIOD_MINUTES = 5;
const OPPORTUNITY_FEED_ALARM_NAME = "offerflow-opportunity-feed";
const OPPORTUNITY_FEED_PERIOD_MINUTES = 15;

async function syncCloudInBackground(): Promise<void> {
  try {
    await runCloudSync();
  } catch (error) {
    console.warn("JobKoI cloud sync failed", error);
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
  } catch (error) {
    console.warn("JobKoI opportunity feed sync failed", error);
  }
}

async function initializeBackground(): Promise<void> {
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
  // Chrome forbids content-script injection into chrome:// pages, the new-tab
  // surface and the Web Store. Do nothing there rather than opening a detached window.
  if (!tab.id || !tab.url?.startsWith("http")) return;

  const toggle = () =>
    chrome.tabs.sendMessage(tab.id!, { type: "OFFERFLOW_TOGGLE_OVERLAY" });

  try {
    await toggle();
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["adapter-registry.js", "extraction-rules.js", "form-adapters.js", "content.js"]
      });
      await toggle();
    } catch (error) {
      console.warn("JobKoI could not open the page overlay", error);
    }
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OFFERFLOW_CLOUD_SYNC_NOW") {
    runCloudSync()
      .then((overview) => sendResponse({ ok: true, data: overview }))
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "云端同步失败"
      }));
    return true;
  }
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
