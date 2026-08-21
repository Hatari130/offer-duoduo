import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const workspaceRequire = (id) => id === "@/shared/types" ? require("@offerflow/domain") : require(id);
const source = readFileSync(
  new URL("../src/integrations/deepseek/deepseek.ts", import.meta.url),
  "utf8"
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const workspaceSource = readFileSync(
  new URL("../src/features/workspace/workspaceUtils.ts", import.meta.url),
  "utf8"
);
const workspaceOutput = ts.transpileModule(workspaceSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const workspaceBox = { exports: {} };
vm.runInNewContext(workspaceOutput, {
  module: workspaceBox,
  exports: workspaceBox.exports,
  require: workspaceRequire,
  console,
  crypto: globalThis.crypto
});
const moduleBox = { exports: {} };
const deepSeekRequire = (id) =>
  id === "@/features/workspace/workspaceUtils" ? workspaceBox.exports : workspaceRequire(id);
vm.runInNewContext(output, {
  module: moduleBox,
  exports: moduleBox.exports,
  require: deepSeekRequire,
  console
});

const { inferApplicationListFromUrl, sanitizeAiPageText } = moduleBox.exports;

test("AI text sanitization strips code comments and standalone navigation labels", () => {
  const dirty = `首页 投递记录 跟进应聘进度，查询暂存投递记录 校园招聘 社会招聘 实习生招聘 编辑
  【27校招】办公平台AI产品经理/AI Agent工程师（J14442） 当前进度：简历筛选·初筛进行中 2026.08.08 19:03 投递
  /*project config start*/ /*project config end*/ <!--page config--> 没有更多了`;
  const cleaned = sanitizeAiPageText(dirty);
  assert.equal(
    cleaned,
    "跟进应聘进度，查询暂存投递记录 【27校招】办公平台AI产品经理/AI Agent工程师（J14442） 当前进度：简历筛选·初筛进行中 2026.08.08 19:03 投递"
  );
});

test("AI text sanitization keeps real position and company text intact", () => {
  assert.equal(
    sanitizeAiPageText("合合信息招聘门户 · 【27校招】办公平台AI产品经理（J14442）"),
    "合合信息招聘门户 · 【27校招】办公平台AI产品经理（J14442）"
  );
});

test("application list URLs are detected regardless of the model page type", () => {
  for (const url of [
    "https://intsig.zhiye.com/personal/deliveryRecord",
    "https://campus.jd.com/applications",
    "https://talent.example.com/personal/apply-record",
    "https://example.com/my-applications",
    "https://example.com/deliveryRecord"
  ]) {
    assert.equal(inferApplicationListFromUrl(url), true, url);
  }
  for (const url of [
    "https://campus.jd.com/jobs/100122560060",
    "https://talent.baidu.com/job/position/123",
    "https://intsig.zhiye.com/campus/detail?jobAdId=123"
  ]) {
    assert.equal(inferApplicationListFromUrl(url), false, url);
  }
});
