import assert from "node:assert/strict";
import test from "node:test";
import {
  isStudioSectionHidden,
  moveStudioSection,
  normalizeStudioSectionOrder,
  toggleStudioSectionHidden
} from "../src/features/resumes/resumeStudioSections.ts";

const legacyTemplate = () => ({
  templateId: "clarity", accentColor: "#000", pageSize: "A4", pageLimit: 1,
  sectionOrder: ["summary", "education", "experience", "projects", "campus", "awards", "skills"],
  hiddenSections: []
});

test("legacy resumes split experience into internship and work modules", () => {
  assert.deepEqual(normalizeStudioSectionOrder(legacyTemplate()).slice(0, 5), ["summary", "education", "internship", "work", "projects"]);
});

test("work is hidden by default while internship remains visible", () => {
  assert.equal(isStudioSectionHidden(legacyTemplate(), "internship"), false);
  assert.equal(isStudioSectionHidden(legacyTemplate(), "work"), true);
});

test("users can reveal work independently and preserve a legacy hidden internship", () => {
  const shown = toggleStudioSectionHidden(legacyTemplate(), "work");
  assert.deepEqual(shown.hiddenExperienceKinds, []);
  const legacyHidden = { ...legacyTemplate(), hiddenSections: ["experience"] };
  const internshipShown = toggleStudioSectionHidden(legacyHidden, "internship");
  assert.deepEqual(internshipShown.hiddenSections, []);
  assert.deepEqual(internshipShown.hiddenExperienceKinds, ["work"]);
});

test("internship and work modules move independently", () => {
  const template = legacyTemplate();
  assert.deepEqual(moveStudioSection(template, "work", -1).slice(0, 5), ["summary", "education", "work", "internship", "projects"]);
});
