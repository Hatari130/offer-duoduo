import type {
  ApplicationSyncChange,
  ApplicationSyncConflict,
  SessionUser
} from "@offerflow/contracts";
import type { JobApplication } from "@offerflow/domain";

export const CLOUD_CONNECTION_KEY = "offerflow.cloudConnection";
export const CLOUD_SYNC_STATE_KEY = "offerflow.cloudSyncState";
export const CLOUD_SYNC_OUTBOX_KEY = "offerflow.cloudSyncOutbox";
export const CLOUD_SYNC_METADATA_KEY = "offerflow.cloudSyncMetadata";
export const CLOUD_DEVICE_ID_KEY = "offerflow.cloudDeviceId";
export const CLOUD_DATA_OWNER_KEY = "offerflow.cloudDataOwner";

export interface CloudConnection {
  apiBaseUrl: string;
  accessToken: string;
  expiresAt: string;
  deviceId: string;
  deviceName: string;
  user: SessionUser;
  connectedAt: string;
}

export interface CloudSyncState {
  cursor: string;
  lastSyncedAt?: string;
  lastError?: string;
  conflicts: ApplicationSyncConflict[];
  lastUploadedCount?: number;
  lastReceivedCount?: number;
}

export interface CloudSyncMetadata {
  revisions: Record<string, number>;
}

const DEFAULT_SYNC_STATE: CloudSyncState = {
  cursor: "0",
  conflicts: []
};

const DEFAULT_SYNC_METADATA: CloudSyncMetadata = {
  revisions: {}
};

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

async function readValue<T>(key: string): Promise<T | undefined> {
  if (!hasChromeStorage()) {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  }
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

async function writeValue<T>(key: string, value: T): Promise<void> {
  if (!hasChromeStorage()) {
    localStorage.setItem(key, JSON.stringify(value));
    return;
  }
  await chrome.storage.local.set({ [key]: value });
}

async function removeValues(keys: string[]): Promise<void> {
  if (!hasChromeStorage()) {
    keys.forEach((key) => localStorage.removeItem(key));
    return;
  }
  await chrome.storage.local.remove(keys);
}

function createChangeId(): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `extension:${Date.now().toString(36)}:${suffix}`;
}

function sameApplication(left: JobApplication, right: JobApplication): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildApplicationOutbox(
  previous: JobApplication[],
  next: JobApplication[],
  currentOutbox: ApplicationSyncChange[],
  metadata: CloudSyncMetadata,
  makeChangeId: () => string = createChangeId
): ApplicationSyncChange[] {
  const previousById = new Map(previous.map((application) => [application.id, application]));
  const nextById = new Map(next.map((application) => [application.id, application]));
  const pendingById = new Map(
    currentOutbox.map((change) => [change.application.id, { ...change }])
  );

  for (const application of next) {
    const before = previousById.get(application.id);
    if (before && sameApplication(before, application)) continue;

    const pending = pendingById.get(application.id);
    pendingById.set(application.id, {
      changeId: pending?.changeId ?? makeChangeId(),
      application,
      baseRevision: pending?.baseRevision ?? metadata.revisions[application.id] ?? 0
    });
  }

  for (const application of previous) {
    if (nextById.has(application.id)) continue;
    const pending = pendingById.get(application.id);

    // A record created and deleted before its first upload never needs to leave
    // the device.
    if (pending?.baseRevision === 0) {
      pendingById.delete(application.id);
      continue;
    }

    pendingById.set(application.id, {
      changeId: pending?.changeId ?? makeChangeId(),
      application,
      baseRevision: pending?.baseRevision ?? metadata.revisions[application.id] ?? 0,
      deletedAt: new Date().toISOString()
    });
  }

  return [...pendingById.values()];
}

export async function loadCloudConnection(): Promise<CloudConnection | undefined> {
  return readValue<CloudConnection>(CLOUD_CONNECTION_KEY);
}

export async function saveCloudConnection(connection: CloudConnection): Promise<void> {
  await writeValue(CLOUD_CONNECTION_KEY, connection);
}

export async function loadCloudDataOwner(): Promise<string | undefined> {
  return readValue<string>(CLOUD_DATA_OWNER_KEY);
}

export async function saveCloudDataOwner(userId: string): Promise<void> {
  await writeValue(CLOUD_DATA_OWNER_KEY, userId);
}

export async function clearCloudDataOwner(): Promise<void> {
  await removeValues([CLOUD_DATA_OWNER_KEY]);
}

export async function loadCloudSyncState(): Promise<CloudSyncState> {
  const stored = await readValue<Partial<CloudSyncState>>(CLOUD_SYNC_STATE_KEY);
  return {
    ...DEFAULT_SYNC_STATE,
    ...stored,
    conflicts: stored?.conflicts ?? []
  };
}

export async function saveCloudSyncState(state: CloudSyncState): Promise<void> {
  await writeValue(CLOUD_SYNC_STATE_KEY, state);
}

export async function loadCloudSyncOutbox(): Promise<ApplicationSyncChange[]> {
  return (await readValue<ApplicationSyncChange[]>(CLOUD_SYNC_OUTBOX_KEY)) ?? [];
}

export async function saveCloudSyncOutbox(changes: ApplicationSyncChange[]): Promise<void> {
  await writeValue(CLOUD_SYNC_OUTBOX_KEY, changes);
}

export async function loadCloudSyncMetadata(): Promise<CloudSyncMetadata> {
  const stored = await readValue<Partial<CloudSyncMetadata>>(CLOUD_SYNC_METADATA_KEY);
  return {
    ...DEFAULT_SYNC_METADATA,
    ...stored,
    revisions: stored?.revisions ?? {}
  };
}

export async function saveCloudSyncMetadata(metadata: CloudSyncMetadata): Promise<void> {
  await writeValue(CLOUD_SYNC_METADATA_KEY, metadata);
}

export async function enqueueApplicationChanges(
  previous: JobApplication[],
  next: JobApplication[]
): Promise<void> {
  const [outbox, metadata] = await Promise.all([
    loadCloudSyncOutbox(),
    loadCloudSyncMetadata()
  ]);
  const updated = buildApplicationOutbox(previous, next, outbox, metadata);
  if (JSON.stringify(updated) !== JSON.stringify(outbox)) {
    await saveCloudSyncOutbox(updated);
  }
}

export async function getOrCreateCloudDeviceId(): Promise<string> {
  const existing = await readValue<string>(CLOUD_DEVICE_ID_KEY);
  if (existing) return existing;
  const deviceId = globalThis.crypto?.randomUUID?.() ?? `device_${Date.now().toString(36)}`;
  await writeValue(CLOUD_DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export async function clearCloudSyncStorage(): Promise<void> {
  // Keep CLOUD_DATA_OWNER_KEY. Disconnecting an account must never make the
  // same local records look unowned and eligible for upload to another user.
  await removeValues([
    CLOUD_CONNECTION_KEY,
    CLOUD_SYNC_STATE_KEY,
    CLOUD_SYNC_OUTBOX_KEY,
    CLOUD_SYNC_METADATA_KEY
  ]);
}

/**
 * Reset only the sync progress (cursor, outbox and revision metadata) while
 * keeping the cloud connection, so the next sync uploads every local record
 * again. Used to recover from a server that lost its data.
 */
export async function resetCloudSyncState(): Promise<void> {
  await removeValues([
    CLOUD_SYNC_STATE_KEY,
    CLOUD_SYNC_OUTBOX_KEY,
    CLOUD_SYNC_METADATA_KEY
  ]);
}
