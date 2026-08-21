import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const workspaceRequire = (id) => id === "@/shared/types" ? require("@offerflow/domain") : require(id);
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
  require: workspaceRequire,
  console,
  crypto: globalThis.crypto
});

const {
  captureCandidatesFromProgress,
  isCapturePositionRejected,
  normalizeExternalStage,
  prepareCaptureForReview
} = moduleBox.exports;

test("capture validation rejects process and campaign labels as positions", () => {
  for (const value of [
    "AI面试",
    "简历投递",
    "简历筛选中",
    "百度校园招聘",
    "实习生招聘",
    "合合信息招聘门户",
    "投递记录",
    "应聘记录"
  ]) {
    assert.equal(isCapturePositionRejected(value), true, value);
  }
  assert.equal(isCapturePositionRejected("技术产品经理"), false);
  assert.equal(isCapturePositionRejected("AI面试产品经理"), false);
});

test("capture review preserves a deadline that has page evidence", () => {
  const result = prepareCaptureForReview({
    company: "蔚来",
    position: "提前批-AI产品经理（创新产品）",
    deadline: "2026-08-31",
    responsibilities: [],
    requirements: [],
    sourceUrl: "https://nio.jobs.feishu.cn/campus/position/application",
    sourceHost: "nio.jobs.feishu.cn",
    confidence: 0.98
  });
  assert.equal(result.deadline, "2026-08-31");
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
      progress: "简历初筛",
      stage: "applied",
      deadline: undefined,
      nextAction: undefined,
      summary: undefined
    }
  );
});

test("current progress text is classified into explicit canonical buckets", () => {
  const cases = [
    ["当前进度：简历筛选·初筛进行中", "简历初筛"],
    ["当前进度：简历筛选-初筛进行中", "简历初筛"],
    ["当前状态：简历筛选中", "简历初筛"],
    ["简历评估", "简历初筛"],
    ["已投递", "已投递"],
    ["投递成功", "已投递"],
    ["简历投递", "已投递"],
    ["笔试", "笔试"],
    ["在线测评", "笔试"],
    ["测评中", "笔试"],
    ["面试", "面试"],
    ["一面", "面试"],
    ["AI面试", "面试"],
    ["Offer", "Offer"],
    ["Offer评估", "Offer"],
    ["录用", "Offer"],
    ["未通过", "已结束"],
    ["待投递", "待投递"]
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeExternalStage(input), expected, input);
  }
  assert.equal(normalizeExternalStage("一些无法归类的文本"), undefined);
  assert.equal(normalizeExternalStage(""), undefined);
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

test("zhiye delivery records get the cleaned page company and label-less applied time", () => {
  const candidates = captureCandidatesFromProgress({
    company: "合合信息招聘门户",
    position: "合合信息招聘门户",
    responsibilities: [],
    requirements: [],
    sourceUrl: "https://intsig.zhiye.com/personal/deliveryRecord",
    sourceHost: "intsig.zhiye.com",
    confidence: 0.65,
    progressEvidence: [
      {
        jobId: "J14442",
        position: "【27校招】办公平台AI产品经理/AI Agent工程师（J14442）",
        currentStage: "当前进度：简历筛选·初筛进行中",
        context:
          "【27校招】办公平台AI产品经理/AI Agent工程师（J14442） 当前进度：简历筛选·初筛进行中 校园招聘 2026.08.08 19:03 投递",
        steps: [],
        confidence: 0.92
      }
    ]
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].company, "合合信息");
  assert.equal(candidates[0].position, "【27校招】办公平台AI产品经理/AI Agent工程师（J14442）");
  assert.equal(candidates[0].appliedAt, "2026-08-08 19:03");
  assert.equal(candidates[0].externalStage, "简历初筛");
  assert.equal(candidates[0].suggestedStage, "applied");
  assert.equal(candidates[0].confidence, 0.92);
});
