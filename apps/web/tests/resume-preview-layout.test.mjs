import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateResumePreviewScale,
  RESUME_A4_WIDTH_PX
} from "../src/features/resumes/resumePreviewLayout.ts";

test("resume preview fits the available pane without changing the A4 width", () => {
  for (const width of [288, 343, 398, 505, 618, 752, 793, 1024, 1440]) {
    const scale = calculateResumePreviewScale(width);
    assert.ok(scale > 0 && scale <= 1);
    assert.ok(RESUME_A4_WIDTH_PX * scale <= width);
    if (width < RESUME_A4_WIDTH_PX) {
      assert.ok(width - RESUME_A4_WIDTH_PX * scale < 1);
    }
  }
});

test("wide panes preserve original size instead of enlarging the resume", () => {
  assert.equal(calculateResumePreviewScale(RESUME_A4_WIDTH_PX), 1);
  assert.equal(calculateResumePreviewScale(1600), 1);
});

test("unmeasurable panes return a safe scale", () => {
  for (const width of [0, -1, NaN, Infinity]) {
    assert.equal(calculateResumePreviewScale(width), 1);
  }
});
