import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { cp, mkdir } from "node:fs/promises";

const require = createRequire(resolve(process.cwd(), "package.json"));

function copyPdfJsCMaps(): Plugin {
  return {
    name: "offerflow-web-copy-pdfjs-cmaps",
    apply: "build",
    async closeBundle() {
      const pdfJsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
      await mkdir(resolve(__dirname, "dist/pdfjs"), { recursive: true });
      await cp(resolve(pdfJsRoot, "cmaps"), resolve(__dirname, "dist/pdfjs/cmaps"), {
        recursive: true
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), copyPdfJsCMaps()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
