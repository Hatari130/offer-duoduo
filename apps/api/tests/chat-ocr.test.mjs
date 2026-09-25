import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createChatOcrProvider, extractOcrMarkdown, validateOcrResultUrl } from "../src/chat/ocr.ts";
import { loadApiConfig } from "../src/config.ts";
import { createOfferFlowServer } from "../src/server.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFEcAAAAASUVORK5CYII=", "base64");
const json = (data) => new Response(JSON.stringify({ data }));
const jsonl = (text) => JSON.stringify({ result: { layoutParsingResults: [{ markdown: { text, images: { "crop.png": "https://storage.example/crop.png" } }, outputImages: { annotated: "https://storage.example/output.png" } }] } });
const config = () => loadApiConfig({ PADDLE_OCR_TOKEN: "test-provider-secret" });

test("PaddleOCR posts multipart, polls pending/running/done, returns page text without downloading images", async () => {
  const calls = [];
  const fileBytes = Buffer.from(png);
  const responses = [json({ jobId: "job-1" }), json({ state: "pending" }), json({ state: "running" }), json({ state: "done", resultUrl: { jsonUrl: "https://storage.example/result.jsonl" } }), new Response(`${jsonl("# 岗位描述\n![图片](https://storage.example/crop.png)")}\n${jsonl("岗位职责：用户研究")}`)];
  const provider = createChatOcrProvider(config(), {
    pollMs: 1,
    validateResultUrl: async (url) => assert.equal(url, "https://storage.example/result.jsonl"),
    fetchImpl: async (url, init) => {
      calls.push({ url, headers: init.headers });
      if (init.method === "POST") {
        assert.equal(init.headers.authorization, "bearer test-provider-secret");
        assert.equal(init.body.get("model"), "PaddleOCR-VL-1.6");
        assert.equal(init.body.get("file").name, "attachment.png");
        assert.deepEqual(Buffer.from(await init.body.get("file").arrayBuffer()), fileBytes);
        assert.deepEqual(JSON.parse(init.body.get("optionalPayload")), { useDocOrientationClassify: false, useDocUnwarping: false, useChartRecognition: false });
      }
      assert.equal(init.redirect, "error");
      return responses.shift();
    }
  });
  assert.equal(await provider.recognize(fileBytes, "image/png", new AbortController().signal), "# 岗位描述\n\n岗位职责：用户研究");
  assert.equal(calls.length, 5);
  assert.equal(calls[4].headers, undefined, "provider token must not be sent to result storage");
});

test("OCR rejects empty/oversized text and private result URLs", async () => {
  assert.throws(() => extractOcrMarkdown(jsonl("![image](https://example.com/a.png)<img src='x'>")), { code: "OCR_NO_TEXT" });
  assert.throws(() => extractOcrMarkdown(jsonl("中".repeat(70_000))), { code: "OCR_TEXT_TOO_LARGE" });
  for (const url of ["http://example.com/file", "https://127.0.0.1/file", "https://10.0.0.1/file", "https://[::1]/file", "https://user:secret@example.com/file"]) {
    await assert.rejects(validateOcrResultUrl(url));
  }
});

test("OCR handles provider failure and malformed data without leaking provider response content", async () => {
  for (const response of [json({ state: "failed", errorMsg: "private upstream info" }), json({ state: "unknown" }), new Response("private token test-provider-secret", { status: 401 }), new Response("not json")]) {
    let call = 0;
    const provider = createChatOcrProvider(config(), { fetchImpl: async () => ++call === 1 ? json({ jobId: "j" }) : response });
    await assert.rejects(provider.recognize(Buffer.from(png), "image/png", new AbortController().signal), (error) => {
      assert.doesNotMatch(error.message, /private|test-provider-secret|not json/);
      return ["OCR_FAILED", "OCR_UPSTREAM_ERROR"].includes(error.code);
    });
  }
});

test("OCR pending polling has a deadline and respects browser cancellation", async () => {
  const fetchImpl = async (url, init) => init.method === "POST" ? json({ jobId: "j" }) : json({ state: "pending" });
  const provider = createChatOcrProvider(config(), { fetchImpl, timeoutMs: 20, pollMs: 100 });
  await assert.rejects(provider.recognize(Buffer.from(png), "image/png", new AbortController().signal), { code: "OCR_TIMEOUT" });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(provider.recognize(Buffer.from(png), "image/png", controller.signal), { code: "OCR_CANCELLED" });
});

async function serverFixture(t, chatOcr) {
  const app = createOfferFlowServer({
    config: { ...loadApiConfig({}), port: 0, demoStreamDelayMs: 0, opportunitySourceUrl: undefined, opportunitySeedPath: undefined },
    chatOcr,
    store: new MemoryStore({ persistence: false }),
    assistant: { model: "test", async *generate(input) { yield input.citations.map((item) => item.excerpt).join("\n") || "已读取"; } }
  });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  t.after(() => new Promise((resolve) => { app.server.close(resolve); app.server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const auth = await (await fetch(`${base}/v1/auth/demo`, { method: "POST" })).json();
  const authorization = `Bearer ${auth.data.accessToken}`;
  const post = (path, body) => fetch(`${base}${path}`, { method: "POST", headers: { authorization, "content-type": "application/json" }, body: JSON.stringify(body) });
  const upload = (body = png, type = "image/png", authorized = true) => fetch(`${base}/v1/chat/ocr`, {
    method: "POST", headers: { ...(authorized ? { authorization } : {}), "content-type": type }, body
  });
  return { app, base, authorization, post, upload };
}

test("OCR endpoint requires authentication, validates uploads, wipes buffers, and chat persists only extracted text", async (t) => {
  const retained = [];
  let fail = false;
  const fixture = await serverFixture(t, {
    configured: true,
    async recognize(bytes) {
      retained.push(bytes);
      assert.equal(bytes[0], 137);
      if (fail) throw new Error("PRIVATE_ORIGINAL_FILE");
      return "岗位职责：负责用户研究和产品设计。";
    }
  });
  assert.equal((await fixture.upload(png, "image/png", false)).status, 401);
  assert.equal((await fixture.upload(png, "application/zip")).status, 415);
  assert.equal((await fixture.upload(Buffer.from("not a png"))).status, 400);
  assert.equal((await fixture.upload(Buffer.alloc(0))).status, 400);
  assert.equal((await fixture.upload(Buffer.alloc(8 * 1024 * 1024 + 1))).status, 413);
  const recognized = await fixture.upload();
  assert.equal(recognized.status, 200);
  assert.equal(recognized.headers.get("cache-control"), "no-store");
  const { data } = await recognized.json();
  assert.deepEqual(data, { text: "岗位职责：负责用户研究和产品设计。" });
  assert.equal(retained[0].every((byte) => byte === 0), true);
  const created = await (await fixture.post("/v1/conversations", {})).json();
  const path = `/v1/conversations/${created.data.conversation.id}`;
  const attachments = [
    { id: "image", name: "截图.png", mimeType: "image/png", size: png.length, content: data.text },
    { id: "pdf", name: "简历.pdf", mimeType: "application/pdf", size: 1_000_000, content: "经历：产品设计项目。" }
  ];
  const sent = await fixture.post(`${path}/messages`, { clientMessageId: "m1", content: "请阅读附件，概括主要内容并给出建议。", attachments });
  assert.equal(sent.status, 200);
  assert.match(await sent.text(), /message.completed/);
  const history = await (await fetch(`${fixture.base}${path}`, { headers: { authorization: fixture.authorization } })).json();
  assert.deepEqual(history.data.messages.find((item) => item.role === "user").attachments, attachments);
  const followUp = await fixture.post(`${path}/messages`, { clientMessageId: "m2", content: "刚才截图中的职责是什么？" });
  assert.equal(followUp.status, 200);
  assert.match(await followUp.text(), /岗位职责：负责用户研究和产品设计/);
  const bad = await fixture.post(`${path}/messages`, { clientMessageId: "bad", content: "分析", attachments: [{ ...attachments[0], base64: png.toString("base64") }] });
  assert.equal(bad.status, 400);
  fail = true;
  const failed = await fixture.upload();
  assert.equal(failed.status, 500);
  assert.doesNotMatch(await failed.text(), /PRIVATE_ORIGINAL_FILE/);
  assert.equal(retained[1].every((byte) => byte === 0), true);
  fail = false;
  assert.equal((await fixture.upload()).status, 200, "failed requests must free concurrency slots");
});

test("OCR endpoint reports missing configuration without accepting uploads", async (t) => {
  const fixture = await serverFixture(t, { configured: false, async recognize() { assert.fail("must not call OCR"); } });
  const response = await fixture.upload();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "OCR_NOT_CONFIGURED");
});

test("OCR endpoint rejects concurrent work for the same user", async (t) => {
  let release;
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const fixture = await serverFixture(t, { configured: true, async recognize() {
    started();
    await new Promise((resolve) => { release = resolve; });
    return "识别文字";
  } });
  const first = fixture.upload();
  await startedPromise;
  try { assert.equal((await fixture.upload()).status, 429); }
  finally { release(); }
  assert.equal((await first).status, 200);
});

test("browser cancellation aborts OCR work and clears its in-memory file", async (t) => {
  let retained;
  let notifyStarted;
  let notifyAborted;
  const started = new Promise((resolve) => { notifyStarted = resolve; });
  const aborted = new Promise((resolve) => { notifyAborted = resolve; });
  const fixture = await serverFixture(t, { configured: true, async recognize(bytes, mime, signal) {
    retained = bytes;
    notifyStarted();
    await new Promise((resolve, reject) => signal.addEventListener("abort", () => {
      notifyAborted();
      reject(signal.reason);
    }, { once: true }));
    return "unused";
  } });
  const controller = new AbortController();
  const request = fetch(`${fixture.base}/v1/chat/ocr`, { method: "POST", headers: {
    authorization: fixture.authorization, "content-type": "image/png"
  }, body: png, signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(request, { name: "AbortError" });
  await aborted;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(retained.every((byte) => byte === 0), true);
});
