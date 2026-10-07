import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { cp, mkdir } from "node:fs/promises";
import { WEB_SECURITY_HEADERS, webSecurityPlugin } from "../../deploy/web-security.mjs";

const require = createRequire(resolve(process.cwd(), "package.json"));

function copyPdfJsCMaps(): Plugin {
  // Chinese PDFs that use predefined CMaps need these files at /pdfjs/cmaps/.
  let outDir = resolve(__dirname, "dist");
  return {
    name: "offerflow-web-copy-pdfjs-cmaps",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const pdfJsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
      await mkdir(resolve(outDir, "pdfjs"), { recursive: true });
      await cp(resolve(pdfJsRoot, "cmaps"), resolve(outDir, "pdfjs/cmaps"), { recursive: true });
    }
  };
}

export default defineConfig({
  plugins: [react(), copyPdfJsCMaps(), webSecurityPlugin()],
  preview: { headers: WEB_SECURITY_HEADERS },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
