import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createEmptyPersonalProfile, createResumeDocument, toCloudResumeProfile, detachedApplicationEntries } from "../../../packages/domain/src/index.ts";
import { mergeRemoteResumeTemplates, mergeRemoteResumeVersions, resumeSyncFingerprint } from "../src/infrastructure/sync/resumeTemplateSync.ts";

const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
const now = "2026-09-13T00:00:00.000Z";
const candidate = () => ({ ...createEmptyPersonalProfile(), fullName: "测试用户", phone: "13800000000", hobbies: "摄影", earliestStartDate: "两周内", idNumber: "LOCAL_ID", experiences: [{ id: "exp-1", organization: "测试公司", title: "产品经理", startDate: "2024", endDate: "2026", description: "完成用户调研", salary: "LOCAL_SALARY", refereeContact: "LOCAL_REFEREE" }] });

test("local application profiles migrate without loss and stay independent", async t => {
  const folder = await mkdtemp(join(tmpdir(), "offerflow-local-profiles-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const out = join(folder, "storage.mjs");
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  await build({ entryPoints: [join(root, "infrastructure/storage/storage.ts")], outfile: out, bundle: true, format: "esm", platform: "node", alias: { "@": root }, logLevel: "silent" });
  const savedChrome = globalThis.chrome;
  const data = {};
  let writes = 0;
  let failWrite = false;
  globalThis.chrome = { storage: { local: {
    async get(keys) { return structuredClone(keys === null ? data : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in data).map(key => [key, data[key]]))); },
    async set(values) { if (failWrite) throw new Error("quota"); writes++; Object.assign(data, structuredClone(values)); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; }
  } } };
  t.after(() => { globalThis.chrome = savedChrome; });
  const storage = await import(pathToFileURL(out).href);
  const clear = () => { for (const key of Object.keys(data)) delete data[key]; };

  await t.test("old supplements, application prose, attachments, conflicts and source keys survive migration", async () => {
    const source = { fileName: "original.pdf", base64: "ORIGINAL_BYTES", size: 8, importedAt: now };
    const old = [
      { id: "base", name: "原母版", kind: "base", profile: toCloudResumeProfile(candidate()), sourcePdf: source, createdAt: now, updatedAt: now,
        syncConflict: { id: "base", revision: 2, name: "云端编辑", profile: { ...toCloudResumeProfile(candidate()), phone: "CLOUD_PHONE" }, createdAt: now, updatedAt: now } },
      { id: "job", name: "旧岗位版", kind: "job", parentResumeId: "base", profile: { ...toCloudResumeProfile(candidate()), selfIntroduction: "岗位独立文案" }, createdAt: now, updatedAt: now }
    ];
    data["offerflow.resumes"] = structuredClone(old);
    data["offerflow.profile"] = candidate();
    data["offerflow.activeResumeId"] = "base";
    data[storage.APPLICATION_PROFILE_KEY] = { schemaVersion: 1, fields: { idNumber: "LOCAL_ID" }, entries: {}, expressions: { base: { "experiences:exp-1:description": "网申专用文案" } } };
    failWrite = true;
    await assert.rejects(storage.loadResumeLibrary(), /quota/);
    assert.equal(data[storage.RESUMES_KEY], undefined);
    assert.deepEqual(data["offerflow.resumes"], old);
    failWrite = false;
    const library = await storage.loadResumeLibrary();
    assert.equal(library.length, 3);
    assert.equal((await storage.loadProfile()).idNumber, "LOCAL_ID");
    assert.equal((await storage.loadProfile()).experiences[0].description, "网申专用文案");
    assert.equal(library.find(row => row.id === "job").sourcePdf.base64, "ORIGINAL_BYTES");
    assert.equal(library.find(row => row.id === "job").parentResumeId, undefined);
    assert.equal(library.find(row => row.id === "local_conflict_base").profile.phone, "CLOUD_PHONE");
    assert.deepEqual(data["offerflow.resumes"], old);
    const before = writes;
    await storage.loadProfile(); await storage.loadResumeLibrary(); await storage.loadResumeLibrary();
    assert.equal(writes, before, "migration is idempotent and reads do not trigger storage loops");
    await storage.deleteLocalApplicationRecord("base");
    assert.equal((await storage.loadResumeLibrary()).length, 2, "deleting one record does not cascade to old job versions");
    assert.equal((await storage.loadResumeLibrary()).find(row => row.id === "job").sourcePdf.base64, "ORIGINAL_BYTES");
  });

  await t.test("manual additions are blank and private fields/text never bleed between profiles", async () => {
    clear();
    const a = await storage.createLocalApplicationProfile("资料 A");
    await storage.saveApplicationProfile(candidate(), a.id);
    const b = await storage.createLocalApplicationProfile("资料 B");
    assert.equal(b.profile.fullName, "");
    assert.equal(b.profile.idNumber, undefined);
    assert.equal(b.profile.experiences.length, 0);
    await storage.saveApplicationProfile({ ...candidate(), fullName: "另一份", idNumber: "SECOND_ID", selfIntroduction: "独立表达" }, b.id);
    await storage.setActiveResumeId(a.id);
    assert.equal((await storage.loadProfile()).fullName, "测试用户");
    assert.equal((await storage.loadProfile()).idNumber, "LOCAL_ID");
    assert.equal((await storage.loadProfile()).selfIntroduction, "");
    await storage.setActiveResumeId(b.id);
    assert.equal((await storage.loadProfile()).idNumber, "SECOND_ID");
    await storage.saveApplicationProfile({ ...await storage.loadProfile(), idNumber: "", experiences: [] }, b.id);
    assert.equal((await storage.loadProfile()).idNumber, "", "cleared fields never come back from a shared archive");
    await assert.rejects(storage.saveResumeLibrary([], { origin: "cloud" }), /不能由云端/);
    assert.equal((await storage.loadResumeLibrary()).length, 2);
    await storage.deleteLocalApplicationRecord(b.id);
    assert.equal(await storage.loadActiveResumeId(), a.id);
    await storage.deleteLocalApplicationRecord(a.id);
    assert.equal((await storage.loadProfile()).fullName, "");
    assert.equal((await storage.loadResumeLibrary()).length, 0);
    await assert.rejects(storage.saveApplicationProfile(candidate(), a.id), /已被删除/);
  });

  await t.test("concurrent additions and unrelated edits survive; stale saves cannot overwrite or resurrect records", async () => {
    clear();
    const [a, b] = await Promise.all([storage.createLocalApplicationProfile("A"), storage.createLocalApplicationProfile("B")]);
    await storage.saveLocalApplicationRecord({ ...a, profile: candidate() }, a.localRevision);
    assert.equal((await storage.loadResumeLibrary()).length, 2);
    await assert.rejects(storage.saveLocalApplicationRecord(a, a.localRevision), /其他页面修改/);
    await assert.rejects(storage.saveApplicationProfile(candidate(), a.id, undefined, a.localRevision), /另一页面/);
    await storage.deleteLocalApplicationRecord(b.id);
    await assert.rejects(storage.saveLocalApplicationRecord(b, b.localRevision), /其他页面修改或删除/);
    assert.equal((await storage.loadResumeLibrary()).length, 1);
    assert.equal((await storage.loadResumeLibrary())[0].profile.fullName, "测试用户");
  });

  await t.test("standalone legacy profiles migrate; explicit reset clears backups and prevents resurrection", async () => {
    clear();
    data["offerflow.profile"] = candidate();
    assert.equal((await storage.loadResumeLibrary()).length, 1);
    const active = await storage.loadActiveResumeId();
    await storage.recordResumeUsage(active, candidate(), "https://jobs.example/apply?token=SECRET", 7);
    const usage = await storage.loadResumeUsage();
    assert.equal(usage[0].pageUrl, "https://jobs.example/apply");
    assert.equal(JSON.stringify(usage).includes("LOCAL_"), false);
    await storage.clearLocalProfileAndResumes();
    assert.equal(JSON.stringify(data).includes("LOCAL_"), false);
    assert.equal(data["offerflow.profile"], undefined);
    assert.deepEqual(await storage.loadResumeLibrary(), []);
    assert.deepEqual(await storage.loadResumeUsage(), []);
  });
  await t.test("browser-preview storage preserves legacy plain active IDs and new selection survives reload", async () => {
    const chrome = globalThis.chrome;
    const originalLocalStorage = globalThis.localStorage;
    const values = new Map();
    globalThis.chrome = undefined;
    globalThis.localStorage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key),
      key: i => [...values.keys()][i] ?? null,
      get length() { return values.size; }
    };
    try {
      values.set("offerflow.resumes", JSON.stringify([{ id: "legacy", name: "旧资料", kind: "base", profile: candidate(), createdAt: now, updatedAt: now }]));
      values.set("offerflow.activeResumeId", "legacy");
      assert.equal(await storage.loadActiveResumeId(), "legacy");
      const b = await storage.createLocalApplicationProfile("空白资料");
      assert.equal(await storage.loadActiveResumeId(), b.id);
      assert.equal((await storage.loadProfile()).fullName, "");
      await storage.setActiveResumeId("legacy");
      assert.equal(await storage.loadActiveResumeId(), "legacy");
      assert.equal((await storage.loadProfile()).fullName, "测试用户");
      await storage.deleteLocalApplicationRecord("legacy");
      assert.equal(await storage.loadActiveResumeId(), b.id);
    } finally {
      globalThis.chrome = chrome;
      globalThis.localStorage = originalLocalStorage;
    }
  });

});

test("revision conflicts preserve both edits regardless of device clocks; explicit asset removal is honored", () => {
  const profile = candidate();
  const remote = { id: "base", name: "母版", profile: toCloudResumeProfile(profile), revision: 1, createdAt: now, updatedAt: now };
  const [ack] = mergeRemoteResumeTemplates([], [remote]);
  const edited = { ...ack, profile: { ...ack.profile, phone: "LOCAL_EDIT" }, updatedAt: "2099-01-01T00:00:00.000Z" };
  const [conflicted] = mergeRemoteResumeTemplates([edited], [{ ...remote, revision: 2, profile: { ...remote.profile, email: "WEB_EDIT" } }]);
  assert.equal(conflicted.profile.phone, "LOCAL_EDIT");
  assert.equal(conflicted.syncConflict.profile.email, "WEB_EDIT");
  const photo = { id: "photo", kind: "portrait", dataUrl: "data:image/png;base64,AA==", mimeType: "image/png", width: 1, height: 1, source: "upload" };
  const document = createResumeDocument({ id: "base", title: "母版", profile, assets: [photo], portraitAssetId: "photo" });
  const [withPhoto] = mergeRemoteResumeTemplates([], [{ ...remote, document }]);
  const [withoutPhoto] = mergeRemoteResumeTemplates([withPhoto], [{ ...remote, revision: 2, document: { ...document, assets: [], portraitAssetId: undefined } }]);
  assert.equal(withoutPhoto.assets?.length || 0, 0);
  assert.equal(withoutPhoto.portraitAssetId, undefined);
});

test("only reviewed versions flow back and updated versions retain historical local snapshots", () => {
  const document = createResumeDocument({ id: "doc", title: "岗位", profile: candidate() });
  const version = { id: "version", tailorTaskId: "task", sourceResumeId: "base", sourceResumeName: "母版", company: "公司", position: "产品经理", document, status: "draft", createdAt: now, updatedAt: now };
  assert.equal(mergeRemoteResumeVersions([], [{ version, revision: 1 }]).length, 0);
  const first = mergeRemoteResumeVersions([], [{ version: { ...version, status: "reviewed" }, revision: 2 }]);
  assert.equal(first[0].kind, "job");
  assert.equal(first[0].cloudVersionRevision, 2);
  const original = structuredClone(first);
  const second = mergeRemoteResumeVersions(first, [{ version: { ...version, status: "reviewed", document: { ...document, profile: { ...document.profile, selfIntroduction: "新版表达" } } }, revision: 3 }]);
  assert.deepEqual(first, original);
  assert.equal(second.length, 2);
  assert.equal(second[0].profile.selfIntroduction, document.profile.selfIntroduction);
  assert.equal(second[1].profile.selfIntroduction, "新版表达");
});
