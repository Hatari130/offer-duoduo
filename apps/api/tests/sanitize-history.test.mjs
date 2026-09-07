import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeHistory } from "../scripts/sanitize-resume-history.ts";

function fakeClient(fail = false) {
  const calls = [];
  let fetched = false;
  return { calls, async query(sql, values) {
    calls.push({ sql, values });
    if (sql.startsWith("FETCH") && !fetched) {
      fetched = true;
      return { rows: [{ id: "template", user_id: "account", payload: { id: "template", name: "old", profile: { identityNumber: "private" }, createdAt: "2026-01-01", updatedAt: "2026-01-01", deletedAt: "2026-01-02" } }] };
    }
    if (fail && sql.startsWith("UPDATE")) throw new Error("synthetic DB failure");
    return { rows: [] };
  } };
}
test("history sanitizer defaults to read-only and reports counts without payloads", async () => {
  const client = fakeClient();
  const result = await sanitizeHistory(client);
  assert.deepEqual(result.resume_templates, { scanned: 1, changed: 1 });
  assert.equal(client.calls[0].sql, "BEGIN READ ONLY");
  assert.equal(client.calls.at(-1).sql, "ROLLBACK");
  assert.ok(!client.calls.some(call => call.sql.startsWith("UPDATE")));
});
test("history sanitizer locks rows, scopes writes, and commits empty tombstones", async () => {
  const client = fakeClient();
  await sanitizeHistory(client, true);
  assert.ok(client.calls.some(call => call.sql.includes("FOR UPDATE")));
  const update = client.calls.find(call => call.sql.startsWith("UPDATE"));
  assert.match(update.sql, /WHERE id=\$1 AND user_id=\$2/);
  assert.ok(!update.values[2].includes("private"));
  assert.equal(JSON.parse(update.values[2]).name, "");
  assert.equal(client.calls.at(-1).sql, "COMMIT");
});
test("history sanitizer rolls back a failed write", async () => {
  const client = fakeClient(true);
  await assert.rejects(sanitizeHistory(client, true), /synthetic/);
  assert.equal(client.calls.at(-1).sql, "ROLLBACK");
  assert.ok(!client.calls.some(call => call.sql === "COMMIT"));
});
