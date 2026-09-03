import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationOverviewEntry,
  shouldUseApplicationContext
} from "../src/knowledge/application-context.ts";

function application(overrides = {}) {
  return {
    id: "application-1",
    company: "远航智能",
    position: "产品实习生",
    city: "上海",
    stage: "applied",
    sourceUrl: "https://jobs.example.com/application-1",
    sourceHost: "jobs.example.com",
    responsibilities: [],
    requirements: [],
    events: [],
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    ...overrides
  };
}

test("personal application overview summarizes only supplied application records", () => {
  const overview = applicationOverviewEntry([
    application(),
    application({
      id: "application-2",
      company: "星河科技",
      position: "用户运营",
      stage: "interview",
      nextAction: "9 月 3 日一面",
      updatedAt: "2026-09-01T00:00:00.000Z"
    }),
    application({
      id: "application-3",
      company: "旧日网络",
      position: "产品助理",
      stage: "closed",
      updatedAt: "2026-08-01T00:00:00.000Z"
    })
  ]);

  assert.match(overview.content, /投递总数：3 条；进行中：2 条；已结束：1 条/);
  assert.match(overview.content, /面试 1 条/);
  assert.ok(overview.content.indexOf("星河科技") < overview.content.indexOf("远航智能"));
  assert.match(overview.content, /回复率、通过率等未记录指标不得自行推测/);
});

test("application context triggers for personal intent and a tracked company, not unrelated chat", () => {
  const applications = [application()];
  assert.equal(shouldUseApplicationContext("我投了哪些产品经理岗位？", [], applications), true);
  assert.equal(shouldUseApplicationContext("远航智能这条下一步怎么准备？", [], applications), true);
  assert.equal(shouldUseApplicationContext("帮我修改自我介绍", [], applications), false);
  assert.equal(shouldUseApplicationContext("行业平均回复率是多少？", [], applications), false);
});

test("application follow-up inherits context from a recent assistant citation", () => {
  const history = [{
    role: "assistant",
    citations: [{
      id: "personal-applications:overview",
      sourceId: "personal-applications:overview",
      title: "个人投递管理｜当前投递概览",
      excerpt: "投递总数：1 条"
    }]
  }];
  assert.equal(shouldUseApplicationContext("那下一步呢？", history, []), true);
});
