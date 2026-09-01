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
