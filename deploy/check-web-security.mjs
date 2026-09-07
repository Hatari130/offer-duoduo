import { inspectWebSecurityHeaders } from "./web-security.mjs";

const argument = process.argv[2];
if (!argument) throw new Error("Usage: node deploy/check-web-security.mjs https://your-site/app/resumes");
const url = new URL(argument);
if (url.username || url.password || url.search || url.hash) throw new Error("Use a public URL without credentials, query parameters or fragments");
if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))) {
  throw new Error("HTTPS is required except for a local loopback test server");
}
const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) });
const issues = inspectWebSecurityHeaders(response.headers, { https: url.protocol === "https:" });
if (response.status !== 200) issues.push(`HTTP ${response.status} (expected HTML 200 without redirect)`);
if (!response.headers.get("content-type")?.includes("text/html")) issues.push("Content-Type text/html");
await response.body?.cancel();
if (issues.length) {
  console.error(`Web security verification failed: ${issues.join(", ")}`);
  process.exitCode = 1;
} else console.log("Web security response headers verified");
