import assert from "node:assert/strict";
import test from "node:test";
import { MemoryStore } from "../src/store/memory-store.ts";

function application(overrides = {}) {
  return {
    id: "application-1",
    company: "星河科技",
    position: "产品经理",
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

test("sync is idempotent and reports stale revisions without overwriting", () => {
  const store = new MemoryStore({ persistence: false });
  const userId = store.getDemoUser().id;

  const first = store.syncApplications(userId, {
    deviceId: "device-a",
    cursor: "0",
    changes: [{ changeId: "create-a", baseRevision: 0, application: application() }]
  });
  assert.deepEqual(first.acceptedChangeIds, ["create-a"]);
  assert.equal(first.changes[0].revision, 1);

  const duplicate = store.syncApplications(userId, {
    deviceId: "device-a",
    cursor: first.cursor,
    changes: [{ changeId: "create-a", baseRevision: 0, application: application() }]
  });
  assert.deepEqual(duplicate.acceptedChangeIds, ["create-a"]);
  assert.equal(duplicate.conflicts.length, 0);

  const second = store.syncApplications(userId, {
    deviceId: "device-b",
    cursor: first.cursor,
    changes: [{
      changeId: "update-b",
      baseRevision: 1,
      application: application({ stage: "interview", updatedAt: "2026-08-08T01:00:00.000Z" })
    }]
  });
  assert.equal(second.changes[0].revision, 2);

  const stale = store.syncApplications(userId, {
    deviceId: "device-a",
    cursor: first.cursor,
    changes: [{
      changeId: "stale-a",
      baseRevision: 1,
      application: application({ stage: "assessment", updatedAt: "2026-08-08T02:00:00.000Z" })
    }]
  });
  assert.equal(stale.acceptedChangeIds.length, 0);
  assert.equal(stale.conflicts[0].code, "revision_conflict");
  assert.equal(stale.conflicts[0].server.revision, 2);
  assert.equal(store.getApplication(userId, "application-1").application.stage, "interview");
});

test("a stale client cannot resurrect a server tombstone", () => {
  const store = new MemoryStore({ persistence: false });
  const userId = store.getDemoUser().id;
  const created = store.syncApplications(userId, {
    deviceId: "device-a",
    changes: [{ changeId: "create", baseRevision: 0, application: application() }]
  });
  const removed = store.syncApplications(userId, {
    deviceId: "device-a",
    cursor: created.cursor,
    changes: [{
      changeId: "delete",
      baseRevision: 1,
      application: application(),
      deletedAt: "2026-08-08T03:00:00.000Z"
    }]
  });
  assert.equal(removed.changes[0].deletedAt, "2026-08-08T03:00:00.000Z");

  const resurrect = store.syncApplications(userId, {
    deviceId: "device-b",
    cursor: created.cursor,
    changes: [{ changeId: "resurrect", baseRevision: 1, application: application() }]
  });
  assert.equal(resurrect.conflicts[0].code, "deleted_on_server");
  assert.equal(store.getApplication(userId, "application-1"), undefined);
});
