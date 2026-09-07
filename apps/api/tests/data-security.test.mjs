import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createOfferFlowServer } from "../src/server.ts";
import { loadApiConfig } from "../src/config.ts";
import { MemoryStore } from "../src/store/memory-store.ts";
import { createResumeTailorProvider } from "../src/ai/resume-tailor.ts";
import { createEmptyPersonalProfile, createResumeDocument } from "../../../packages/domain/src/index.ts";

function privateProfile() {
  return {
    ...createEmptyPersonalProfile(), fullName: "PUBLIC_NAME_A", phone: "13900000000",
    idNumber: "PRIVATE_ID", birthDate: "PRIVATE_BIRTH", healthStatus: "PRIVATE_HEALTH",
    emergencyContactPhone: "PRIVATE_CONTACT", familyMembers: [{ name: "PRIVATE_FAMILY" }],
    extraFields: { localOnly: "PRIVATE_EXTRA" }, unknown: "PRIVATE_UNKNOWN",
    experiences: [{ id: "exp", organization: "Company", title: "Engineer", startDate: "2024", endDate: "", description: "Public work", salary: "PRIVATE_SALARY", refereeContact: "PRIVATE_REFEREE", contentBlocks: [{ id: "block", kind: "bullet", text: "Public work", evidence: [{ source: "pdf", sourceText: "PRIVATE_BLOCK_RAW" }] }] }]
  };
}
const noPrivate = value => assert.equal(JSON.stringify(value).includes("PRIVATE_"), false);

test("private cloud data: ingress, isolation, deletion, export and account cleanup", async t => {
  const store = new MemoryStore({ persistence: false });
  const config = { ...loadApiConfig({}), host: "127.0.0.1", port: 0, opportunitySourceUrl: undefined, opportunitySeedPath: undefined };
  const app = createOfferFlowServer({ config, store });
  app.server.listen(0, config.host);
  await once(app.server, "listening");
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const users = ["a", "b"].map(id => store.createUser(`security-${id}@example.invalid`, id, "synthetic-password"));
  const tokens = users.map(user => store.createSession(user.id, "web", new Date(Date.now() + 3600000).toISOString()).accessToken);
  async function req(path, token, method = "GET", body, extra = {}) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  const profile = privateProfile();
  const now = new Date().toISOString();
  const template = { id: "shared-id", name: "Public resume", profile, createdAt: now, updatedAt: now, sourceFileName: "PRIVATE_FILENAME" };
  const document = { ...createResumeDocument({ id: template.id, title: template.name, profile }), sourceEvidence: { fileName: "PRIVATE_FILENAME", rawText: "PRIVATE_RAW" }, unknown: "PRIVATE_DOCUMENT" };
  const application = { id: "app-a", company: "Company A", position: "Engineer", stage: "applied", responsibilities: [], requirements: [], events: [], sourceUrl: "", sourceHost: "", createdAt: now, updatedAt: now };
  let task;

  await t.test("anonymous private routes are denied", async () => {
    for (const path of ["/v1/resume-templates", "/v1/resume-versions", "/v1/applications", "/v1/account/export"]) assert.equal((await req(path)).status, 401);
  });
  await t.test("template create, update and sync filter before storage, not just in responses", async () => {
    const created = await req("/v1/resume-templates", tokens[0], "POST", { id: template.id, name: template.name, document });
    assert.equal(created.status, 201);
    noPrivate(created.body);
    noPrivate([...store.resumeTemplates.values()]);
    const updated = await req(`/v1/resume-templates/${template.id}`, tokens[0], "PATCH", { name: template.name, document });
    assert.equal(updated.status, 200);
    noPrivate(updated.body);
    const synced = await req("/v1/resume-templates/sync", tokens[0], "POST", { userId: users[1].id, templates: [{ ...template, document, updatedAt: "2099-01-01T00:00:00.000Z", unknown: "PRIVATE_TEMPLATE" }] });
    assert.equal(synced.status, 200);
    noPrivate(synced.body);
    noPrivate([...store.resumeTemplates.values()]);
    assert.equal(synced.body.data.templates[0].profile.fullName, profile.fullName);
    assert.equal((await req("/v1/resume-templates", tokens[1])).body.data.templates.length, 0);
  });
  await t.test("B cannot read/change/delete A template, even knowing its ID", async () => {
    const path = `/v1/resume-templates/${template.id}`;
    assert.equal((await req(path, tokens[1])).status, 404);
    assert.equal((await req(path, tokens[1], "PATCH", { name: "B", document })).status, 404);
    assert.equal((await req(path, tokens[1], "DELETE")).status, 404);
  });
  await t.test("same IDs are independent between accounts", async () => {
    const result = await req("/v1/resume-templates/sync", tokens[1], "POST", { templates: [{ ...template, profile: { ...profile, fullName: "PUBLIC_NAME_B" } }] });
    assert.equal(result.status, 200);
    assert.equal((await req(`/v1/resume-templates/${template.id}`, tokens[0])).body.data.template.profile.fullName, "PUBLIC_NAME_A");
    assert.equal((await req(`/v1/resume-templates/${template.id}`, tokens[1])).body.data.template.profile.fullName, "PUBLIC_NAME_B");
  });
  await t.test("applications and sync remain scoped to the session user", async () => {
    assert.equal((await req("/v1/applications", tokens[0], "POST", { application, userId: users[1].id })).status, 201);
    assert.equal((await req("/v1/applications", tokens[1])).body.data.applications.length, 0);
    assert.equal((await req(`/v1/applications/${application.id}`, tokens[1])).status, 404);
    const denied = await req(`/v1/applications/${application.id}`, tokens[1], "PATCH", { application, expectedRevision: 1 });
    assert.equal(denied.status, 409);
    assert.equal(JSON.stringify(denied.body).includes("Company A"), false);
    assert.equal((await req(`/v1/applications/${application.id}?expectedRevision=1`, tokens[1], "DELETE")).status, 404);
    const synced = await req("/v1/applications/sync", tokens[1], "POST", { deviceId: "B", cursor: "0", changes: [] });
    assert.equal(synced.status, 200);
    assert.equal(synced.body.data.changes.length, 0);
  });
  await t.test("task and version writes cannot store raw or application-only data", async () => {
    const created = await req("/v1/tailor-tasks", tokens[0], "POST", { sourceResumeId: template.id, sourceResumeName: template.name, sourceProfile: profile, sourceEvidence: { rawText: "PRIVATE_RAW" }, job: { company: "Company", position: "Role", sourceUrl: "", responsibilities: [], requirements: [] } });
    assert.equal(created.status, 201);
    noPrivate(created.body);
    noPrivate([...store.tailorTasks.values(), ...store.resumeVersions.values()]);
    task = created.body.data;
    const edited = { ...task.version.version.document, profile, sourceEvidence: { rawText: "PRIVATE_RAW" } };
    const saved = await req(`/v1/resume-versions/${task.version.version.id}`, tokens[0], "PATCH", { document: edited, expectedRevision: 1 });
    assert.equal(saved.status, 200);
    noPrivate(saved.body);
    noPrivate([...store.resumeVersions.values()]);
  });
  await t.test("B cannot read/change/delete A task or version", async () => {
    assert.equal((await req(`/v1/tailor-tasks/${task.task.id}`, tokens[1])).status, 404);
    assert.equal((await req(`/v1/tailor-tasks/${task.task.id}`, tokens[1], "POST")).status, 404);
    const path = `/v1/resume-versions/${task.version.version.id}`;
    assert.equal((await req(path, tokens[1])).status, 404);
    assert.equal((await req(path, tokens[1], "PATCH", { document: task.version.version.document, expectedRevision: 2 })).status, 404);
    assert.equal((await req(`${path}?expectedRevision=2`, tokens[1], "DELETE")).status, 404);
  });
  await t.test("export contains master resumes and only this account's allowed data", async () => {
    const exported = (await req("/v1/account/export", tokens[0])).body.data;
    assert.equal(exported.resumeTemplates.length, 1);
    assert.equal(exported.resumeTemplates[0].profile.fullName, "PUBLIC_NAME_A");
    assert.equal(exported.resumeVersions.length, 1);
    assert.equal(JSON.stringify(exported).includes("PUBLIC_NAME_B"), false);
    noPrivate(exported);
  });
  await t.test("deleted template content is erased and cannot be resurrected by a future clock", async () => {
    assert.equal((await req(`/v1/resume-templates/${template.id}`, tokens[0], "DELETE")).status, 200);
    assert.equal((await req(`/v1/resume-templates/${template.id}`, tokens[0])).status, 404);
    const sync = await req("/v1/resume-templates/sync", tokens[0], "POST", { templates: [{ ...template, updatedAt: "2100-01-01T00:00:00.000Z" }] });
    const deleted = sync.body.data.templates[0];
    assert.ok(deleted.deletedAt);
    assert.equal(deleted.profile.fullName, "");
    assert.equal(deleted.document, undefined);
    assert.equal(deleted.sourceFileName, undefined);
    assert.equal((await req(`/v1/resume-templates/${template.id}`, tokens[0], "PATCH", { name: template.name, document })).status, 404);
    const stored = store.resumeTemplates.get(`${users[0].id}:${template.id}`).template;
    assert.equal(stored.profile.fullName, "");
    assert.equal(stored.document, undefined);
    assert.equal((await req(`/v1/resume-templates/${template.id}`, tokens[1])).body.data.template.profile.fullName, "PUBLIC_NAME_B");
  });
  await t.test("untrusted cookie Origin and non-admin access are denied", async () => {
    assert.equal((await req("/v1/auth/device-codes", undefined, "POST", {}, { Cookie: `${config.cookieName}=${tokens[0]}`, Origin: "https://untrusted.example.invalid" })).status, 403);
    assert.equal((await req("/v1/admin/dashboard", tokens[0])).status, 403);
  });
  await t.test("account deletion clears templates and invalidates sessions without affecting B", async () => {
    assert.equal((await req("/v1/account", tokens[0], "DELETE", { confirmation: "DELETE", password: "synthetic-password" })).status, 200);
    assert.equal((await req("/v1/account/export", tokens[0])).status, 401);
    assert.equal(store.listResumeTemplates(users[0].id, true).length, 0);
    assert.equal(store.listResumeVersions(users[0].id).length, 0);
    assert.equal(store.listApplications(users[0].id).length, 0);
    assert.equal((await req("/v1/resume-templates", tokens[1])).body.data.templates.length, 1);
  });
});

test("AI outbound prompt omits raw source evidence and private fields", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let outbound;
  globalThis.fetch = async (_url, init) => {
    outbound = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
  };
  const provider = createResumeTailorProvider({ ...loadApiConfig({}), aiApiKey: "synthetic-not-a-secret", aiBaseUrl: "https://example.invalid" });
  await provider.generate({ company: "Company", position: "Role", sourceUrl: "", responsibilities: [], requirements: [] }, privateProfile(), { rawText: "PRIVATE_RAW", unclassifiedText: "PRIVATE_UNCLASSIFIED" });
  noPrivate(outbound);
  assert.ok(JSON.stringify(outbound).includes("Public work"));
});

test("upstream AI error bodies are not returned to clients or copied to error logs", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response("PRIVATE_UPSTREAM_ECHO", { status: 502 });
  const provider = createResumeTailorProvider({ ...loadApiConfig({}), aiApiKey: "synthetic-not-a-secret", aiBaseUrl: "https://example.invalid" });
  await assert.rejects(provider.generate({ company: "Company", position: "Role", sourceUrl: "", responsibilities: [], requirements: [] }, privateProfile()), error => {
    assert.match(error.message, /502/);
    assert.equal(error.message.includes("PRIVATE_"), false);
    return true;
  });
});
