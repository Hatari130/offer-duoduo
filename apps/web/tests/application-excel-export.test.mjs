import assert from "node:assert/strict";
import test from "node:test";
import { createApplicationExportXlsx } from "../src/features/applications/applicationExcelExport.ts";

test("exports application records as an Excel workbook with readable fields", () => {
  const workbook = createApplicationExportXlsx([{
    revision: 3,
    application: {
      id: "application-1",
      company: "示例 & 公司",
      position: "产品经理",
      stage: "interview",
      interviewRound: "interview_2",
      appliedAt: "2026-09-03T09:30:00.000Z",
      sourceUrl: "https://careers.example.com/jobs/1",
      sourceHost: "careers.example.com",
      responsibilities: ["规划产品路线"],
      requirements: ["3 年相关经验"],
      rawExcerpt: "负责&lt;核心&gt;产品。",
      createdAt: "2026-09-01T09:30:00.000Z",
      updatedAt: "2026-09-03T09:30:00.000Z",
      events: [{ id: "event-1", type: "created", title: "创建投递记录", occurredAt: "2026-09-01T09:30:00.000Z" }]
    }
  }]);

  assert.deepEqual([...workbook.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const content = new TextDecoder().decode(workbook);
  assert.match(content, /投递记录/);
  assert.match(content, /示例 &amp; 公司/);
  assert.match(content, /面试 · 二面/);
  assert.match(content, /岗位 JD/);
  assert.match(content, /测评截止/);
  assert.match(content, /<autoFilter ref="A1:S2"/);
});

test("exports assessment application with assessmentType", () => {
  const workbook = createApplicationExportXlsx([
    {
      revision: 1,
      application: {
        id: "app-ai",
        company: "某科技",
        position: "AI工程师",
        stage: "assessment",
        assessmentType: "ai_interview",
        appliedAt: "2026-09-08T09:00:00.000Z",
        deadline: "2026-09-12 18:00",
        sourceUrl: "offerflow://manual",
        sourceHost: "manual",
        responsibilities: [],
        requirements: [],
        createdAt: "2026-09-08T09:00:00.000Z",
        updatedAt: "2026-09-08T09:00:00.000Z",
        events: []
      }
    },
    {
      revision: 1,
      application: {
        id: "app-written",
        company: "某大厂",
        position: "后端开发",
        stage: "assessment",
        assessmentType: "written_test",
        appliedAt: "2026-09-08T09:00:00.000Z",
        deadline: "2026-09-10 18:00",
        sourceUrl: "offerflow://manual",
        sourceHost: "manual",
        responsibilities: [],
        requirements: [],
        createdAt: "2026-09-08T09:00:00.000Z",
        updatedAt: "2026-09-08T09:00:00.000Z",
        events: []
      }
    }
  ]);

  const content = new TextDecoder().decode(workbook);
  assert.match(content, /测评 · AI面/);
  assert.match(content, /测评 · 笔试测评/);
});
