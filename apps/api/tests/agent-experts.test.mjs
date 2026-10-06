import assert from "node:assert/strict";
import test from "node:test";
import { customExpert, expertRoster, officialSkills, parseSkill, publicExpert, resolveTeamSkills } from "../src/agent/experts.ts";
import { TEAM_PROFILES } from "../src/agent/teams.ts";

test("every official skill file parses into a complete expert", () => {
  const skills = officialSkills();
  assert.ok(skills.length >= 10);
  for (const skill of skills) {
    for (const key of ["id", "name", "role", "when", "summary", "category", "instructions"]) assert.ok(skill[key], `${skill.id} 缺少 ${key}`);
    assert.ok(skill.teams.length > 0);
    assert.equal(skill.source, "official");
  }
  assert.equal(new Set(skills.map((skill) => skill.id)).size, skills.length, "技能 id 不能重复");
});

test("every team's default skills exist and are allowed on that team", () => {
  for (const team of Object.values(TEAM_PROFILES)) {
    const resolved = resolveTeamSkills(team.id, officialSkills(), undefined, team.defaultSkills);
    assert.deepEqual(resolved.map((skill) => skill.id), team.defaultSkills, `${team.name} 的默认技能有误`);
  }
});

test("requested skills are limited to ones that may join the team", () => {
  const resolved = resolveTeamSkills("job_radar", officialSkills(), ["job-analyst", "plain-editor", "nope"], []);
  assert.deepEqual(resolved.map((skill) => skill.id), ["job-analyst"]);
  assert.deepEqual(resolveTeamSkills("resume_coach", officialSkills(), [], ["hr-screener"]), [], "明确传空数组表示不要专家");
});

test("the roster shows names and when to call them, not their methods", () => {
  const roster = expertRoster(resolveTeamSkills("resume_coach", officialSkills(), ["hr-screener"], []));
  assert.match(roster, /HR 小周/);
  assert.doesNotMatch(roster, /输出/);
});

test("custom skills behave like official ones but keep their method private in public views", () => {
  const expert = customExpert({
    id: "abc", name: "我的导师", role: "研究生导师", when: "需要学术视角时", summary: "导师视角",
    instructions: "你是导师，按学术标准看经历。", teams: ["resume_coach"], createdAt: "", updatedAt: ""
  });
  assert.equal(expert.id, "custom:abc");
  assert.equal(expert.source, "custom");
  assert.equal("instructions" in publicExpert(expert), false);
});

test("a malformed skill file is rejected with a readable reason", () => {
  assert.throws(() => parseSkill("没有名片的正文"), /名片/);
  assert.throws(() => parseSkill("---\nid: x\nname: 某人\n---\n正文"), /缺少 role/);
  const card = (overrides) => `---\nid: x\nname: 某人\nrole: r\ncategory: ${overrides.category ?? "resume"}\nteams: ${overrides.teams ?? "resume_coach"}\nsummary: s\nwhen: w\n---\n正文`;
  assert.throws(() => parseSkill(card({ category: "magic" })), /类别/);
  assert.throws(() => parseSkill(card({ teams: "resume_coach, dream_team" })), /dream_team/);
});
