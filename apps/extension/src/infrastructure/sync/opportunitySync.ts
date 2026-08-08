import { createApiClient } from "@offerflow/api-client";
import type { OpportunityFeedSnapshot } from "@/shared/types";
import { DEFAULT_CLOUD_API_URL } from "./cloudSync";
import { loadCloudConnection } from "./syncState";

export const OPPORTUNITY_PUBLISH_STATUS_KEY = "offerflow.opportunityPublishStatus";

/**
 * Publish the latest campus opportunity snapshot to the local API. The
 * catalogue is shared, public data, so the endpoint works with or without a
 * paired device; failures are intentionally swallowed by callers because a
 * local API being offline must never break the extension's own feed.
 */
export async function publishOpportunityFeed(
  snapshot: OpportunityFeedSnapshot,
  apiBaseUrl = DEFAULT_CLOUD_API_URL
): Promise<number> {
  if (!snapshot?.opportunities?.length) return 0;
  const connection = await loadCloudConnection().catch(() => undefined);
  const client = createApiClient({
    baseUrl: connection?.apiBaseUrl || apiBaseUrl,
    getAccessToken: () => connection?.accessToken
  });
  const hasStorage =
    typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
  try {
    const result = await client.opportunities.sync({
      opportunities: snapshot.opportunities,
      fetchedAt: snapshot.fetchedAt,
      sourceUpdatedAt: snapshot.sourceUpdatedAt,
      sourceUrl: snapshot.sourceUrl
    });
    if (hasStorage) {
      await chrome.storage.local
        .set({
          [OPPORTUNITY_PUBLISH_STATUS_KEY]: {
            syncedAt: new Date().toISOString(),
            count: result.accepted
          }
        })
        .catch(() => undefined);
    }
    return result.accepted;
  } catch (error) {
    if (hasStorage) {
      await chrome.storage.local
        .set({
          [OPPORTUNITY_PUBLISH_STATUS_KEY]: {
            syncedAt: new Date().toISOString(),
            count: 0,
            error:
              error instanceof Error ? error.message : "Web 端同步失败"
          }
        })
        .catch(() => undefined);
    }
    throw error;
  }
}
