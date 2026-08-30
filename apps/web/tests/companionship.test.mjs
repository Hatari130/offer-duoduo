import assert from "node:assert/strict";
import test from "node:test";
import { companionshipDayCount, companionshipLabel } from "../src/app/companionship.ts";

test("registration day is the first companionship day", () => {
  const registeredAt = "2026-08-30T01:00:00.000Z";
  const laterThatDay = Date.parse("2026-08-30T15:59:59.000Z");

  assert.equal(companionshipDayCount(registeredAt, laterThatDay), 1);
  assert.equal(companionshipLabel(registeredAt, laterThatDay), "已陪伴 1 天");
});

test("companionship days advance at midnight in China", () => {
  const registeredAt = "2026-08-30T15:59:59.000Z";
  const nextChinaDay = Date.parse("2026-08-30T16:00:00.000Z");

  assert.equal(companionshipDayCount(registeredAt, nextChinaDay), 2);
  assert.equal(companionshipDayCount("not-a-date", nextChinaDay), 1);
});
