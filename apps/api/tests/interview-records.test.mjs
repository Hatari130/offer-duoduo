import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createOfferFlowServer } from "../src/server.ts";
import { loadApiConfig } from "../src/config.ts";
import { createInterviewQaParser, LocalInterviewQaParser } from "../src/interviews/qa-parser.ts";
import { mergeOverlappedSegments } from "../src/interviews/transcription.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

function sampleApplication(id = "interview-application") {
  return {
    id,
    company: "远航智能",
    position: "产品实习生",
    stage: "interview",
    sourceUrl: `https://jobs.example.com/${id}`,
    sourceHost: "jobs.example.com",
    responsibilities: ["用户研究"],
    requirements: ["结构化分析"],
    events: [],
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z"
  };
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { response, payload: await response.json() };
}

async function waitForRecord(baseUrl, applicationId, recordId, headers, expectedStatus) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const listed = await requestJson(
      baseUrl,
      `/v1/applications/${applicationId}/interview-records`,
      { headers }
    );
    const record = listed.payload.data.records.find((item) => item.id === recordId);
    if (record?.status === expectedStatus) return record;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`record ${recordId} did not reach ${expectedStatus}`);
}

test("local interview parser preserves labelled questions, answers and evidence", async () => {
  const parser = new LocalInterviewQaParser();
  const pairs = await parser.parse([
    "面试官：请介绍一下你负责的增长项目。",
    "候选人：我负责漏斗分析，并将注册转化率提升了 12%。",
    "面试官：遇到的最大挑战是什么？",
    "候选人：样本偏差。我补充了分层抽样并重新验证。"
  ].join("\n"));

  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].order, 1);
  assert.match(pairs[0].question, /增长项目/);
  assert.match(pairs[0].answer, /12%/);
  assert.match(pairs[0].evidence, /候选人/);
  assert.match(pairs[1].answer, /分层抽样/);
});

test("configured AI parser accepts only source-traceable structured Q&A", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          qaPairs: [{
            question: "你如何验证需求？",
            answer: "我先访谈用户，再用原型测试。",
            evidence: "我先访谈用户，再用原型测试。"
          }]
        })
      }
    }]
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const parser = createInterviewQaParser(loadApiConfig({ AI_API_KEY: "test-key" }));
    const pairs = await parser.parse("面试官：你如何验证需求？\n候选人：我先访谈用户，再用原型测试。");
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].answer, "我先访谈用户，再用原型测试。");
    assert.equal(pairs[0].evidence, "我先访谈用户，再用原型测试。");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("overlapped ASR segments are de-duplicated by time and text", () => {
  const merged = mergeOverlappedSegments([
    { start: 590, end: 600, text: "我负责用户研究和需求分析" },
    { start: 590.4, end: 600.2, text: "我负责用户研究和需求分析。" },
    { start: 601, end: 607, text: "之后推动了方案落地" }
  ]);
  assert.equal(merged.length, 2);
  assert.match(merged[1].text, /方案落地/);
});

test("transcript and audio create private interview records and feed chat retrieval", async (t) => {
  let retainedAudio;
  const transcriber = {
    name: "test-asr",
    configured: true,
    async transcribe(input) {
      retainedAudio = input.audio;
      if (input.fileName === "fail.mp3") throw new Error("测试转写失败");
      return "面试官：为什么选择产品岗位？\n候选人：因为我喜欢从用户问题出发验证方案。";
    }
  };
  const assistant = {
    model: "test-assistant",
    async *generate(input) {
      yield input.citations.map((citation) => citation.title).join("｜") || "没有资料";
    }
  };
  const config = {
    ...loadApiConfig({}),
    host: "127.0.0.1",
    port: 0,
    tokenSecret: "interview-test-secret",
    demoStreamDelayMs: 0
  };
  const app = createOfferFlowServer({
    config,
    assistant,
    transcriber,
    store: new MemoryStore({ persistence: false })
  });
  app.server.listen(0, config.host);
  await once(app.server, "listening");
  t.after(async () => {
    app.server.close();
    await once(app.server, "close");
  });
  const address = app.server.address();
  const baseUrl = `http://${config.host}:${address.port}`;
  const auth = await requestJson(baseUrl, "/v1/auth/demo", { method: "POST" });
  const headers = {
    authorization: `Bearer ${auth.payload.data.accessToken}`,
    "content-type": "application/json"
  };
  await requestJson(baseUrl, "/v1/applications", {
    method: "POST",
    headers,
    body: JSON.stringify({ application: sampleApplication() })
  });

  const transcript = [
    "面试官：请介绍一次你推动跨团队协作的经历。",
    "候选人：我对齐了三个团队的目标，并按风险拆分了里程碑。"
  ].join("\n");
  const created = await requestJson(
    baseUrl,
    "/v1/applications/interview-application/interview-records",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "一面复盘", transcript })
    }
  );
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.data.record.status, "ready");
  assert.equal(created.payload.data.record.sourceType, "transcript");
  assert.equal(created.payload.data.record.qaPairs.length, 1);

  const audioResponse = await fetch(
    `${baseUrl}/v1/applications/interview-application/interview-records/audio?fileName=round-2.mp3&title=${encodeURIComponent("二面复盘")}`,
    {
      method: "POST",
      headers: {
        authorization: headers.authorization,
        "content-type": "audio/mpeg"
      },
      body: new Uint8Array([1, 2, 3, 4])
    }
  );
  assert.equal(audioResponse.status, 202);
  const audioPayload = await audioResponse.json();
  assert.equal(audioPayload.data.record.status, "processing");
  const readyAudio = await waitForRecord(
    baseUrl,
    "interview-application",
    audioPayload.data.record.id,
    { authorization: headers.authorization },
    "ready"
  );
  assert.equal(readyAudio.qaPairs.length, 1);
  assert.equal(retainedAudio.every((byte) => byte === 0), true, "raw audio buffer is zeroed after ASR");

  const failedUpload = await fetch(
    `${baseUrl}/v1/applications/interview-application/interview-records/audio?fileName=fail.mp3`,
    {
      method: "POST",
      headers: { authorization: headers.authorization, "content-type": "audio/mpeg" },
      body: new Uint8Array([5, 6, 7])
    }
  );
  const failedPayload = await failedUpload.json();
  const failedRecord = await waitForRecord(
    baseUrl,
    "interview-application",
    failedPayload.data.record.id,
    { authorization: headers.authorization },
    "failed"
  );
  assert.match(failedRecord.error, /测试转写失败/);
  assert.equal(failedRecord.transcript, "");

  const invalidAudio = await requestJson(
    baseUrl,
    "/v1/applications/interview-application/interview-records/audio?fileName=notes.txt",
    {
      method: "POST",
      headers: { authorization: headers.authorization, "content-type": "text/plain" },
      body: "not audio"
    }
  );
  assert.equal(invalidAudio.response.status, 415);
  assert.equal(invalidAudio.payload.error.code, "UNSUPPORTED_AUDIO_TYPE");

  const conversation = await requestJson(baseUrl, "/v1/conversations", {
    method: "POST",
    headers,
    body: "{}"
  });
  const stream = await fetch(
    `${baseUrl}/v1/conversations/${conversation.payload.data.conversation.id}/messages`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ content: "我之前的面试问了什么？", clientMessageId: "private-qa" })
    }
  );
  const streamBody = await stream.text();
  assert.doesNotMatch(streamBody, /interview-record:/);

  const contextCatalog = await requestJson(baseUrl, "/v1/chat-context", { headers });
  const interviewContext = contextCatalog.payload.data.contexts.find(
    (item) => item.kind === "interview" && item.id === created.payload.data.record.id
  );
  assert.ok(interviewContext);
  const contextualStream = await fetch(
    `${baseUrl}/v1/conversations/${conversation.payload.data.conversation.id}/messages`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        content: "只根据一面复盘告诉我之前问了什么？",
        clientMessageId: "selected-private-qa",
        context: [interviewContext]
      })
    }
  );
  const contextualStreamBody = await contextualStream.text();
  assert.match(contextualStreamBody, /interview-record:/);
  assert.match(contextualStreamBody, /个人面试记录/);

  const second = await requestJson(baseUrl, "/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "另一个用户",
      avatarKey: "mint",
      email: "other-interview@example.com",
      password: "strong-pass-2026",
      acceptPrivacy: true
    })
  });
  const isolated = await requestJson(
    baseUrl,
    "/v1/applications/interview-application/interview-records",
    { headers: { authorization: `Bearer ${second.payload.data.accessToken}` } }
  );
  assert.equal(isolated.response.status, 404);
  assert.equal(isolated.payload.error.code, "APPLICATION_NOT_FOUND");
});
