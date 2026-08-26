import assert from "node:assert/strict";
import test from "node:test";
import { createUuid } from "../src/app/id.ts";

test("uses native randomUUID when the browser exposes it", () => {
  const expected = "11111111-2222-4333-8444-555555555555";
  assert.equal(createUuid({
    randomUUID: () => expected,
    getRandomValues: () => {
      throw new Error("fallback should not run");
    }
  }), expected);
});

test("creates an RFC 4122 v4 UUID when randomUUID is unavailable on HTTP", () => {
  const uuid = createUuid({
    getRandomValues: (values) => {
      for (let index = 0; index < values.length; index += 1) values[index] = index;
      return values;
    }
  });

  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(uuid, "00010203-0405-4607-8809-0a0b0c0d0e0f");
});
