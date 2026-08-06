import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

await import("../public/extraction-rules.js");

const rules = globalThis.OfferFlowExtractionRules;
const fixtures = JSON.parse(
  await readFile(new URL("./fixtures/extraction-cases.json", import.meta.url), "utf8")
);

test("known platform fixtures separate positions, campaigns and progress text", () => {
  for (const fixture of fixtures) {
    const adapter = rules.getAdapter(fixture.hostname);
    assert.equal(adapter.id, fixture.platform);
    assert.equal(rules.classifyText(fixture.position), "occupation");
    assert.equal(rules.isLikelyPosition(fixture.position), true);
    assert.equal(rules.classifyText(fixture.campaign), "campaign");
    assert.equal(rules.isLikelyPosition(fixture.campaign), false);
    for (const progress of fixture.processes) {
      assert.equal(
        rules.classifyText(progress),
        "process",
        `${fixture.platform}: ${progress} must be progress text`
      );
      assert.equal(rules.isLikelyPosition(progress), false);
    }
  }
});

test("an occupation containing a process word remains a valid occupation", () => {
  assert.equal(rules.classifyText("AI面试产品经理"), "occupation");
  assert.equal(rules.isLikelyPosition("AI面试产品经理"), true);
});

test("later recruitment stages remain process text", () => {
  for (const value of ["群面", "业务面试", "背景调查", "体检", "薪酬沟通", "Offer审批", "Offer发放", "签约"]) {
    assert.equal(rules.classifyText(value), "process", value);
    assert.equal(rules.isLikelyPosition(value), false);
  }
});

test("platform application identifiers support numeric and alphanumeric forms", () => {
  assert.equal(
    rules.extractApplicationId("申请编号 100122400085", rules.getAdapter("talent.alibaba.com")),
    "100122400085"
  );
  assert.equal(
    rules.extractApplicationId("北京-AI产品经理(J100665)", rules.getAdapter("talent.baidu.com")),
    "J100665"
  );
  assert.equal(
    rules.extractApplicationId("普通页面 100122400085", rules.getAdapter("example.com")),
    undefined
  );
});
