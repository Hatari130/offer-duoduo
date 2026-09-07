export const WEB_CONTENT_SECURITY_POLICY: string;
export const CAMPUS_HIRING_FEED_ORIGIN: string;
export const COMPANY_LOGO_ORIGIN: string;
export const WEB_SECURITY_HEADERS: Record<string, string>;
export function webSecurityPlugin(): {
  name: string;
  apply: "build";
  transformIndexHtml(): Array<{
    tag: string;
    attrs: Record<string, string>;
    injectTo: "head-prepend";
  }>;
};
export function inspectWebSecurityHeaders(headers: Headers, options?: { https?: boolean }): string[];
