import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const extensionDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const distDirectory = join(extensionDirectory, "dist");
const manifestPath = join(distDirectory, "manifest.json");
const requiredPdfJsAssets = [
  "pdfjs/cmaps/Adobe-GB1-UCS2.bcmap",
  "pdfjs/standard_fonts/LiberationSans-Regular.ttf",
  "pdfjs/wasm/openjpeg.wasm",
  "pdfjs/iccs/CGATS001Compat-v2-micro.icc"
];

if (!existsSync(manifestPath)) {
  throw new Error("Extension build is missing dist/manifest.json");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.manifest_version !== 3) {
  throw new Error(`Expected Manifest V3, received ${manifest.manifest_version}`);
}

const requiredFiles = new Set([
  "manifest.json",
  "resume.html",
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

for (const relativePath of requiredPdfJsAssets) {
  if (!existsSync(join(distDirectory, relativePath))) {
    throw new Error(`Extension build is missing required PDF.js asset: ${relativePath}`);
  }
}

for (const contentScript of manifest.content_scripts ?? []) {
  for (const script of contentScript.js ?? []) {
    const source = readFileSync(join(distDirectory, script), "utf8");
    try {
      // Content scripts are classic scripts, so parsing them as a function body
      // catches malformed merges before Chrome silently rejects the extension.
      new Function(source);
    } catch (error) {
      throw new Error(
        `Extension content script has invalid JavaScript: ${script}\n${error instanceof Error ? error.message : error}`
      );
    }
  }
}

for (const htmlFile of ["dashboard.html", "sidepanel.html", "resume.html", "tailor.html"]) {
  const html = readFileSync(join(distDirectory, htmlFile), "utf8");
  const assetReferences = html.matchAll(/(?:src|href)="\/([^"#?]+)/g);
  for (const match of assetReferences) {
    if (!existsSync(join(distDirectory, match[1]))) {
      throw new Error(`${htmlFile} references a missing asset: ${match[1]}`);
    }
  }
}

if (process.argv.includes("--production")) {
  const forbidden = ["http://127.0.0.1", "http://localhost", "chrome-extension://*"];
  const walk = (directory, prefix = "") => readdirSync(directory).flatMap((name) => {
    const absolute = join(directory, name);
    const relative = join(prefix, name);
    return statSync(absolute).isDirectory() ? walk(absolute, relative) : [relative];
  });
  for (const relativePath of walk(distDirectory).filter((file) => /\.m?js$/.test(file))) {
    const source = readFileSync(join(distDirectory, relativePath), "utf8");
    for (const value of forbidden) {
      if (source.includes(value)) throw new Error(`Production extension contains forbidden endpoint ${value} in ${relativePath}`);
    }
  }
}

console.log(`Extension artifact validation passed (${requiredFiles.size} required files).`);
