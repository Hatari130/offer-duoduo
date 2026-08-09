import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(extensionRoot, "dist");
const fixtureRoot = resolve(process.argv[2] || process.env.OFFERFLOW_PDF_FIXTURES || "D:\\2026\\2026product\\z");
const reportRoot = resolve(process.argv[3] || join(extensionRoot, ".tmp", "extension-pdf-flow"));
const fixtureLimit = Number(process.env.OFFERFLOW_PDF_FLOW_LIMIT || 0);
const fixtures = readdirSync(fixtureRoot)
  .filter((name) => extname(name).toLowerCase() === ".pdf")
  .sort((left, right) => left.localeCompare(right, "zh-CN"))
  .map((name) => resolve(fixtureRoot, name))
  .slice(0, fixtureLimit > 0 ? fixtureLimit : undefined);

if (!existsSync(join(distRoot, "manifest.json"))) {
  throw new Error(`Missing packaged extension at ${distRoot}; run the extension build first.`);
}
if (!fixtures.length) throw new Error(`No PDF fixtures found in ${fixtureRoot}`);
mkdirSync(reportRoot, { recursive: true });

const runtimeModules = join(
  homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "node",
  "node_modules"
);

async function importWithRuntimeFallback(name, fallbackFile) {
  try {
    return await import(name);
  } catch {
    return import(pathToFileURL(join(runtimeModules, name, fallbackFile)).href);
  }
}

const { chromium } = await importWithRuntimeFallback("playwright", "index.mjs");
const browserExecutable = [
  join(process.env.ProgramFiles || "", "Google", "Chrome", "Application", "chrome.exe"),
  join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
  join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe")
].find((candidate) => candidate && existsSync(candidate));

if (!browserExecutable) throw new Error("Chrome or Edge is required for the packaged flow check.");

function encodedTailorContext(index, sourceResumeId) {
  const jobKey = `packaged_pdf_flow_${index + 1}`;
  const context = {
    jobKey,
    sourceResumeId,
    company: "OfferFlow 测试公司",
    position: "AI 产品经理",
    city: "南京",
    sourceUrl: "https://example.com/jobs/ai-product-manager",
    summary: "负责 AI 产品规划、用户研究和跨团队落地。",
    responsibilities: [
      "负责 AI 产品从需求分析到上线复盘的完整流程",
      "协同研发、设计与运营团队推动关键项目落地"
    ],
    requirements: [
      "具备 AI 产品或智能工具相关项目经验",
      "能够基于数据和用户反馈持续优化产品"
    ],
    rawExcerpt: "OfferFlow 测试公司\nAI 产品经理\n负责 AI 产品从需求分析到上线复盘的完整流程。"
  };
  return encodeURIComponent(Buffer.from(JSON.stringify({ jobKey, context }), "utf8").toString("base64"));
}

const server = await createServer({
  root: distRoot,
  configFile: false,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, strictPort: false }
});

let browser;
const reports = [];

try {
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error("The packaged extension server did not expose a local URL.");
  browser = await chromium.launch({ headless: true, executablePath: browserExecutable });

  for (let index = 0; index < fixtures.length; index += 1) {
    const fixture = fixtures[index];
    const consoleErrors = [];
    const pageErrors = [];
    const failedResponses = [];
    const context = await browser.newContext({ viewport: { width: 1800, height: 1100 } });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
    });
    console.log(`CHECK ${basename(fixture)}`);

    try {
      await page.goto(`${baseUrl}resume.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.locator('input[type="file"]').setInputFiles(fixture);
      await page.waitForFunction(() => {
        const resumes = JSON.parse(localStorage.getItem("offerflow.resumes") || "[]");
        const activeId = localStorage.getItem("offerflow.activeResumeId");
        return Array.isArray(resumes)
          && resumes.some((resume) => resume.id === activeId && resume.sourcePdf?.base64?.length > 1000);
      }, undefined, { timeout: 120000 });

      const storedState = await page.evaluate(() => {
        const resumes = JSON.parse(localStorage.getItem("offerflow.resumes") || "[]");
        const activeId = localStorage.getItem("offerflow.activeResumeId");
        const activeResume = resumes.find((resume) => resume.id === activeId);
        return {
          activeResumeId: activeResume?.id || "",
          sourcePdfBytes: activeResume?.sourcePdf?.size || 0,
          sourcePdfBase64Length: activeResume?.sourcePdf?.base64?.length || 0
        };
      });
      if (!storedState.activeResumeId) throw new Error("The uploaded PDF was not activated in the resume library.");

      const payload = encodedTailorContext(index, storedState.activeResumeId);
      await page.goto(`${baseUrl}tailor.html?context=${payload}&auto=1`, {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
      await page.waitForSelector("iframe.resume-iframe", { state: "attached", timeout: 120000 });
      await page.waitForFunction(() => {
        const iframe = document.querySelector("iframe.resume-iframe");
        return Boolean(iframe?.contentDocument?.querySelector('meta[name="source-character-count"]'));
      }, undefined, { timeout: 120000 });
      await page.locator("iframe.resume-iframe").evaluate(async (iframe) => {
        const frameDocument = iframe.contentDocument;
        if (!frameDocument) throw new Error("Resume iframe is not readable.");
        await frameDocument.fonts.ready;
        await Promise.all(
          [...frameDocument.images].map((image) => image.complete ? Promise.resolve() : image.decode())
        );
      });

      const metrics = await page.locator("iframe.resume-iframe").evaluate((iframe) => {
        const frameDocument = iframe.contentDocument;
        if (!frameDocument) return undefined;
        const meta = (name) => Number(
          frameDocument.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || 0
        );
        const sourcePage = frameDocument.querySelector(".source-page");
        const sourceImage = frameDocument.querySelector(".source-page-image");
        const sourceText = [...frameDocument.querySelectorAll(".source-text")];
        return {
          characterCount: meta("source-character-count"),
          fontCount: meta("source-font-count"),
          vectorShapeCount: meta("source-vector-shape-count"),
          overrideCount: meta("tailored-override-count"),
          pageCount: frameDocument.querySelectorAll(".source-page").length,
          vectorPathCount: frameDocument.querySelectorAll(".source-page-vectors path").length,
          textOverlayCount: sourceText.length,
          sourceImageLoaded: sourceImage?.tagName === "IMG"
            && sourceImage.complete
            && sourceImage.naturalWidth > 0
            && sourceImage.naturalHeight > 0,
          pageWidth: sourcePage?.getBoundingClientRect().width || 0,
          pageHeight: sourcePage?.getBoundingClientRect().height || 0,
          bodyTextLength: frameDocument.body.innerText.trim().length
        };
      });

      if (!metrics) throw new Error("The resume iframe did not expose fidelity metadata.");
      const screenshotPath = join(reportRoot, `fixture-${index + 1}-packaged.png`);
      const frame = page.frames().find((candidate) => candidate.parentFrame() === page.mainFrame());
      if (!frame) throw new Error("The generated resume frame was not found.");
      await frame.locator(".source-page").first().screenshot({ path: screenshotPath });

      const checks = {
        sourcePdfStored: storedState.sourcePdfBytes > 0 && storedState.sourcePdfBase64Length > 1000,
        completeText: metrics.characterCount >= 400,
        embeddedFonts: metrics.fontCount > 0,
        vectorShapes: metrics.vectorShapeCount > 0 && metrics.vectorPathCount > 0,
        sourceImageLoaded: metrics.sourceImageLoaded,
        sourcePageVisible: metrics.pageCount > 0 && metrics.pageWidth > 500 && metrics.pageHeight > 700,
        editableTextLayer: metrics.textOverlayCount > 0,
        notBlank: metrics.bodyTextLength >= 400,
        browserConsole: pageErrors.length === 0
          && consoleErrors.every((message) => message.startsWith("Failed to load resource:"))
      };
      const passed = Object.values(checks).every(Boolean);
      reports.push({
        sourceName: basename(fixture),
        passed,
        checks,
        storedState,
        metrics,
        consoleErrors,
        pageErrors,
        failedResponses,
        screenshotPath
      });
    } catch (error) {
      const failureScreenshotPath = join(reportRoot, `fixture-${index + 1}-failure.png`);
      await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => undefined);
      reports.push({
        sourceName: basename(fixture),
        passed: false,
        error: error instanceof Error ? error.stack || error.message : String(error),
        consoleErrors,
        pageErrors,
        failedResponses,
        failureScreenshotPath
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}

const passed = reports.every((report) => report.passed);
const report = {
  generatedAt: new Date().toISOString(),
  fixtureRoot,
  distRoot,
  hostMode: "packaged-dist",
  passed,
  reports
};
const reportPath = join(reportRoot, "report.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

for (const item of reports) {
  const suffix = item.error
    ? item.error.split("\n")[0]
    : `${item.metrics.characterCount} chars, ${item.metrics.fontCount} fonts, ${item.metrics.vectorPathCount} vectors`;
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.sourceName}: ${suffix}`);
}
console.log(`Packaged extension report: ${reportPath}`);
if (!passed) process.exitCode = 1;
