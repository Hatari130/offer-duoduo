import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(
  new URL("../../../packages/domain/src/application-identity.ts", import.meta.url),
  "utf8"
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const moduleBox = { exports: {} };
vm.runInNewContext(output, {
  module: moduleBox,
  exports: moduleBox.exports,
  require,
  console,
  URL
});

const {
  matchExistingApplication,
  rememberApplicationObservation
} = moduleBox.exports;

const baseJob = (overrides = {}) => ({
  id: "job_1",
  company: "京东",
  position: "技术产品经理",
  city: "北京",
  sourceHost: "campus.jd.com",
  sourceUrl: "https://campus.jd.com/jobs/tech-product",
  stage: "applied",
  responsibilities: [],
  requirements: [],
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
  events: [],
  ...overrides
});

test("no-id applications match by platform, company, normalized position and city", () => {
  const result = matchExistingApplication([baseJob()], {
    sourceHost: "campus.jd.com",
    sourceUrl: "https://campus.jd.com/application/list",
    company: "京东集团",
    position: "北京-技术产品经理（实习生）",
    city: "北京市",
    appliedAt: "2026/07/22"
  });

  assert.equal(result.kind, "matched");
  assert.equal(result.best.job.id, "job_1");
  assert.ok(result.best.score >= 80);
});

test("same title without enough distinguishing data remains ambiguous", () => {
  const result = matchExistingApplication(
    [
      baseJob({ id: "job_beijing", city: "北京" }),
      baseJob({ id: "job_shanghai", city: "上海" })
    ],
    {
      sourceHost: "campus.jd.com",
      company: "京东",
      position: "技术产品经理"
    }
  );

  assert.equal(result.kind, "ambiguous");
  assert.equal(result.alternatives.length, 1);
});

test("application id remains the strongest identity signal", () => {
  const result = matchExistingApplication(
    [
      baseJob({ id: "job_1", jobId: "100122400085", position: "技术产品经理" }),
      baseJob({ id: "job_2", jobId: "100122400086", position: "技术产品经理" })
    ],
    {
      sourceHost: "campus.jd.com",
      jobId: "100122400085",
      company: "京东",
      position: "岗位名称加载后发生变化"
    }
  );

  assert.equal(result.kind, "matched");
  assert.equal(result.best.job.id, "job_1");
  assert.ok(result.best.reasons.includes("application_id"));
});

test("remembered record links make later no-id matching stable", () => {
  const remembered = rememberApplicationObservation(baseJob(), {
    sourceHost: "campus.jd.com",
    sourceUrl: "https://campus.jd.com/application/list",
    recordUrl: "https://campus.jd.com/application/detail?record=abc",
    company: "京东",
    position: "技术产品经理",
    city: "北京"
  });

  const result = matchExistingApplication([remembered], {
    sourceHost: "campus.jd.com",
    recordUrl: "https://campus.jd.com/application/detail?record=abc",
    company: "京东",
    position: "技术产品经理"
  });

  assert.equal(result.kind, "matched");
  assert.equal(result.best.job.id, "job_1");
  assert.ok(result.best.reasons.includes("remembered_alias"));
});

test("a different platform does not match an otherwise identical position", () => {
  const result = matchExistingApplication([baseJob()], {
    sourceHost: "campus.baidu.com",
    company: "京东",
    position: "技术产品经理",
    city: "北京"
  });

  assert.equal(result.kind, "none");
});
