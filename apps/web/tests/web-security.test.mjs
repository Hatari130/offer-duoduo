import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { WEB_SECURITY_HEADERS, WEB_CONTENT_SECURITY_POLICY, inspectWebSecurityHeaders, webSecurityPlugin } from "../../../deploy/web-security.mjs";

test("Nginx and preview use the same complete HTML security headers", async () => {
  const nginx = await readFile(new URL("../../../deploy/nginx-security-headers.conf", import.meta.url), "utf8");
  for (const [key, value] of Object.entries(WEB_SECURITY_HEADERS)) assert.ok(nginx.includes(`add_header ${key} "${value}" always;`), key);
  assert.deepEqual(inspectWebSecurityHeaders(new Headers(WEB_SECURITY_HEADERS)), []);
  assert.ok(inspectWebSecurityHeaders(new Headers()).includes("CSP frame-ancestors 'none'"));
  assert.ok(inspectWebSecurityHeaders(new Headers()).includes("Strict-Transport-Security"));
});

test("built HTML gets a CSP fallback without unsupported frame-ancestors meta", () => {
  const tags = webSecurityPlugin().transformIndexHtml();
  const meta = tags.find(tag => tag.attrs["http-equiv"] === "Content-Security-Policy");
  assert.equal(meta.injectTo, "head-prepend");
  assert.match(meta.attrs.content, /script-src 'self'/);
  assert.equal(meta.attrs.content.includes("frame-ancestors"), false);
  assert.match(WEB_CONTENT_SECURITY_POLICY, /frame-ancestors 'none'/);
  assert.match(WEB_CONTENT_SECURITY_POLICY, /worker-src 'self' blob:/);
});
