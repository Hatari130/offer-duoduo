import assert from "node:assert/strict";
import test from "node:test";
import { loginReasonForPath } from "../src/app/authAccess.ts";

test("keeps public discovery routes available without login", () => {
  assert.equal(loginReasonForPath("/app/chat"), undefined);
  assert.equal(loginReasonForPath("/app/opportunities"), undefined);
  assert.equal(loginReasonForPath("/app/companies/tencent"), undefined);
});

test("requires login for private user data routes", () => {
  assert.match(loginReasonForPath("/app/chat/conversation-1"), /历史对话/);
  assert.match(loginReasonForPath("/app/applications"), /投递记录/);
  assert.match(loginReasonForPath("/app/resumes"), /简历/);
  assert.match(loginReasonForPath("/app/settings"), /账号/);
  assert.match(loginReasonForPath("/extension/connect"), /浏览器插件/);
});
