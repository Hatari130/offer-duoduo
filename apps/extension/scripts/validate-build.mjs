import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const extensionDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const distDirectory = join(extensionDirectory, "dist");
const manifestPath = join(distDirectory, "manifest.json");

if (!existsSync(manifestPath)) {
  throw new Error("Extension build is missing dist/manifest.json");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.manifest_version !== 3) {
  throw new Error(`Expected Manifest V3, received ${manifest.manifest_version}`);
}

const requiredFiles = new Set([
  "manifest.json",
  "dashboard.html",
  "resume.html",
  manifest.side_panel?.default_path,
  manifest.background?.service_worker
]);

for (const contentScript of manifest.content_scripts ?? []) {
  for (const script of contentScript.js ?? []) requiredFiles.add(script);
}

for (const resourceGroup of manifest.web_accessible_resources ?? []) {
  for (const resource of resourceGroup.resources ?? []) {
    if (!resource.includes("*")) requiredFiles.add(resource);
  }
}

for (const relativePath of requiredFiles) {
  if (!relativePath || !existsSync(join(distDirectory, relativePath))) {
    throw new Error(`Extension build is missing required file: ${relativePath}`);
  }
}

for (const htmlFile of ["dashboard.html", "sidepanel.html", "resume.html"]) {
  const html = readFileSync(join(distDirectory, htmlFile), "utf8");
  const assetReferences = html.matchAll(/(?:src|href)="\/([^"#?]+)/g);
  for (const match of assetReferences) {
    if (!existsSync(join(distDirectory, match[1]))) {
      throw new Error(`${htmlFile} references a missing asset: ${match[1]}`);
    }
  }
}

console.log(`Extension artifact validation passed (${requiredFiles.size} required files).`);
