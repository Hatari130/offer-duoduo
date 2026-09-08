import assert from "node:assert/strict";
import test from "node:test";
import { computeDeadlineStatus } from "../src/features/applications/applicationDeadline.ts";

test("computeDeadlineStatus returns undefined for empty or invalid dates", () => {
  assert.equal(computeDeadlineStatus(undefined), undefined);
  assert.equal(computeDeadlineStatus(""), undefined);
  assert.equal(computeDeadlineStatus("invalid-date-string"), undefined);
});

test("computeDeadlineStatus handles expired deadlines", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  const past = "2026-09-07T12:00:00Z";
  const status = computeDeadlineStatus(past, now);

  assert.ok(status);
  assert.equal(status.isUrgent, true);
  assert.equal(status.isExpired, true);
  assert.equal(status.remainingText, "已截止");
});

test("computeDeadlineStatus triggers urgent warning within 3 days", () => {
  const now = new Date("2026-09-08T12:00:00Z");

  // 10 hours later
  const tenHoursLater = "2026-09-08T22:00:00Z";
  const statusHours = computeDeadlineStatus(tenHoursLater, now);
  assert.ok(statusHours);
  assert.equal(statusHours.isUrgent, true);
  assert.equal(statusHours.isExpired, false);
  assert.equal(statusHours.remainingText, "剩 10 小时");

  // 2 days later
  const twoDaysLater = "2026-09-10T12:00:00Z";
  const statusTwoDays = computeDeadlineStatus(twoDaysLater, now);
  assert.ok(statusTwoDays);
  assert.equal(statusTwoDays.isUrgent, true);
  assert.equal(statusTwoDays.isExpired, false);
  assert.equal(statusTwoDays.remainingText, "剩 2 天");

  // 3 days later exactly
  const threeDaysLater = "2026-09-11T12:00:00Z";
  const statusThreeDays = computeDeadlineStatus(threeDaysLater, now);
  assert.ok(statusThreeDays);
  assert.equal(statusThreeDays.isUrgent, true);
  assert.equal(statusThreeDays.isExpired, false);
  assert.equal(statusThreeDays.remainingText, "剩 3 天");
});

test("computeDeadlineStatus does not trigger urgent warning beyond 3 days", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  const fiveDaysLater = "2026-09-13T12:00:00Z";
  const status = computeDeadlineStatus(fiveDaysLater, now);

  assert.ok(status);
  assert.equal(status.isUrgent, false);
  assert.equal(status.isExpired, false);
  assert.equal(status.remainingText, "剩 5 天");
});
