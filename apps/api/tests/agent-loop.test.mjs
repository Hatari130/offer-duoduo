import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyPersonalProfile } from "@offerflow/domain";
import { runAgentTurn } from "../src/agent/loop.ts";
import { createResumeCoachSession } from "../src/agent/resume-coach.ts";

/** A fake model that replays scripted assistant messages, so the loop can be tested without a network. */
function scriptedModel(script) {
  const seen = [];
  return {
    seen,
    async complete(messages) {
      seen.push(messages.map((message) => ({ ...message })));
      const next = script.shift();
      if (!next) throw new Error("script exhausted");
      return next;
    }
  };
}

const call = (id, name, args) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });

test("the loop runs tools and returns when the model answers in plain text", async () => {
  const events = [];
  const model = scriptedModel([
    { role: "assistant", content: null, tool_calls: [call("c1", "echo", { word: "hi" })] },
    { role: "assistant", content: "done" }
  ]);
  const messages = [{ role: "user", content: "go" }];
  const result = await runAgentTurn({
    model,
    tools: [{ name: "echo", description: "", parameters: {}, run: (args) => ({ echoed: args.word }) }],
    messages,
    onEvent: (event) => events.push(event.type)
  });
  assert.equal(result.reply, "done");
  assert.equal(result.steps, 2);
  assert.deepEqual(messages[2], { role: "tool", tool_call_id: "c1", content: JSON.stringify({ echoed: "hi" }) });
  assert.deepEqual(events, ["tool_call", "tool_result", "reply"]);
});

test("tool errors and unknown tools are returned to the model instead of crashing", async () => {
  const model = scriptedModel([
    { role: "assistant", content: null, tool_calls: [call("c1", "boom", {}), call("c2", "missing", {})] },
    { role: "assistant", content: "recovered" }
  ]);
  const messages = [{ role: "user", content: "go" }];
  await runAgentTurn({
    model,
    tools: [{ name: "boom", description: "", parameters: {}, run: () => { throw new Error("disk full"); } }],
    messages
  });
  assert.match(messages[2].content, /disk full/);
  assert.match(messages[3].content, /没有名为 missing 的工具/);
});

test("the loop stops at the step limit", async () => {
  const looping = { role: "assistant", content: null, tool_calls: [call("c", "noop", {})] };
  const model = scriptedModel([looping, looping, looping]);
  const result = await runAgentTurn({
    model,
    tools: [{ name: "noop", description: "", parameters: {}, run: () => ({}) }],
    messages: [{ role: "user", content: "go" }],
    maxSteps: 3
  });
  assert.equal(result.stoppedByStepLimit, true);
});

test("propose_rewrite rejects invented numbers and accepts facts the user just gave", async () => {
  const statements = [];
  const profile = {
    ...createEmptyPersonalProfile(),
    campusExperiences: [{ id: "camp-1", type: "融媒体中心", role: "干事", startDate: "", endDate: "", description: "• 写公众号推文，管理学院公众号" }]
  };
  const session = createResumeCoachSession({
    profile,
    job: { company: "某集团", position: "行政岗", sourceUrl: "", responsibilities: [], requirements: [] },
    userStatements: () => statements
  });
  const propose = session.tools.find((tool) => tool.name === "propose_rewrite");
  const draft = { entry_id: "camp-1", text: "撰写并发布公众号推文 40 余篇，单篇最高阅读 3000", reason: "宣传能力" };

  const rejected = await propose.run(draft);
  assert.equal(rejected.accepted, false);
  assert.equal(session.accepted.size, 0);

  statements.push("我一共写了 40 多篇，最高的一篇有 3000 阅读");
  assert.deepEqual(await propose.run(draft), { accepted: true, entry_id: "camp-1" });
  assert.equal(session.accepted.get("camp-1").after, draft.text);
});

function dataResumeSession(statements, claimChecker) {
  const profile = {
    ...createEmptyPersonalProfile(),
    experiences: [{ id: "exp-1", organization: "某电商公司", title: "运营实习生", startDate: "", endDate: "", description: "• 整理每周销售数据，做成表格发给组长" }]
  };
  const session = createResumeCoachSession({
    profile,
    job: { company: "某公司", position: "数据运营", sourceUrl: "", responsibilities: [], requirements: [] },
    userStatements: () => statements,
    claimChecker
  });
  return { session, propose: session.tools.find((tool) => tool.name === "propose_rewrite") };
}

test("skills from a JD the user pasted are not evidence that the user has them", async () => {
  const jd = "帮我对着这个岗位改\n岗位职责：\n1. 负责电商数据分析\n任职要求：\n1. 熟练使用 SQL 和 Python";
  const { propose } = dataResumeSession([jd]);
  const result = await propose.run({ entry_id: "exp-1", text: "使用 SQL 整理每周销售数据", reason: "对上岗位要求" });
  assert.equal(result.accepted, false);
  assert.match(result.problems.join(), /sql/i);
});

test("the claim checker rejects new claims the code check cannot see", async () => {
  const checks = [];
  const checker = {
    async complete(messages) {
      checks.push(messages);
      return { role: "assistant", content: "{\"unsupported\":[{\"claim\":\"搭建销售看板\",\"why\":\"用户只说过整理表格\"}]}" };
    }
  };
  const { session, propose } = dataResumeSession(["没做过看板，就是整理表格"], checker);
  const result = await propose.run({ entry_id: "exp-1", text: "整理每周销售数据并搭建销售看板", reason: "数据能力" });
  assert.equal(result.accepted, false);
  assert.match(result.problems[0], /搭建销售看板/);
  assert.equal(session.accepted.size, 0);
  // The checker sees the original, the rewrite and the user's words.
  assert.match(checks[0][1].content, /没做过看板/);

  // A rewrite the code check already rejects never reaches the checker.
  await propose.run({ entry_id: "exp-1", text: "整理 52 周销售数据", reason: "" });
  assert.equal(checks.length, 1);
});

test("an unreadable checker reply does not block a rewrite that passed the code check", async () => {
  const checker = { async complete() { return { role: "assistant", content: "我觉得没问题" }; } };
  const { propose } = dataResumeSession([], checker);
  assert.deepEqual(await propose.run({ entry_id: "exp-1", text: "每周整理销售数据，做成表格发给组长", reason: "" }), { accepted: true, entry_id: "exp-1" });
});
