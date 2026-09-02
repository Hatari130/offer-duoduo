import {
  DEFAULT_CAMPUS_HIRING_FEED_URL,
  normalizeCampusHiringFeed as normalizeSharedCampusHiringFeed
} from "@offerflow/domain";
import type { CampusHiringOpportunity } from "@offerflow/domain";

export type { CampusHiringOpportunity } from "@offerflow/domain";

export const CAMPUS_HIRING_FEED_URL =
  import.meta.env?.VITE_CAMPUS_HIRING_FEED_URL || DEFAULT_CAMPUS_HIRING_FEED_URL;

const CAMPUS_HIRING_CACHE_KEY = "offerflow:campus-hiring-feed:v1";

export interface CampusHiringFeedSnapshot {
  opportunities: CampusHiringOpportunity[];
  fetchedAt?: string;
  sourceUpdatedAt?: string;
  sourceUrl?: string;
}

interface CachedCampusHiringFeed extends CampusHiringFeedSnapshot {
  version: 1;
}

export function normalizeCampusHiringFeed(
  payload: unknown,
  sourceUrl = CAMPUS_HIRING_FEED_URL
): CampusHiringFeedSnapshot {
  return normalizeSharedCampusHiringFeed(payload, sourceUrl);
}

/**
 * Public feed only: a successful snapshot is kept in this browser so list
 * pages can render immediately while their background refresh is in flight.
 */
export function readCachedCampusHiringFeed(): CampusHiringFeedSnapshot | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.localStorage.getItem(CAMPUS_HIRING_CACHE_KEY);
    if (!value) return undefined;
    const cached = JSON.parse(value) as Partial<CachedCampusHiringFeed>;
    if (cached.version !== 1 || !Array.isArray(cached.opportunities)) {
      return undefined;
    }
    return {
      opportunities: cached.opportunities,
      fetchedAt: typeof cached.fetchedAt === "string" ? cached.fetchedAt : undefined,
      sourceUpdatedAt: typeof cached.sourceUpdatedAt === "string" ? cached.sourceUpdatedAt : undefined,
      sourceUrl: typeof cached.sourceUrl === "string" ? cached.sourceUrl : undefined
    };
  } catch {
    return undefined;
  }
}

export function cacheCampusHiringFeed(snapshot: CampusHiringFeedSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    const cached: CachedCampusHiringFeed = { version: 1, ...snapshot };
    window.localStorage.setItem(CAMPUS_HIRING_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Storage can be disabled or full; the live request still remains usable.
  }
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
