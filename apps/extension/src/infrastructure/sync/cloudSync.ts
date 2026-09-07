import { createApiClient, OfferFlowApiError } from "@offerflow/api-client";
import type {
  ApplicationSyncChange,
  ApplicationSyncConflict,
  ApplicationSyncItem,
  CreateTailorTaskResponse,
  SessionUser
} from "@offerflow/contracts";
import type { JobApplication, TailorJobContext } from "@offerflow/domain";
import { cloudResumeToPersonalProfile, toCloudResumeAssets, toCloudResumeProfile } from "@offerflow/domain";
import {
  EMPTY_PROFILE,
  clearLocalProfileAndResumes,
  isStarterProfile,
  loadJobs,
  loadPendingDeletedResumeIds,
  loadProfile,
  loadResumeLibrary,
  migrateLegacyResumeDeletions,
  recordPendingDeletedResumeId,
  removePendingDeletedResumeIds,
  saveJobs,
  saveProfile,
  saveResumeLibrary
} from "@/infrastructure/storage/storage";
import { mergeRemoteResumeTemplates } from "./resumeTemplateSync";
import {
  clearCloudSyncStorage,
  clearCloudConnection,
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
import { CLOUD_RESUME_CONSENT_VERSION, cloudDataScope, type CloudDataOwner } from "./syncState";

const localDevServer = import.meta.env.DEV;
const allowConfiguredInsecureHttp = import.meta.env.VITE_OFFERFLOW_ALLOW_INSECURE_HTTP === "true";
export const DEFAULT_CLOUD_API_URL = import.meta.env.VITE_OFFERFLOW_API_URL?.replace(/\/$/, "") || (localDevServer ? "http://127.0.0.1:8787" : "https://jobkoi.cn/api");
export const DEFAULT_CLOUD_WEB_URL = import.meta.env.VITE_OFFERFLOW_WEB_URL?.replace(/\/$/, "") || (localDevServer ? "http://127.0.0.1:5173" : "https://jobkoi.cn");

export interface CloudSyncOverview {
  connection?: CloudConnection;
  state: CloudSyncState;
  pendingCount: number;
  requiresUploadConsent?: boolean;
}

export type CloudSyncCommand =
  | { action: "sync" | "disconnect" | "clearLocal" | "resync" | "resetResumes" | "clearTemplates" }
  | { action: "preparePair"; code: string; apiBaseUrl: string; deviceName: string; forceRebind?: boolean }
  | { action: "finishPair" | "cancelPair"; pendingId: string }
  | { action: "deleteTemplate"; templateId: string; scope?: string }
  | { action: "resolve"; entityId: string; choice: "local" | "server" }
  | { action: "tailor"; sourceResumeId: string; job: TailorJobContext; applicationId?: string; scope: string };

interface PairPreview {
  pendingId: string;
  user: SessionUser;
  apiBaseUrl: string;
  jobCount: number;
  resumeCount: number;
  migration: boolean;
  requiresConsent: boolean;
}

interface PendingPair {
  preview: PairPreview;
  connection: CloudConnection;
  fingerprint: string;
  expiresAt: number;
}

// Every cloud mutation runs in the extension service worker, not concurrently
// in dashboard tabs, content scripts and the alarm handler.
let cloudAuthority = typeof chrome === "undefined" || !chrome.runtime?.id;
let operationTail: Promise<unknown> = Promise.resolve();
const pendingPairs = new Map<string, PendingPair>();

export function enableBackgroundCloudAuthority(): void { cloudAuthority = true; }

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationTail.then(operation, operation);
  operationTail = result.catch(() => undefined);
  return result;
}

export async function handleCloudSyncCommand(request: CloudSyncCommand): Promise<unknown> {
  if (!cloudAuthority) throw new Error("云端操作只能由插件后台执行");
  if (!request || typeof request.action !== "string") throw new Error("无效的云端操作");
  if (request.action === "sync") return runCloudSync();
  return serialized(async () => {
    switch (request.action) {
      case "disconnect":
        return performDisconnect();
      case "clearLocal":
        return performClearLocal();
      case "resync":
        return performResyncAll();
      case "resetResumes":
        return performResetResumes();
      case "clearTemplates":
        return performClearCloudTemplates();
      case "deleteTemplate":
        return performDeleteTemplate(request.templateId, request.scope);
      case "resolve":
        return performResolveConflict(request.entityId, request.choice);
      case "tailor":
        return performCreateTailor(request);
      case "preparePair":
        return prepareCloudPair(request.code, request.apiBaseUrl, request.deviceName, request.forceRebind);
      case "finishPair":
        return finishCloudPair(request.pendingId);
      case "cancelPair":
        return cancelCloudPair(request.pendingId);
      default:
        throw new Error("无法识别云端操作，请更新插件后重试");
    }
  });
}

async function command<T>(request: CloudSyncCommand): Promise<T> {
  if (cloudAuthority) return handleCloudSyncCommand(request) as Promise<T>;
  const response = await chrome.runtime.sendMessage({ type: "OFFERFLOW_CLOUD_COMMAND", command: request });
  if (!response?.ok) throw new Error(response?.error || "插件后台未响应，请重新加载插件后重试");
  return response.data as T;
}

async function accountFingerprint(): Promise<string> {
  return JSON.stringify([await loadCloudDataOwner(), await loadCloudConnection()]);
}

function connectionScope(connection: CloudConnection): string {
  return cloudDataScope({ userId: connection.user.id, apiBaseUrl: connection.apiBaseUrl })!;
}

async function requireBoundConnection(): Promise<CloudConnection | undefined> {
  const connection = await loadCloudConnection();
  if (!connection) return undefined;
  const owner = await loadCloudDataOwner();
  if (!owner || cloudDataScope(owner) !== connectionScope(connection)) {
    throw new Error("本地资料与当前账号归属不一致，已阻止跨账号同步，请重新登录确认");
  }
  if (owner.consentVersion !== CLOUD_RESUME_CONSENT_VERSION) {
    throw new Error("请重新登录并确认投递与简历的云端同步范围");
  }
  return connection;
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

  // Never erase ownership just because the endpoint changed. Reconnecting to
  // production must go through the same explicit migration approval as A -> B.
  return undefined;
}

async function loadConnectionWithFreshToken(): Promise<CloudConnection | undefined> {
  const connection = await migrateLegacyLocalConnection(await requireBoundConnection());
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
  const owner = await loadCloudDataOwner();
  return {
    connection, state: friendlyState, pendingCount: outbox.length,
    requiresUploadConsent: Boolean(connection && (!owner || cloudDataScope(owner) !== connectionScope(connection) || owner.consentVersion !== CLOUD_RESUME_CONSENT_VERSION))
  };
}

export async function pairCloudDevice(
  code: string,
  apiBaseUrl = DEFAULT_CLOUD_API_URL,
  deviceName = defaultDeviceName(),
  options: { allowInitialUpload?: boolean; forceRebind?: boolean } = {}
): Promise<CloudSyncOverview> {
  const preview = await command<PairPreview>({ action: "preparePair", code, apiBaseUrl, deviceName, forceRebind: options.forceRebind });
  try {
    if (preview.requiresConsent) {
      const action = preview.migration ? "迁移并同步" : "同步";
      const approved = typeof window !== "undefined" && window.confirm(
        `${action}至 ${preview.user.email}（${preview.apiBaseUrl}）？\n\n` +
        `包括 ${preview.jobCount} 条投递、${preview.resumeCount} 份通用简历，以及之后保存的投递与通用简历。\n` +
        "简历只上传姓名、联系方式、教育、经历、项目和技能等简历字段。证件、家庭、健康、紧急联系人等网申专用字段及原文件留在本地。\n\n" +
        (preview.migration ? "旧账号的本地资料将绑定至这个账号；旧账号云端数据不变。\n" : "") +
        "确认后开始同步；取消不会删除或迁移任何本地资料。"
      );
      if (!approved) throw new Error("已取消同步授权，本地资料保持不变");
    }
    return await command<CloudSyncOverview>({ action: "finishPair", pendingId: preview.pendingId });
  } catch (error) {
    await command({ action: "cancelPair", pendingId: preview.pendingId }).catch(() => undefined);
    throw error;
  }
}

async function prepareCloudPair(code: string, apiBaseUrl: string, deviceName: string, forceRebind = false): Promise<PairPreview> {
  const normalizedCode = code.replace(/\s/g, "").toUpperCase();
  if (!normalizedCode) throw new Error("未收到有效的插件授权信息");

  const [normalizedUrl, owner, previousConnection, localJobs, library] = await Promise.all([
    Promise.resolve(normalizeApiBaseUrl(apiBaseUrl)),
    loadCloudDataOwner(),
    loadCloudConnection(),
    loadJobs(),
    loadResumeLibrary()
  ]);
  if (previousConnection && owner && cloudDataScope(owner) === connectionScope(previousConnection)) {
    await migrateLegacyResumeDeletions(connectionScope(previousConnection));
  }
  const deviceId = await getOrCreateCloudDeviceId();
  const client = createApiClient({ baseUrl: normalizedUrl });
  const session = await client.auth.exchangeDeviceCode({
    code: normalizedCode,
    deviceId,
    deviceName
  });

  const previousScope = owner ? cloudDataScope(owner) : previousConnection ? connectionScope(previousConnection) : undefined;
  const nextScope = cloudDataScope({ userId: session.user.id, apiBaseUrl: normalizedUrl });
  const migration = Boolean((owner || previousConnection) && previousScope !== nextScope);
  if (migration && !forceRebind) {
    await createApiClient({ baseUrl: normalizedUrl, getAccessToken: () => session.accessToken }).auth.logout().catch(() => undefined);
    throw new Error("已阻止跨账号同步：本地投递、简历和网申档案仍属于原账号。请在设置中选择清空本地资料，或明确迁移投递与简历后再登录。");
  }
  const pendingId = globalThis.crypto.randomUUID();
  const preview: PairPreview = {
    pendingId, user: session.user, apiBaseUrl: normalizedUrl,
    jobCount: localJobs.length,
    resumeCount: library.filter(resume => (resume.kind || "base") === "base").length,
    migration,
    requiresConsent: migration || owner?.consentVersion !== CLOUD_RESUME_CONSENT_VERSION
  };
  const connection: CloudConnection = {
    apiBaseUrl: normalizedUrl,
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    deviceId,
    deviceName,
    user: session.user,
    connectedAt: new Date().toISOString()
  };
  pendingPairs.set(pendingId, { preview, connection, fingerprint: await accountFingerprint(), expiresAt: Date.now() + 5 * 60_000 });
  for (const [id, pending] of pendingPairs) {
    if (pending.expiresAt < Date.now() || pendingPairs.size > 5) await cancelCloudPair(id);
  }
  return preview;
}

async function cancelCloudPair(pendingId: string): Promise<void> {
  const pending = pendingPairs.get(pendingId);
  pendingPairs.delete(pendingId);
  if (pending) await createApiClient({ baseUrl: pending.connection.apiBaseUrl, getAccessToken: () => pending.connection.accessToken }).auth.logout().catch(() => undefined);
}

async function finishCloudPair(pendingId: string): Promise<CloudSyncOverview> {
  const pending = pendingPairs.get(pendingId);
  if (!pending || pending.expiresAt < Date.now() || pending.fingerprint !== await accountFingerprint()) {
    await cancelCloudPair(pendingId);
    throw new Error("登录确认已过期或账号状态已变化，请重新登录；本地资料未迁移");
  }
  const owner = await loadCloudDataOwner();
  const sameScope = owner && cloudDataScope(owner) === connectionScope(pending.connection);
  if (!sameScope) await clearCloudSyncStorage();
  const currentProfile = await loadProfile();
  if (isStarterProfile(currentProfile)) {
    await saveProfile({ ...EMPTY_PROFILE, fullName: pending.connection.user.displayName || "", email: pending.connection.user.email || "" });
  }
  const nextOwner: CloudDataOwner = {
    userId: pending.connection.user.id,
    apiBaseUrl: pending.connection.apiBaseUrl,
    consentVersion: CLOUD_RESUME_CONSENT_VERSION,
    consentGrantedAt: new Date().toISOString()
  };
  await saveCloudDataOwner(nextOwner);
  await saveCloudConnection(pending.connection);
  pendingPairs.delete(pendingId);
  if (!sameScope) await enqueueApplicationChanges([], await loadJobs());
  return performBatchedCloudSync();
}

export async function loginAndSync(
  webBaseUrl = DEFAULT_CLOUD_WEB_URL,
  apiBaseUrl = DEFAULT_CLOUD_API_URL,
  deviceName = defaultDeviceName(),
  options: { allowInitialUpload?: boolean; forceRebind?: boolean } = {}
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
  return command<void>({ action: "disconnect" });
}

async function performDisconnect(): Promise<void> {
  const connection = await loadCloudConnection();
  if (connection) {
    const client = createApiClient({
      baseUrl: connection.apiBaseUrl,
      getAccessToken: () => connection.accessToken
    });
    await client.auth.logout().catch(() => undefined);
  }
  await clearCloudConnection();
}

export async function deleteLocalApplicationsAndForgetOwner(): Promise<void> {
  return command<void>({ action: "clearLocal" });
}

async function performClearLocal(): Promise<void> {
  await performDisconnect();
  await saveJobs([], { origin: "cloud" });
  await clearLocalProfileAndResumes();
  await clearCloudSyncStorage();
  await clearCloudDataOwner();
}

export async function deleteCloudResumeTemplate(templateId: string): Promise<void> {
  const owner = await loadCloudDataOwner();
  return command<void>({ action: "deleteTemplate", templateId, scope: owner ? cloudDataScope(owner) : undefined });
}

async function performDeleteTemplate(templateId: string, expectedScope?: string): Promise<void> {
  const owner = await loadCloudDataOwner();
  const scope = owner && cloudDataScope(owner);
  if (scope !== expectedScope) throw new Error("账号已变化，未删除简历，请刷新后重试");
  if (scope) await recordPendingDeletedResumeId(templateId, scope);
  const library = await loadResumeLibrary();
  await saveResumeLibrary(library.filter(resume => resume.id !== templateId));
  const connection = await loadCloudConnection();
  if (!connection || !scope) return;
  await requireBoundConnection();
  try {
    const client = createApiClient({
      baseUrl: connection.apiBaseUrl,
      getAccessToken: () => connection.accessToken
    });
    await client.resumes.removeTemplate(templateId);
    await removePendingDeletedResumeIds([templateId], scope);
  } catch (error) {
    if (error instanceof OfferFlowApiError && error.status === 404) await removePendingDeletedResumeIds([templateId], scope);
    // Retained in pending deleted list for the next sync attempt
  }
}

export async function clearAllCloudResumeTemplates(): Promise<void> {
  return command<void>({ action: "clearTemplates" });
}

async function performClearCloudTemplates(): Promise<void> {
  const connection = await requireBoundConnection();
  if (!connection) throw new Error("请先登录，再清空云端通用简历");
  const scope = connectionScope(connection);
  const client = createApiClient({ baseUrl: connection.apiBaseUrl, getAccessToken: () => connection.accessToken });
  const remote = await client.resumes.listTemplates();
  for (const template of remote.templates) await recordPendingDeletedResumeId(template.id, scope);
  for (const template of remote.templates) {
    try {
      await client.resumes.removeTemplate(template.id);
      await removePendingDeletedResumeIds([template.id], scope);
    } catch (error) {
      if (error instanceof OfferFlowApiError && error.status === 404) {
        await removePendingDeletedResumeIds([template.id], scope);
      } else throw new Error("部分云端简历尚未删除，本地资料已保留，请联网后重试");
    }
  }
}

async function performResetResumes(): Promise<void> {
  const connection = await requireBoundConnection();
  if (!connection) throw new Error("请先登录，再清空本地与云端简历");
  await performClearCloudTemplates();
  await clearLocalProfileAndResumes();
  if (connection) {
    await saveProfile({
      ...EMPTY_PROFILE,
      fullName: connection.user.displayName || "",
      email: connection.user.email || ""
    });
  }
}

export async function resetLocalAndCloudResumes(): Promise<void> {
  return command<void>({ action: "resetResumes" });
}

/**
 * Re-upload every local application while keeping the current cloud
 * connection. The server loses its data on an in-memory restart, so this
 * resets the sync cursor/outbox and queues all local records for upload again.
 */
export async function resyncAllCloud(): Promise<CloudSyncOverview> {
  return command<CloudSyncOverview>({ action: "resync" });
}

async function performResyncAll(): Promise<CloudSyncOverview> {
  const connection = await requireBoundConnection();
  if (!connection) return getCloudSyncOverview();
  await resetCloudSyncState();
  const localJobs = await loadJobs();
  await enqueueApplicationChanges([], localJobs);
  return performBatchedCloudSync();
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

/** Mirrors reusable extension resumes without transferring the source PDF. */
async function syncResumeTemplates(client: ReturnType<typeof createApiClient>, scope: string): Promise<void> {
  const pendingDeletes = await loadPendingDeletedResumeIds(scope);
  if (pendingDeletes.length) {
    const successfullyDeleted: string[] = [];
    for (const id of pendingDeletes) {
      try {
        await client.resumes.removeTemplate(id);
        successfullyDeleted.push(id);
      } catch (error) {
        if (error instanceof OfferFlowApiError && error.status === 404) successfullyDeleted.push(id);
      }
    }
    if (successfullyDeleted.length) {
      await removePendingDeletedResumeIds(successfullyDeleted, scope);
    }
  }

  const library = await loadResumeLibrary();
  // Suppress this run's IDs even after acknowledgement, before reading local
  // copies. Otherwise a not-found delete could be re-uploaded in this round.
  const currentPendingDeletes = new Set([...pendingDeletes, ...await loadPendingDeletedResumeIds(scope)]);
  const filteredLibrary = library.filter((resume) => !currentPendingDeletes.has(resume.id));
  const templates = filteredLibrary
    .filter((resume) => (resume.kind || "base") === "base")
    .map((resume) => ({
      id: resume.id,
      name: resume.name,
      profile: toCloudResumeProfile(resume.profile),
      origin: "extension" as const,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt
    }));
  const response = await client.resumes.syncTemplates({ templates });
  const activeRemote = response.templates.filter((t) => !currentPendingDeletes.has(t.id));
  const nextLibrary = mergeRemoteResumeTemplates(filteredLibrary, activeRemote);
  if (JSON.stringify(nextLibrary) !== JSON.stringify(library)) await saveResumeLibrary(nextLibrary);
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
    await syncResumeTemplates(client, connectionScope(connection));
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
    await syncResumeTemplates(client, connectionScope(connection));
    return getCloudSyncOverview();
  } catch (error) {
    const message = cloudErrorMessage(error, "云端同步失败");
    await saveCloudSyncState({ ...state, lastError: message });
    throw error;
  }
}

export function runCloudSync(): Promise<CloudSyncOverview> {
  if (!cloudAuthority) return command<CloudSyncOverview>({ action: "sync" });
  if (activeSync) return activeSync;
  activeSync = serialized(performBatchedCloudSync).finally(() => {
    activeSync = undefined;
  });
  return activeSync;
}

export async function resolveCloudConflict(
  entityId: string,
  choice: "local" | "server"
): Promise<CloudSyncOverview> {
  return command<CloudSyncOverview>({ action: "resolve", entityId, choice });
}

async function performResolveConflict(entityId: string, choice: "local" | "server"): Promise<CloudSyncOverview> {
  await requireBoundConnection();
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
  return performBatchedCloudSync();
}

export async function createCloudTailorTask(sourceResumeId: string, job: TailorJobContext, scope: string, applicationId?: string): Promise<CreateTailorTaskResponse> {
  return command<CreateTailorTaskResponse>({ action: "tailor", sourceResumeId, job, scope, applicationId });
}

async function performCreateTailor(request: Extract<CloudSyncCommand, { action: "tailor" }>): Promise<CreateTailorTaskResponse> {
  const connection = await requireBoundConnection();
  if (!connection || connectionScope(connection) !== request.scope) throw new Error("账号已变化，请重新选择简历后再定制");
  const resume = (await loadResumeLibrary()).find(item => item.id === request.sourceResumeId);
  if (!resume) throw new Error("这份本地简历已变化或已删除，请刷新简历库后重试");
  const assets = toCloudResumeAssets(resume.assets);
  const client = createApiClient({ baseUrl: connection.apiBaseUrl, getAccessToken: () => connection.accessToken });
  return client.resumes.createTailorTask({
    sourceResumeId: resume.id,
    sourceResumeName: resume.name,
    sourceProfile: cloudResumeToPersonalProfile(resume.profile),
    sourceAssets: assets,
    sourcePortraitAssetId: assets.some(asset => asset.id === resume.portraitAssetId) ? resume.portraitAssetId : undefined,
    applicationId: request.applicationId,
    job: request.job
  });
}

export type { ApplicationSyncChange };
