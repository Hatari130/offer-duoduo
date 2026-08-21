import assert from "node:assert/strict";
import test from "node:test";

import {
  parseResumeContentBlocks,
  serializeResumeContentBlocks
} from "@offerflow/domain";

test("legacy visual lines become semantic project, paragraph and bullet blocks", () => {
  const source = [
    "项目一：TripYoYo 企业级通用桌面 AI Agent",
    "围绕传统企业团队的 AI-native 转型，参与建设企业级桌面端办公 Agent 应用，内部 DAU 200+。",
    "agent迭代：负责平台日常维护、推广与留存，任务成功率提升至95%",
    "参与桌面端产品调研与方案设计，沉淀各业务 Skills/MCP 工具40+。",
    "项目二：Tripflow AI赋能出海短视频生产平台",
    "面向出海内容运营增长团队的内容提效需求，参与建设内部 AI 原生内容生产平台。",
    "视频AI审核体系建设：上线初期合规审核准确率69%，将准确率提升至83%。"
  ].join("\n");

  const blocks = parseResumeContentBlocks(source, "exp-1");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, "project");
  assert.equal(blocks[0].title, "TripYoYo 企业级通用桌面 AI Agent");
  assert.equal(blocks[0].children[0].kind, "paragraph");
  assert.equal(blocks[0].children[1].kind, "bullet");
  assert.equal(blocks[0].children[1].label, "agent迭代");
  assert.equal(blocks[0].children[2].kind, "bullet");
  assert.equal(blocks[1].children[0].kind, "paragraph");
  assert.equal(blocks[1].children[1].label, "视频AI审核体系建设");
  assert.doesNotMatch(serializeResumeContentBlocks(blocks), /^•/m);
});

test("semicolons and wrapped prose are not promoted to separate bullets", () => {
  const blocks = parseResumeContentBlocks("负责需求调研；输出 PRD；推动上线\n并持续跟踪用户反馈。", "exp-2");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, "bullet");
  assert.match(blocks[0].text, /需求调研；输出 PRD；推动上线/);
  assert.match(blocks[0].text, /用户反馈/);
});
