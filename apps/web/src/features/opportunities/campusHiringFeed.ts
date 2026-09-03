import {
  DEFAULT_CAMPUS_HIRING_FEED_URL,
  normalizeCampusHiringFeed as normalizeSharedCampusHiringFeed
} from "@offerflow/domain";
import type { CampusHiringOpportunity } from "@offerflow/domain";

export type { CampusHiringOpportunity } from "@offerflow/domain";

export const CAMPUS_HIRING_FEED_URL =
  import.meta.env?.VITE_CAMPUS_HIRING_FEED_URL || DEFAULT_CAMPUS_HIRING_FEED_URL;

const CAMPUS_HIRING_CACHE_DB = "offerflow-public-data";
const CAMPUS_HIRING_CACHE_STORE = "snapshots";
const CAMPUS_HIRING_CACHE_KEY = "campus-hiring-feed:v1";

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

function openCampusHiringCache(): Promise<IDBDatabase | undefined> {
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const request = window.indexedDB.open(CAMPUS_HIRING_CACHE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CAMPUS_HIRING_CACHE_STORE)) {
        request.result.createObjectStore(CAMPUS_HIRING_CACHE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
  });
}

/** Public data only. IndexedDB avoids the small synchronous localStorage quota. */
export async function readCachedCampusHiringFeed(): Promise<CampusHiringFeedSnapshot | undefined> {
  const database = await openCampusHiringCache();
  if (!database) return undefined;
  try {
    const cached = await new Promise<Partial<CachedCampusHiringFeed> | undefined>((resolve) => {
      const request = database.transaction(CAMPUS_HIRING_CACHE_STORE, "readonly")
        .objectStore(CAMPUS_HIRING_CACHE_STORE)
        .get(CAMPUS_HIRING_CACHE_KEY);
      request.onsuccess = () => resolve(request.result as Partial<CachedCampusHiringFeed> | undefined);
      request.onerror = () => resolve(undefined);
    });
    if (cached?.version !== 1 || !Array.isArray(cached.opportunities)) return undefined;
    return {
      opportunities: cached.opportunities,
      fetchedAt: typeof cached.fetchedAt === "string" ? cached.fetchedAt : undefined,
      sourceUpdatedAt: typeof cached.sourceUpdatedAt === "string" ? cached.sourceUpdatedAt : undefined,
      sourceUrl: typeof cached.sourceUrl === "string" ? cached.sourceUrl : undefined
    };
  } finally {
    database.close();
  }
}

export async function cacheCampusHiringFeed(snapshot: CampusHiringFeedSnapshot): Promise<void> {
  const database = await openCampusHiringCache();
  if (!database) return;
  try {
    await new Promise<void>((resolve) => {
      const request = database.transaction(CAMPUS_HIRING_CACHE_STORE, "readwrite")
        .objectStore(CAMPUS_HIRING_CACHE_STORE)
        .put({ version: 1, ...snapshot } satisfies CachedCampusHiringFeed, CAMPUS_HIRING_CACHE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } finally {
    database.close();
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
