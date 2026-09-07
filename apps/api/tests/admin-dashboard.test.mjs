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

  // Feedback list auth & retrieval
  const anonymousFeedback = await jsonRequest(baseUrl, "/v1/admin/feedback");
  assert.equal(anonymousFeedback.response.status, 401);

  const memberFeedback = await jsonRequest(baseUrl, "/v1/admin/feedback", {
    headers: { authorization: `Bearer ${memberToken}` }
  });
  assert.equal(memberFeedback.response.status, 403);
  assert.equal(memberFeedback.payload.error.code, "ADMIN_FORBIDDEN");

  const adminFeedback = await jsonRequest(baseUrl, "/v1/admin/feedback", {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminFeedback.response.status, 200);
  assert.equal(adminFeedback.payload.data.total, 1);
  assert.equal(adminFeedback.payload.data.counts.all, 1);
  assert.equal(adminFeedback.payload.data.counts.new, 1);
  const item = adminFeedback.payload.data.items[0];
  assert.equal(item.content, "希望增加留存分析");
  assert.equal(item.category, "suggestion");
  assert.equal(item.status, "new");
  assert.equal(item.userEmail, "owner@example.com");

  // Filter and search
  const filteredFeedback = await jsonRequest(baseUrl, "/v1/admin/feedback?category=issue", {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assert.equal(filteredFeedback.payload.data.total, 0);

  const searchedFeedback = await jsonRequest(baseUrl, "/v1/admin/feedback?keyword=留存", {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assert.equal(searchedFeedback.payload.data.total, 1);

  // Status update
  const invalidStatusPatch = await jsonRequest(baseUrl, `/v1/admin/feedback/${item.id}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: "invalid_status" })
  });
  assert.equal(invalidStatusPatch.response.status, 400);

  const memberStatusPatch = await jsonRequest(baseUrl, `/v1/admin/feedback/${item.id}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${memberToken}` },
    body: JSON.stringify({ status: "resolved" })
  });
  assert.equal(memberStatusPatch.response.status, 403);

  const updateStatusResult = await jsonRequest(baseUrl, `/v1/admin/feedback/${item.id}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: "resolved" })
  });
  assert.equal(updateStatusResult.response.status, 200);
  assert.equal(updateStatusResult.payload.data.success, true);
  assert.equal(updateStatusResult.payload.data.item.status, "resolved");

  const reloadedFeedback = await jsonRequest(baseUrl, "/v1/admin/feedback", {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assert.equal(reloadedFeedback.payload.data.counts.resolved, 1);
  assert.equal(reloadedFeedback.payload.data.counts.new, 0);
});
