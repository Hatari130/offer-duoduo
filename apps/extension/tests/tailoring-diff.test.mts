import assert from "node:assert/strict";
import test from "node:test";
import { collectResumeTextChanges } from "../src/features/tailor/tailoringDiff.ts";

const resume = {
  targetRole: "AI 产品经理",
  targetCompany: "测试公司",
  generatedAt: "",
  header: { name: "陈城", headline: "AI 产品经理", email: "", phone: "", city: "", links: [] },
  summary: "原摘要",
  education: [],
  experience: [{ id: "exp-1", company: "公司", title: "产品经理", start: "", end: "", location: "", bullets: ["负责平台迭代"] }],
  projects: [],
  campus: [],
  awards: [],
  skills: [],
  languages: [],
  publications: [],
  interests: []
};

test("counts actual content rewrites and ignores unchanged structure", () => {
  const changes = collectResumeTextChanges(resume, {
    ...resume,
    experience: [{ ...resume.experience[0], bullets: ["围绕 AI 办公场景推进平台迭代"] }]
  });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].key, "experience.exp-1.bullet.0");
});

test("does not claim a customization when text is unchanged", () => {
  assert.equal(collectResumeTextChanges(resume, structuredClone(resume)).length, 0);
});
