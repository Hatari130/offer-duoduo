const required = ["VITE_OFFERFLOW_API_URL", "VITE_OFFERFLOW_WEB_URL"];
const allowInsecureHttp = process.env.VITE_OFFERFLOW_ALLOW_INSECURE_HTTP === "true";
for (const name of required) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for a production extension build`);
  const url = new URL(value);
  if (url.protocol !== "https:" && !(allowInsecureHttp && url.protocol === "http:")) {
    throw new Error(`${name} must use HTTPS`);
  }
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(`${name} must not point to localhost`);
  }
}
console.log(
  allowInsecureHttp
    ? "Extension endpoints are valid (temporary insecure HTTP override enabled)."
    : "Production extension endpoints are valid."
);
