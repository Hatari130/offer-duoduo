import assert from "node:assert/strict";
import test from "node:test";
import { mergeRemoteResumeTemplates } from "../src/infrastructure/sync/resumeTemplateSync.ts";

const emptyProfile = (name = "") => ({
  fullName: name,
  gender: "",
  phone: "",
  email: "",
  birthDate: "",
  graduationDate: "",
  currentCity: "",
  nativePlace: "",
  height: "",
  weight: "",
  recruitmentType: "",
  graduateStatus: "",
  address: "",
  targetRole: "",
  targetCities: "",
  earliestStartDate: "",
  portfolioUrl: "",
  githubUrl: "",
  education: [],
  experiences: [],
  projects: [],
  campusExperiences: [],
  awards: [],
  selfIntroduction: "",
  strengths: "",
  careerPlan: ""
});

test("web-created resume fields are added to the extension library", () => {
  const merged = mergeRemoteResumeTemplates([], [{
    id: "web-resume",
    name: "产品经理通用简历",
    profile: emptyProfile("林知夏"),
    origin: "web",
    createdAt: "2026-09-03T08:00:00.000Z",
    updatedAt: "2026-09-03T08:00:00.000Z"
  }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].kind, "base");
  assert.equal(merged[0].profile.fullName, "林知夏");
});

test("newer web fields replace local fields and tombstones remove stale copies", () => {
  const local = [{
    id: "shared-resume",
    name: "旧名称",
    kind: "base",
    profile: emptyProfile("旧姓名"),
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z"
  }];
  const updated = mergeRemoteResumeTemplates(local, [{
    id: "shared-resume",
    name: "网页名称",
    profile: emptyProfile("网页姓名"),
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z"
  }]);
  assert.equal(updated[0].name, "网页名称");
  assert.equal(updated[0].profile.fullName, "网页姓名");

  const removed = mergeRemoteResumeTemplates(updated, [{
    id: "shared-resume",
    name: "网页名称",
    profile: emptyProfile("网页姓名"),
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    deletedAt: "2026-09-04T00:00:00.000Z"
  }]);
  assert.equal(removed.length, 0);
});
