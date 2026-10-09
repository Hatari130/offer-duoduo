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

test("the default agent's system prompt carries principles, not procedures, and no date", () => {
  const prompt = companionAgentPrompt();

  // The date changes every request and would stop the model API from caching the prompt and history.
  assert.doesNotMatch(prompt, /当前北京时间/);
  // Its own knowledge is welcome; hiring facts come from the feed.
  assert.match(prompt, /你自己对行业、公司、岗位的了解可以放心用/);
  assert.match(prompt, /只能来自岗位库/);
  assert.match(prompt, /只说已经做完的事/);
  // No "when the user asks X, call Y" scripts.
  assert.doesNotMatch(prompt, /exclude_applied/);
});
