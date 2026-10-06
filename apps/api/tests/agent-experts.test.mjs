import assert from "node:assert/strict";
import test from "node:test";
import { expertRoster, expertsFor, loadExperts, parseSkill } from "../src/agent/experts.ts";

test("every skill file parses into a complete expert", () => {
  const experts = loadExperts();
  assert.ok(experts.length >= 3);
  for (const expert of experts) {
    for (const key of ["id", "name", "role", "when", "instructions"]) assert.ok(expert[key], `${expert.id} 缺少 ${key}`);
    assert.ok(expert.agents.length > 0);
  }
  assert.equal(new Set(experts.map((expert) => expert.id)).size, experts.length, "专家 id 不能重复");
});

test("the resume coach roster lists names and when to call them, not their methods", () => {
  const ids = expertsFor("resume_coach").map((expert) => expert.id);
  assert.deepEqual(ids, ["business-interviewer", "hr-screener", "plain-editor"]);
  const roster = expertRoster("resume_coach");
  assert.match(roster, /HR 小周/);
  assert.doesNotMatch(roster, /输出格式/);
});

test("a skill file without its business card is rejected", () => {
  assert.throws(() => parseSkill("没有名片的正文"), /名片/);
  assert.throws(() => parseSkill("---\nid: x\nname: 某人\n---\n正文"), /缺少 role/);
});
