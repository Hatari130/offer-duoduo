import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createOfferFlowServer } from "../src/server.ts";
import { loadApiConfig } from "../src/config.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

async function startTestServer() {
  const config = {
    ...loadApiConfig({}),
    host: "127.0.0.1",
    port: 0,
    tokenSecret: "offerflow-resume-test-secret"
  };
  const app = createOfferFlowServer({
    config,
    store: new MemoryStore({ persistence: false }),
    resumeTailor: {
      configured: true,
      name: "test-tailor",
      async generate(_job, sourceProfile) {
        const tailored = structuredClone(sourceProfile);
        tailored.selfIntroduction = "面向 AI 产品经理岗位，关注 Agent 产品规划与落地。";
        return {
          profile: tailored,
          changes: [{
            id: "change-1",
            field: "selfIntroduction",
            label: "个人总结",
            before: sourceProfile.selfIntroduction,
            after: tailored.selfIntroduction,
            reason: "突出岗位相关能力"
          }],
          provider: "test-tailor",
          generatedAt: new Date().toISOString()
        };
      }
    }
  });
  app.server.listen(0, config.host);
  await once(app.server, "listening");
  const address = app.server.address();
  return { ...app, baseUrl: `http://${config.host}:${address.port}` };
}

async function jsonRequest(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const payload = await response.json();
  return { response, payload };
}

function profile() {
  return {
    fullName: "陈城",
    gender: "男",
    phone: "18300000000",
    email: "candidate@example.com",
    birthDate: "",
    graduationDate: "2027-06",
    currentCity: "南京",
    nativePlace: "安徽",
    height: "",
    weight: "",
    recruitmentType: "",
    graduateStatus: "",
    address: "",
    targetRole: "产品经理",
    targetCities: "上海",
    earliestStartDate: "",
    portfolioUrl: "",
    githubUrl: "",
    education: [{ id: "edu-1", school: "南京大学", major: "城乡规划", degree: "硕士", startDate: "2024-09", endDate: "2027-06", gpa: "" }],
    experiences: [],
    projects: [],
    campusExperiences: [],
    awards: [],
    selfIntroduction: "关注 AI 产品与用户体验。",
    strengths: "产品规划；用户研究",
    careerPlan: ""
  };
}

test("extension handoff creates, opens and autosaves a tailored resume version", async (t) => {
  const app = await startTestServer();
  t.after(async () => {
    app.server.close();
    await once(app.server, "close");
  });

  const auth = await jsonRequest(app.baseUrl, "/v1/auth/demo", { method: "POST" });
  const token = auth.payload.data.accessToken;
  const created = await jsonRequest(app.baseUrl, "/v1/tailor-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      sourceResumeId: "master-1",
      sourceResumeName: "AI 产品母版",
      sourceProfile: profile(),
      sourceAssets: [{
        id: "portrait-1",
        kind: "portrait",
        dataUrl: "data:image/png;base64,AA==",
        mimeType: "image/png",
        width: 120,
        height: 160,
        source: "pdf",
        sourcePage: 1
      }],
      sourcePortraitAssetId: "portrait-1",
      job: {
        company: "示例科技",
        position: "AI 产品经理",
        city: "上海",
        sourceUrl: "https://jobs.example.com/ai-pm",
        responsibilities: ["负责 AI 产品规划"],
        requirements: ["熟悉 Agent 与 RAG"]
      }
    })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.data.version.version.document.profile.targetRole, "AI 产品经理");
  assert.equal(created.payload.data.version.version.document.portraitAssetId, "portrait-1");
  assert.equal(created.payload.data.version.version.document.assets[0].dataUrl, "data:image/png;base64,AA==");
  assert.ok(created.payload.data.handoff.code);

  const exchanged = await jsonRequest(app.baseUrl, "/v1/auth/handoff-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: created.payload.data.handoff.code })
  });
  assert.equal(exchanged.response.status, 200);
  assert.equal(exchanged.payload.data.targetPath, `/app/resumes/tailor/${created.payload.data.task.id}`);

  const reused = await jsonRequest(app.baseUrl, "/v1/auth/handoff-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: created.payload.data.handoff.code })
  });
  assert.equal(reused.response.status, 401);

  const webToken = exchanged.payload.data.accessToken;
  const task = await jsonRequest(app.baseUrl, `/v1/tailor-tasks/${created.payload.data.task.id}`, {
    headers: { Authorization: `Bearer ${webToken}` }
  });
  assert.equal(task.response.status, 200);

  const generated = await jsonRequest(app.baseUrl, `/v1/tailor-tasks/${created.payload.data.task.id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${webToken}` }
  });
  assert.equal(generated.response.status, 200);
  assert.equal(generated.payload.data.proposal.changes.length, 1);
  assert.equal(generated.payload.data.proposal.profile.selfIntroduction, "面向 AI 产品经理岗位，关注 Agent 产品规划与落地。");

  const document = structuredClone(task.payload.data.version.version.document);
  document.profile.fullName = "陈城（定制版）";
  const saved = await jsonRequest(app.baseUrl, `/v1/resume-versions/${task.payload.data.version.version.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${webToken}` },
    body: JSON.stringify({ document, expectedRevision: 1 })
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.payload.data.item.revision, 2);
  assert.equal(saved.payload.data.item.version.document.profile.fullName, "陈城（定制版）");

  const conflict = await jsonRequest(app.baseUrl, `/v1/resume-versions/${task.payload.data.version.version.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${webToken}` },
    body: JSON.stringify({ document, expectedRevision: 1 })
  });
  assert.equal(conflict.response.status, 409);
});
