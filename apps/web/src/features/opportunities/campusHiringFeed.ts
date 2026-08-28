import {
  DEFAULT_CAMPUS_HIRING_FEED_URL,
  normalizeCampusHiringFeed as normalizeSharedCampusHiringFeed
} from "@offerflow/domain";

export type { CampusHiringOpportunity } from "@offerflow/domain";

export const CAMPUS_HIRING_FEED_URL =
  import.meta.env?.VITE_CAMPUS_HIRING_FEED_URL || DEFAULT_CAMPUS_HIRING_FEED_URL;

export function normalizeCampusHiringFeed(
  payload: unknown,
  sourceUrl = CAMPUS_HIRING_FEED_URL
) {
  return normalizeSharedCampusHiringFeed(payload, sourceUrl);
}

export async function fetchCampusHiringFeed(signal?: AbortSignal) {
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
