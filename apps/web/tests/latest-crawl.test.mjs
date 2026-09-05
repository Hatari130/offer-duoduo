import assert from "node:assert/strict";
import test from "node:test";
import { crawlDateKey, latestCrawlDateKey } from "../src/features/opportunities/latestCrawl.ts";

test("normalizes crawler timestamps to a calendar date", () => {
  assert.equal(crawlDateKey("2026-09-05T20:22:11+08:00"), "2026-09-05");
  assert.equal(crawlDateKey("2026/9/5"), "2026-09-05");
});

test("finds the latest crawler date independently of openAt", () => {
  const opportunities = [{ updatedAt: "2026-09-04", openAt: "2026-09-10" }, {
    updatedAt: "2026-09-05",
    openAt: "2026-09-02"
  }];

  assert.equal(latestCrawlDateKey(opportunities), "2026-09-05");
});
