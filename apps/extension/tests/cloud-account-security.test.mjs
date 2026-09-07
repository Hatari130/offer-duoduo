import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createEmptyPersonalProfile } from "../../../packages/domain/src/profile.ts";

const require = createRequire(import.meta.resolve("vite"));
const { build } = require("esbuild");
const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const apiBaseUrl = "https://cloud.example.invalid/api";
const now = "2026-09-07T00:00:00.000Z";

function profile(name = "A") {
  return { ...createEmptyPersonalProfile(), fullName: name, idNumber: "PRIVATE_ID", familyMembers: [{ name: "PRIVATE_FAMILY" }], extraFields: { localOnly: "PRIVATE_EXTRA" } };
}
function resume(id = "resume-a") {
  return { id, name: "Resume A", kind: "base", profile: profile(), parse: { sourceText: "PRIVATE_RAW", unclassifiedText: "PRIVATE_UNCLASSIFIED" }, createdAt: now, updatedAt: now };
}
function job() {
  return { id: "job-a", company: "Company A", position: "Engineer", stage: "applied", responsibilities: [], requirements: [], events: [], sourceUrl: "", sourceHost: "", createdAt: now, updatedAt: now };
}

test("cloud account security flows", { timeout: 30000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "jobkoi-cloud-security-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outfile = join(directory, "cloud-fixture.mjs");
  await build({
    stdin: { contents: 'export * from "@/infrastructure/sync/cloudSync"; export * as state from "@/infrastructure/sync/syncState"; export * as storage from "@/infrastructure/storage/storage";', resolveDir: sourceRoot },
    alias: { "@": sourceRoot }, bundle: true, platform: "node", format: "esm",
    define: { "import.meta.env": JSON.stringify({ DEV: true }) }, outfile, logLevel: "silent"
  });
  let instance = 0;

  async function harness(st) {
    const originals = { chrome: globalThis.chrome, fetch: globalThis.fetch, window: globalThis.window };
    const data = {};
    const calls = [];
    const messages = [];
    const sessions = new Map();
    const remote = new Map();
    let tokenSequence = 0;
    let worker;
    const h = { data, calls, messages, remote, sessions, approve: true, intercept: undefined, confirmations: [] };
    globalThis.window = { confirm: message => { h.confirmations.push(message); return h.approve; } };
    globalThis.chrome = {
      runtime: { id: "security-test-extension", async sendMessage(message) {
        messages.push(message);
        try { return { ok: true, data: await worker.handleCloudSyncCommand(message.command) }; }
        catch (error) { return { ok: false, error: error.message }; }
      } },
      storage: { local: {
        async get(keys) {
          if (keys === null) return structuredClone(data);
          return structuredClone(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in data).map(key => [key, data[key]])));
        },
        async set(values) { Object.assign(data, structuredClone(values)); },
        async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; }
      } }
    };
    const ok = payload => new Response(JSON.stringify({ ok: true, data: payload }), { status: 200, headers: { "Content-Type": "application/json" } });
    const fail = status => new Response(JSON.stringify({ ok: false, error: { code: "TEST", message: "test failure" } }), { status, headers: { "Content-Type": "application/json" } });
    globalThis.fetch = async (url, init = {}) => {
      const path = new URL(url).pathname.replace(/^\/api/, "");
      const body = init.body ? JSON.parse(init.body) : undefined;
      const token = new Headers(init.headers).get("Authorization")?.replace(/^Bearer /, "");
      const user = sessions.get(token);
      const call = { path, body, user, method: init.method || "GET", url: String(url) };
      calls.push(call);
      const intercepted = await h.intercept?.(call);
      if (intercepted) return intercepted;
      if (path === "/v1/auth/device-token") {
        const id = body.code;
        const accessToken = `token-${id}-${++tokenSequence}`;
        sessions.set(accessToken, id);
        return ok({ user: { id, email: `${id}@example.invalid`, displayName: id }, accessToken, expiresAt: "2099-01-01T00:00:00.000Z" });
      }
      if (path === "/v1/auth/logout") { sessions.delete(token); return ok({ loggedOut: true }); }
      if (!user) return fail(401);
      const scope = JSON.stringify([new URL(url).origin + "/api", user]);
      if (!remote.has(scope)) remote.set(scope, new Map());
      const templates = remote.get(scope);
      if (path === "/v1/applications/sync") return ok({ cursor: "1", acceptedChangeIds: body.changes.map(change => change.changeId), conflicts: [], changes: [] });
      if (path === "/v1/resume-templates/sync") {
        for (const template of body.templates) if (!templates.get(template.id)?.deletedAt) templates.set(template.id, structuredClone(template));
        return ok({ templates: [...templates.values()] });
      }
      if (path === "/v1/resume-templates") return ok({ templates: [...templates.values()].filter(item => !item.deletedAt) });
      if (path.startsWith("/v1/resume-templates/") && init.method === "DELETE") {
        const id = decodeURIComponent(path.split("/").at(-1));
        if (!templates.has(id)) return fail(404);
        templates.set(id, { id, name: "", profile: createEmptyPersonalProfile(), createdAt: now, updatedAt: now, deletedAt: now });
        return ok({ deleted: true });
      }
      if (path === "/v1/tailor-tasks") return ok({ task: { id: "task" }, handoff: { code: "handoff" } });
      throw new Error(`Unexpected test request: ${path}`);
    };
    worker = await import(`${pathToFileURL(outfile).href}?worker=${++instance}`);
    worker.enableBackgroundCloudAuthority();
    h.worker = worker;
    h.ui = await import(`${pathToFileURL(outfile).href}?ui=${instance}`);
    h.scope = user => worker.state.cloudDataScope({ userId: user, apiBaseUrl });
    h.seed = async (user = "A", options = {}) => {
      const token = `seed-${user}`;
      sessions.set(token, user);
      await worker.state.saveCloudDataOwner({ userId: user, apiBaseUrl, consentVersion: 1, ...options });
      await worker.state.saveCloudConnection({ apiBaseUrl, user: { id: user, email: `${user}@example.invalid` }, accessToken: token, expiresAt: "2099-01-01T00:00:00.000Z", deviceId: "device", deviceName: "Test", connectedAt: now });
      await worker.storage.saveResumeLibrary([resume()]);
      await worker.storage.saveProfile(profile());
      await worker.storage.saveJobs([job()]);
    };
    st.after(() => Object.assign(globalThis, originals));
    return h;
  }

  await t.test("existing connections cannot upload before accepting the new boundary", async st => {
    const h = await harness(st);
    await h.seed("A", { consentVersion: undefined });
    await assert.rejects(h.worker.runCloudSync(), /确认/);
    assert.equal(h.calls.length, 0);
    assert.equal((await h.worker.getCloudSyncOverview()).requiresUploadConsent, true);
  });

  await t.test("first connection cancel keeps local resumes and does not upload", async st => {
    const h = await harness(st);
    await h.worker.storage.saveResumeLibrary([resume()]);
    h.approve = false;
    await assert.rejects(h.ui.pairCloudDevice("A", apiBaseUrl), /取消/);
    assert.equal((await h.worker.storage.loadResumeLibrary())[0].profile.idNumber, "PRIVATE_ID");
    assert.equal(await h.worker.state.loadCloudConnection(), undefined);
    assert.equal(h.calls.some(call => call.path.endsWith("/sync")), false);
    assert.equal(h.sessions.size, 0);
    assert.match(h.confirmations[0], /1 份通用简历/);
  });

  await t.test("UI delegates sync to one worker and sends only allowed profile fields", async st => {
    const h = await harness(st);
    await h.seed();
    await h.ui.runCloudSync();
    assert.equal(h.messages[0].command.action, "sync");
    const upload = h.calls.find(call => call.path === "/v1/resume-templates/sync");
    assert.equal(JSON.stringify(upload.body).includes("PRIVATE_"), false);
    assert.equal(upload.body.templates[0].profile.fullName, "A");
    assert.equal((await h.worker.storage.loadResumeLibrary())[0].profile.idNumber, "PRIVATE_ID");
  });

  await t.test("logout clears current connection and unbinds cleanly; B can bind without cross-account blocker", async st => {
    const h = await harness(st);
    await h.seed("A");
    await h.ui.disconnectCloud();
    assert.equal(await h.worker.state.loadCloudConnection(), undefined);
    await h.ui.pairCloudDevice("B", apiBaseUrl);
    assert.equal((await h.worker.state.loadCloudDataOwner()).userId, "B");
    assert.equal((await h.worker.storage.loadResumeLibrary())[0].profile.fullName, "A");
    assert.equal(h.calls.some(call => call.user === "B" && call.path.endsWith("/sync")), true);
  });

  await t.test("switching accounts isolates jobs per user and pulls cloud data for new account", async st => {
    const h = await harness(st);
    await h.seed("A");
    await h.ui.pairCloudDevice("B", apiBaseUrl, "Test");
    assert.equal((await h.worker.state.loadCloudDataOwner()).userId, "B");
    assert.equal((await h.worker.storage.loadResumeLibrary()).length, 1);
  });

  await t.test("same user ID at a different API origin updates connection scope smoothly", async st => {
    const h = await harness(st);
    await h.seed("A");
    await h.ui.pairCloudDevice("A", "https://other.example.invalid/api");
    assert.equal((await h.worker.state.loadCloudDataOwner()).apiBaseUrl, "https://other.example.invalid/api");
  });

  await t.test("approved migration never replays A deletions into B", async st => {
    const h = await harness(st);
    await h.seed();
    await h.worker.storage.saveResumeLibrary([]);
    await h.worker.storage.recordPendingDeletedResumeId("shared", h.scope("A"));
    h.remote.set(h.scope("B"), new Map([["shared", { ...resume("shared"), name: "B-owned" }]]));
    await h.ui.pairCloudDevice("B", apiBaseUrl, "Test", { forceRebind: true });
    assert.equal((await h.worker.state.loadCloudDataOwner()).userId, "B");
    assert.equal(h.calls.some(call => call.user === "B" && call.method === "DELETE"), false);
    assert.deepEqual(await h.worker.storage.loadPendingDeletedResumeIds(h.scope("A")), ["shared"]);
    assert.equal(h.remote.get(h.scope("B")).get("shared").name, "B-owned");
  });

  await t.test("clear waits for in-flight sync before B can bind and upload", async st => {
    const h = await harness(st);
    await h.seed();
    let release;
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    h.intercept = async call => { if (call.user === "A" && call.path === "/v1/applications/sync") { started(); await gate; } };
    const syncing = h.worker.runCloudSync();
    await ready;
    const clearing = h.ui.deleteLocalApplicationsAndForgetOwner();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await h.worker.state.loadCloudDataOwner()).userId, "A");
    release();
    await syncing;
    await clearing;
    assert.equal((await h.worker.storage.loadResumeLibrary()).length, 0);
    assert.equal((await h.worker.storage.loadProfile()).idNumber, undefined);
    await h.ui.pairCloudDevice("B", apiBaseUrl);
    const bUploads = h.calls.filter(call => call.user === "B" && call.path.endsWith("/sync"));
    assert.equal(JSON.stringify(bUploads).includes("Company A"), false);
    assert.equal(JSON.stringify(bUploads).includes("Resume A"), false);
  });

  await t.test("acknowledged not-found deletions cannot re-upload stale local copies", async st => {
    const h = await harness(st);
    await h.seed();
    await h.worker.storage.recordPendingDeletedResumeId("resume-a", h.scope("A"));
    await h.worker.runCloudSync();
    const upload = h.calls.find(call => call.path === "/v1/resume-templates/sync");
    assert.deepEqual(upload.body.templates, []);
    assert.equal((await h.worker.storage.loadResumeLibrary()).length, 0);
    assert.deepEqual(await h.worker.storage.loadPendingDeletedResumeIds(h.scope("A")), []);
  });

  await t.test("failed cloud reset does not erase local source files or claim success", async st => {
    const h = await harness(st);
    await h.seed();
    h.remote.set(h.scope("A"), new Map([["resume-a", resume()]]));
    h.intercept = async call => call.method === "DELETE" ? new Response(JSON.stringify({ ok: false, error: { code: "OFFLINE", message: "offline" } }), { status: 503 }) : undefined;
    await assert.rejects(h.ui.resetLocalAndCloudResumes(), /本地资料已保留/);
    assert.equal((await h.worker.storage.loadResumeLibrary()).length, 1);
    assert.equal((await h.worker.storage.loadProfile()).idNumber, "PRIVATE_ID");
  });

  await t.test("a stale pair confirmation cannot take over a newly bound account", async st => {
    const h = await harness(st);
    await h.seed();
    const older = await h.worker.handleCloudSyncCommand({ action: "preparePair", code: "A", apiBaseUrl, deviceName: "Test" });
    await h.ui.pairCloudDevice("B", apiBaseUrl, "Test", { forceRebind: true });
    await assert.rejects(h.worker.handleCloudSyncCommand({ action: "finishPair", pendingId: older.pendingId }), /状态已变化/);
    assert.equal((await h.worker.state.loadCloudDataOwner()).userId, "B");
  });

  await t.test("tailoring re-reads the bound library and rejects stale account scopes", async st => {
    const h = await harness(st);
    await h.seed();
    const jd = { company: "Company", position: "Role", sourceUrl: "", responsibilities: [], requirements: [] };
    await assert.rejects(h.ui.createCloudTailorTask("resume-a", jd, h.scope("B")), /账号已变化/);
    await h.ui.createCloudTailorTask("resume-a", jd, h.scope("A"));
    const upload = h.calls.find(call => call.path === "/v1/tailor-tasks");
    assert.equal(JSON.stringify(upload.body).includes("PRIVATE_"), false);
    assert.equal(upload.body.sourceProfile.fullName, "A");
    assert.equal(upload.body.sourceEvidence, undefined);
  });
});
