import { createReadStream, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = resolve(process.argv[2] || process.env.OFFERFLOW_PDF_FIXTURES || "D:\\2026\\2026product\\z");
const reportRoot = resolve(process.argv[3] || join(extensionRoot, ".tmp", "pdf-fidelity"));
const pdfJsRoot = resolve(extensionRoot, "node_modules", "pdfjs-dist");
const fixtures = readdirSync(fixtureRoot)
  .filter((name) => extname(name).toLowerCase() === ".pdf")
  .sort((left, right) => left.localeCompare(right, "zh-CN"))
  .map((name) => resolve(fixtureRoot, name));

if (!fixtures.length) throw new Error(`No PDF fixtures found in ${fixtureRoot}`);
mkdirSync(reportRoot, { recursive: true });

const runtimeModules = join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules");

async function importWithRuntimeFallback(name, fallbackFile) {
  try {
    return await import(name);
  } catch {
    return import(pathToFileURL(join(runtimeModules, name, fallbackFile)).href);
  }
}

const [{ chromium }, sharpModule] = await Promise.all([
  importWithRuntimeFallback("playwright", "index.mjs"),
  importWithRuntimeFallback("sharp", join("lib", "index.js"))
]);
const sharp = sharpModule.default || sharpModule;

const browserExecutable = [
  join(process.env.ProgramFiles || "", "Google", "Chrome", "Application", "chrome.exe"),
  join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
  join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe")
].find((candidate) => candidate && existsSync(candidate));

const mimeTypes = new Map([
  [".bcmap", "application/octet-stream"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
  [".wasm", "application/wasm"],
  [".icc", "application/vnd.iccprofile"],
  [".pdf", "application/pdf"]
]);

function safeAssetPath(root, relativePath) {
  const target = resolve(root, relativePath);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return target.startsWith(prefix) ? target : "";
}

const fixturePlugin = {
  name: "offerflow-pdf-fidelity-fixtures",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
      if (pathname.startsWith("/__pdf_fixture__/")) {
        const index = Number(pathname.slice("/__pdf_fixture__/".length));
        const fixture = fixtures[index];
        if (!fixture) {
          response.statusCode = 404;
          response.end("Unknown fixture");
          return;
        }
        response.setHeader("Content-Type", "application/pdf");
        createReadStream(fixture).pipe(response);
        return;
      }
      if (pathname.startsWith("/pdfjs/")) {
        const asset = safeAssetPath(pdfJsRoot, pathname.slice("/pdfjs/".length));
        if (!asset || !existsSync(asset)) {
          response.statusCode = 404;
          response.end("Unknown PDF.js asset");
          return;
        }
        response.setHeader("Content-Type", mimeTypes.get(extname(asset).toLowerCase()) || "application/octet-stream");
        createReadStream(asset).pipe(response);
        return;
      }
      next();
    });
  }
};

const server = await createServer({
  root: extensionRoot,
  configFile: false,
  logLevel: "error",
  plugins: [fixturePlugin],
  resolve: { alias: { "@": resolve(extensionRoot, "src") } },
  server: { host: "127.0.0.1", port: 0, strictPort: false }
});

let browser;
try {
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error("Vite did not expose a local URL");
  browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
  const context = await browser.newContext({ viewport: { width: 2100, height: 1800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const reports = [];

  for (let index = 0; index < fixtures.length; index += 1) {
    const sourceName = basename(fixtures[index]);
    const safeName = `fixture-${index + 1}`;
    const consoleErrors = [];
    const onConsole = (message) => {
      if (process.env.OFFERFLOW_PDF_DEBUG === "1") console.log(message.text());
      if (message.type() === "error") consoleErrors.push(message.text());
    };
    page.on("console", onConsole);
    await page.goto(`${baseUrl}tests/pdf-fidelity-harness.html?fixture=${index}`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForFunction(() => window.__PDF_FIDELITY_RESULT__?.ready === true, undefined, { timeout: 120000 });
    const metrics = await page.evaluate(() => window.__PDF_FIDELITY_RESULT__);
    const referencePath = join(reportRoot, `${safeName}-reference.png`);
    const outputPath = join(reportRoot, `${safeName}-output.png`);
    const differencePath = join(reportRoot, `${safeName}-difference.png`);
    const htmlPath = join(reportRoot, `${safeName}.html`);
    await page.locator("#reference").screenshot({ path: referencePath });
    const generatedHtml = await page.evaluate(() => window.__PDF_FIDELITY_HTML__ || "");
    if (!generatedHtml) throw new Error(`Missing generated HTML for ${sourceName}`);
    writeFileSync(htmlPath, generatedHtml, "utf8");
    const standalone = await context.newPage();
    await standalone.goto(pathToFileURL(htmlPath).href, { waitUntil: "load", timeout: 120000 });
    await standalone.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.complete ? Promise.resolve() : image.decode()));
    });
    await standalone.locator(".source-page").first().screenshot({ path: outputPath });
    await standalone.close();

    const reference = await sharp(referencePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const output = await sharp(outputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const widthMatches = reference.info.width === output.info.width;
    const heightMatches = reference.info.height === output.info.height;
    let mismatchRatio = 1;
    let meanAbsoluteError = 255;
    if (widthMatches && heightMatches) {
      let mismatchCount = 0;
      let absoluteError = 0;
      const difference = Buffer.alloc(reference.data.length);
      const pixelCount = reference.info.width * reference.info.height;
      for (let offset = 0; offset < reference.data.length; offset += 4) {
        const red = Math.abs(reference.data[offset] - output.data[offset]);
        const green = Math.abs(reference.data[offset + 1] - output.data[offset + 1]);
        const blue = Math.abs(reference.data[offset + 2] - output.data[offset + 2]);
        const maximum = Math.max(red, green, blue);
        if (maximum > 24) mismatchCount += 1;
        absoluteError += red + green + blue;
        difference[offset] = maximum;
        difference[offset + 1] = maximum > 24 ? 0 : maximum;
        difference[offset + 2] = maximum > 24 ? 0 : maximum;
        difference[offset + 3] = 255;
      }
      mismatchRatio = mismatchCount / pixelCount;
      meanAbsoluteError = absoluteError / (pixelCount * 3);
      await sharp(difference, { raw: { width: reference.info.width, height: reference.info.height, channels: 4 } }).png().toFile(differencePath);
    }

    const checks = {
      pageSize: widthMatches && heightMatches,
      completeText: (metrics?.characterCount || 0) >= 400,
      embeddedFonts: (metrics?.fontCount || 0) > 0,
      boldText: (metrics?.boldItemCount || 0) > 0,
      vectorShapes: (metrics?.vectorShapeCount || 0) > 0,
      visualMismatch: mismatchRatio <= 0.01,
      visualMeanError: meanAbsoluteError <= 1,
      browserConsole: consoleErrors.length === 0
    };
    const passed = Object.values(checks).every(Boolean);
    reports.push({
      sourceName,
      passed,
      checks,
      metrics,
      visual: {
        referenceSize: [reference.info.width, reference.info.height],
        outputSize: [output.info.width, output.info.height],
        mismatchRatio,
        meanAbsoluteError
      },
      consoleErrors,
      artifacts: { htmlPath, referencePath, outputPath, differencePath: existsSync(differencePath) ? differencePath : "" }
    });
    page.off("console", onConsole);
    console.log(`${passed ? "PASS" : "FAIL"} ${sourceName} | mismatch ${(mismatchRatio * 100).toFixed(3)}% | MAE ${meanAbsoluteError.toFixed(3)} | ${metrics?.characterCount || 0} chars | ${metrics?.fontCount || 0} fonts | ${metrics?.vectorShapeCount || 0} vectors`);
  }

  const suiteChecks = {
    allFixturesPassed: reports.every((item) => item.passed),
    symbolCoverage: reports.some((item) => (item.metrics?.symbolItemCount || 0) + (item.metrics?.symbolFontCount || 0) > 0)
  };
  const report = {
    generatedAt: new Date().toISOString(),
    fixtureRoot,
    thresholds: { mismatchRatio: 0.01, meanAbsoluteError: 1, minimumCharacters: 400 },
    passed: Object.values(suiteChecks).every(Boolean),
    suiteChecks,
    reports
  };
  writeFileSync(join(reportRoot, "report.json"), JSON.stringify(report, null, 2), "utf8");
  if (!report.passed) process.exitCode = 1;
  await context.close();
} finally {
  await browser?.close();
  await server.close();
}
