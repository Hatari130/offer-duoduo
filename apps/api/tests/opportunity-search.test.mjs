import assert from "node:assert/strict";
import test from "node:test";
import {
  isOpportunitySearchPrompt,
  searchOpportunitySnapshot
} from "../src/opportunities/search.ts";

function opportunity(id, overrides = {}) {
  return {
    id,
    company: `示例公司 ${id}`,
    title: "2027届校园招聘",
    batch: "2027 秋招",
    deadline: "2026-09-30",
    graduationYears: ["2027届"],
    roleTags: ["产品经理"],
    cities: ["上海"],
    officialUrl: `https://jobs.example.com/${id}`,
    updatedAt: "2026-08-28T10:00:00.000Z",
    ...overrides
  };
}

test("recognizes explicit opportunity searches without hijacking career questions", () => {
  assert.equal(isOpportunitySearchPrompt("目前有哪些产品经理岗位能投递？"), true);
  assert.equal(isOpportunitySearchPrompt("你有什么岗位推荐 应届生"), true);
  assert.equal(isOpportunitySearchPrompt("帮我找一下上海的产品实习机会"), true);
  assert.equal(isOpportunitySearchPrompt("应届生有什么工作推荐？"), true);
  assert.equal(isOpportunitySearchPrompt("给毕业生看看能投的"), true);
  assert.equal(isOpportunitySearchPrompt("产品经理需要具备哪些能力？"), false);
  assert.equal(isOpportunitySearchPrompt("如何准备产品经理岗位面试？"), false);
  assert.equal(isOpportunitySearchPrompt("应届生的工作经历怎么写？"), false);
  assert.equal(isOpportunitySearchPrompt("我的投递进度怎么样？"), false);
});

test("returns at most five matching open opportunities with verified web links", () => {
  const snapshot = {
    fetchedAt: "2026-08-28T10:00:00.000Z",
    sourceUpdatedAt: "2026-08-28T09:00:00.000Z",
    opportunities: [
      ...Array.from({ length: 6 }, (_, index) => opportunity(`product-${index + 1}`)),
      opportunity("wrong-role", { roleTags: ["后端开发工程师"] }),
      opportunity("closed", { deadline: "2026-08-20" }),
      opportunity("invalid-url", { officialUrl: "javascript:alert(1)" })
    ]
  };
  const results = searchOpportunitySnapshot(
    snapshot,
    "目前有哪些上海 2027 届产品经理岗位能投递？",
    { now: new Date("2026-08-28T12:00:00+08:00") }
  );

  assert.equal(results.total, 6);
  assert.equal(results.items.length, 5);
  assert.equal(results.items.every((item) => item.roleTags.includes("产品经理")), true);
  assert.equal(results.items.every((item) => item.officialUrl.startsWith("https://")), true);
  assert.equal(results.items.some((item) => item.id === "closed"), false);
  assert.equal(results.isBroadSearch, false);
});

test("returns broad campus recommendations before asking for more profile details", () => {
  const results = searchOpportunitySnapshot({
    opportunities: Array.from({ length: 6 }, (_, index) => opportunity(`campus-${index + 1}`))
  }, "你有什么岗位推荐 应届生", {
    now: new Date("2026-08-28T12:00:00+08:00")
  });

  assert.equal(results.isBroadSearch, true);
  assert.equal(results.total, 6);
  assert.equal(results.items.length, 5);
});

test("supports company and city filters from the same deterministic index", () => {
  const results = searchOpportunitySnapshot({
    opportunities: [
      opportunity("koi-shanghai", { company: "锦鲤科技有限公司" }),
      opportunity("koi-beijing", { company: "锦鲤科技有限公司", cities: ["北京"] }),
      opportunity("other", { company: "远航智能有限公司" })
    ]
  }, "锦鲤科技上海有哪些产品岗位在招？", {
    now: new Date("2026-08-28T12:00:00+08:00")
  });

  assert.equal(results.total, 1);
  assert.equal(results.items[0]?.id, "koi-shanghai");
});
