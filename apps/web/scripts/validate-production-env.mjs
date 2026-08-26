const value = process.env.VITE_API_BASE_URL;
if (!value) throw new Error("VITE_API_BASE_URL is required for a production Web build");
const url = new URL(value);
if (url.protocol !== "https:") throw new Error("VITE_API_BASE_URL must use HTTPS");
if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
  throw new Error("VITE_API_BASE_URL must not point to localhost");
}
console.log("Production Web API endpoint is valid.");
