import assert from "node:assert/strict";
import test from "node:test";
import { resolveColorTheme } from "../src/app/theme.ts";

test("saved appearance overrides the system preference", () => {
  assert.equal(resolveColorTheme("light", true), "light");
  assert.equal(resolveColorTheme("dark", false), "dark");
});

test("first visit follows the system appearance", () => {
  assert.equal(resolveColorTheme(null, true), "dark");
  assert.equal(resolveColorTheme(null, false), "light");
  assert.equal(resolveColorTheme("unsupported", true), "dark");
});
