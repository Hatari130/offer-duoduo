import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createOfferFlowServer } from "../src/server.ts";
import { loadApiConfig } from "../src/config.ts";
import { MemoryStore } from "../src/store/memory-store.ts";
import { StoreError } from "../src/store/store.ts";

function sampleApplication(overrides = {}) {
  return {
    id: "e2e-application",
    company: "远航智能",
    position: "产品实习生",
    city: "上海",
    stage: "applied",
    sourceUrl: "https://jobs.example.com/e2e",
    sourceHost: "jobs.example.com",
    responsibilities: ["用户研究"],
    requirements: ["结构化分析"],
    events: [],
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
    ...overrides
  };
}

async function startTestServer(configOverrides = {}, appOverrides = {}) {
  const config = {
    ...loadApiConfig({}),
    host: "127.0.0.1",
    port: 0,
    demoStreamDelayMs: 0,
    opportunityIngestKey: "offerflow-e2e-ingest-key-long-enough",
    opportunitySourceUrl: undefined,
    opportunitySeedPath: undefined,
    ...configOverrides
  };
  const assistant = {
    model: "test-assistant",
    async *generate() {
      yield "先明确目标岗位，";
      yield "再按周复盘投递与面试证据。";
    }
  };
  const app = createOfferFlowServer({
    config,
    assistant,
    store: new MemoryStore({ persistence: false }),
    ...appOverrides
  });
  app.server.listen(0, config.host);
  await once(app.server, "listening");
  const address = app.server.address();
  return {
    ...app,
    baseUrl: `http://${config.host}:${address.port}`
  };
}

test("registration email verification is rate-limited, single-use and bound to the email", async (t) => {
  const deliveries = [];
  const app = await startTestServer(
    {
      emailVerificationEnabled: true,
      emailCodeHmacSecret: "offerflow-email-code-test-secret-2026-long-enough"
    },
    {
      emailMailer: {
        configured: true,
        async sendVerificationEmail(email, code) {
          deliveries.push({ email, code });
        }
      }
    }
  );
  t.after(async () => {
    app.server.close();
    await once(app.server, "close");
  });

  const registration = {
    displayName: "邮箱验证用户",
    email: "verified@example.com",
    password: "strong-pass-2026",
    acceptPrivacy: true
  };
  const unverified = await jsonRequest(app.baseUrl, "/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(registration)
  });
  assert.equal(unverified.response.status, 403);
  assert.equal(unverified.payload.error.code, "EMAIL_VERIFICATION_REQUIRED");

  const sent = await jsonRequest(app.baseUrl, "/v1/auth/email-code/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: registration.email, purpose: "register" })
  });
  assert.equal(sent.response.status, 200);
  assert.equal(sent.payload.data.retryAfterSeconds, 60);
  assert.equal(deliveries.length, 1);
  assert.match(deliveries[0].code, /^\d{6}$/);

  const rateLimited = await jsonRequest(app.baseUrl, "/v1/auth/email-code/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: registration.email, purpose: "register" })
  });
  assert.equal(rateLimited.response.status, 429);
  assert.equal(rateLimited.payload.error.code, "EMAIL_CODE_RATE_LIMITED");
  assert.equal(rateLimited.response.headers.get("retry-after"), "60");

  const incorrectCode = deliveries[0].code === "000000" ? "000001" : "000000";
  const incorrect = await jsonRequest(app.baseUrl, "/v1/auth/email-code/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: registration.email, purpose: "register", code: incorrectCode })
  });
  assert.equal(incorrect.response.status, 400);
  assert.equal(incorrect.payload.error.code, "INVALID_EMAIL_CODE");

  const verified = await jsonRequest(app.baseUrl, "/v1/auth/email-code/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: registration.email, purpose: "register", code: deliveries[0].code })
  });
  assert.equal(verified.response.status, 200);
  assert.equal(typeof verified.payload.data.verificationToken, "string");

  const reusedCode = await jsonRequest(app.baseUrl, "/v1/auth/email-code/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: registration.email, purpose: "register", code: deliveries[0].code })
  });
  assert.equal(reusedCode.response.status, 400);

  const wrongEmail = await jsonRequest(app.baseUrl, "/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...registration,
      email: "other@example.com",
      emailVerificationToken: verified.payload.data.verificationToken
    })
  });
  assert.equal(wrongEmail.response.status, 403);
  assert.equal(wrongEmail.payload.error.code, "EMAIL_VERIFICATION_REQUIRED");

  const registered = await jsonRequest(app.baseUrl, "/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...registration, emailVerificationToken: verified.payload.data.verificationToken })
  });
  assert.equal(registered.response.status, 201);
  assert.equal(registered.payload.data.user.email, registration.email);
  assert.equal(registered.payload.data.user.avatarKey, "sprout");

  const updatedAvatar = await jsonRequest(app.baseUrl, "/v1/account/avatar", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${registered.payload.data.accessToken}`
    },
    body: JSON.stringify({ avatarKey: "mint" })
  });
  assert.equal(updatedAvatar.response.status, 200);
  assert.equal(updatedAvatar.payload.data.user.avatarKey, "mint");

  const refreshedSession = await jsonRequest(app.baseUrl, "/v1/session", {
    headers: { Authorization: `Bearer ${registered.payload.data.accessToken}` }
  });
  assert.equal(refreshedSession.payload.data.user.avatarKey, "mint");
});

test("password reset consumes the email code and revokes every existing session", async (t) => {
  const deliveries = [];
  const app = await startTestServer(
    {
      emailVerificationEnabled: true,
      emailCodeHmacSecret: "offerflow-password-reset-test-secret-2026-long-enough"
    },
    {
      emailMailer: {
        configured: true,
        async sendVerificationEmail(email, code) {
          deliveries.push({ email, code });
        }
      }
    }
  );
  t.after(async () => {
    app.server.close();
    await once(app.server, "close");
  });

  const user = await app.store.createUser("reset@example.com", "重置密码用户", "old-password-2026", "sprout");
  const webSession = await app.store.createSession(user.id, "user", new Date(Date.now() + 60_000).toISOString());
  const deviceSession = await app.store.createSession(user.id, "device", new Date(Date.now() + 60_000).toISOString(), "browser-1", "Chrome");

  const unknownEmail = await jsonRequest(app.baseUrl, "/v1/auth/email-code/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "missing@example.com", purpose: "reset_password" })
  });
  assert.equal(unknownEmail.response.status, 200);
  assert.equal(deliveries.length, 0);

  const sent = await jsonRequest(app.baseUrl, "/v1/auth/email-code/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, purpose: "reset_password" })
  });
  assert.equal(sent.response.status, 200);
  assert.equal(deliveries.length, 1);

  const reset = await jsonRequest(app.baseUrl, "/v1/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: "new-password-2026", code: deliveries[0].code })
  });
  assert.equal(reset.response.status, 200);
  assert.equal(reset.payload.data.passwordReset, true);

  const reusedCode = await jsonRequest(app.baseUrl, "/v1/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: "another-password-2026", code: deliveries[0].code })
  });
  assert.equal(reusedCode.response.status, 400);
  assert.equal(reusedCode.payload.error.code, "INVALID_PASSWORD_RESET");

  for (const token of [webSession.accessToken, deviceSession.accessToken]) {
    const session = await jsonRequest(app.baseUrl, "/v1/session", { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(session.response.status, 401);
  }

  const oldLogin = await jsonRequest(app.baseUrl, "/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: "old-password-2026" })
  });
  assert.equal(oldLogin.response.status, 401);

  const newLogin = await jsonRequest(app.baseUrl, "/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: "new-password-2026" })
  });
  assert.equal(newLogin.response.status, 200);
});

test("a failed verification email delivery does not leave the address rate-limited", async (t) => {
  let deliveryAttempts = 0;
  const app = await startTestServer(
    {
      emailVerificationEnabled: true,
      emailCodeHmacSecret: "offerflow-email-code-test-secret-2026-long-enough"
    },
    {
      emailMailer: {
        configured: true,
        async sendVerificationEmail() {
          deliveryAttempts += 1;
          if (deliveryAttempts === 1) {
            throw new StoreError("EMAIL_DELIVERY_FAILED", "验证码邮件发送失败，请稍后重试", 502);
          }
        }
      }
    }
  );
  t.after(async () => {
    app.server.close();
    await once(app.server, "close");
  });

  const request = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "retry@example.com", purpose: "register" })
  };
  const failed = await jsonRequest(app.baseUrl, "/v1/auth/email-code/send", request);
  assert.equal(failed.response.status, 502);
  assert.equal(failed.payload.error.code, "EMAIL_DELIVERY_FAILED");

  const retried = await jsonRequest(app.baseUrl, "/v1/auth/email-code/send", request);
  assert.equal(retried.response.status, 200);
  assert.equal(deliveryAttempts, 2);
});

async function jsonRequest(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const payload = await response.json();
  return { response, payload };
}

test("auth, chat streaming, applications and device pairing work end to end", async (t) => {
  const app = await startTestServer();
  t.after(async () => {
    app.server.close();
    await once(app.server, "close");
  });

  const health = await jsonRequest(app.baseUrl, "/health", {
    headers: { Origin: "chrome-extension://offerflow-e2e" }
  });
  assert.equal(health.response.status, 200);
  assert.equal(health.response.headers.get("access-control-allow-origin"), "chrome-extension://offerflow-e2e");
  assert.equal(health.payload.data.status, "ok");

  const publicFeedback = await jsonRequest(app.baseUrl, "/v1/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "suggestion",
      content: "希望岗位筛选可以记住上次的选择",
      contact: "candidate@example.com",
      pagePath: "/app/opportunities"
    })
  });
  assert.equal(publicFeedback.response.status, 201);
  assert.equal(typeof publicFeedback.payload.data.feedbackId, "string");

  const invalidFeedback = await jsonRequest(app.baseUrl, "/v1/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "suggestion", content: "短" })
  });
  assert.equal(invalidFeedback.response.status, 400);
  assert.equal(invalidFeedback.payload.error.code, "INVALID_FEEDBACK_CONTENT");

  const registered = await jsonRequest(app.baseUrl, "/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: "测试用户",
      avatarKey: "cloud",
      email: "candidate@example.com",
      password: "strong-pass-2026",
      acceptPrivacy: true
    })
  });
  assert.equal(registered.response.status, 201);
  assert.equal(typeof registered.payload.data.user.createdAt, "string");
  assert.match(registered.response.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(registered.response.headers.get("set-cookie"), /SameSite=Lax/i);
  const loggedIn = await jsonRequest(app.baseUrl, "/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "candidate@example.com", password: "strong-pass-2026" })
  });
  assert.equal(loggedIn.response.status, 200);
  assert.equal(loggedIn.payload.data.user.displayName, "测试用户");
  assert.equal(loggedIn.payload.data.user.avatarKey, "cloud");
  assert.equal(loggedIn.payload.data.user.createdAt, registered.payload.data.user.createdAt);

  const duplicateRegistration = await jsonRequest(app.baseUrl, "/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: "重复用户",
      avatarKey: "berry",
      email: "candidate@example.com",
      password: "strong-pass-2026",
      acceptPrivacy: true
    })
  });
  assert.equal(duplicateRegistration.response.status, 409);

  const auth = await jsonRequest(app.baseUrl, "/v1/auth/demo", { method: "POST" });
  assert.equal(auth.response.status, 200);
  const token = auth.payload.data.accessToken;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const unauthorized = await jsonRequest(app.baseUrl, "/v1/session");
  assert.equal(unauthorized.response.status, 401);
  const session = await jsonRequest(app.baseUrl, "/v1/session", { headers });
  assert.equal(session.payload.data.user.email, "demo@offerflow.cn");
  assert.equal(typeof session.payload.data.user.createdAt, "string");

  const createdConversation = await jsonRequest(app.baseUrl, "/v1/conversations", {
    method: "POST",
    headers,
    body: JSON.stringify({})
  });
  const emptyContext = await jsonRequest(app.baseUrl, "/v1/chat-context", { headers });
  assert.deepEqual(emptyContext.payload.data.contexts, []);
  const conversationId = createdConversation.payload.data.conversation.id;
  const stream = await fetch(`${app.baseUrl}/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content: "如何准备秋招？",
      clientMessageId: "e2e-user-message",
      attachments: [{
        id: "attachment-1",
        name: "个人复盘.txt",
        mimeType: "text/plain",
        size: 18,
        content: "我每周可以投入十五小时，目标是产品实习。"
      }]
    })
  });
  assert.equal(stream.headers.get("content-type").startsWith("text/event-stream"), true);
  const streamBody = await stream.text();
  assert.match(streamBody, /"type":"message\.started"/);
  assert.match(streamBody, /"type":"message\.delta"/);
  assert.match(streamBody, /"type":"citation"/);
  assert.match(streamBody, /本次资料｜个人复盘\.txt/);
  assert.match(streamBody, /"type":"message\.completed"/);
  assert.match(streamBody, /"type":"done"/);

  const conversation = await jsonRequest(app.baseUrl, `/v1/conversations/${conversationId}`, { headers });
  assert.equal(conversation.payload.data.messages.length, 2);
  assert.equal(conversation.payload.data.messages[1].status, "complete");
  assert.match(conversation.payload.data.messages[1].content, /按周复盘/);
  assert.equal(conversation.payload.data.messages[0].attachments[0].content, "我每周可以投入十五小时，目标是产品实习。");

  const renamedConversation = await jsonRequest(app.baseUrl, `/v1/conversations/${conversationId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ title: "产品实习准备" })
  });
  assert.equal(renamedConversation.payload.data.conversation.title, "产品实习准备");
  const feedback = await jsonRequest(
    app.baseUrl,
    `/v1/conversations/${conversationId}/messages/${conversation.payload.data.messages[1].id}/feedback`,
    { method: "PATCH", headers, body: JSON.stringify({ feedback: "positive" }) }
  );
  assert.equal(feedback.payload.data.message.feedback, "positive");

  const opportunities = await jsonRequest(app.baseUrl, "/v1/opportunities", { headers });
  assert.deepEqual(opportunities.payload.data.opportunities, []);
  const importStatus = await jsonRequest(app.baseUrl, "/v1/imports/opportunities/status", { headers });
  assert.equal(importStatus.payload.data.status, "not_configured");

  const createdApplication = await jsonRequest(app.baseUrl, "/v1/applications", {
    method: "POST",
    headers,
    body: JSON.stringify({ application: sampleApplication() })
  });
  assert.equal(createdApplication.response.status, 201);
  assert.equal(createdApplication.payload.data.item.revision, 1);

  const otherUserApplication = await jsonRequest(app.baseUrl, "/v1/applications", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${loggedIn.payload.data.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      application: sampleApplication({
        id: "other-user-application",
        company: "隐私科技",
        position: "保密岗位",
        sourceUrl: "https://private.example.com/job",
        sourceHost: "private.example.com"
      })
    })
  });
  assert.equal(otherUserApplication.response.status, 201);

  const personalApplicationStream = await fetch(`${app.baseUrl}/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content: "我投了哪些产品经理岗位，进度怎么样？",
      clientMessageId: "e2e-personal-applications-message"
    })
  });
  const personalApplicationBody = await personalApplicationStream.text();
  assert.match(personalApplicationBody, /个人投递管理｜当前投递概览/);
  assert.match(personalApplicationBody, /远航智能/);
  assert.doesNotMatch(personalApplicationBody, /隐私科技|保密岗位/);

  const applicationFollowUpStream = await fetch(`${app.baseUrl}/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content: "那下一步呢？",
      clientMessageId: "e2e-personal-applications-follow-up"
    })
  });
  assert.match(await applicationFollowUpStream.text(), /个人投递管理｜当前投递概览/);

  const applicationContext = await jsonRequest(app.baseUrl, "/v1/chat-context", { headers });
  assert.equal(applicationContext.payload.data.contexts[0].kind, "application");
  assert.match(applicationContext.payload.data.contexts[0].label, /远航智能/);
  const contextualStream = await fetch(`${app.baseUrl}/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content: "根据这条投递告诉我下一步",
      clientMessageId: "e2e-context-message",
      context: [{ ...applicationContext.payload.data.contexts[0], label: "伪造的材料名称" }]
    })
  });
  assert.match(await contextualStream.text(), /投递记录｜远航智能 · 产品实习生/);
  const canonicalConversation = await jsonRequest(app.baseUrl, `/v1/conversations/${conversationId}`, { headers });
  assert.equal(canonicalConversation.payload.data.messages.at(-2).context[0].label, "远航智能 · 产品实习生");

  const updatedApplication = await jsonRequest(app.baseUrl, "/v1/applications/e2e-application", {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      expectedRevision: 1,
      application: sampleApplication({ stage: "interview", updatedAt: "2026-08-08T01:00:00.000Z" })
    })
  });
  assert.equal(updatedApplication.payload.data.item.revision, 2);

  const staleUpdate = await jsonRequest(app.baseUrl, "/v1/applications/e2e-application", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ expectedRevision: 1, application: sampleApplication({ stage: "assessment" }) })
  });
  assert.equal(staleUpdate.response.status, 409);
  assert.equal(staleUpdate.payload.error.code, "REVISION_CONFLICT");

  const code = await jsonRequest(app.baseUrl, "/v1/auth/device-codes", { method: "POST", headers });
  const exchanged = await jsonRequest(app.baseUrl, "/v1/auth/device-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: code.payload.data.code.replace("-", ""), deviceId: "extension-e2e" })
  });
  assert.equal(exchanged.response.status, 200);
  assert.equal(exchanged.payload.data.deviceId, "extension-e2e");

  const reused = await jsonRequest(app.baseUrl, "/v1/auth/device-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: code.payload.data.code, deviceId: "extension-e2e-2" })
  });
  assert.equal(reused.response.status, 401);
});

test("public opportunity catalogue hydrates an empty store from the configured JSON source", async (t) => {
  let sourceRequests = 0;
  const source = createServer((_request, response) => {
    sourceRequests += 1;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({
      updatedAt: "2026-08-29T08:00:00+08:00",
      items: [{
        id: "source-product-role",
        company: "源数据科技",
        positions: "产品经理",
        city: "上海",
        targetCohort: "2027届",
        type: "秋招",
        applyUrl: "https://jobs.example.com/source-product-role"
      }]
    }));
  });
  source.listen(0, "127.0.0.1");
  await once(source, "listening");
  const sourceAddress = source.address();
  const app = await startTestServer({
    opportunitySourceUrl: `http://127.0.0.1:${sourceAddress.port}/campus-hiring.json`,
    opportunityFetchTimeoutSeconds: 2
  });
  t.after(async () => {
    app.server.close();
    source.close();
    await Promise.all([once(app.server, "close"), once(source, "close")]);
  });

  const first = await jsonRequest(app.baseUrl, "/v1/opportunities");
  assert.equal(first.response.status, 200);
  assert.equal(first.payload.data.opportunities.length, 1);
  assert.equal(first.payload.data.opportunities[0].company, "源数据科技");

  const second = await jsonRequest(app.baseUrl, "/v1/opportunities");
  assert.equal(second.payload.data.opportunities.length, 1);
  assert.equal(sourceRequests, 1);
});

test("public opportunity catalogue hydrates from the bundled snapshot without a remote request", async (t) => {
  const seedDirectory = await mkdtemp(join(tmpdir(), "offerflow-opportunity-seed-"));
  const seedPath = join(seedDirectory, "campus-hiring.json");
  await writeFile(seedPath, JSON.stringify({
    updatedAt: "2026-08-29T08:00:00+08:00",
    items: [{
      id: "bundled-product-role",
      company: "随包数据科技",
      positions: "产品经理",
      city: "杭州",
      targetCohort: "2027届",
      type: "秋招",
      applyUrl: "https://jobs.example.com/bundled-product-role"
    }]
  }), "utf8");
  const app = await startTestServer({
    opportunitySourceUrl: "https://unreachable.invalid/campus-hiring.json",
    opportunitySeedPath: seedPath
  });
  t.after(async () => {
    app.server.close();
    await once(app.server, "close");
    await rm(seedDirectory, { recursive: true, force: true });
  });

  const response = await jsonRequest(app.baseUrl, "/v1/opportunities");
  assert.equal(response.response.status, 200);
  assert.equal(response.payload.data.opportunities.length, 1);
  assert.equal(response.payload.data.opportunities[0].company, "随包数据科技");
  assert.equal(response.payload.data.opportunities[0].officialUrl, "https://jobs.example.com/bundled-product-role");
});

test("opportunity catalogue is public and only accepts trusted importer snapshots", async (t) => {
  const app = await startTestServer();
  t.after(async () => {
    app.server.close();
    await once(app.server, "close");
  });

  const soon = new Date();
  soon.setDate(soon.getDate() + 2);
  const deadline = soon.toISOString().slice(0, 10);

  const initial = await jsonRequest(app.baseUrl, "/v1/opportunities");
  assert.equal(initial.response.status, 200);
  assert.deepEqual(initial.payload.data.opportunities, []);

  const forbidden = await jsonRequest(app.baseUrl, "/v1/opportunities/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ opportunities: [] })
  });
  assert.equal(forbidden.response.status, 403);

  const opportunity = {
    id: "opp_e2e",
    company: "蜀道集团",
    title: "铁路运输管理类（工务管理）",
    batch: "2026 秋招",
    deadline,
    graduationYears: ["2026届"],
    roleTags: ["工务管理"],
    cities: ["成都"],
    officialUrl: "https://example.com/apply",
    sourceUrl: "https://example.com/notice",
    sourceName: "Campus Hiring 公开数据",
    updatedAt: new Date().toISOString()
  };
  const synced = await jsonRequest(app.baseUrl, "/v1/opportunities/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-OfferFlow-Ingest-Key": "offerflow-e2e-ingest-key-long-enough" },
    body: JSON.stringify({
      opportunities: [opportunity],
      fetchedAt: "2026-08-08T10:00:00.000Z",
      sourceUrl: "https://shouna12358-png.github.io/campus-hiring/campus-hiring.json"
    })
  });
  assert.equal(synced.response.status, 200);
  assert.equal(synced.payload.data.accepted, 1);

  const listed = await jsonRequest(app.baseUrl, "/v1/opportunities");
  assert.equal(listed.response.status, 200);
  assert.equal(listed.payload.data.opportunities.length, 1);
  assert.equal(listed.payload.data.opportunities[0].status, "closing");

  const detail = await jsonRequest(app.baseUrl, "/v1/opportunities/opp_e2e");
  assert.equal(detail.response.status, 200);
  assert.equal(detail.payload.data.opportunity.company, "蜀道集团");

  const auth = await jsonRequest(app.baseUrl, "/v1/auth/demo", { method: "POST" });
  const headers = {
    Authorization: `Bearer ${auth.payload.data.accessToken}`,
    "Content-Type": "application/json"
  };
  const conversation = await jsonRequest(app.baseUrl, "/v1/conversations", {
    method: "POST",
    headers,
    body: JSON.stringify({})
  });
  const chat = await fetch(`${app.baseUrl}/v1/conversations/${conversation.payload.data.conversation.id}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content: "目前有哪些岗位能投递？",
      clientMessageId: "opportunity-search-message"
    })
  });
  const chatStream = await chat.text();
  assert.match(chatStream, /我先从 1 条当前可投递的校招岗位里/);
  assert.match(chatStream, /"opportunityResults"/);
  assert.match(chatStream, /https:\/\/example\.com\/apply/);

  const recentFollowUp = await fetch(`${app.baseUrl}/v1/conversations/${conversation.payload.data.conversation.id}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content: "只想最近一周更新的",
      clientMessageId: "opportunity-recent-week-follow-up"
    })
  });
  const recentFollowUpStream = await recentFollowUp.text();
  assert.match(recentFollowUpStream, /"opportunityResults"/);
  assert.match(recentFollowUpStream, /https:\/\/example\.com\/apply/);
  assert.doesNotMatch(recentFollowUpStream, /无法直接访问实时招聘网站/);

  const followUp = await fetch(`${app.baseUrl}/v1/conversations/${conversation.payload.data.conversation.id}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content: "你不是有json数据没",
      clientMessageId: "opportunity-search-follow-up"
    })
  });
  const followUpStream = await followUp.text();
  assert.match(followUpStream, /"opportunityResults"/);
  assert.match(followUpStream, /https:\/\/example\.com\/apply/);
  assert.doesNotMatch(followUpStream, /没有接入.*岗位数据库/);

  const importStatus = await jsonRequest(app.baseUrl, "/v1/imports/opportunities/status");
  assert.equal(importStatus.payload.data.status, "ready");

  const invalid = await jsonRequest(app.baseUrl, "/v1/opportunities/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-OfferFlow-Ingest-Key": "offerflow-e2e-ingest-key-long-enough" },
    body: JSON.stringify({ opportunities: [{ id: "broken" }] })
  });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.payload.error.code, "INVALID_OPPORTUNITY_SYNC");
});
