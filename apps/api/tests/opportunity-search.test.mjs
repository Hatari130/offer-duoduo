import assert from "node:assert/strict";
import test from "node:test";
import { searchOpportunitySnapshot } from "../src/opportunities/search.ts";
import { companionSystemPrompt } from "../src/ai/companion.ts";

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

test("gives the model one bounded companion identity", () => {
  const prompt = companionSystemPrompt();
  assert.match(prompt, /AI 求职伙伴“小鲤”/);
  assert.match(prompt, /温暖但不敷衍，直接但不催逼/);
  assert.match(prompt, /只依据对话历史和工具读到的数据/);
  // Wording left over from the retrieval chat, where material was pasted into the prompt.
  assert.doesNotMatch(prompt, /知识资料|本轮材料|最多问两个/);
  assert.match(prompt, /你不是人类/);
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

test("filters yesterday updates by the Asia Shanghai calendar day", () => {
  const results = searchOpportunitySnapshot({
    opportunities: [
      opportunity("yesterday", { updatedAt: "2026-08-28T18:00:00.000Z" }),
      opportunity("today", { updatedAt: "2026-08-29T18:00:00.000Z" }),
      opportunity("older", { updatedAt: "2026-08-28T15:59:59.000Z" })
    ]
  }, "昨天更新了哪些岗位？", {
    now: new Date("2026-08-30T12:00:00+08:00")
  });

  assert.equal(results.total, 1);
  assert.equal(results.items[0]?.id, "yesterday");
  assert.equal(results.isBroadSearch, false);
});

test("filters recent-week follow-ups while preserving the previous role", () => {
  const results = searchOpportunitySnapshot({
    opportunities: [
      opportunity("sales-recent", { roleTags: ["销售"], updatedAt: "2026-08-27T04:00:00.000Z" }),
      opportunity("sales-old", { roleTags: ["销售"], updatedAt: "2026-08-20T04:00:00.000Z" }),
      opportunity("product-recent", { updatedAt: "2026-08-27T04:00:00.000Z" })
    ]
  }, "只想最近一周更新的", {
    contextPrompt: "我想找销售类的岗位 最新能投递什么",
    now: new Date("2026-08-30T12:00:00+08:00")
  });

  assert.equal(results.total, 1);
  assert.equal(results.items[0]?.id, "sales-recent");
});

test("keeps previous role filters while applying a follow-up city filter", () => {
  const snapshot = {
    opportunities: [
      opportunity("product-shanghai"),
      opportunity("product-beijing", { cities: ["北京"] }),
      opportunity("backend-beijing", { cities: ["北京"], roleTags: ["后端开发工程师"] })
    ]
  };
  const results = searchOpportunitySnapshot(snapshot, "只看北京的", {
    contextPrompt: "帮我找产品经理相关的工作",
    now: new Date("2026-08-28T12:00:00+08:00")
  });

  assert.equal(results.total, 1);
  assert.equal(results.items[0]?.id, "product-beijing");
});

test("a large limit returns every match, so set differences are computed over all of them", () => {
  const snapshot = { opportunities: Array.from({ length: 30 }, (_, index) => opportunity(`p${index}`, { company: `公司${index}` })) };
  const results = searchOpportunitySnapshot(snapshot, "产品经理", { limit: 5_000, now: new Date("2026-08-28T12:00:00+08:00") });
  assert.equal(results.total, 30);
  assert.equal(results.items.length, 30);
});
