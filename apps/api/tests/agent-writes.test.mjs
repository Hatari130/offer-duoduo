import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createOfferFlowServer } from "../src/server.ts";
import { loadApiConfig } from "../src/config.ts";
import { MemoryStore } from "../src/store/memory-store.ts";
import { applyRewrites } from "../src/agent/material-tools.ts";
import { createEmptyPersonalProfile, createResumeDocument } from "../../../packages/domain/src/index.ts";

const call = (id, name, args) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });

/** Replays scripted assistant messages; the rewrite claim checker always passes. */
function scriptedModel(script) {
  return {
    async complete(messages) {
      if (messages[0].content?.includes("简历事实核对员")) return { role: "assistant", content: "{\"unsupported\":[]}" };
      const next = script.shift();
      if (!next) throw new Error("script exhausted");
      return next;
    }
  };
}

async function startServer(t, agentModel) {
  const config = { ...loadApiConfig({}), host: "127.0.0.1", port: 0, tokenSecret: "offerflow-agent-writes-test", opportunitySourceUrl: undefined, opportunitySeedPath: undefined };
  const app = createOfferFlowServer({ config, store: new MemoryStore({ persistence: false }), agentModel });
  app.server.listen(0, config.host);
  await once(app.server, "listening");
  t.after(async () => {
    app.server.close();
    await once(app.server, "close");
  });
  const baseUrl = `http://${config.host}:${app.server.address().port}`;
  const auth = await (await fetch(`${baseUrl}/v1/auth/demo`, { method: "POST" })).json();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${auth.data.accessToken}` };
  const get = async (path) => (await (await fetch(`${baseUrl}${path}`, { headers })).json()).data;
  const post = (path, body) => fetch(`${baseUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { baseUrl, headers, get, post };
}

async function sseEvents(response) {
  const text = await response.text();
  return text.split("\n").filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice(5)));
}

function application(overrides) {
  return { stage: "applied", sourceUrl: "https://jobs.example.com/1", sourceHost: "jobs.example.com", responsibilities: [], requirements: [], events: [], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...overrides };
}

test("rewrites go back into the profile in its own format, and unknown entries are skipped", () => {
  const profile = {
    ...createEmptyPersonalProfile(),
    strengths: "Excel",
    experiences: [{ id: "exp-1", organization: "某公司", title: "实习生", startDate: "", endDate: "", description: "• 整理周报\n• 做表格" }],
    projects: [{ id: "proj-1", name: "小程序", role: "成员", startDate: "", endDate: "", description: "参与需求调研" }]
  };
  const { profile: next, applied } = applyRewrites(profile, [
    { entryId: "exp-1", after: "整理销售周报 12 期\n用 Excel 做透视表" },
    { entryId: "proj-1", after: "访谈 12 名用户，整理需求文档" },
    { entryId: "strengths", after: "Excel、PPT" },
    { entryId: "gone", after: "不存在的条目" }
  ]);
  assert.deepEqual(applied, ["exp-1", "proj-1", "strengths"]);
  assert.equal(next.experiences[0].description, "• 整理销售周报 12 期\n• 用 Excel 做透视表");
  assert.equal(next.projects[0].description, "访谈 12 名用户，整理需求文档");
  assert.equal(next.strengths, "Excel、PPT");
  assert.equal(profile.experiences[0].description, "• 整理周报\n• 做表格", "the input profile is not changed");
});

test("the resume team saves accepted rewrites into the tailored resume for the job, never into the general resume", async (t) => {
  const app = await startServer(t, scriptedModel([
    // Turn 1: rewrite one entry with the facts the user gives in the same message.
    { role: "assistant", content: null, tool_calls: [call("r1", "propose_rewrite", { entry_id: "camp-1", text: "撰写并发布公众号推文 40 余篇\n单篇最高阅读 3000", reason: "用户的回答" })] },
    { role: "assistant", content: "改好了，要保存到这个岗位的定岗简历吗？" },
    // Turn 2: the user asks to save.
    { role: "assistant", content: null, tool_calls: [call("s1", "save_tailored_resume", {})] },
    { role: "assistant", content: "已经存好了，可以去简历页导出 PDF。" },
    // Turn 3: one more rewrite, saved again: the same tailored resume is updated.
    { role: "assistant", content: null, tool_calls: [call("r2", "propose_rewrite", { entry_id: "summary", text: "汉语言文学专业本科生，写过 40 余篇公众号推文。", reason: "对齐岗位" })] },
    { role: "assistant", content: null, tool_calls: [call("s2", "save_tailored_resume", {})] },
    { role: "assistant", content: "总结也写进去了。" }
  ]));
  const profile = {
    ...createEmptyPersonalProfile(),
    selfIntroduction: "汉语言文学专业本科生。",
    campusExperiences: [{ id: "camp-1", type: "学院融媒体中心", role: "干事", startDate: "2024-09", endDate: "2026-06", description: "• 写公众号推文，管理学院公众号" }]
  };
  await app.post("/v1/resume-templates", { id: "resume-1", name: "通用简历", document: createResumeDocument({ id: "resume-1", title: "通用简历", profile }) });
  await app.post("/v1/applications", { application: application({ id: "app-1", company: "远航智能", position: "新媒体运营" }) });
  const option = (await app.get("/v1/chat-context")).contexts.find((item) => item.kind === "application");
  const conversation = (await (await app.post("/v1/conversations", {})).json()).data.conversation;
  const send = (content, extra = {}) => app.post(`/v1/conversations/${conversation.id}/messages`, { content, clientMessageId: crypto.randomUUID(), ...extra });
  const versions = async () => (await app.get("/v1/resume-versions")).versions;

  await sseEvents(await send("一共写了 40 多篇，最高的一篇 3000 阅读，帮我改简历", { agent: "resume_coach", context: [option] }));
  assert.equal((await versions()).length, 0, "nothing is saved until the user asks");

  const saved = await sseEvents(await send("保存到定岗简历"));
  const write = saved.find((event) => event.type === "message.completed").message.agentRun.writes[0];
  assert.equal(write.kind, "tailored_resume");
  assert.match(write.detail, /新建定岗简历，写入 1 条改写/);
  const [created] = await versions();
  assert.equal(write.href, `/app/resumes/tailor/${encodeURIComponent(created.version.tailorTaskId)}`);
  assert.equal(created.version.applicationId, "app-1");
  // Bullets stay bullets, the way the resume was written.
  assert.equal(created.version.document.profile.campusExperiences[0].description, "• 撰写并发布公众号推文 40 余篇\n• 单篇最高阅读 3000");
  assert.equal((await app.get("/v1/applications/app-1")).item.application.tailoredResumeVersionId, created.version.id);

  await sseEvents(await send("总结也改一下再存"));
  const after = await versions();
  assert.equal(after.length, 1, "a second save updates the same tailored resume");
  assert.equal(after[0].version.document.profile.selfIntroduction, "汉语言文学专业本科生，写过 40 余篇公众号推文。");
  assert.match(after[0].version.document.profile.campusExperiences[0].description, /40 余篇/);

  const general = (await app.get("/v1/resume-templates/resume-1")).template;
  assert.equal(general.document.profile.selfIntroduction, "汉语言文学专业本科生。");
  assert.equal(general.document.profile.campusExperiences[0].description, "• 写公众号推文，管理学院公众号");
});

test("小鲤 records a status change the user states, and the application timeline shows who changed it", async (t) => {
  const app = await startServer(t, scriptedModel([
    { role: "assistant", content: null, tool_calls: [call("u1", "update_application", { application_id: "app-1", assessment_done: true })] },
    { role: "assistant", content: "记下了，满帮的测评标成已完成。" }
  ]));
  await app.post("/v1/applications", { application: application({ id: "app-1", company: "满帮集团", position: "产品经理", stage: "assessment", deadline: "2026-10-09" }) });
  const conversation = (await (await app.post("/v1/conversations", {})).json()).data.conversation;
  const events = await sseEvents(await app.post(`/v1/conversations/${conversation.id}/messages`, { content: "满帮的测评我做完了", clientMessageId: crypto.randomUUID() }));

  const write = events.find((event) => event.type === "message.completed").message.agentRun.writes[0];
  assert.deepEqual([write.kind, write.title, write.detail, write.href], ["application", "满帮集团 · 产品经理", "测评已完成", "/app/applications"]);
  const saved = (await app.get("/v1/applications/app-1")).item.application;
  assert.equal(saved.assessmentCompleted, true);
  assert.equal(saved.events.at(-1).title, "小鲤根据对话更新：测评已完成");
});
