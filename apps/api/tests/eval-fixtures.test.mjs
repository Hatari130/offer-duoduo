import assert from "node:assert/strict";
import test from "node:test";
import { mentions } from "../evals/fixtures.ts";

test("a number token only matches the whole number", () => {
  assert.equal(mentions("抽查了 300 多张凭证", "300"), true);
  assert.equal(mentions("粉丝 2300", "300"), false);
  assert.equal(mentions("单篇最高阅读 3000", "300"), false);
});

test("decimals and mixed tokens keep their boundaries", () => {
  assert.equal(mentions("成交额大概 1.2 万", "1.2"), true);
  assert.equal(mentions("提升 11.25%", "1.2"), false);
  assert.equal(mentions("跟进了 6期培训班", "6期"), true);
  assert.equal(mentions("开过 ICP-OES", "ICP"), true);
});
