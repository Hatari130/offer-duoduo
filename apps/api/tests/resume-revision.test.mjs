import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createOfferFlowServer } from "../src/server.ts";
import { loadApiConfig } from "../src/config.ts";
import { MemoryStore } from "../src/store/memory-store.ts";
import { createResumeDocument, createEmptyPersonalProfile, applyReviewedResumeChanges } from "../../../packages/domain/src/index.ts";

test("concurrent master edits conflict, failed sync is atomic, and tailoring freezes its JD/source revision", async t => {
  const store = new MemoryStore({ persistence: false });
  const config = { ...loadApiConfig({}), host: "127.0.0.1", port: 0, opportunitySourceUrl: undefined, opportunitySeedPath: undefined };
  const app = createOfferFlowServer({ config, store });
  app.server.listen(0, config.host);
  await once(app.server, "listening");
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  const user = store.createUser("revision@example.invalid", "test", "test-password");
  const token = store.createSession(user.id, "web", new Date(Date.now() + 3600000).toISOString()).accessToken;
  const request = async (path, body, method = "POST") => {
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const profile = { ...createEmptyPersonalProfile(), fullName: "Candidate", hobbies: "摄影", earliestStartDate: "两周内" };
  const document = createResumeDocument({ id: "base", title: "母版", profile });
  const created = await request("/v1/resume-templates", { id: "base", name: "母版", document });
  assert.equal(created.body.data.template.revision, 1);
  const edits = await Promise.all(["A", "B"].map(name => request("/v1/resume-templates/base", { name, document, expectedRevision: 1 }, "PATCH")));
  assert.deepEqual(edits.map(item => item.status).sort(), [200, 409]);
  const master = (await request("/v1/resume-templates/base", undefined, "GET")).body.data.template;
  assert.equal(master.revision, 2);
  assert.equal(master.profile.hobbies, "摄影");
  assert.equal(master.profile.earliestStartDate, "两周内");
  const batch = await request("/v1/resume-templates/sync", { templates: [
    { id: "new", name: "Not committed", profile, createdAt: document.createdAt, updatedAt: document.updatedAt },
    { ...master, name: "Stale future device", revision: 1, updatedAt: "2099-01-01T00:00:00.000Z" }
  ] });
  assert.equal(batch.status, 409);
  assert.equal(store.getResumeTemplate(user.id, "new"), undefined);
  assert.equal(store.getResumeTemplate(user.id, "base").name, master.name);

  const job = { company: "公司", position: "产品经理", sourceUrl: "https://jobs.example/1", responsibilities: ["用户研究"], requirements: ["产品规划"] };
  const taskRequest = { sourceResumeId: master.id, sourceResumeName: master.name, sourceRevision: 2, sourceProfile: master.profile, job };
  const stale = await request("/v1/tailor-tasks", { ...taskRequest, sourceRevision: 1 });
  assert.equal(stale.status, 409);
  const task = (await request("/v1/tailor-tasks", taskRequest)).body.data;
  assert.equal(task.task.sourceRevision, 2);
  assert.deepEqual(task.version.version.jobSnapshot, job);
  await request("/v1/resume-templates/base", { name: "母版后来改名", document: { ...document, profile: { ...profile, fullName: "Changed" } }, expectedRevision: 2 }, "PATCH");
  const unchanged = (await request(`/v1/tailor-tasks/${task.task.id}`, undefined, "GET")).body.data;
  assert.equal(unchanged.version.version.document.profile.fullName, "Candidate");
  const published = await request(`/v1/resume-versions/${task.version.version.id}`, { document: task.version.version.document, expectedRevision: 1, status: "reviewed" }, "PATCH");
  assert.equal(published.status, 200);
  assert.equal(published.body.data.item.version.status, "reviewed");
  assert.equal(published.body.data.item.revision, 2);
});

test("review accepts only selected changes and rejects stale edits", () => {
  const source = { ...createEmptyPersonalProfile(), selfIntroduction: "原总结", strengths: "原技能" };
  const changes = [
    { id: "summary", field: "selfIntroduction", before: "原总结", after: "岗位总结", label: "总结", reason: "相关" },
    { id: "skills", field: "strengths", before: "原技能", after: "岗位技能", label: "技能", reason: "相关" }
  ];
  const proposal = { profile: source, changes, provider: "test", generatedAt: "now" };
  const result = applyReviewedResumeChanges(source, proposal, ["summary"]);
  assert.equal(result.selfIntroduction, "岗位总结");
  assert.equal(result.strengths, "原技能");
  assert.equal(source.selfIntroduction, "原总结");
  assert.throws(() => applyReviewedResumeChanges({ ...source, selfIntroduction: "手工修改" }, proposal, ["summary"]), /已修改/);
});


test("cloud templates retain old content while device clients cannot sync or delete them", async t => {
  const store = new MemoryStore({ persistence: false });
  const config = { ...loadApiConfig({}), host: "127.0.0.1", port: 0, opportunitySourceUrl: undefined, opportunitySeedPath: undefined };
  const app = createOfferFlowServer({ config, store });
  app.server.listen(0, config.host);
  await once(app.server, "listening");
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  const user = store.createUser("local-separation@example.invalid", "test", "test-password");
  const expiry = new Date(Date.now() + 3600000).toISOString();
  const web = store.createSession(user.id, "web", expiry).accessToken;
  const device = store.createSession(user.id, "device", expiry, "old-plugin", "Old plugin").accessToken;
  const other = store.createUser("other-separation@example.invalid", "other", "test-password");
  const otherToken = store.createSession(other.id, "web", expiry).accessToken;
  const request = async (token, path, method = "GET", body) => {
    const response = await fetch(`http://${config.host}:${app.server.address().port}${path}`, {
      method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  };
  const profile = { ...createEmptyPersonalProfile(), fullName: "Existing User", phone: "13800000000" };
  await store.syncResumeTemplates(user.id, [{ id: "old-template", revision: 0, name: "原有简历", profile, origin: "extension", createdAt: expiry, updatedAt: expiry }]);
  for (const [path, method, body] of [
    ["/v1/resume-templates/sync", "POST", { templates: [] }],
    ["/v1/resume-templates/old-template", "DELETE"],
    ["/v1/resume-templates", "GET"],
    ["/v1/resume-versions", "GET"],
    ["/v1/tailor-tasks", "POST", {}]
  ]) assert.equal((await request(device, path, method, body)).status, 403);
  const listed = await request(web, "/v1/resume-templates");
  assert.equal(listed.body.data.templates[0].profile.fullName, "Existing User");
  assert.equal(listed.body.data.templates[0].name, "原有简历");
  const old = listed.body.data.templates[0];
  const changed = await request(web, "/v1/resume-templates/old-template", "PATCH", { name: "保留后继续编辑", document: createResumeDocument({ id: "old-template", title: "保留后继续编辑", profile }), expectedRevision: old.revision });
  assert.equal(changed.status, 200);
  assert.equal((await request(otherToken, "/v1/resume-templates")).body.data.templates.length, 0);
  assert.equal((await request(otherToken, "/v1/resume-templates/old-template", "DELETE")).status, 404);
  assert.equal((await request(web, "/v1/resume-templates")).body.data.templates.length, 1);
});
