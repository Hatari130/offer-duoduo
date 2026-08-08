import assert from "node:assert/strict";
import test from "node:test";
import { buildApplicationOutbox } from "../src/infrastructure/sync/syncState.ts";

function application(overrides = {}) {
  return {
    id: "application-1",
    company: "远航智能",
    position: "产品实习生",
    stage: "applied",
    sourceUrl: "https://jobs.example.com/1",
    sourceHost: "jobs.example.com",
    responsibilities: [],
    requirements: [],
    events: [],
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
    ...overrides
  };
}

test("offline edits coalesce into one idempotent change", () => {
  const first = buildApplicationOutbox([], [application()], [], { revisions: {} }, () => "change-1");
  assert.equal(first.length, 1);
  assert.equal(first[0].baseRevision, 0);

  const second = buildApplicationOutbox(
    [application()],
    [application({ stage: "interview", updatedAt: "2026-08-08T01:00:00.000Z" })],
    first,
    { revisions: {} },
    () => "should-not-be-used"
  );
  assert.equal(second.length, 1);
  assert.equal(second[0].changeId, "change-1");
  assert.equal(second[0].baseRevision, 0);
  assert.equal(second[0].application.stage, "interview");
});

test("a locally created record removed before upload disappears from the outbox", () => {
  const created = buildApplicationOutbox([], [application()], [], { revisions: {} }, () => "change-1");
  const removed = buildApplicationOutbox([application()], [], created, { revisions: {} });
  assert.deepEqual(removed, []);
});

test("deleting a synced record carries its last cloud revision", () => {
  const removed = buildApplicationOutbox(
    [application()],
    [],
    [],
    { revisions: { "application-1": 4 } },
    () => "delete-1"
  );
  assert.equal(removed.length, 1);
  assert.equal(removed[0].changeId, "delete-1");
  assert.equal(removed[0].baseRevision, 4);
  assert.equal(typeof removed[0].deletedAt, "string");
});
