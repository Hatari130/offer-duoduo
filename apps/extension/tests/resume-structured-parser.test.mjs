import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeResumeStructuredText,
  parseResumeDateRange,
  parseResumeStructuredText
} from "../src/features/profile/resumeStructuredParser.ts";

const completeResume = `
姓名：陈城 | 性别：男 | 手机：13800138000 | 邮箱：chencheng@example.com
现居城市：南京 | 求职意向：AI 产品经理

教育背景
2024.09 — 2027.06 | 南京大学 | 城乡规划 | 硕士 | GPA：3.8/4.0
2020年09月 至 2024年06月 | 北京林业大学 | 城乡规划 | 本科

实习 / 工作经历
2025.01 - 至今 | 携程集团 | AI 产品经理
 负责企业级桌面端 AI Agent 的需求调研与方案设计。
2023.07~2024.12 | 星河科技有限公司 | 产品实习生
 完成用户访谈并输出产品需求文档。

项目经验
2025.03-2025.08 | TripYoYo 企业级通用桌面 AI Agent | 项目负责人
• 设计 Skill 市场和权限体系。
项目二：地图工坊 Map Creator | 产品经理 | 2024/09—2025/02
• 完成需求调研、产品设计与上线验证。

校园活动
2022.09 - 2023.06 | 南京大学学生会 | 新媒体部部长
• 负责校园活动内容策划与团队协作。

荣誉与奖项
2024年07月 | 全国大学生创新创业竞赛 | 国家级一等奖
2023.12 | 优秀学生干部 | 校级

其他信息
这是一段当前规则无法可靠归类、但必须保留的原文。
`;

test("parses multiple education, work, project, campus and award entries without losing unknown text", () => {
  const result = parseResumeStructuredText(completeResume, "陈城个人简历.pdf");
  const { profile, diagnostics } = result;

  assert.equal(profile.fullName, "陈城");
  assert.equal(profile.gender, "男");
  assert.equal(profile.phone, "13800138000");
  assert.equal(profile.email, "chencheng@example.com");
  assert.equal(profile.currentCity, "南京");
  assert.equal(profile.targetRole, "AI 产品经理");

  assert.equal(profile.education.length, 2);
  assert.deepEqual(
    profile.education.map(({ school, major, degree, startDate, endDate }) => ({ school, major, degree, startDate, endDate })),
    [
      { school: "南京大学", major: "城乡规划", degree: "硕士", startDate: "2024-09", endDate: "2027-06" },
      { school: "北京林业大学", major: "城乡规划", degree: "本科", startDate: "2020-09", endDate: "2024-06" }
    ]
  );

  assert.equal(profile.experiences.length, 2);
  assert.deepEqual(
    profile.experiences.map(({ organization, title, startDate, endDate }) => ({ organization, title, startDate, endDate })),
    [
      { organization: "携程集团", title: "AI 产品经理", startDate: "2025-01", endDate: "至今" },
      { organization: "星河科技有限公司", title: "产品实习生", startDate: "2023-07", endDate: "2024-12" }
    ]
  );
  assert.match(profile.experiences[0].description, /企业级桌面端 AI Agent/);
  assert.equal(profile.experiences[0].contentBlocks?.[0]?.kind, "bullet");

  assert.equal(profile.projects.length, 2);
  assert.equal(profile.projects[0].name, "TripYoYo 企业级通用桌面 AI Agent");
  assert.equal(profile.projects[0].role, "项目负责人");
  assert.equal(profile.projects[0].contentBlocks?.[0]?.kind, "bullet");
  assert.equal(profile.projects[1].name, "地图工坊 Map Creator");
  assert.equal(profile.projects[1].role, "产品经理");

  assert.equal(profile.campusExperiences.length, 1);
  assert.equal(profile.campusExperiences[0].type, "南京大学学生会");
  assert.equal(profile.campusExperiences[0].role, "新媒体部部长");

  assert.equal(profile.awards.length, 2);
  assert.deepEqual(profile.awards.map(({ date, name, level }) => ({ date, name, level })), [
    { date: "2024-07", name: "全国大学生创新创业竞赛", level: "国家级一等奖" },
    { date: "2023-12", name: "优秀学生干部", level: "校级" }
  ]);

  assert.match(diagnostics.unclassifiedText, /必须保留的原文/);
  assert.ok(diagnostics.unclassifiedLines.some((line) => line.text === "其他信息"));
  assert.ok(diagnostics.coverage > 0 && diagnostics.coverage < 1);
  assert.ok(diagnostics.warnings.some((warning) => warning.includes("未可靠归类")));
  assert.ok(diagnostics.sections.some((section) => section.kind === "unknown" && section.heading === "其他信息"));
});

test("parses education college and study form", () => {
  const result = parseResumeStructuredText(`
教育背景
学校：南京大学
学院：建筑与城市规划学院
专业：城乡规划
学历：硕士
学习形式：全国普通高等院校全日制
2024-09 至 2027-06
`, "教育信息.pdf");

  assert.equal(result.profile.education.length, 1);
  assert.equal(result.profile.education[0].college, "建筑与城市规划学院");
  assert.equal(result.profile.education[0].educationForm, "全国普通高等院校全日制");
});

test("normalizes Wingdings/private-use bullets and supports common date variants", () => {
  const normalized = normalizeResumeStructuredText("\uf0b7 第一条\n\uf06e 第二条");
  assert.equal(normalized, "• 第一条\n• 第二条");

  assert.deepEqual(parseResumeDateRange("2022年9月—2024年06月"), {
    startDate: "2022-09",
    endDate: "2024-06",
    isCurrent: false,
    matchedText: "2022年9月—2024年06月"
  });
  assert.deepEqual(parseResumeDateRange("2025.01 至今"), {
    startDate: "2025-01",
    endDate: "至今",
    isCurrent: true,
    matchedText: "2025.01 至今"
  });
  assert.deepEqual(parseResumeDateRange("2024.06-09"), {
    startDate: "2024-06",
    endDate: "2024-09",
    isCurrent: false,
    matchedText: "2024.06-09"
  });
});

test("does not invent fields when evidence is absent and retains all source text", () => {
  const source = "没有章节的自由文本\n另一行无法确认含义";
  const result = parseResumeStructuredText(source, "upload.pdf");

  assert.equal(result.profile.fullName, "");
  assert.equal(result.profile.education.length, 0);
  assert.equal(result.profile.experiences.length, 0);
  assert.equal(result.profile.projects.length, 0);
  assert.equal(result.profile.campusExperiences.length, 0);
  assert.equal(result.profile.awards.length, 0);
  assert.equal(result.diagnostics.unclassifiedText, source);
  assert.equal(result.diagnostics.coverage, 0);
  assert.ok(result.diagnostics.warnings.some((warning) => warning.includes("没有识别到明确")));
});
