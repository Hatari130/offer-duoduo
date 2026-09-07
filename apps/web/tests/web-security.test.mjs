import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CAMPUS_HIRING_FEED_ORIGIN, COMPANY_LOGO_ORIGIN, WEB_SECURITY_HEADERS, WEB_CONTENT_SECURITY_POLICY, inspectWebSecurityHeaders, webSecurityPlugin } from "../../../deploy/web-security.mjs";
import { DEFAULT_CAMPUS_HIRING_FEED_URL } from "../../../packages/domain/src/campus-hiring.ts";

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

test("CSP permits the configured public campus-hiring feed and no broader GitHub origin", () => {
  const feed = new URL(DEFAULT_CAMPUS_HIRING_FEED_URL);
  assert.equal(CAMPUS_HIRING_FEED_ORIGIN, feed.origin);
  assert.match(WEB_CONTENT_SECURITY_POLICY, new RegExp(`connect-src 'self' ${feed.origin.replaceAll(".", "\\.")}(?:;| )`));
  assert.equal(WEB_CONTENT_SECURITY_POLICY.includes("https://*.github.io"), false);
});

test("CSP permits only the company logo origin used by the directory", () => {
  assert.equal(COMPANY_LOGO_ORIGIN, "https://logos.hunter.io");
  assert.match(WEB_CONTENT_SECURITY_POLICY, /img-src 'self' data: blob: https:\/\/logos\.hunter\.io(?:;| )/);
  assert.equal(WEB_CONTENT_SECURITY_POLICY.includes("img-src *"), false);
});
