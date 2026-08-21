import assert from "node:assert/strict";
import test from "node:test";
import type { FormFieldMatch } from "../src/shared/types.ts";
import { normalizeRepeatableFormFields } from "../src/features/profile/repeatableFormFields.ts";

const field = (
  id: string,
  key: FormFieldMatch["key"],
  repeatIndex?: number
): FormFieldMatch => ({
  id,
  key,
  repeatIndex,
  label: id,
  type: "input",
  confidence: 0.96
});

test("normalizes mixed Xiaomi work-experience indexes after final field matching", () => {
  const normalized = normalizeRepeatableFormFields([
    field("start-1", "experienceStartDate", 1),
    field("end-1", "experienceEndDate", 1),
    field("company-1", "experienceOrganization", 0),
    field("title-1", "experienceTitle", 0),
    field("description-1", "experienceDescription", 0),
    field("start-2", "experienceStartDate", 0),
    field("end-2", "experienceEndDate", 0),
    // Simulates a field that only gained its semantic key after DeepSeek matching.
    field("company-2", "experienceOrganization"),
    field("title-2", "experienceTitle"),
    field("description-2", "experienceDescription")
  ]);

  assert.deepEqual(
    normalized.map(({ id, repeatGroup, repeatIndex }) => ({ id, repeatGroup, repeatIndex })),
    [
      { id: "start-1", repeatGroup: "experience", repeatIndex: 0 },
      { id: "end-1", repeatGroup: "experience", repeatIndex: 0 },
      { id: "company-1", repeatGroup: "experience", repeatIndex: 0 },
      { id: "title-1", repeatGroup: "experience", repeatIndex: 0 },
      { id: "description-1", repeatGroup: "experience", repeatIndex: 0 },
      { id: "start-2", repeatGroup: "experience", repeatIndex: 1 },
      { id: "end-2", repeatGroup: "experience", repeatIndex: 1 },
      { id: "company-2", repeatGroup: "experience", repeatIndex: 1 },
      { id: "title-2", repeatGroup: "experience", repeatIndex: 1 },
      { id: "description-2", repeatGroup: "experience", repeatIndex: 1 }
    ]
  );
});

test("keeps every field in the same structural card on the same repeat index", () => {
  const fields = [
    { ...field("second-date", "experienceStartDate", 1), repeatIndexSource: "structural" as const, repeatEntryFingerprint: "experience:card-b", domOrder: 1 },
    { ...field("first-company", "experienceOrganization", 0), repeatIndexSource: "structural" as const, repeatEntryFingerprint: "experience:card-a", domOrder: 2 },
    { ...field("first-title", "experienceTitle", 0), repeatIndexSource: "structural" as const, repeatEntryFingerprint: "experience:card-a", domOrder: 3 },
    { ...field("second-company", "experienceOrganization", 1), repeatIndexSource: "structural" as const, repeatEntryFingerprint: "experience:card-b", domOrder: 4 },
    { ...field("second-title", "experienceTitle", 1), repeatIndexSource: "structural" as const, repeatEntryFingerprint: "experience:card-b", domOrder: 5 }
  ];

  const normalized = normalizeRepeatableFormFields(fields);
  assert.deepEqual(
    normalized.map(({ id, repeatIndex }) => ({ id, repeatIndex })),
    [
      { id: "second-date", repeatIndex: 1 },
      { id: "first-company", repeatIndex: 0 },
      { id: "first-title", repeatIndex: 0 },
      { id: "second-company", repeatIndex: 1 },
      { id: "second-title", repeatIndex: 1 }
    ],
    "the card fingerprint must outrank conflicting per-field occurrence counters"
  );
});
