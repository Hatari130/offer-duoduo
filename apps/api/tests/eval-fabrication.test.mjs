import assert from "node:assert/strict";
import test from "node:test";
import { findUnsupportedClaims, gradeRewrite } from "../src/agent/fabrication.ts";

const resume = [
  "参与校园二手交易小程序的需求调研，访谈 12 名用户，整理需求文档。",
  "使用 Python 和 SQL 分析 3 个月订单数据，输出周报。"
];

test("rewording without new facts passes", () => {
  const rewritten = "围绕用户需求开展调研，访谈 12 名用户并沉淀需求文档。";
  assert.deepEqual(findUnsupportedClaims(rewritten, resume), []);
});

test("a number that never appeared in the resume is flagged", () => {
  const rewritten = "访谈 12 名用户，推动转化率提升 30%。";
  assert.deepEqual(findUnsupportedClaims(rewritten, resume), [{ kind: "number", value: "30" }]);
});

test("a tool the candidate never mentioned is flagged, case-insensitively", () => {
  const rewritten = "使用 python、sql 与 Tableau 分析订单数据。";
  assert.deepEqual(findUnsupportedClaims(rewritten, resume), [{ kind: "term", value: "tableau" }]);
});

test("upgrading 参与 to 主导 is flagged as an ownership claim", () => {
  const rewritten = "主导校园二手交易小程序的需求调研。";
  assert.deepEqual(findUnsupportedClaims(rewritten, resume), [{ kind: "ownership", value: "主导" }]);
});

test("a plain verb swap is not an ownership upgrade when the original was not a supporting role", () => {
  const evidence = ["运营 60 余个热点事件，做内容解读和用户激励"];
  const rewritten = "运营 60 余个热点事件，负责内容解读与用户激励";
  assert.deepEqual(findUnsupportedClaims(rewritten, evidence, { before: evidence[0] }), []);
});

test("参与 rewritten as 负责 within the same change is still flagged", () => {
  const before = "参与校园二手交易小程序的需求调研";
  assert.deepEqual(
    findUnsupportedClaims("负责校园二手交易小程序的需求调研", [before], { before }),
    [{ kind: "ownership", value: "负责" }]
  );
});

test("facts the user supplied in a follow-up answer count as evidence", () => {
  const answer = "这个小程序上线后两周有 400 个同学注册。";
  const rewritten = "参与需求调研的小程序上线两周获得 400 名注册用户。";
  assert.deepEqual(findUnsupportedClaims(rewritten, [...resume, answer]), []);
});

test("the target job title may appear in the summary without evidence", () => {
  const rewritten = "希望从事 AI 产品经理工作。";
  assert.deepEqual(findUnsupportedClaims(rewritten, resume, { allow: ["AI 产品经理"] }), []);
});

test("the report counts the share of changes that contain unsupported claims", () => {
  const report = gradeRewrite([
    { before: resume[0], after: "围绕用户需求开展调研，访谈 12 名用户。" },
    { before: resume[1], after: "使用 Python 分析 3 个月订单数据，带来 20% 增长。" }
  ], resume);
  assert.equal(report.totalChanges, 2);
  assert.equal(report.changesWithFindings, 1);
  assert.equal(report.fabricationRate, 0.5);
  assert.deepEqual(report.findings, [{ kind: "number", value: "20", change: 1 }]);
});
