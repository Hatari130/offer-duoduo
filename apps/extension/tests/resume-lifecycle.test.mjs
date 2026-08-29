import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateResumeCoverage,
  collectResumeRemovalIds,
  countResumeFields,
  dehydrateResumeLibrary,
  migrateResumeLibrary,
  resolveActiveResumeId
} from "../src/features/resumes/resumeLifecycle.ts";

function profile(overrides = {}) {
  return {
    fullName: "陈城",
    gender: "",
    phone: "13800000000",
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
    careerPlan: "",
    extraFields: {},
    ...overrides
  };
}

function resume(id, overrides = {}) {
  return {
    id,
    name: id,
    profile: profile(),
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides
  };
}

test("field count and coverage include campus and awards", () => {
  const candidate = resume("base", {
    profile: profile({
      education: [{ id: "e1", school: "南京大学", major: "城乡规划", degree: "硕士", startDate: "", endDate: "", gpa: "" }],
      experiences: [{ id: "x1", organization: "携程", title: "产品经理", startDate: "", endDate: "", description: "负责产品" }],
      projects: [{ id: "p1", name: "Agent", role: "产品", startDate: "", endDate: "", description: "项目描述" }],
      campusExperiences: [{ id: "c1", organization: "学生会", role: "部长", startDate: "", endDate: "", description: "组织活动" }],
      awards: [{ id: "a1", name: "一等奖", level: "校级", date: "2025" }]
    })
  });
  assert.ok(countResumeFields(candidate) >= 18);
  assert.equal(calculateResumeCoverage(candidate), 1);
});

test("legacy PDF records migrate directly to a general resume with an explicit unknown parse report", () => {
  const [migrated] = migrateResumeLibrary([
    resume("legacy", {
      sourceFileName: "resume.pdf",
      sourcePdf: { fileName: "resume.pdf", size: 10, importedAt: "2026-08-10", base64: "JVBERi0=" }
    })
  ]);
  assert.equal(migrated.kind, "base");
  assert.equal(migrated.masterResumeId, undefined);
  assert.equal(migrated.parse.status, "unknown");
  assert.equal(migrated.source.storageStatus, "stored");
});

test("legacy master/base pairs collapse and job versions inherit without duplicating binary assets", () => {
  const master = resume("master", {
    kind: "master",
    masterResumeId: "master",
    sourcePdf: { fileName: "resume.pdf", size: 10, importedAt: "2026-08-10", base64: "JVBERi0=" },
    assets: [{ id: "photo", kind: "portrait", dataUrl: "data:image/png;base64,AA==", mimeType: "image/png", width: 100, height: 130, source: "pdf" }],
    portraitAssetId: "photo"
  });
  const base = resume("base", { kind: "base", masterResumeId: "master", parentResumeId: "master" });
  const job = resume("job", { kind: "job", masterResumeId: "master", parentResumeId: "base" });
  const migrated = migrateResumeLibrary([job, base, master]);
  assert.equal(migrated.length, 2);
  const hydratedBase = migrated.find((item) => item.id === "base");
  assert.equal(hydratedBase.sourcePdf.base64, "JVBERi0=");
  assert.equal(hydratedBase.assets[0].id, "photo");
  assert.equal(hydratedBase.portraitAssetId, "photo");
  assert.equal(hydratedBase.source.storageStatus, "stored");
  const hydratedJob = migrated.find((item) => item.id === "job");
  assert.equal(hydratedJob.sourcePdf.base64, "JVBERi0=");
  assert.equal(hydratedJob.sourcePdfInherited, true);
  assert.equal(hydratedJob.assets[0].id, "photo");
  assert.equal(hydratedJob.sourceAssetsInherited, true);
  const persistedBase = dehydrateResumeLibrary(migrated).find((item) => item.id === "base");
  assert.equal(persistedBase.sourcePdf.base64, "JVBERi0=");
  assert.equal(persistedBase.sourcePdfInherited, undefined);
  assert.equal(persistedBase.assets[0].id, "photo");
  assert.equal(persistedBase.sourceAssetsInherited, undefined);
  assert.equal(persistedBase.portraitAssetId, "photo");
  const persistedJob = dehydrateResumeLibrary(migrated).find((item) => item.id === "job");
  assert.equal(persistedJob.sourcePdf, undefined);
  assert.equal(persistedJob.assets, undefined);
});

test("active resume repair prefers a usable general resume and repairs a unique library", () => {
  const base = resume("base", { kind: "base" });
  const job = resume("job", { kind: "job", parentResumeId: "base" });
  assert.equal(resolveActiveResumeId([job, base], "missing"), "base");
  assert.equal(resolveActiveResumeId([job, base], "job"), "job");
  assert.equal(resolveActiveResumeId([base], ""), "base");
});

test("deleting a general resume cascades through its job versions", () => {
  const library = [
    resume("base", { kind: "base" }),
    resume("job", { kind: "job", parentResumeId: "base" }),
    resume("other", { kind: "base" })
  ];
  assert.deepEqual([...collectResumeRemovalIds(library, "base")].sort(), ["base", "job"]);
});
