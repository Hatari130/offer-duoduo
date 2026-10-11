import assert from "node:assert/strict";
import test from "node:test";
import {
  groupConversations,
  highlightParts,
  searchConversations,
  searchTerms
} from "../src/features/chat/conversationHistory.ts";

const now = new Date(2026, 9, 12, 15, 0).getTime();
const daysAgo = (days, hour = 10) => new Date(2026, 9, 12 - days, hour, 0).toISOString();
const chat = (id, title, updatedAt, lastMessagePreview) => ({ id, title, createdAt: updatedAt, updatedAt, lastMessagePreview });

test("groups by calendar day, newest first, pinned on top, empty groups dropped", () => {
  const groups = groupConversations([
    chat("a", "今天的", daysAgo(0, 9)),
    chat("b", "更晚的今天", daysAgo(0, 14)),
    chat("c", "昨天", daysAgo(1, 23)),
    chat("d", "五天前", daysAgo(5)),
    chat("e", "二十天前", daysAgo(20)),
    chat("f", "三个月前", daysAgo(90)),
    chat("p", "置顶的旧对话", daysAgo(40))
  ], new Set(["p"]), now);
  assert.deepEqual(groups.map((group) => [group.label, group.conversations.map((item) => item.id)]), [
    ["置顶", ["p"]],
    ["今天", ["b", "a"]],
    ["昨天", ["c"]],
    ["7 天内", ["d"]],
    ["30 天内", ["e"]],
    ["更早", ["f"]]
  ]);
  assert.deepEqual(groupConversations([chat("x", "x", daysAgo(0))], new Set(), now).map((group) => group.key), ["today"]);
});

test("search needs every term, ranks title hits first and shows a snippet for body-only hits", () => {
  const conversations = [
    chat("1", "字节 AI 产品面试复盘", daysAgo(3), "二面问了 agent 评测怎么做"),
    chat("2", "简历修改", daysAgo(0), "把字节那段实习写成结果导向，补上评测数据"),
    chat("3", "腾讯笔试", daysAgo(1), "行测和数学题")
  ];
  assert.deepEqual(searchConversations(conversations, "字节").map((match) => match.conversation.id), ["1", "2"]);
  assert.deepEqual(searchConversations(conversations, "字节 评测").map((match) => match.conversation.id), ["1", "2"]);
  assert.deepEqual(searchConversations(conversations, "腾讯 字节"), []);
  const bodyOnly = searchConversations(conversations, "实习")[0];
  assert.equal(bodyOnly.conversation.id, "2");
  assert.match(bodyOnly.snippet, /实习/);
  assert.equal(searchConversations(conversations, "字节")[0].snippet, undefined);
  assert.deepEqual(searchConversations(conversations, "   "), []);
});

test("search terms are case-insensitive and highlighting keeps the original text", () => {
  assert.deepEqual(searchTerms("  AI   Agent "), ["ai", "agent"]);
  assert.deepEqual(highlightParts("AI 产品与 agent", ["ai", "agent"]), [
    { text: "AI", hit: true },
    { text: " 产品与 ", hit: false },
    { text: "agent", hit: true }
  ]);
  assert.deepEqual(highlightParts("a+b (c)", ["(c)"]), [{ text: "a+b ", hit: false }, { text: "(c)", hit: true }]);
});
