import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const serverDirectory = resolve(root, "dist", "server");
await mkdir(serverDirectory, { recursive: true });
await copyFile(
  resolve(root, "site-worker.js"),
  resolve(serverDirectory, "index.js")
);
