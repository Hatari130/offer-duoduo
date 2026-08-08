import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MemoryStore } from "../src/store/memory-store.ts";

function sampleChange(overrides = {}) {
  return {
    changeId: "extension:persistence:1",
    baseRevision: 0,
    application: {
      id: "persisted-application",
      company: "远航智能",
      position: "产品实习生",
      stage: "applied",
      externalStage: "简历初筛",
      appliedAt: "2026-08-08 19:03",
      sourceUrl: "https://jobs.example.com/persisted",
      sourceHost: "jobs.example.com",
      responsibilities: ["用户研究"],
      requirements: ["结构化分析"],
      events: [],
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
      ...overrides
    }
  };
}

test("MemoryStore survives a simulated restart through its data file", () => {
  const directory = mkdtempSync(join(tmpdir(), "offerflow-store-"));
  const dataFile = join(directory, "state.json");
  try {
    const first = new MemoryStore({ dataFile });
    const user = first.createUser("candidate@example.com", "测试用户", "strong-pass-2026");

    const uploaded = first.syncApplications(user.id, {
      deviceId: "device-1",
      cursor: "0",
      changes: [sampleChange()]
    });
    assert.equal(uploaded.acceptedChangeIds.length, 1);

    // A new store over the same file behaves like the API after a restart:
    // users, applications, revisions and the sync cursor all come back.
    const restarted = new MemoryStore({ dataFile });
    assert.equal(
      restarted.authenticate("candidate@example.com", "strong-pass-2026")?.displayName,
      "测试用户"
    );

    const restored = restarted.listApplications(user.id);
    assert.equal(restored.length, 1);
    assert.equal(restored[0].application.company, "远航智能");
    assert.equal(restored[0].application.externalStage, "简历初筛");
    assert.equal(restored[0].application.appliedAt, "2026-08-08 19:03");
    assert.equal(restored[0].revision, 1);

    const pull = restarted.syncApplications(user.id, {
      deviceId: "device-1",
      cursor: uploaded.cursor,
      changes: []
    });
    assert.equal(pull.changes.length, 0);
    assert.equal(Number(pull.cursor) >= Number(uploaded.cursor), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("persistence can be disabled for in-memory usage", () => {
  const directory = mkdtempSync(join(tmpdir(), "offerflow-store-"));
  try {
    const store = new MemoryStore({ persistence: false, dataFile: join(directory, "unused.json") });
    const user = store.getDemoUser();
    store.syncApplications(user.id, {
      deviceId: "device-1",
      cursor: "0",
      changes: [sampleChange({ changeId: "extension:memory:1", application: { ...sampleChange().application, id: "memory-only" } })]
    });
    const fresh = new MemoryStore({ persistence: false, dataFile: join(directory, "unused.json") });
    assert.equal(fresh.listApplications(user.id).length, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
