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

async function compareScreenshots(referencePath, candidatePath, differencePath) {
  const reference = await sharp(referencePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const candidate = await sharp(candidatePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const widthMatches = reference.info.width === candidate.info.width;
  const heightMatches = reference.info.height === candidate.info.height;
  let mismatchRatio = 1;
  let meanAbsoluteError = 255;
  if (widthMatches && heightMatches) {
    let mismatchCount = 0;
    let absoluteError = 0;
    const difference = Buffer.alloc(reference.data.length);
    const pixelCount = reference.info.width * reference.info.height;
    for (let offset = 0; offset < reference.data.length; offset += 4) {
      const red = Math.abs(reference.data[offset] - candidate.data[offset]);
      const green = Math.abs(reference.data[offset + 1] - candidate.data[offset + 1]);
      const blue = Math.abs(reference.data[offset + 2] - candidate.data[offset + 2]);
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
  return {
    referenceSize: [reference.info.width, reference.info.height],
    candidateSize: [candidate.info.width, candidate.info.height],
    widthMatches,
    heightMatches,
    mismatchRatio,
    meanAbsoluteError
  };
}

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
    const editingPath = join(reportRoot, `${safeName}-editing-untouched.png`);
    const editingDifferencePath = join(reportRoot, `${safeName}-editing-difference.png`);
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
    if (process.env.OFFERFLOW_PDF_DEBUG === "1") {
      console.log("[pdf-fidelity] standalone-state", await standalone.evaluate(() => ({
        repainted: document.querySelectorAll('[data-repainted="true"]').length,
        modifiedRegions: document.querySelectorAll('.edit-region.is-modified').length,
        shifted: [...document.querySelectorAll('.source-overlay')]
          .filter((node) => Math.abs(Number.parseFloat(node.style.getPropertyValue('--flow-shift')) || 0) > .25)
          .length,
        samples: [...document.querySelectorAll('.source-overlay')].slice(0, 20).map((node) => ({
          key: node.dataset.editKey,
          top: node.dataset.baseTop,
          base: node.dataset.renderedBaseHeight,
          scroll: node.scrollHeight,
          line: getComputedStyle(node).lineHeight,
          shift: node.style.getPropertyValue('--flow-shift'),
          repaint: node.dataset.repainted
        })),
        storageKeys: Object.keys(localStorage)
      })));
    }
    await standalone.locator(".source-page").first().screenshot({ path: outputPath });
    await standalone.click("#tailor-edit-toggle");
    await standalone.locator(".source-page").first().screenshot({ path: editingPath });
    const editing = await standalone.evaluate(() => {
      const meta = (name) => Number(document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || 0);
      const regions = [...document.querySelectorAll(".edit-region")];
      let target;
      let downstream;
      for (const region of regions) {
        const regionNodes = [...region.querySelectorAll(".source-overlay")]
          .sort((left, right) => Number(left.dataset.baseTop || 0) - Number(right.dataset.baseTop || 0));
        for (let nodeIndex = 0; nodeIndex < regionNodes.length - 1; nodeIndex += 1) {
          const candidate = regionNodes[nodeIndex];
          if ((candidate.textContent || "").length < 60) continue;
          const lineHeight = Number.parseFloat(getComputedStyle(candidate).lineHeight) || 1;
          if (candidate.scrollHeight < lineHeight * 1.5) continue;
          const candidateX = Number(candidate.dataset.baseX || 0);
          const candidateWidth = Number(candidate.dataset.baseWidth || 0);
          const next = regionNodes.slice(nodeIndex + 1).find((node) => {
            const x = Number(node.dataset.baseX || 0);
            const width = Number(node.dataset.baseWidth || 0);
            const overlap = Math.max(0, Math.min(candidateX + candidateWidth, x + width) - Math.max(candidateX, x));
            return overlap / Math.max(1, Math.min(candidateWidth, width)) >= .2;
          });
          if (!next) continue;
          target = candidate;
          downstream = next;
          break;
        }
        if (target) break;
      }
      const result = {
        textItemCount: meta("source-text-item-count"),
        blockCount: meta("editable-block-count"),
        regionCount: meta("editable-region-count"),
        untouchedActiveRegionCount: regions.filter((region) => region.classList.contains("is-active") || region.classList.contains("is-modified")).length,
        activeRegionCount: 0,
        downstreamShift: 0,
        fontStable: true,
        subsetFallbackSafe: true,
        exercisedReflow: false
      };
      if (target && downstream) {
        const fontBefore = getComputedStyle(target).fontFamily;
        const targetTop = Number(target.dataset.baseTop || 0);
        const downstreamNodes = [...target.closest('.edit-region').querySelectorAll('.source-overlay')]
          .filter((node) => Number(node.dataset.baseTop || 0) > targetTop + .5);
        const downstreamBefore = new Map(downstreamNodes.map((node) => [node, node.getBoundingClientRect().top]));
        target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        target.focus();
        target.textContent = (target.textContent || "").slice(0, 24);
        target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
        result.activeRegionCount = regions.filter((region) => region.classList.contains("is-active")).length;
        result.downstreamShift = Math.min(0, ...downstreamNodes.map((node) => node.getBoundingClientRect().top - downstreamBefore.get(node)));
        result.fontStable = getComputedStyle(target).fontFamily === fontBefore;
        result.exercisedReflow = result.downstreamShift < -1;
      }
      const subsetNode = [...document.querySelectorAll('[data-font-subset="true"]')][0];
      if (subsetNode) {
        const known = new Set([...(subsetNode.dataset.sourceGlyphs || '')]);
        const unseen = [...'𠮷髙龘'].find((character) => !known.has(character));
        if (unseen) {
          subsetNode.textContent = (subsetNode.textContent || '') + unseen;
          subsetNode.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: unseen }));
          result.subsetFallbackSafe = subsetNode.classList.contains('uses-fallback-font');
        }
      }
      localStorage.clear();
      return result;
    });
    await standalone.close();

    const patchedHtml = await page.evaluate(() => window.__PDF_PATCH_REFLOW_HTML__ || "");
    const initialPatchReflow = {
      exercised: false,
      growth: 0,
      downstreamShift: 0,
      overlap: false
    };
    if (patchedHtml) {
      const patchedHtmlPath = join(reportRoot, `${safeName}-initial-patch.html`);
      writeFileSync(patchedHtmlPath, patchedHtml, "utf8");
      const patchedPage = await context.newPage();
      await patchedPage.goto(pathToFileURL(patchedHtmlPath).href, { waitUntil: "load", timeout: 120000 });
      await patchedPage.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => image.complete ? Promise.resolve() : image.decode()));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      Object.assign(initialPatchReflow, await patchedPage.evaluate(() => {
        const target = document.querySelector('.source-overlay[data-initial-override="true"]');
        if (!target) return { exercised: false, growth: 0, downstreamShift: 0, overlap: false };
        const regionNodes = [...target.closest('.edit-region').querySelectorAll('.source-overlay')]
          .sort((left, right) => Number(left.dataset.baseTop || 0) - Number(right.dataset.baseTop || 0));
        const targetTop = Number(target.dataset.baseTop || 0);
        const targetX = Number(target.dataset.baseX || 0);
        const targetWidth = Number(target.dataset.baseWidth || 0);
        const downstream = regionNodes.find((node) => {
          if (Number(node.dataset.baseTop || 0) <= targetTop + .5) return false;
          const x = Number(node.dataset.baseX || 0);
          const width = Number(node.dataset.baseWidth || 0);
          const overlap = Math.max(0, Math.min(targetX + targetWidth, x + width) - Math.max(targetX, x));
          return overlap / Math.max(1, Math.min(targetWidth, width)) >= .2;
        });
        if (!downstream) return { exercised: false, growth: 0, downstreamShift: 0, overlap: false };
        const baseline = Number(target.dataset.renderedBaseHeight || 0);
        const growth = target.scrollHeight - baseline;
        const downstreamShift = Number.parseFloat(downstream.style.getPropertyValue('--flow-shift')) || 0;
        const targetRect = target.getBoundingClientRect();
        const downstreamRect = downstream.getBoundingClientRect();
        return {
          exercised: growth > 1,
          growth,
          downstreamShift,
          overlap: targetRect.bottom > downstreamRect.top + 1
        };
      }));
      await patchedPage.close();
    }

    const visual = await compareScreenshots(referencePath, outputPath, differencePath);
    const editingVisual = await compareScreenshots(referencePath, editingPath, editingDifferencePath);

    const checks = {
      pageSize: visual.widthMatches && visual.heightMatches,
      completeText: (metrics?.characterCount || 0) >= 400,
      embeddedFonts: (metrics?.fontCount || 0) > 0,
      boldText: (metrics?.boldItemCount || 0) > 0,
      vectorShapes: (metrics?.vectorShapeCount || 0) > 0,
      visualMismatch: visual.mismatchRatio <= 0.01,
      visualMeanError: visual.meanAbsoluteError <= 1,
      untouchedEditModeMismatch: editingVisual.mismatchRatio <= 0.01,
      untouchedEditModeMeanError: editingVisual.meanAbsoluteError <= 1,
      paragraphGrouping: editing.blockCount > 0 && editing.blockCount < editing.textItemCount,
      localEditIsland: editing.untouchedActiveRegionCount === 0 && (!editing.exercisedReflow || editing.activeRegionCount === 1),
      localReflow: !editing.exercisedReflow || editing.downstreamShift < -1,
      initialPatchReflow: !initialPatchReflow.exercised
        || (initialPatchReflow.downstreamShift >= initialPatchReflow.growth - 2 && !initialPatchReflow.overlap),
      fontStableDuringEdit: editing.fontStable,
      subsetFontFallback: editing.subsetFallbackSafe,
      browserConsole: consoleErrors.length === 0
    };
    const passed = Object.values(checks).every(Boolean);
    reports.push({
      sourceName,
      passed,
      checks,
      metrics,
      editing,
      initialPatchReflow,
      visual,
      editingVisual,
      consoleErrors,
      artifacts: {
        htmlPath,
        referencePath,
        outputPath,
        editingPath,
        differencePath: existsSync(differencePath) ? differencePath : "",
        editingDifferencePath: existsSync(editingDifferencePath) ? editingDifferencePath : ""
      }
    });
    page.off("console", onConsole);
    console.log(`${passed ? "PASS" : "FAIL"} ${sourceName} | mismatch ${(visual.mismatchRatio * 100).toFixed(3)}% | edit-toggle ${(editingVisual.mismatchRatio * 100).toFixed(3)}% | ${editing.blockCount}/${editing.textItemCount} blocks/runs | shift ${editing.downstreamShift.toFixed(1)}px | initial +${initialPatchReflow.growth.toFixed(1)}=>${initialPatchReflow.downstreamShift.toFixed(1)}px`);
  }

  const suiteChecks = {
    allFixturesPassed: reports.every((item) => item.passed),
    symbolCoverage: reports.some((item) => (item.metrics?.symbolItemCount || 0) + (item.metrics?.symbolFontCount || 0) > 0),
    exercisedParagraphReflow: reports.some((item) => item.editing?.exercisedReflow && item.editing?.downstreamShift < -1),
    exercisedInitialPatchReflow: reports.some((item) => item.initialPatchReflow?.exercised && item.checks?.initialPatchReflow)
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
