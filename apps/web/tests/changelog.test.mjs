import assert from "node:assert/strict";
import test from "node:test";
import {
  CHANGELOG_RELEASES,
  LATEST_CHANGELOG_VERSION,
  CHANGELOG_STORAGE_KEY,
  hasSeenLatestChangelog,
  markLatestChangelogSeen
} from "../src/features/changelog/changelogData.ts";

test("latest changelog release includes written test deadline feature and warning", () => {
  const latest = CHANGELOG_RELEASES[0];
  assert.equal(latest.version, LATEST_CHANGELOG_VERSION);
  assert.equal(latest.version, "2026.09.08");

  const writtenTestItem = latest.items.find((item) =>
    item.title.includes("笔试截止") || item.desc.includes("笔试")
  );
  assert.ok(writtenTestItem, "Expected written test deadline update item to exist");
  assert.ok(writtenTestItem.desc.includes("3 天") || writtenTestItem.desc.includes("3天"));
  assert.ok(writtenTestItem.desc.includes("拖延症"));
  assert.equal(writtenTestItem.actionHref, "/app/applications");
});

test("hasSeenLatestChangelog correctly checks and updates localStorage", () => {
  const storage = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, val) => storage.set(key, String(val))
    }
  };

  // Initially not seen
  assert.equal(hasSeenLatestChangelog(), false);

  // Mark seen
  markLatestChangelogSeen();
  assert.equal(storage.get(CHANGELOG_STORAGE_KEY), LATEST_CHANGELOG_VERSION);
  assert.equal(hasSeenLatestChangelog(), true);

  // Old version stored
  storage.set(CHANGELOG_STORAGE_KEY, "2026.08.01");
  assert.equal(hasSeenLatestChangelog(), false);

  delete globalThis.window;
});
