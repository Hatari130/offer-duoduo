import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { WEB_SECURITY_HEADERS, webSecurityPlugin } from "../../deploy/web-security.mjs";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/admin/" : "/",
  plugins: [react(), webSecurityPlugin()],
  preview: { headers: WEB_SECURITY_HEADERS },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
}));
