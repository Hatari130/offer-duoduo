import assert from "node:assert/strict";
import test from "node:test";

const {
  EMPTY_OPPORTUNITY_UPDATE_META,
  nextOpportunityUpdateMeta,
  normalizeFeishuRows,
  opportunityDisplayTitle
} = await import("../src/features/opportunities/opportunities.ts");

const sourceUrl = "https://example.feishu.cn/wiki/source";

test("Feishu rows use the end of a date range as the deadline", () => {
  const snapshot = normalizeFeishuRows(
    {
      title: "8.4招聘 - 飞书云文档",
      rows: [
        ["更新时间", "公司名称", "投递起止时间", "招聘类型", "招聘岗位", "城市", "公告链接", "投递链接"],
        [
          "2026-08-04",
          "拼多多",
          "2026-07-01 至 2026-08-20",
          "2027 秋招",
          "技术研发、产品经理、数据分析",
          "上海、广州",
          "https://example.com/notice",
          "https://example.com/apply"
        ],
        ["2026-08-03", "无链接公司", "2026-08-10", "秋招", "产品", "北京", "", ""]
      ]
    },
    sourceUrl
  );

  assert.equal(snapshot.opportunities.length, 1);
  assert.equal(snapshot.opportunities[0].deadline, "2026-08-20");
  assert.deepEqual(snapshot.opportunities[0].cities, ["上海", "广州"]);
  assert.equal(snapshot.sourceUpdatedAt, "2026-08-04");
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
