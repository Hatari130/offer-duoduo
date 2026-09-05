import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCampusHiringFeed } from "../src/features/opportunities/campusHiringFeed.ts";

test("preserves and normalizes enterprise tags from the campus hiring feed", () => {
  const snapshot = normalizeCampusHiringFeed({
    updatedAt: "2026-08-28T09:00:00+08:00",
    items: [{
      id: "hot-company",
      company: "示例企业",
      positions: "产品经理",
      city: "上海",
      applyUrl: "https://example.com/apply",
      tags: ["hot", "��多hc", "行业独角兽"]
    }]
  });

  assert.deepEqual(snapshot.opportunities[0]?.companyTags, ["hot", "超多hc", "行业独角兽"]);
});

test("preserves company nature for enterprise filtering", () => {
  const snapshot = normalizeCampusHiringFeed({
    items: [{
      id: "state-owned-company",
      company: "示例国企",
      positions: "研发工程师",
      city: "北京",
      applyUrl: "https://example.com/apply",
      companyNature: "国企"
    }]
  });

  assert.equal(snapshot.opportunities[0]?.companyType, "国企");
});

test("keeps crawl date separate from the opportunity open date", () => {
  const snapshot = normalizeCampusHiringFeed({
    items: [{
      id: "separate-dates",
      company: "示例企业",
      positions: "产品经理",
      city: "上海",
      applyUrl: "https://example.com/apply",
      updatedAt: "2026-09-05",
      openAt: "2026/9/2"
    }, {
      id: "crawl-date-only",
      company: "另一家企业",
      positions: "研发工程师",
      city: "北京",
      applyUrl: "https://example.com/jobs",
      updatedAt: "2026-09-05"
    }]
  });

  assert.equal(snapshot.opportunities[0]?.updatedAt, "2026-09-05");
  assert.equal(snapshot.opportunities[0]?.openAt, "2026-09-02");
  assert.equal(snapshot.opportunities[1]?.updatedAt, "2026-09-05");
  assert.equal(snapshot.opportunities[1]?.openAt, undefined);
});
