import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { cp, mkdir } from "node:fs/promises";

const PDFJS_ASSET_DIRECTORIES = ["cmaps", "standard_fonts", "wasm", "iccs"] as const;

function copyPdfJsAssets(): Plugin {
  return {
    name: "offerflow-copy-pdfjs-assets",
    apply: "build",
    async closeBundle() {
      const sourceRoot = resolve(__dirname, "node_modules/pdfjs-dist");
      const targetRoot = resolve(__dirname, "dist/pdfjs");
      await mkdir(targetRoot, { recursive: true });
      await Promise.all(PDFJS_ASSET_DIRECTORIES.map((directory) =>
        cp(resolve(sourceRoot, directory), resolve(targetRoot, directory), { recursive: true })
      ));
    }
  };
}

export default defineConfig({
  plugins: [react(), copyPdfJsAssets()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src")
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        resume: resolve(__dirname, "resume.html"),
        tailor: resolve(__dirname, "tailor.html"),
        dashboard: resolve(__dirname, "dashboard.html"),
        sidepanel: resolve(__dirname, "sidepanel.html"),
        background: resolve(__dirname, "src/entries/background/index.ts")
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
