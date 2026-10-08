import assert from "node:assert/strict";
import test from "node:test";
import { companionAgentPrompt } from "../src/agent/companion.ts";
import { assistantRuntimeContext } from "../src/ai/runtime-context.ts";

test("anchors relative dates to the current Asia/Shanghai time", () => {
  const context = assistantRuntimeContext(new Date("2026-08-31T06:30:45.000Z"));

  assert.match(context, /当前北京时间：2026-08-31 14:30:45（星期一）/);
  assert.match(context, /“今天”指 2026-08-31/);
  assert.match(context, /“昨天”指 2026-08-30/);
  assert.match(context, /“最近一周”默认指 2026-08-25 至 2026-08-31/);
  assert.match(context, /秋招\/春招规划等时间问题时，必须以上述日期为基准计算/);
});

test("uses Shanghai time even when UTC is still on the previous day", () => {
  const context = assistantRuntimeContext(new Date("2026-08-31T16:15:00.000Z"));

  assert.match(context, /当前北京时间：2026-09-01 00:15:00（星期二）/);
  assert.match(context, /“昨天”指 2026-08-31/);
});

test("the default agent's system prompt carries the runtime date and its tools", () => {
  const prompt = companionAgentPrompt(new Date("2026-08-31T06:30:45.000Z"));

  assert.match(prompt, /当前北京时间：2026-08-31 14:30:45（星期一）/);
  assert.match(prompt, /exclude_applied: true/);
  assert.match(prompt, /只说已经做完的事/);
});
