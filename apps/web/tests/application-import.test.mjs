import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDelimitedText,
  parseClipboardOrCsv,
  detectColumnMapping,
  extractCompanyAndDepartment,
  matchOfficialCompany,
  normalizeStageValue,
  normalizeRecruitmentTypeValue,
  normalizeDateValue,
  buildImportCandidates,
  parseXlsxBuffer
} from "../src/features/applications/applicationImport.ts";
import { createApplicationExportXlsx } from "../src/features/applications/applicationExcelExport.ts";

test("parseDelimitedText parses TSV copied from Feishu / Excel", () => {
  const tsv = "公司\t岗位\t当前阶段\t投递时间\n字节跳动\t\"AI产品经理\n(商业化)\"\t已投递\t2026-08-25\n腾讯\t后台开发\t一面\t2026-08-26";
  const rows = parseDelimitedText(tsv);

  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ["公司", "岗位", "当前阶段", "投递时间"]);
  assert.equal(rows[1][0], "字节跳动");
  assert.equal(rows[1][1], "AI产品经理\n(商业化)");
  assert.equal(rows[1][2], "已投递");
  assert.equal(rows[2][0], "腾讯");
  assert.equal(rows[2][2], "一面");
});

test("parseClipboardOrCsv distinguishes header row from data", () => {
  const withHeader = "企业名称\t应聘职位\t流程进度\n阿里巴巴\t前端专家\t笔试测评";
  const res1 = parseClipboardOrCsv(withHeader);
  assert.equal(res1.hasHeaderRow, true);
  assert.deepEqual(res1.headers, ["企业名称", "应聘职位", "流程进度"]);
  assert.equal(res1.rows.length, 1);

  const withoutHeader = "美团\t骑手运营\t已投递\n快手\t推荐算法\t二面";
  const res2 = parseClipboardOrCsv(withoutHeader);
  assert.equal(res2.hasHeaderRow, false);
  assert.equal(res2.headers[0], "第 1 列");
  assert.equal(res2.rows.length, 2);
});

test("detectColumnMapping automatically maps standard and common custom headers", () => {
  const headers = ["投递企业", "应聘岗位", "当前状态", "申请日期", "工作地点", "业务线", "备注信息"];
  const mapping = detectColumnMapping(headers);

  assert.equal(mapping.find((m) => m.headerName === "投递企业")?.targetField, "company");
  assert.equal(mapping.find((m) => m.headerName === "应聘岗位")?.targetField, "position");
  assert.equal(mapping.find((m) => m.headerName === "当前状态")?.targetField, "stage");
  assert.equal(mapping.find((m) => m.headerName === "申请日期")?.targetField, "appliedAt");
  assert.equal(mapping.find((m) => m.headerName === "工作地点")?.targetField, "city");
  assert.equal(mapping.find((m) => m.headerName === "业务线")?.targetField, "department");
  assert.equal(mapping.find((m) => m.headerName === "备注信息")?.targetField, "rawExcerpt");
});

test("extractCompanyAndDepartment handles dash, slash, and parentheses", () => {
  const res1 = extractCompanyAndDepartment("腾讯-IEG");
  assert.equal(res1.company, "腾讯");
  assert.equal(res1.department, "IEG");

  const res2 = extractCompanyAndDepartment("字节跳动（抖音电商）");
  assert.equal(res2.company, "字节跳动");
  assert.equal(res2.department, "抖音电商");

  const res3 = extractCompanyAndDepartment("美团");
  assert.equal(res3.company, "美团");
  assert.equal(res3.department, undefined);
});

test("matchOfficialCompany matches company directory entries and aliases", () => {
  const bytedance = matchOfficialCompany("字节");
  assert.equal(bytedance.matched, true);
  assert.equal(bytedance.canonicalName, "字节跳动");
  assert.ok(bytedance.careerUrl?.includes("bytedance"));

  const cmb = matchOfficialCompany("招行");
  assert.equal(cmb.matched, true);
  assert.equal(cmb.canonicalName, "招商银行");

  const unknown = matchOfficialCompany("神秘创业团队");
  assert.equal(unknown.matched, false);
  assert.equal(unknown.canonicalName, "神秘创业团队");
});

test("normalizeStageValue maps user Chinese stage descriptions into JobKoi stage and round", () => {
  assert.deepEqual(normalizeStageValue("已投递"), { stage: "applied" });
  assert.deepEqual(normalizeStageValue("简历初筛中"), { stage: "applied" });
  assert.deepEqual(normalizeStageValue("笔试测评"), { stage: "assessment" });

  const i1 = normalizeStageValue("技术一面");
  assert.equal(i1.stage, "interview");
  assert.equal(i1.interviewRound, "interview_1");

  const i2 = normalizeStageValue("复试 (二面)");
  assert.equal(i2.stage, "interview");
  assert.equal(i2.interviewRound, "interview_2");

  const hr = normalizeStageValue("HR面试");
  assert.equal(hr.stage, "interview");
  assert.equal(hr.interviewRound, "hr_interview");

  const off = normalizeStageValue("已收意向书 Offer");
  assert.equal(off.stage, "offer");

  const rejInterview = normalizeStageValue("二面挂了");
  assert.equal(rejInterview.stage, "closed");
  assert.equal(rejInterview.closedReason, "interview_2_rejected");

  const rejWritten = normalizeStageValue("笔试未通过");
  assert.equal(rejWritten.stage, "closed");
  assert.equal(rejWritten.closedReason, "assessment_rejected");
});

test("normalizeRecruitmentTypeValue identifies autumn, spring, internship, social", () => {
  assert.equal(normalizeRecruitmentTypeValue("2027届秋招正式批"), "autumn");
  assert.equal(normalizeRecruitmentTypeValue("秋招提前批"), "autumn_early");
  assert.equal(normalizeRecruitmentTypeValue("春招补录"), "spring");
  assert.equal(normalizeRecruitmentTypeValue("日常实习生"), "daily_internship");
  assert.equal(normalizeRecruitmentTypeValue("暑期实习"), "summer_internship");
  assert.equal(normalizeRecruitmentTypeValue("", "【27届秋招】软件产品经理"), "autumn");
});

test("normalizeDateValue formats ISO, Chinese, Slash dates and Excel numbers", () => {
  assert.equal(normalizeDateValue("2026/08/25 18:30"), "2026-08-25 18:30");
  assert.equal(normalizeDateValue("2026年8月25日"), "2026-08-25 08:00");
  assert.equal(normalizeDateValue("2026-08-25T08:00:00.000Z"), "2026-08-25 08:00");
  // Excel serial for 2024-08-25 is ~45529
  const excelDate = normalizeDateValue("45529");
  assert.ok(excelDate?.startsWith("2024-08-25"));
});

test("buildImportCandidates reconciles against existing applications", () => {
  const existingItems = [{
    revision: 1,
    application: {
      id: "existing-app-1",
      company: "字节跳动",
      position: "AI产品经理",
      stage: "applied",
      responsibilities: [],
      requirements: [],
      sourceUrl: "offerflow://manual",
      sourceHost: "manual",
      createdAt: "2026-08-20T00:00:00Z",
      updatedAt: "2026-08-20T00:00:00Z",
      events: []
    }
  }];

  const rawRows = [
    ["字节", "AI产品经理", "二面", "2026-08-25", "北京"],
    ["腾讯", "前端开发", "已投递", "2026-08-26", "深圳"]
  ];

  const mapping = [
    { colIndex: 0, headerName: "公司", targetField: "company" },
    { colIndex: 1, headerName: "岗位", targetField: "position" },
    { colIndex: 2, headerName: "阶段", targetField: "stage" },
    { colIndex: 3, headerName: "时间", targetField: "appliedAt" },
    { colIndex: 4, headerName: "城市", targetField: "city" }
  ];

  // Test update_existing strategy
  const candidatesUpdate = buildImportCandidates(rawRows, mapping, existingItems, "update_existing");
  assert.equal(candidatesUpdate.length, 2);
  assert.equal(candidatesUpdate[0].action, "update");
  assert.equal(candidatesUpdate[0].matchedExistingItem?.application.id, "existing-app-1");
  assert.equal(candidatesUpdate[0].stage, "interview");
  assert.equal(candidatesUpdate[0].interviewRound, "interview_2");
  assert.equal(candidatesUpdate[1].action, "create");

  // Test skip_existing strategy
  const candidatesSkip = buildImportCandidates(rawRows, mapping, existingItems, "skip_existing");
  assert.equal(candidatesSkip[0].action, "skip");
  assert.equal(candidatesSkip[0].selected, false);
  assert.equal(candidatesSkip[1].action, "create");
  assert.equal(candidatesSkip[1].selected, true);
});

test("parseXlsxBuffer parses workbook generated from createApplicationExportXlsx", async () => {
  const testItems = [{
    revision: 1,
    application: {
      id: "app-export-test",
      company: "阿里巴巴",
      position: "全栈工程师",
      stage: "interview",
      interviewRound: "interview_1",
      city: "杭州",
      appliedAt: "2026-08-28T10:00:00.000Z",
      responsibilities: ["核心系统重构"],
      requirements: ["熟悉分布式技术"],
      rawExcerpt: "岗位详细JD内容",
      sourceUrl: "https://talent.alibaba.com",
      sourceHost: "talent.alibaba.com",
      createdAt: "2026-08-25T00:00:00Z",
      updatedAt: "2026-08-28T10:00:00Z",
      events: []
    }
  }];

  const xlsxBytes = createApplicationExportXlsx(testItems);
  const parsed = await parseXlsxBuffer(xlsxBytes.buffer);

  assert.equal(parsed.hasHeaderRow, true);
  assert.ok(parsed.headers.includes("公司"));
  assert.ok(parsed.headers.includes("岗位"));
  assert.equal(parsed.rows.length, 1);

  const companyIndex = parsed.headers.indexOf("公司");
  const positionIndex = parsed.headers.indexOf("岗位");
  assert.equal(parsed.rows[0][companyIndex], "阿里巴巴");
  assert.equal(parsed.rows[0][positionIndex], "全栈工程师");
});
