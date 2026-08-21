import assert from "node:assert/strict";
import test from "node:test";
import {
  inferRecruitmentType,
  normalizeRecruitmentType
} from "../src/applications.ts";

test("normalizes persisted values and Chinese labels", () => {
  assert.equal(normalizeRecruitmentType("summer_internship"), "summer_internship");
  assert.equal(normalizeRecruitmentType("秋招提前批"), "autumn_early");
  assert.equal(normalizeRecruitmentType("未知"), undefined);
});

test("infers specific campaigns before broad internship and campus terms", () => {
  assert.equal(inferRecruitmentType("2027届秋招提前批 产品经理"), "autumn_early");
  assert.equal(inferRecruitmentType("项目：2027届校园招聘-技术提前批"), "autumn_early");
  assert.equal(inferRecruitmentType("暑期实习生招聘 - AI 产品"), "summer_internship");
  assert.equal(inferRecruitmentType("日常实习 产品运营"), "daily_internship");
  assert.equal(inferRecruitmentType("2027届春季校园招聘"), "spring");
  assert.equal(inferRecruitmentType("2027校园招聘 技术产品经理"), "autumn");
  assert.equal(
    inferRecruitmentType("AI Agent 产品运营实习生", "校园招聘官网"),
    "daily_internship"
  );
  assert.equal(
    inferRecruitmentType("技术产品经理", undefined, "公司也有实习岗位", "2027校园招聘"),
    "autumn"
  );
});

test("returns undefined when the page has no campaign evidence", () => {
  assert.equal(inferRecruitmentType("社会招聘 高级产品经理"), undefined);
});
