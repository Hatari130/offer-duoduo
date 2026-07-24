import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const distDirectory = resolve(root, "dist");
const serverDirectory = resolve(distDirectory, "server");
const templatePath = resolve(root, "site-worker.js");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp"
};

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else {
      files.push(path);
    }
  }

  return files;
}

const assetFiles = await collectFiles(resolve(distDirectory, "assets"));
const websiteFiles = [
  resolve(distDirectory, "index.html"),
  resolve(distDirectory, "dashboard.html"),
  resolve(distDirectory, "opportunities.json"),
  resolve(distDirectory, "og-v2.png"),
  ...assetFiles
];

const embeddedFiles = {};
for (const path of websiteFiles) {
  const publicPath = `/${relative(distDirectory, path).split(sep).join("/")}`;
  const bytes = await readFile(path);
  embeddedFiles[publicPath] = {
    contentType:
      contentTypes[extname(path).toLowerCase()] ?? "application/octet-stream",
    body: bytes.toString("base64")
  };
}

const template = await readFile(templatePath, "utf8");
const workerSource = template.replace(
  "__OFFERFLOW_EMBEDDED_FILES__",
  JSON.stringify(embeddedFiles)
);

await mkdir(serverDirectory, { recursive: true });
await writeFile(resolve(serverDirectory, "index.js"), workerSource);
