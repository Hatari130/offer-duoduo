import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createOfferFlowServer } from "../src/server.ts";
import { loadApiConfig } from "../src/config.ts";
import { MemoryStore } from "../src/store/memory-store.ts";
import { createEmptyPersonalProfile } from "../../../packages/domain/src/index.ts";
import { createInterviewCoachSession } from "../src/agent/interview-coach.ts";
import { createJobRadarSession } from "../src/agent/job-radar.ts";
import { agentMessagesFromHistory } from "../src/agent/teams.ts";

const call = (id, name, args) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });

async function startServer(agentModel) {
  const config = { ...loadApiConfig({}), host: "127.0.0.1", port: 0, tokenSecret: "offerflow-agent-teams-test" };
  const app = createOfferFlowServer({ config, store: new MemoryStore({ persistence: false }), agentModel });
  app.server.listen(0, config.host);
  await once(app.server, "listening");
  const baseUrl = `http://${config.host}:${app.server.address().port}`;
  const auth = await (await fetch(`${baseUrl}/v1/auth/demo`, { method: "POST" })).json();
  return { ...app, baseUrl, headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.data.accessToken}` } };
}

async function sseEvents(response) {
  const text = await response.text();
  return text.split("\n").filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice(5)));
}

test("a user's own skill can be created, joins their team and is consulted with the safety rules", async (t) => {
  const seenSystems = [];
  const script = [
    { role: "assistant", content: null, tool_calls: [] },
    { role: "assistant", content: "导师的意见我看过了。" }
  ];
  const model = {
    async complete(messages) {
      const system = messages[0].content || "";
      if (system.includes("你是我的研究生导师")) {
        seenSystems.push(system);
        return { role: "assistant", content: "学术经历可以再写清楚方法。" };
      }
      return script.shift();
    }
  };
  const app = await startServer(model);
  t.after(async () => {
    app.server.close();
    await once(app.server, "close");
  });

  const draft = {
    name: "我的导师", role: "研究生导师", when: "需要学术视角时", summary: "导师视角看科研经历",
    instructions: "你是我的研究生导师，按学术标准看简历里的科研经历。", teams: ["resume_coach"]
  };
  const invalid = await fetch(`${app.baseUrl}/v1/skills/custom`, { method: "POST", headers: app.headers, body: JSON.stringify({ ...draft, teams: ["dream_team"] }) });
  assert.equal(invalid.status, 400);
  const created = await (await fetch(`${app.baseUrl}/v1/skills/custom`, { method: "POST", headers: app.headers, body: JSON.stringify(draft) })).json();
  const id = `custom:${created.data.skill.id}`;

  const roster = (await (await fetch(`${app.baseUrl}/v1/chat-agents`, { headers: app.headers })).json()).data.skills;
  assert.ok(roster.some((skill) => skill.id === id && skill.source === "custom"));

  script[0].tool_calls = [call("c1", "consult_expert", { expert: id, request: "看看科研经历" })];
  const conversation = (await (await fetch(`${app.baseUrl}/v1/conversations`, { method: "POST", headers: app.headers, body: "{}" })).json()).data.conversation;
  const events = await sseEvents(await fetch(`${app.baseUrl}/v1/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers: app.headers,
    body: JSON.stringify({ content: "@我的导师 看看", clientMessageId: crypto.randomUUID(), agent: "resume_coach", skills: [id] })
  }));
  assert.equal(events.find((event) => event.type === "agent.expert").note.expertName, "我的导师");
  assert.match(seenSystems[0], /用户自己创建/, "自建技能必须带上安全规则");
  assert.deepEqual(events.find((event) => event.type === "message.completed").message.agentRun.skills, [id]);

  const removed = await fetch(`${app.baseUrl}/v1/skills/custom/${created.data.skill.id}`, { method: "DELETE", headers: app.headers });
  assert.equal(removed.status, 200);
  const exported = (await (await fetch(`${app.baseUrl}/v1/account/export`, { headers: app.headers })).json()).data;
  assert.deepEqual(exported.customSkills, []);
});

test("the interview team's sample answers cannot invent facts the user never gave", () => {
  const said = ["我们组织了一场 200 人的校园活动，我负责报名和现场签到"];
  const session = createInterviewCoachSession({
    profile: { ...createEmptyPersonalProfile(), selfIntroduction: "学生会干事" },
    userStatements: () => said,
    transcript: () => []
  });
  const propose = session.tools.find((tool) => tool.name === "propose_sample_answer");
  const invented = propose.run({ question: "讲一次组织活动的经历", answer: "我组织了 200 人的活动，报名转化率 85%", reason: "更具体" });
  assert.equal(invented.accepted, false);
  assert.match(invented.problems[0], /85/);
  const honest = propose.run({ question: "讲一次组织活动的经历", answer: "在一场 200 人的校园活动里，我负责报名和现场签到。【需要你补充：签到用了什么方法】", reason: "补上规模" });
  assert.equal(honest.accepted, true);
  assert.equal(session.accepted.size, 1);
});

test("the job radar can only show openings that came back from a search", async () => {
  const item = (id, title) => ({ id, company: "示例公司", title, graduationYears: ["2027"], roleTags: [], cities: ["上海"], officialUrl: "https://example.com" });
  const session = createJobRadarSession({
    search: async () => ({ query: "", total: 2, items: [item("a", "产品经理"), item("b", "运营")], sourceAvailable: true, isBroadSearch: false }),
    applications: [],
    userStatements: () => []
  });
  const tool = (name) => session.tools.find((candidate) => candidate.name === name);
  assert.match(tool("show_opportunities").run({ ids: ["a"] }).error, /不在检索结果里/);
  await tool("search_opportunities").run({ query: "上海 产品经理" });
  assert.match(tool("show_opportunities").run({ ids: ["zzz"] }).error, /zzz/);
  assert.deepEqual(tool("show_opportunities").run({ ids: ["b"] }), { shown: 1 });
  assert.deepEqual(session.results().items.map((opportunity) => opportunity.id), ["b"]);
});

test("search results flag companies already applied to and openings shown before", async () => {
  const item = (id, company) => ({ id, company, title: "产品经理", graduationYears: ["2027"], roleTags: [], cities: ["北京"], officialUrl: "https://example.com" });
  const session = createJobRadarSession({
    search: async () => ({ query: "", total: 3, items: [item("a", "滴滴出行"), item("b", "美团"), item("c", "小米")], sourceAvailable: true, isBroadSearch: false }),
    applications: [{ id: "app-1", company: "滴滴", position: "产品经理", stage: "applied" }],
    userStatements: () => [],
    shownBefore: ["b"]
  });
  const found = await session.tools.find((tool) => tool.name === "search_opportunities").run({ query: "北京 产品" });
  assert.deepEqual(found.items.map((opportunity) => [opportunity.id, Boolean(opportunity.applied), Boolean(opportunity.shownBefore)]), [
    ["a", true, false],
    ["b", false, true],
    ["c", false, false]
  ]);
});

test("long conversations replay tool calls only for the last two turns", () => {
  const turn = (index) => [
    { id: `u${index}`, role: "user", content: `第 ${index} 轮`, status: "complete" },
    {
      id: `a${index}`,
      role: "assistant",
      content: `回复 ${index}`,
      status: "complete",
      agentRun: {
        agent: "resume_coach",
        steps: [],
        rewrites: index === 1 ? [{ entryId: "camp-1", title: "融媒体中心", before: "写推文", after: "撰写推文 40 余篇", reason: "" }] : [],
        trace: [
          { role: "assistant", content: null, tool_calls: [call(`t${index}`, "get_resume", {})] },
          { role: "tool", tool_call_id: `t${index}`, content: "整份简历".repeat(500) },
          { role: "assistant", content: `回复 ${index}` }
        ]
      }
    }
  ];
  const messages = agentMessagesFromHistory([1, 2, 3, 4].flatMap(turn), "系统提示");
  const toolCalls = messages.filter((message) => message.role === "tool").map((message) => message.tool_call_id);
  assert.deepEqual(toolCalls, ["t3", "t4"]);
  assert.equal(messages.filter((message) => message.role === "user").length, 4);
  // An old turn keeps its reply and what it settled on.
  assert.equal(messages[2].content, "回复 1\n（这一轮已写好：「融媒体中心」→ 撰写推文 40 余篇）");
});

test("companies not yet applied to are computed over every match, grouped by company", async () => {
  const item = (id, company, role = "产品经理") => ({ id, company, title: "2027届", graduationYears: ["2027届"], roleTags: [role], cities: ["上海"], officialUrl: "https://example.com" });
  // 30 matches: more than one page of results, so the answer cannot come from the first 12 the model sees.
  const matches = [
    ...Array.from({ length: 10 }, (_, index) => item(`bytedance-${index}`, "字节跳动")),
    ...Array.from({ length: 12 }, (_, index) => item(`meituan-${index}`, "美团")),
    ...Array.from({ length: 8 }, (_, index) => item(`xiaomi-${index}`, "小米", "AI 产品经理"))
  ];
  const limits = [];
  const session = createJobRadarSession({
    search: async (_query, options) => {
      limits.push(options?.limit);
      const items = matches.slice(0, options?.limit ?? 12);
      return { query: "", total: matches.length, items, sourceAvailable: true, isBroadSearch: false };
    },
    applications: [{ id: "app-1", company: "字节跳动", position: "产品经理", stage: "applied" }],
    userStatements: () => []
  });
  const search = session.tools.find((tool) => tool.name === "search_opportunities");
  const found = await search.run({ query: "产品经理 2027届", exclude_applied: true });

  assert.ok(limits[0] >= matches.length);
  assert.equal(found.total, 20);
  assert.equal(found.companyCount, 2);
  assert.equal(found.appliedCompaniesExcluded, 1);
  assert.deepEqual(found.companies.map((company) => [company.company, company.openings]), [["美团", 12], ["小米", 8]]);
  assert.equal(found.items.some((opportunity) => opportunity.company === "字节跳动"), false);
  // Every unapplied opening can be shown as a card, not only the first page.
  assert.deepEqual(session.tools.find((tool) => tool.name === "show_opportunities").run({ ids: ["xiaomi-7"] }), { shown: 1 });
});

test("another agent's tool calls are not replayed, only what it said", () => {
  const run = (agent, id) => ({
    id: `a-${id}`,
    role: "assistant",
    content: `${agent} 的回复`,
    status: "complete",
    agentRun: {
      agent,
      steps: [],
      rewrites: [],
      trace: [
        { role: "assistant", content: null, tool_calls: [call(id, "list_applications", {})] },
        { role: "tool", tool_call_id: id, content: "{}" },
        { role: "assistant", content: `${agent} 的回复` }
      ]
    }
  });
  const history = [
    { id: "u1", role: "user", content: "我投了哪些", status: "complete" },
    run("companion", "c1"),
    { id: "u2", role: "user", content: "帮我改简历", status: "complete" },
    run("resume_coach", "r1")
  ];
  const forResumeTeam = agentMessagesFromHistory(history, "系统提示", "resume_coach");
  assert.deepEqual(forResumeTeam.filter((message) => message.role === "tool").map((message) => message.tool_call_id), ["r1"]);
  assert.ok(forResumeTeam.some((message) => message.role === "assistant" && message.content === "companion 的回复"));
});
