import assert from "node:assert/strict";
import test from "node:test";
import { prepareAutofillPersistence, profileStorageWarning } from "../src/features/profile/autofillPersistence.ts";

test("unchanged drafts do not rewrite the resume library", async () => {
  let writes = 0;
  assert.equal(await prepareAutofillPersistence(false, async () => { writes++; }), undefined);
  assert.equal(writes, 0);
});

test("a full browser disk returns a warning and allows the caller to continue autofill", async () => {
  const events: string[] = [];
  const warning = await prepareAutofillPersistence(true, async () => {
    events.push("save");
    throw new Error("IO error: .../000448.ldb: FILE_ERROR_NO_SPACE (ChromeMethodBFE: 3::WritableFileAppend::8)");
  });
  events.push("scan-and-fill");
  assert.deepEqual(events, ["save", "scan-and-fill"]);
  assert.match(warning!, /磁盘/);
  assert.match(warning!, /未完整保存/);
});

test("quota errors have a distinct recovery instruction", async () => {
  for (const error of [new DOMException("Storage full", "QuotaExceededError"), { message: "QUOTA_BYTES quota exceeded" }]) {
    const warning = await prepareAutofillPersistence(true, async () => { throw error; });
    assert.match(warning!, /存储额度/);
  }
});

test("a successful retry clears the storage warning", async () => {
  let writes = 0;
  assert.equal(await prepareAutofillPersistence(true, async () => { writes++; }), undefined);
  assert.equal(writes, 1);
});

test("unrelated failures are not disguised as low disk space or silently ignored", async () => {
  const error = new Error("Extension context invalidated");
  assert.equal(profileStorageWarning(error), undefined);
  await assert.rejects(prepareAutofillPersistence(true, async () => { throw error; }), (actual) => actual === error);
});
