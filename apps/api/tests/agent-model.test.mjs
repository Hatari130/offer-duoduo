import assert from "node:assert/strict";
import test from "node:test";
import { loadApiConfig } from "../src/config.ts";
import { createOpenAiCompatibleModel } from "../src/agent/model.ts";

const config = { ...loadApiConfig({}), aiApiKey: "test-key", aiBaseUrl: "https://api.example.com", aiModel: "deepseek-flash" };
const call = { id: "c1", type: "function", function: { name: "list_applications", arguments: "{}" } };

/** Replaces fetch for one test, recording request bodies and answering from `respond`. */
function mockFetch(t, respond) {
  const bodies = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init.body)));
    return respond(bodies.length);
  };
  t.after(() => { globalThis.fetch = original; });
  return bodies;
}

test("a thinking model's reasoning is kept on the message and sent back on the next request", async (t) => {
  const bodies = mockFetch(t, () => Response.json({
    choices: [{ message: { role: "assistant", content: null, reasoning_content: "先读投递记录，再查岗位库。", tool_calls: [call] } }]
  }));
  const model = createOpenAiCompatibleModel(config);
  const first = await model.complete([{ role: "user", content: "还有哪些公司没投" }], []);
  assert.equal(first.reasoning_content, "先读投递记录，再查岗位库。");

  await model.complete([{ role: "user", content: "还有哪些公司没投" }, first, { role: "tool", tool_call_id: "c1", content: "{}" }], []);
  assert.equal(bodies[1].messages[1].reasoning_content, "先读投递记录，再查岗位库。");
});

test("streamed reasoning is collected but never forwarded as reply text", async (t) => {
  const chunks = [
    { choices: [{ delta: { reasoning_content: "用户投了 93 条，" } }] },
    { choices: [{ delta: { reasoning_content: "先看方向。" } }] },
    { choices: [{ delta: { content: "你投了 93 条。" } }] }
  ];
  mockFetch(t, () => new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`, {
    headers: { "content-type": "text/event-stream" }
  }));
  const shown = [];
  const message = await createOpenAiCompatibleModel(config).complete([{ role: "user", content: "我投了多少" }], [], {
    onText: (delta) => shown.push(delta)
  });
  assert.equal(message.reasoning_content, "用户投了 93 条，先看方向。");
  assert.equal(message.content, "你投了 93 条。");
  assert.deepEqual(shown, ["你投了 93 条。"]);
});
