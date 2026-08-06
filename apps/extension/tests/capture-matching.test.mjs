import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(
  new URL("../src/features/workspace/workspaceUtils.ts", import.meta.url),
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
  crypto: globalThis.crypto
});

const {
  captureCandidatesFromProgress,
  isCapturePositionRejected,
  prepareCaptureForReview
} = moduleBox.exports;

test("capture validation rejects process and campaign labels as positions", () => {
  for (const value of ["AI面试", "简历投递", "简历筛选中", "百度校园招聘"]) {
    assert.equal(isCapturePositionRejected(value), true, value);
  }
  assert.equal(isCapturePositionRejected("技术产品经理"), false);
  assert.equal(isCapturePositionRejected("AI面试产品经理"), false);
});

test("progress evidence becomes same-card capture candidates", () => {
  const page = {
    company: "招聘平台",
    position: "投递记录",
    responsibilities: [],
    requirements: [],
    sourceUrl: "https://campus.jd.com/applications",
    sourceHost: "campus.jd.com",
    confidence: 0.6,
    deadline: "2026-08-31",
    nextAction: "unused",
    summary: "unused",
    progressEvidence: [
      {
        jobId: "100122400085",
        company: "京东",
        position: "技术产品经理",
        currentStage: "简历筛选中",
        steps: [],
        confidence: 0.92
      },
      {
        jobId: "100122400086",
        company: "京东",
        position: "AI面试",
        currentStage: "简历筛选中",
        steps: [],
        confidence: 0.97
      }
    ]
  };

  const candidates = captureCandidatesFromProgress(page);
  assert.equal(candidates.length, 1);
  assert.deepEqual(
    {
      company: candidates[0].company,
      position: candidates[0].position,
      progress: candidates[0].externalStage,
      stage: candidates[0].suggestedStage,
      deadline: candidates[0].deadline,
      nextAction: candidates[0].nextAction,
      summary: candidates[0].summary
    },
    {
      company: "京东",
      position: "技术产品经理",
      progress: "简历筛选中",
      stage: "applied",
      deadline: undefined,
      nextAction: undefined,
      summary: undefined
    }
  );
});

test("different application ids keep otherwise identical positions separate", () => {
  const baseEvidence = {
    company: "测试公司",
    position: "产品经理",
    currentStage: "简历筛选",
    steps: [],
    confidence: 0.9
  };
  const candidates = captureCandidatesFromProgress({
    company: "测试公司",
    position: "投递记录",
    responsibilities: [],
    requirements: [],
    sourceUrl: "https://example.com/applications",
    sourceHost: "example.com",
    confidence: 0.6,
    progressEvidence: [
      { ...baseEvidence, jobId: "100000000001" },
      { ...baseEvidence, jobId: "100000000002" }
    ]
  });
  assert.equal(candidates.length, 2);
});

test("unsafe page-level fallback is blank and cannot masquerade as a position", () => {
  const result = prepareCaptureForReview({
    company: "京东",
    position: "AI面试",
    responsibilities: [],
    requirements: [],
    sourceUrl: "https://campus.jd.com/applications",
    sourceHost: "campus.jd.com",
    confidence: 0.97
  });
  assert.equal(result.position, "");
  assert.equal(result.confidence, 0.49);
});
