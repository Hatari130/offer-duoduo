import assert from "node:assert/strict";
import test from "node:test";
import { createAssistantProvider } from "../src/ai/assistant.ts";
import { assistantRuntimeContext } from "../src/ai/runtime-context.ts";
import { loadApiConfig } from "../src/config.ts";

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

test("sends the runtime date in the model system message", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response("data: [DONE]\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" }
    });
  };

  try {
    const provider = createAssistantProvider(
      loadApiConfig({ NODE_ENV: "test", AI_API_KEY: "test-key" }),
      () => new Date("2026-08-31T06:30:45.000Z")
    );
    const stream = provider.generate({ prompt: "现在是什么时间", history: [], citations: [] });
    await stream.next();

    assert.match(requestBody.messages[0].content, /当前北京时间：2026-08-31 14:30:45（星期一）/);
    assert.equal(requestBody.messages.at(-1).content, "现在是什么时间");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
