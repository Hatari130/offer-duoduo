import assert from "node:assert/strict";
import test from "node:test";
import { isLikelyTruncatedJson, parseDeepSeekJson, stripDeepSeekCodeFence } from "../src/features/tailor/deepseekJson.ts";

test("parses a fenced DeepSeek JSON object", () => {
  const result = parseDeepSeekJson<{ ok: boolean }>('```json\n{"ok":true}\n```');
  assert.deepEqual(result.value, { ok: true });
  assert.equal(result.likelyTruncated, false);
});

test("recognizes a JSON response truncated inside a string", () => {
  const result = parseDeepSeekJson('{"resume":{"summary":"未结束的长文本');
  assert.equal(result.value, undefined);
  assert.equal(result.likelyTruncated, true);
});

test("does not silently repair malformed complete JSON", () => {
  const result = parseDeepSeekJson('{"resume":,}');
  assert.equal(result.value, undefined);
  assert.equal(result.likelyTruncated, false);
});

test("tolerates an accidental prose prefix", () => {
  assert.equal(stripDeepSeekCodeFence('结果如下：\n{"ok":true}'), '{"ok":true}');
});

test("uses the parse error as a truncation signal", () => {
  assert.equal(isLikelyTruncatedJson('{"a":"x', new SyntaxError("Unterminated string in JSON at position 7")), true);
});
