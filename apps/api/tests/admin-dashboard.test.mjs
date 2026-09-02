import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { createOfferFlowApp } from "../src/app.ts";
import { loadApiConfig } from "../src/config.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

async function jsonRequest(baseUrl, path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  return { response, payload: await response.json() };
}

async function login(baseUrl, email, password) {
  const result = await jsonRequest(baseUrl, "/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.equal(result.response.status, 200);
  return result.payload.data.accessToken;
}

test("admin dashboard requires an allowlisted account and returns aggregate-only data", async (t) => {
  const store = new MemoryStore({ persistence: false });
  const admin = store.createUser("owner@example.com", "运营负责人", "admin-pass-2026", "sprout");
  store.createUser("member@example.com", "普通用户", "member-pass-2026", "mint");
  const conversation = store.createConversation(admin.id, "后台统计测试");
  store.appendUserMessage(admin.id, conversation.id, "admin-message", "帮我分析产品数据");
  const assistant = store.beginAssistantMessage(admin.id, conversation.id);
  store.completeAssistantMessage(admin.id, conversation.id, assistant.id, "可以。", [], "complete");
  store.setMessageFeedback(admin.id, conversation.id, assistant.id, "positive");
  store.createProductFeedback({ userId: admin.id, category: "suggestion", content: "希望增加留存分析" });

  const config = {
    ...loadApiConfig({ NODE_ENV: "test", ADMIN_EMAILS: "owner@example.com" }),
    host: "127.0.0.1",
    port: 0,
    demoStreamDelayMs: 0,
    opportunitySourceUrl: undefined,
    opportunitySeedPath: undefined
  };
  const app = createOfferFlowApp({ config, store });
  const server = createServer(app.handler);
  server.listen(0, config.host);
  await once(server, "listening");
  t.after(async () => {
    server.close();
    await once(server, "close");
  });
  const address = server.address();
  const baseUrl = `http://${config.host}:${address.port}`;

  const anonymous = await jsonRequest(baseUrl, "/v1/admin/dashboard?days=30");
  assert.equal(anonymous.response.status, 401);

  const memberToken = await login(baseUrl, "member@example.com", "member-pass-2026");
  const forbidden = await jsonRequest(baseUrl, "/v1/admin/dashboard?days=30", {
    headers: { authorization: `Bearer ${memberToken}` }
  });
  assert.equal(forbidden.response.status, 403);
  assert.equal(forbidden.payload.error.code, "ADMIN_FORBIDDEN");

  const adminToken = await login(baseUrl, "owner@example.com", "admin-pass-2026");
  const allowed = await jsonRequest(baseUrl, "/v1/admin/dashboard?days=30", {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.payload.data.overview.totalUsers, 2);
  assert.equal(allowed.payload.data.overview.conversations, 1);
  assert.equal(allowed.payload.data.overview.chatSuccessRate, 1);
  assert.equal(allowed.payload.data.overview.positiveFeedbackRate, 1);
  assert.equal(allowed.payload.data.recentUsers.some((user) => "email" in user), false);
  assert.match(allowed.payload.data.recentUsers[0].maskedEmail, /\*+@/);

  const invalidRange = await jsonRequest(baseUrl, "/v1/admin/dashboard?days=14", {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assert.equal(invalidRange.response.status, 400);
  assert.equal(invalidRange.payload.error.code, "INVALID_ADMIN_RANGE");
});
