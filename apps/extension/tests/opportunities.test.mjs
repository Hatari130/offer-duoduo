import assert from "node:assert/strict";
import test from "node:test";

const {
  EMPTY_OPPORTUNITY_UPDATE_META,
  nextOpportunityUpdateMeta,
  normalizeOpportunityFeed,
  opportunityDisplayTitle
} = await import("../src/features/opportunities/opportunities.ts");

const sourceUrl = "https://shouna12358-png.github.io/campus-hiring/campus-hiring.json";

test("the public campus JSON maps source fields into opportunities", () => {
  const snapshot = normalizeOpportunityFeed(
    {
      updatedAt: "2026-08-14T09:26:45+08:00",
      items: [
        {
          id: "pdd",
          company: "拼多多",
          updatedAt: "2026-08-04",
          deadline: "2026-08-20",
          type: "秋招",
          targetCohort: "2027届",
          positions: "技术研发,产品经理,数据分析",
          city: "上海,广州",
          announcementUrl: "https://example.com/notice",
          applyUrl: "https://example.com/apply"
        },
        { company: "无链接公司", positions: "产品", city: "北京" }
      ]
    },
    sourceUrl
  );

  assert.equal(snapshot.opportunities.length, 1);
  assert.equal(snapshot.opportunities[0].deadline, "2026-08-20");
  assert.deepEqual(snapshot.opportunities[0].cities, ["上海", "广州"]);
  assert.deepEqual(snapshot.opportunities[0].roleTags, ["技术研发", "产品经理", "数据分析"]);
  assert.equal(snapshot.sourceUpdatedAt, "2026-08-14T09:26:45+08:00");
});

test("long role lists stay searchable but receive a concise card title", () => {
  const opportunity = {
    id: "long-role",
    company: "示例公司",
    title: "技术研发类、产品经理类、数据分析类、商业分析类、市场运营类、供应链类",
    graduationYears: ["2027届"],
    roleTags: ["技术研发类", "产品经理类", "数据分析类"],
    cities: ["上海"],
    officialUrl: "https://example.com/apply"
  };

  assert.equal(opportunityDisplayTitle(opportunity), "技术研发类、产品经理类等 6 类岗位");
  assert.match(opportunity.title, /供应链类/);
});

test("the first successful snapshot establishes a baseline without unread noise", () => {
  const next = {
    opportunities: [
      {
        id: "a",
        company: "A",
        title: "产品经理",
        graduationYears: [],
        roleTags: [],
        cities: [],
        officialUrl: "https://example.com/a"
      }
    ],
    fetchedAt: "2026-08-04T10:00:00.000Z",
    sourceUrl
  };

  const meta = nextOpportunityUpdateMeta(
    { opportunities: [] },
    next,
    EMPTY_OPPORTUNITY_UPDATE_META
  );
  assert.equal(meta.unreadCount, 0);
  assert.equal(meta.addedCount, 0);
  assert.equal(meta.lastSyncedAt, next.fetchedAt);
});

test("later syncs accumulate added, changed and removed records as unread", () => {
  const baseItem = {
    company: "A",
    title: "产品经理",
    graduationYears: [],
    roleTags: ["产品"],
    cities: ["北京"],
    officialUrl: "https://example.com/a"
  };
  const previous = {
    opportunities: [
      { id: "updated", ...baseItem },
      { id: "removed", ...baseItem, officialUrl: "https://example.com/removed" }
    ],
    fetchedAt: "2026-08-04T09:00:00.000Z",
    sourceUrl
  };
  const next = {
    opportunities: [
      { id: "updated", ...baseItem, cities: ["上海"] },
      { id: "added", ...baseItem, officialUrl: "https://example.com/added" }
    ],
    fetchedAt: "2026-08-04T10:00:00.000Z",
    sourceUrl
  };
  const existingUnread = {
    ...EMPTY_OPPORTUNITY_UPDATE_META,
    unreadCount: 1,
    unreadOpportunityIds: ["older"]
  };

  const meta = nextOpportunityUpdateMeta(previous, next, existingUnread);
  assert.equal(meta.addedCount, 1);
  assert.equal(meta.updatedCount, 1);
  assert.equal(meta.removedCount, 1);
  assert.equal(meta.unreadCount, 4);
  assert.deepEqual(new Set(meta.unreadOpportunityIds), new Set(["older", "updated", "added"]));
  assert.deepEqual(meta.unreadRemovedOpportunityIds, ["removed"]);
});
