import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createOfferFlowServer } from "../src/server.ts";
import { loadApiConfig } from "../src/config.ts";
import { MemoryStore } from "../src/store/memory-store.ts";
import { createEmptyPersonalProfile, createResumeDocument } from "../../../packages/domain/src/index.ts";

const call = (id, name, args) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });

/** Replays scripted assistant messages and records what the model was shown. The claim checker always passes. */
function scriptedModel(script) {
  const seen = [];
  return {
    seen,
    async complete(messages) {
      if (messages[0].content?.includes("简历事实核对员")) return { role: "assistant", content: "{\"unsupported\":[]}" };
      seen.push(structuredClone(messages));
      const next = script.shift();
      if (!next) throw new Error("script exhausted");
      return next;
    }
  };
}

async function startServer(agentModel) {
  const config = { ...loadApiConfig({}), host: "127.0.0.1", port: 0, tokenSecret: "offerflow-agent-chat-test" };
  const app = createOfferFlowServer({ config, store: new MemoryStore({ persistence: false }), agentModel });
  app.server.listen(0, config.host);
  await once(app.server, "listening");
  return { ...app, baseUrl: `http://${config.host}:${app.server.address().port}` };
}

async function sseEvents(response) {
  const text = await response.text();
  return text.split("\n").filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice(5)));
}

test("resume coach runs as an agent in chat and resumes from stored state on the next turn", async (t) => {
  const model = scriptedModel([
    // Turn 1: read materials, then ask a question.
    { role: "assistant", content: null, tool_calls: [call("t1", "get_resume", {}), call("t2", "get_job", {})] },
    { role: "assistant", content: "公众号一共写了多少篇？最高的一篇阅读量多少？" },
    // Turn 2: write the user's answer into the resume.
    { role: "assistant", content: null, tool_calls: [call("t3", "propose_rewrite", {
      entry_id: "camp-1",
      text: "撰写并发布公众号推文 40 余篇，单篇最高阅读 3000",
      reason: "用到了用户说的篇数和阅读量"
    })] },
    { role: "assistant", content: "改好了：公众号那条写进了 40 余篇和 3000 阅读。" }
  ]);
  const app = await startServer(model);
  t.after(async () => {
    app.server.close();
    await once(app.server, "close");
  });

  const auth = await (await fetch(`${app.baseUrl}/v1/auth/demo`, { method: "POST" })).json();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${auth.data.accessToken}` };
  const profile = {
    ...createEmptyPersonalProfile(),
    selfIntroduction: "汉语言文学专业本科生。",
    campusExperiences: [{ id: "camp-1", type: "学院融媒体中心", role: "干事", startDate: "2024-09", endDate: "2026-06", description: "写公众号推文，管理学院公众号" }]
  };
  const template = await fetch(`${app.baseUrl}/v1/resume-templates`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: "resume-1", name: "通用简历", document: createResumeDocument({ id: "resume-1", title: "通用简历", profile }) })
  });
  assert.equal(template.status, 201);
  const conversation = (await (await fetch(`${app.baseUrl}/v1/conversations`, { method: "POST", headers, body: "{}" })).json()).data.conversation;
  const send = (content, extra = {}) => fetch(`${app.baseUrl}/v1/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content, clientMessageId: crypto.randomUUID(), ...extra })
  });

  const first = await sseEvents(await send("帮我把简历针对这个岗位改一下", { agent: "resume_coach" }));
  const steps = first.filter((event) => event.type === "agent.step").map((event) => [event.step.label, event.step.status]);
  assert.deepEqual(steps, [["读取简历", "done"], ["读取岗位要求", "done"]]);
  const firstMessage = first.find((event) => event.type === "message.completed").message;
  assert.equal(firstMessage.content, "公众号一共写了多少篇？最高的一篇阅读量多少？");
  assert.equal(firstMessage.agentRun.agent, "resume_coach");
  assert.equal(firstMessage.agentRun.trace.length, 4);

  // No agent flag: the conversation already belongs to the agent.
  const second = await sseEvents(await send("一共写了 40 多篇，最高的一篇 3000 阅读"));
  const rewrite = second.find((event) => event.type === "agent.rewrite").rewrite;
  assert.equal(rewrite.entryId, "camp-1");
  assert.equal(rewrite.before, "写公众号推文，管理学院公众号");
  assert.equal(second.find((event) => event.type === "message.completed").message.agentRun.rewrites.length, 1);

  // The second turn saw the first turn's tool calls and results replayed from storage.
  const replayed = model.seen[2];
  assert.ok(replayed.some((message) => message.role === "tool" && message.tool_call_id === "t1"));
  assert.equal(replayed.at(-1).content, "一共写了 40 多篇，最高的一篇 3000 阅读");

  const stored = (await (await fetch(`${app.baseUrl}/v1/conversations/${conversation.id}`, { headers })).json()).data.messages;
  assert.equal(stored.at(-1).agentRun.rewrites[0].after, "撰写并发布公众号推文 40 余篇，单篇最高阅读 3000");
});

test("a review panel consults two experts in parallel and stores their opinions", async (t) => {
  const script = [
    { role: "assistant", content: null, tool_calls: [
      call("e1", "consult_expert", { expert: "hr-screener", request: "看看能不能过初筛" }),
      call("e2", "consult_expert", { expert: "business-interviewer", request: "哪些经历经不起追问" })
    ] },
    { role: "assistant", content: "两位专家都看过了，最该先补的是公众号的阅读数据。" }
  ];
  // Expert calls run in parallel, so they are answered by who is speaking rather than by script order.
  const model = {
    async complete(messages) {
      const system = messages[0].content || "";
      if (system.includes("你是校招 HR 小周")) return { role: "assistant", content: "第一印象：做过新媒体，但看不出量级。" };
      if (system.includes("你是用人部门负责人老陈")) return { role: "assistant", content: "我会追问：40 篇推文里你最满意哪篇？" };
      return script.shift();
    }
  };
  const app = await startServer(model);
  t.after(async () => {
    app.server.close();
    await once(app.server, "close");
  });
  const auth = await (await fetch(`${app.baseUrl}/v1/auth/demo`, { method: "POST" })).json();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${auth.data.accessToken}` };

  const roster = (await (await fetch(`${app.baseUrl}/v1/chat-agents`, { headers })).json()).data;
  assert.deepEqual(roster.agents.map((agent) => agent.id), ["resume_coach", "interview_coach", "job_radar", "career_planner"]);
  assert.ok(roster.skills.some((skill) => skill.name === "HR 小周"));
  assert.equal(roster.skills.some((skill) => "instructions" in skill), false, "公开名单里不能带工作方法");

  const conversation = (await (await fetch(`${app.baseUrl}/v1/conversations`, { method: "POST", headers, body: "{}" })).json()).data.conversation;
  const events = await sseEvents(await fetch(`${app.baseUrl}/v1/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: "帮我整体看看这份简历能不能过", clientMessageId: crypto.randomUUID(), agent: "resume_coach" })
  }));
  const notes = events.filter((event) => event.type === "agent.expert").map((event) => event.note.expertName).sort();
  assert.deepEqual(notes, ["HR 小周", "面试官 老陈"]);
  const steps = events.filter((event) => event.type === "agent.step").map((event) => event.step.label).sort();
  assert.deepEqual(steps, ["请 HR 小周 看了一眼", "请 面试官 老陈 看了一眼"]);
  const completed = events.find((event) => event.type === "message.completed").message;
  assert.equal(completed.agentRun.notes.length, 2);
});

test("an invented number is rejected by the guard and shown as a rejected step", async (t) => {
  const model = scriptedModel([
    { role: "assistant", content: null, tool_calls: [call("t1", "propose_rewrite", {
      entry_id: "summary",
      text: "汉语言文学专业本科生，公众号阅读量提升 50%",
      reason: "显得厉害"
    })] },
    { role: "assistant", content: "这个数字没有出处，我先不写。" }
  ]);
  const app = await startServer(model);
  t.after(async () => {
    app.server.close();
    await once(app.server, "close");
  });
  const auth = await (await fetch(`${app.baseUrl}/v1/auth/demo`, { method: "POST" })).json();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${auth.data.accessToken}` };
  const profile = { ...createEmptyPersonalProfile(), selfIntroduction: "汉语言文学专业本科生。" };
  await fetch(`${app.baseUrl}/v1/resume-templates`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: "resume-1", name: "通用简历", document: createResumeDocument({ id: "resume-1", title: "通用简历", profile }) })
  });
  const conversation = (await (await fetch(`${app.baseUrl}/v1/conversations`, { method: "POST", headers, body: "{}" })).json()).data.conversation;
  const events = await sseEvents(await fetch(`${app.baseUrl}/v1/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: "帮我改简历", clientMessageId: crypto.randomUUID(), agent: "resume_coach" })
  }));
  const step = events.find((event) => event.type === "agent.step").step;
  assert.equal(step.status, "rejected");
  assert.match(step.detail, /50/);
  assert.equal(events.some((event) => event.type === "agent.rewrite"), false);
});

async function demoConversation(app) {
  const auth = await (await fetch(`${app.baseUrl}/v1/auth/demo`, { method: "POST" })).json();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${auth.data.accessToken}` };
  const conversation = (await (await fetch(`${app.baseUrl}/v1/conversations`, { method: "POST", headers, body: "{}" })).json()).data.conversation;
  const send = (content, extra = {}) => fetch(`${app.baseUrl}/v1/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content, clientMessageId: crypto.randomUUID(), agent: "resume_coach", ...extra })
  });
  return { headers, conversation, send };
}

test("the reply streams token by token and a preamble before a tool call is withdrawn", async (t) => {
  const script = [
    { text: ["我先看", "看简历"], message: { role: "assistant", content: "我先看看简历", tool_calls: [call("t1", "get_resume", {})] } },
    { text: ["简历还", "没有，", "先建一份吧。"], message: { role: "assistant", content: "简历还没有，先建一份吧。" } }
  ];
  const model = {
    async complete(messages, tools, options = {}) {
      const next = script.shift();
      for (const delta of next.text) options.onText?.(delta);
      return next.message;
    }
  };
  const app = await startServer(model);
  t.after(async () => {
    app.server.close();
    await once(app.server, "close");
  });
  const { send } = await demoConversation(app);
  const events = await sseEvents(await send("帮我改简历"));
  const text = events.filter((event) => ["message.delta", "message.reset"].includes(event.type))
    .map((event) => event.type === "message.reset" ? "|reset|" : event.delta);
  assert.deepEqual(text, ["我先看", "看简历", "|reset|", "简历还", "没有，", "先建一份吧。"]);
  assert.equal(events.find((event) => event.type === "message.completed").message.content, "简历还没有，先建一份吧。");
});

test("stopping a team turn cancels the model call and keeps one turn per user at a time", async (t) => {
  let started;
  const modelStarted = new Promise((resolve) => { started = resolve; });
  let cancelled = false;
  const model = {
    complete(messages, tools, options = {}) {
      started();
      options.onText?.("正在想");
      return new Promise((resolve, reject) => {
        options.signal?.addEventListener("abort", () => {
          cancelled = true;
          reject(options.signal.reason);
        });
      });
    }
  };
  const app = await startServer(model);
  t.after(async () => {
    app.server.close();
    await once(app.server, "close");
  });
  const { headers, conversation, send } = await demoConversation(app);

  const stop = new AbortController();
  const first = send("帮我改简历", { signal: stop.signal });
  const firstResponse = await first;
  await modelStarted;

  const busy = await send("再发一条");
  assert.equal(busy.status, 429);
  assert.equal((await busy.json()).error.code, "AGENT_BUSY");

  stop.abort();
  await firstResponse.body.cancel().catch(() => {});
  for (let i = 0; i < 50 && !cancelled; i++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(cancelled, true, "模型请求应被取消");

  let messages = [];
  for (let i = 0; i < 50; i++) {
    messages = (await (await fetch(`${app.baseUrl}/v1/conversations/${conversation.id}`, { headers })).json()).data.messages;
    if (messages.at(-1)?.status === "stopped") break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(messages.at(-1).status, "stopped");
  assert.equal(messages.at(-1).content, "正在想");
  // The refused message was not stored.
  assert.equal(messages.filter((message) => message.role === "user").length, 1);
});
