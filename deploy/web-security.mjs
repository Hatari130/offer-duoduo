/** Shared by build-time HTML, local preview, Nginx verification and tests. */
export const CAMPUS_HIRING_FEED_ORIGIN = "https://shouna12358-png.github.io";
export const WEB_CONTENT_SECURITY_POLICY = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ${CAMPUS_HIRING_FEED_ORIGIN}; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;

export const WEB_SECURITY_HEADERS = {
  "Content-Security-Policy": WEB_CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
};

/** CSP meta is a fallback for a misconfigured static host, not a substitute
 * for response headers: frame-ancestors/HSTS must still be set by the server. */
export function webSecurityPlugin() {
  return {
    name: "jobkoi-web-security",
    apply: "build",
    transformIndexHtml() {
      return [{
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: WEB_CONTENT_SECURITY_POLICY.replace("; frame-ancestors 'none'", "") },
        injectTo: "head-prepend"
      }, { tag: "meta", attrs: { name: "referrer", content: "no-referrer" }, injectTo: "head-prepend" }];
    }
  };
}

export function inspectWebSecurityHeaders(headers, { https = true } = {}) {
  const issues = [];
  const csp = headers.get("content-security-policy") || "";
  if (!/(?:^|;)\s*frame-ancestors\s+'none'(?:\s*;|\s*$)/i.test(csp)) issues.push("CSP frame-ancestors 'none'");
  if (!/(?:^|;)\s*script-src\s+'self'(?:\s*;|\s*$)/i.test(csp)) issues.push("CSP script-src 'self'");
  if (!/(?:^|;)\s*object-src\s+'none'(?:\s*;|\s*$)/i.test(csp)) issues.push("CSP object-src 'none'");
  if (headers.get("x-content-type-options")?.toLowerCase() !== "nosniff") issues.push("X-Content-Type-Options");
  if (headers.get("x-frame-options")?.toUpperCase() !== "DENY") issues.push("X-Frame-Options");
  if (headers.get("referrer-policy")?.toLowerCase() !== "no-referrer") issues.push("Referrer-Policy");
  if (https && !/max-age=([1-9]\d{6,})/i.test(headers.get("strict-transport-security") || "")) issues.push("Strict-Transport-Security");
  return issues;
}
