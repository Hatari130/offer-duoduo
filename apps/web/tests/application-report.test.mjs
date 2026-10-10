import assert from "node:assert/strict";
import test from "node:test";
import { buildApplicationReport, reachedStep, shortCompanyName } from "../src/features/applications/applicationReport.ts";

const at = "2026-10-01T00:00:00Z";
const app = (company, stage, extra = {}) => ({ company, stage, createdAt: at, updatedAt: at, ...extra });

test("reachedStep reads how far a closed application got from its closed reason", () => {
  assert.equal(reachedStep(app("A", "interested")), undefined);
  assert.equal(reachedStep(app("A", "to_apply")), undefined);
  assert.equal(reachedStep(app("A", "closed")), "applied");
  assert.equal(reachedStep(app("A", "closed", { closedReason: "resume_rejected" })), "applied");
  assert.equal(reachedStep(app("A", "closed", { closedReason: "assessment_rejected" })), "assessment");
  assert.equal(reachedStep(app("A", "closed", { closedReason: "interview_2_rejected" })), "interview");
  assert.equal(reachedStep(app("A", "closed", { closedReason: "hr_rejected" })), "interview");
  assert.equal(reachedStep(app("A", "offer")), "offer");
});

test("the funnel is cumulative and ignores applications never submitted", () => {
  const report = buildApplicationReport([
    app("字节跳动", "interview"),
    app("腾讯", "offer"),
    app("美团", "assessment"),
    app("京东", "applied"),
    app("快手", "closed", { closedReason: "interview_1_rejected" }),
    app("小红书", "interested")
  ]);
  assert.deepEqual(report.counts, { applied: 5, assessment: 4, interview: 3, offer: 1 });
  assert.equal(report.companies.length, 5);
  assert.ok(!report.companies.some((company) => company.name === "小红书"));
});

test("companies are listed once, furthest stage first, so offers never hide behind +N", () => {
  const report = buildApplicationReport([
    app("京东", "applied", { updatedAt: "2026-10-09T00:00:00Z" }),
    app("腾讯", "applied"),
    app("腾讯", "offer"),
    app("字节跳动", "interview")
  ]);
  assert.deepEqual(report.companies, [
    { name: "腾讯", furthest: "offer" },
    { name: "字节跳动", furthest: "interview" },
    { name: "京东", furthest: "applied" }
  ]);
  assert.equal(report.counts.applied, 4);
});

test("title follows the dominant recruitment season and the comment only uses the user's own numbers", () => {
  const report = buildApplicationReport([
    app("A", "interview", { recruitmentType: "autumn" }),
    app("B", "applied", { recruitmentType: "autumn_early" }),
    app("C", "applied", { recruitmentType: "spring" })
  ], new Date(2026, 9, 10));
  assert.equal(report.title, "我的秋招战报");
  assert.equal(report.dateLabel, "截至 2026.10.10");
  assert.equal(report.comment, "3 份投递换来 1 次面试，下一站是 Offer。");
  assert.doesNotMatch(report.comment, /同届|高于|超过/);
});

test("no report when nothing has been submitted", () => {
  assert.equal(buildApplicationReport([app("A", "interested")]), undefined);
  assert.equal(buildApplicationReport([]), undefined);
});

test("legal suffixes are trimmed so the same company is not listed twice", () => {
  assert.equal(shortCompanyName("帆软软件有限公司"), "帆软软件");
  assert.equal(shortCompanyName("岚图汽车科技股份有限公司"), "岚图汽车科技");
  assert.equal(shortCompanyName("有限公司"), "有限公司");
  const report = buildApplicationReport([app("帆软软件有限公司", "applied"), app("帆软软件", "interview")]);
  assert.deepEqual(report.companies, [{ name: "帆软软件", furthest: "interview" }]);
});
