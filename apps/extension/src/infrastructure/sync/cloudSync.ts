import { createApiClient, OfferFlowApiError } from "@offerflow/api-client";
import type {
  ApplicationSyncChange,
  ApplicationSyncConflict,
  ApplicationSyncItem
} from "@offerflow/contracts";
import type { JobApplication } from "@offerflow/domain";
import { loadJobs, saveJobs } from "@/infrastructure/storage/storage";
import {
  clearCloudSyncStorage,
  clearCloudDataOwner,
  enqueueApplicationChanges,
  getOrCreateCloudDeviceId,
  loadCloudConnection,
  loadCloudDataOwner,
  loadCloudSyncMetadata,
  loadCloudSyncOutbox,
  loadCloudSyncState,
  resetCloudSyncState,
  saveCloudConnection,
  saveCloudDataOwner,
  saveCloudSyncMetadata,
  saveCloudSyncOutbox,
  saveCloudSyncState,
  type CloudConnection,
  type CloudSyncState
} from "./syncState";

const localDevServer = import.meta.env.DEV;
const allowConfiguredInsecureHttp = import.meta.env.VITE_OFFERFLOW_ALLOW_INSECURE_HTTP === "true";
export const DEFAULT_CLOUD_API_URL = import.meta.env.VITE_OFFERFLOW_API_URL?.replace(/\/$/, "") || (localDevServer ? "http://127.0.0.1:8787" : "https://jobkoi.cn/api");
export const DEFAULT_CLOUD_WEB_URL = import.meta.env.VITE_OFFERFLOW_WEB_URL?.replace(/\/$/, "") || (localDevServer ? "http://127.0.0.1:5173" : "https://jobkoi.cn");

export interface CloudSyncOverview {
  connection?: CloudConnection;
  state: CloudSyncState;
  pendingCount: number;
}

// Renew the access token when less than two days of its TTL remain, so a
// paired extension keeps syncing indefinitely instead of silently failing
// once the token expires (the original cause of "sync stopped after a week").
const TOKEN_REFRESH_MARGIN_MS = 2 * 24 * 60 * 60 * 1000;

function isLoopbackUrl(value: string): boolean {
  try {
    return ["127.0.0.1", "localhost", "::1"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

async function migrateLegacyLocalConnection(
  connection: CloudConnection | undefined
): Promise<CloudConnection | undefined> {
  if (!connection || localDevServer || !isLoopbackUrl(connection.apiBaseUrl)) return connection;

  // development-build is the package loaded by users during local testing. Older
  // builds persisted 127.0.0.1 as their cloud endpoint, which made every later
  // sync and tailor request fail. Keep local applications, but discard the local
  // test account ownership as well: its user id does not exist on production and
  // would otherwise block the user from reconnecting their real website account.
  await Promise.all([clearCloudSyncStorage(), clearCloudDataOwner()]);
  return undefined;
}

async function loadConnectionWithFreshToken(): Promise<CloudConnection | undefined> {
  const connection = await migrateLegacyLocalConnection(await loadCloudConnection());
  if (!connection) return undefined;

  const expiresAt = Date.parse(connection.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
    return connection;
  }

  const client = createApiClient({
    baseUrl: connection.apiBaseUrl,
    getAccessToken: () => connection.accessToken
  });
  try {
    const session = await client.auth.refresh();
    const renewed: CloudConnection = {
      ...connection,
      accessToken: session.accessToken,
      expiresAt: session.expiresAt
    };
    await saveCloudConnection(renewed);
    return renewed;
  } catch {
    // The token may already be expired or the API is offline. Keep the
    // current connection so the regular sync surfaces the real error.
    return connection;
  }
}

export function cloudErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof OfferFlowApiError && error.status === 401) {
    return "登录已过期：请在插件设置中重新登录 JobKoI 并同步";
  }
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return "无法连接 JobKoI 官网，请检查网络后重新登录并同步";
  }
  return error instanceof Error ? error.message : fallback;
}

let activeSync: Promise<CloudSyncOverview> | undefined;

function normalizeApiBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API 地址必须使用 http 或 https");
  }
  if (
    url.protocol === "http:" &&
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) &&
    !allowConfiguredInsecureHttp
  ) {
    throw new Error("非本机 API 必须使用 HTTPS");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function defaultDeviceName(): string {
  const platform = globalThis.navigator?.platform || "Browser";
  return `JobKoI · ${platform}`;
}

export async function getCloudSyncOverview(): Promise<CloudSyncOverview> {
  const connection = await migrateLegacyLocalConnection(await loadCloudConnection());
  const [state, outbox] = await Promise.all([
    loadCloudSyncState(),
    loadCloudSyncOutbox()
  ]);
  const friendlyState = state.lastError === "Failed to fetch"
    ? { ...state, lastError: "无法连接 JobKoI 官网，请检查网络后重新登录并同步" }
    : state;
  return { connection, state: friendlyState, pendingCount: outbox.length };
}

export async function pairCloudDevice(
  code: string,
  apiBaseUrl = DEFAULT_CLOUD_API_URL,
  deviceName = defaultDeviceName(),
  options: { allowInitialUpload?: boolean } = {}
): Promise<CloudSyncOverview> {
  const normalizedCode = code.replace(/\s/g, "").toUpperCase();
  if (!normalizedCode) throw new Error("请输入 Web 端生成的配对码");

  const [normalizedUrl, ownerUserId, previousConnection, localJobs] = await Promise.all([
    Promise.resolve(normalizeApiBaseUrl(apiBaseUrl)),
    loadCloudDataOwner(),
    loadCloudConnection(),
    loadJobs()
  ]);
  if (!ownerUserId && localJobs.length && !options.allowInitialUpload) {
    throw new Error("首次连接会把本地投递绑定到登录账号，请确认后再继续");
  }
  const deviceId = await getOrCreateCloudDeviceId();
  const client = createApiClient({ baseUrl: normalizedUrl });
  const session = await client.auth.exchangeDeviceCode({
    code: normalizedCode,
    deviceId,
    deviceName
  });

  if (ownerUserId && ownerUserId !== session.user.id) {
    throw new Error(`这些本地投递属于 ${previousConnection?.user.email || "另一个账号"}，已阻止跨账号上传`);
  }

  await clearCloudSyncStorage();
  await saveCloudConnection({
    apiBaseUrl: normalizedUrl,
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    deviceId,
    deviceName,
    user: session.user,
    connectedAt: new Date().toISOString()
  });

  if (!ownerUserId) await saveCloudDataOwner(session.user.id);
  await enqueueApplicationChanges([], localJobs);
  return runCloudSync();
}

export async function loginAndSync(
  webBaseUrl = DEFAULT_CLOUD_WEB_URL,
  apiBaseUrl = DEFAULT_CLOUD_API_URL,
  deviceName = defaultDeviceName(),
  options: { allowInitialUpload?: boolean } = {}
): Promise<CloudSyncOverview> {
  if (typeof chrome === "undefined" || !chrome.identity?.launchWebAuthFlow) {
    throw new Error("当前浏览器不支持一键登录，请使用 Chrome 或 Edge");
  }

  const state = globalThis.crypto?.randomUUID?.() ?? `state_${Date.now().toString(36)}`;
  const redirectUri = chrome.identity.getRedirectURL("offerflow");
  const authUrl = new URL("/extension/connect", webBaseUrl);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  const callbackUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true
  });
  if (!callbackUrl) throw new Error("登录窗口没有返回授权结果");

  const callback = new URL(callbackUrl);
  if (callback.searchParams.get("state") !== state) {
    throw new Error("登录授权状态无效，请重新尝试");
  }
  const code = callback.searchParams.get("code");
  if (!code) throw new Error("登录没有完成，请重新尝试");
  return pairCloudDevice(code, apiBaseUrl, deviceName, options);
}

export async function disconnectCloud(): Promise<void> {
  const connection = await loadCloudConnection();
  if (connection) {
    const client = createApiClient({
      baseUrl: connection.apiBaseUrl,
      getAccessToken: () => connection.accessToken
    });
    await client.auth.logout().catch(() => undefined);
  }
  await clearCloudSyncStorage();
}

export async function deleteLocalApplicationsAndForgetOwner(): Promise<void> {
  await disconnectCloud();
  await saveJobs([], { origin: "cloud" });
  await clearCloudDataOwner();
}

/**
 * Re-upload every local application while keeping the current cloud
 * connection. The server loses its data on an in-memory restart, so this
 * resets the sync cursor/outbox and queues all local records for upload again.
 */
export async function resyncAllCloud(): Promise<CloudSyncOverview> {
  const connection = await loadCloudConnection();
  if (!connection) return getCloudSyncOverview();
  await resetCloudSyncState();
  const localJobs = await loadJobs();
  await enqueueApplicationChanges([], localJobs);
  return runCloudSync();
}

function mergeConflicts(
  previous: ApplicationSyncConflict[],
  incoming: ApplicationSyncConflict[],
  acceptedEntities: Set<string>
): ApplicationSyncConflict[] {
  const byEntity = new Map(
    previous
      .filter((conflict) => !acceptedEntities.has(conflict.entityId))
      .map((conflict) => [conflict.entityId, conflict])
  );
  for (const conflict of incoming) byEntity.set(conflict.entityId, conflict);
  return [...byEntity.values()];
}

function applyRemoteChanges(
  jobs: JobApplication[],
  changes: ApplicationSyncItem[]
): JobApplication[] {
  const byId = new Map(jobs.map((application) => [application.id, application]));
  for (const item of changes) {
    const id = item.application.id;
    if (item.deletedAt) byId.delete(id);
    else byId.set(id, item.application);
  }
  return [...byId.values()].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

function preserveLocalConflicts(
  responseConflicts: ApplicationSyncConflict[],
  sent: ApplicationSyncChange[]
): ApplicationSyncConflict[] {
  const sentById = new Map(sent.map((change) => [change.changeId, change]));
  return responseConflicts.map((conflict) => ({
    ...conflict,
    local: conflict.local ?? sentById.get(conflict.changeId)
  }));
}

async function performCloudSync(): Promise<CloudSyncOverview> {
  const connection = await loadConnectionWithFreshToken();
  if (!connection) return getCloudSyncOverview();

  const [state, outbox, metadata, jobs] = await Promise.all([
    loadCloudSyncState(),
    loadCloudSyncOutbox(),
    loadCloudSyncMetadata(),
    loadJobs()
  ]);
  const client = createApiClient({
    baseUrl: connection.apiBaseUrl,
    getAccessToken: () => connection.accessToken
  });

  try {
    const response = await client.applications.sync({
      deviceId: connection.deviceId,
      cursor: state.cursor,
      changes: outbox
    });
    const acceptedIds = new Set(response.acceptedChangeIds);
    const responseConflicts = preserveLocalConflicts(response.conflicts, outbox);
    const conflictedIds = new Set(responseConflicts.map((conflict) => conflict.changeId));
    const conflictedEntities = new Set(responseConflicts.map((conflict) => conflict.entityId));
    const acceptedEntities = new Set(
      outbox
        .filter((change) => acceptedIds.has(change.changeId))
        .map((change) => change.application.id)
    );
    const remainingOutbox = outbox.filter(
      (change) => !acceptedIds.has(change.changeId) && !conflictedIds.has(change.changeId)
    );
    const nextJobs = applyRemoteChanges(jobs, response.changes.filter((item) => !conflictedEntities.has(item.application.id)));
    const nextRevisions = { ...metadata.revisions };
    for (const item of response.changes) {
      nextRevisions[item.application.id] = item.revision;
    }
    for (const conflict of responseConflicts) {
      if (conflict.server) {
        nextRevisions[conflict.entityId] = conflict.server.revision;
      }
    }

    if (JSON.stringify(nextJobs) !== JSON.stringify(jobs)) {
      await saveJobs(nextJobs, { origin: "cloud" });
    }
    await Promise.all([
      saveCloudSyncOutbox(remainingOutbox),
      saveCloudSyncMetadata({ revisions: nextRevisions }),
      saveCloudSyncState({
        cursor: response.cursor,
        lastSyncedAt: new Date().toISOString(),
        conflicts: mergeConflicts(state.conflicts, responseConflicts, acceptedEntities),
        lastUploadedCount: response.acceptedChangeIds.length,
        lastReceivedCount: response.changes.length
      })
    ]);
    return getCloudSyncOverview();
  } catch (error) {
    const message = cloudErrorMessage(error, "云端同步失败");
    await saveCloudSyncState({ ...state, lastError: message });
    throw error;
  }
}

// Keep the initial upload below the API request limit. This matters for users
// who already have a large local history with excerpts and event timelines.
const SYNC_BATCH_MAX_BYTES = 700_000;

function takeSyncBatch(changes: ApplicationSyncChange[]): ApplicationSyncChange[] {
  if (!changes.length) return [];
  const encoder = new TextEncoder();
  const batch: ApplicationSyncChange[] = [];
  let bytes = 0;
  for (const change of changes) {
    const changeBytes = encoder.encode(JSON.stringify(change)).byteLength;
    if (batch.length && bytes + changeBytes > SYNC_BATCH_MAX_BYTES) break;
    batch.push(change);
    bytes += changeBytes;
  }
  return batch;
}

async function performBatchedCloudSync(): Promise<CloudSyncOverview> {
  const connection = await loadConnectionWithFreshToken();
  if (!connection) return getCloudSyncOverview();

  const [state, initialOutbox, metadata, jobs] = await Promise.all([
    loadCloudSyncState(),
    loadCloudSyncOutbox(),
    loadCloudSyncMetadata(),
    loadJobs()
  ]);
  const client = createApiClient({
    baseUrl: connection.apiBaseUrl,
    getAccessToken: () => connection.accessToken
  });

  let cursor = state.cursor;
  let outbox = initialOutbox;
  let nextJobs = jobs;
  let nextRevisions = { ...metadata.revisions };
  let conflicts: ApplicationSyncConflict[] = [];
  const acceptedEntities = new Set<string>();
  let uploadedCount = 0;
  let receivedCount = 0;
  let rounds = 0;

  try {
    do {
      if (++rounds > 10_000) throw new Error("Cloud sync stopped after too many batches");
      const batch = takeSyncBatch(outbox);
      const response = await client.applications.sync({
        deviceId: connection.deviceId,
        cursor,
        changes: batch
      });
      cursor = response.cursor;
      uploadedCount += response.acceptedChangeIds.length;
      receivedCount += response.changes.length;

      const acceptedIds = new Set(response.acceptedChangeIds);
      const responseConflicts = preserveLocalConflicts(response.conflicts, batch);
      const conflictedIds = new Set(responseConflicts.map((conflict) => conflict.changeId));
      const conflictedEntities = new Set(responseConflicts.map((conflict) => conflict.entityId));
      for (const change of batch) {
        if (acceptedIds.has(change.changeId)) acceptedEntities.add(change.application.id);
      }
      outbox = outbox.filter(
        (change) => !acceptedIds.has(change.changeId) && !conflictedIds.has(change.changeId)
      );
      nextJobs = applyRemoteChanges(nextJobs, response.changes.filter((item) => !conflictedEntities.has(item.application.id)));
      for (const item of response.changes) {
        nextRevisions[item.application.id] = item.revision;
      }
      for (const conflict of responseConflicts) {
        if (conflict.server) nextRevisions[conflict.entityId] = conflict.server.revision;
      }
      conflicts = mergeConflicts(conflicts, responseConflicts, acceptedEntities);

      if (!batch.length) break;
    } while (outbox.length);

    if (JSON.stringify(nextJobs) !== JSON.stringify(jobs)) {
      await saveJobs(nextJobs, { origin: "cloud" });
    }
    await Promise.all([
      saveCloudSyncOutbox(outbox),
      saveCloudSyncMetadata({ revisions: nextRevisions }),
      saveCloudSyncState({
        cursor,
        lastSyncedAt: new Date().toISOString(),
        conflicts: mergeConflicts(state.conflicts, conflicts, acceptedEntities),
        lastUploadedCount: uploadedCount,
        lastReceivedCount: receivedCount
      })
    ]);
    return getCloudSyncOverview();
  } catch (error) {
    const message = cloudErrorMessage(error, "云端同步失败");
    await saveCloudSyncState({ ...state, lastError: message });
    throw error;
  }
}

export function runCloudSync(): Promise<CloudSyncOverview> {
  if (activeSync) return activeSync;
  activeSync = performBatchedCloudSync().finally(() => {
    activeSync = undefined;
  });
  return activeSync;
}

export async function resolveCloudConflict(
  entityId: string,
  choice: "local" | "server"
): Promise<CloudSyncOverview> {
  const [state, jobs, outbox, metadata] = await Promise.all([
    loadCloudSyncState(), loadJobs(), loadCloudSyncOutbox(), loadCloudSyncMetadata()
  ]);
  const conflict = state.conflicts.find((item) => item.entityId === entityId);
  if (!conflict) return getCloudSyncOverview();
  const remainingConflicts = state.conflicts.filter((item) => item.entityId !== entityId);
  if (choice === "server") {
    const nextJobs = conflict.server ? applyRemoteChanges(jobs, [conflict.server]) : jobs;
    await Promise.all([
      saveJobs(nextJobs, { origin: "cloud" }),
      saveCloudSyncOutbox(outbox.filter((change) => change.application.id !== entityId)),
      saveCloudSyncState({ ...state, conflicts: remainingConflicts }),
      saveCloudSyncMetadata({ revisions: { ...metadata.revisions, ...(conflict.server ? { [entityId]: conflict.server.revision } : {}) } })
    ]);
    return getCloudSyncOverview();
  }
  if (!conflict.local) throw new Error("本地冲突副本不可用，请选择云端版本");
  const localChange: ApplicationSyncChange = {
    ...conflict.local,
    changeId: `extension:${Date.now().toString(36)}:${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`,
    baseRevision: conflict.server?.revision ?? metadata.revisions[entityId] ?? 0
  };
  await Promise.all([
    saveCloudSyncOutbox([...outbox.filter((change) => change.application.id !== entityId), localChange]),
    saveCloudSyncState({ ...state, conflicts: remainingConflicts })
  ]);
  return runCloudSync();
}

export type { ApplicationSyncChange };
