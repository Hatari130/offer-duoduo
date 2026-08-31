import assert from "node:assert/strict";
import test from "node:test";
import { chatPendingMode } from "../src/features/chat/pendingMode.ts";

test("uses the opportunity loading journey for explicit job searches", () => {
  assert.equal(chatPendingMode("最近有什么产品经理能投的岗位"), "opportunities");
  assert.equal(chatPendingMode("帮我找上海最近一周更新的产品实习"), "opportunities");
  assert.equal(chatPendingMode("产品经理需要具备什么能力"), "answer");
});

test("keeps the opportunity loading journey for refinements after job cards", () => {
  assert.equal(chatPendingMode("只看最近一周更新的", [
    { role: "user" },
    { role: "assistant", opportunityResults: { total: 5 } }
  ]), "opportunities");
  assert.equal(chatPendingMode("把结论整理成行动清单", [
    { role: "assistant", opportunityResults: { total: 5 } }
  ]), "answer");
});
