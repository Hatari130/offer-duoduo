import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const appPath = resolve(testDir, "../src/entries/tailor/App.tsx");
const appSource = await readFile(appPath, "utf8");

const exportedFunctions = loadPureFunctions(appSource, [
  "isHistoricalBundleForSource",
  "isFlowPreviewSource",
  "resolveTailorPreview",
  "formatSourceCharacterCount"
]);

const {
  isHistoricalBundleForSource,
  isFlowPreviewSource,
  resolveTailorPreview,
  formatSourceCharacterCount
} = exportedFunctions as Record<string, (...args: any[]) => any>;

const basePreviewInput = {
  hasBundle: true,
  hasSourcePdf: true,
  allowFlowPreview: false,
  sourceLayoutState: "ready",
  sourceLayoutError: "",
  coordinatePreviewHtml: "<html>coordinate</html>",
  coordinatePreviewError: "",
  flowPreviewHtml: "<html>flow</html>"
};

test("PDF loading never exposes the flow preview", () => {
  const result = resolveTailorPreview({
    ...basePreviewInput,
    sourceLayoutState: "loading",
    coordinatePreviewHtml: ""
  });
  assert.deepEqual(result, { mode: "loading", html: "", error: "" });
});

test("PDF errors preserve the real error and never fall back to flow HTML", () => {
  const result = resolveTailorPreview({
    ...basePreviewInput,
    sourceLayoutState: "error",
    sourceLayoutError: "字体映射读取失败",
    coordinatePreviewHtml: ""
  });
  assert.equal(result.mode, "error");
  assert.equal(result.html, "");
  assert.equal(result.error, "字体映射读取失败");
});

test("only a successful coordinate preview represents a PDF result", () => {
  assert.deepEqual(resolveTailorPreview(basePreviewInput), {
    mode: "coordinate",
    html: "<html>coordinate</html>",
    error: ""
  });

  const failedCoordinate = resolveTailorPreview({
    ...basePreviewInput,
    coordinatePreviewHtml: "",
    coordinatePreviewError: "坐标预览构建失败"
  });
  assert.equal(failedCoordinate.mode, "error");
  assert.equal(failedCoordinate.html, "");
});

test("flow preview is limited to DOCX/TXT sources without a PDF", () => {
  assert.equal(isFlowPreviewSource("candidate.docx", false), true);
  assert.equal(isFlowPreviewSource("candidate.DOC", false), false);
  assert.equal(isFlowPreviewSource("candidate.txt", false), true);
  assert.equal(isFlowPreviewSource("candidate.pdf", false), false);
  assert.equal(isFlowPreviewSource("candidate.docx", true), false);

  const flow = resolveTailorPreview({
    ...basePreviewInput,
    hasSourcePdf: false,
    allowFlowPreview: true,
    sourceLayoutState: "idle",
    coordinatePreviewHtml: ""
  });
  assert.equal(flow.mode, "flow");
  assert.equal(flow.html, "<html>flow</html>");
});

test("historical bundles require an exact source resume id", () => {
  assert.equal(isHistoricalBundleForSource("resume-a", "resume-a"), true);
  assert.equal(isHistoricalBundleForSource("resume-a", "resume-b"), false);
  assert.equal(isHistoricalBundleForSource(undefined, "resume-a"), false);
  assert.equal(isHistoricalBundleForSource("resume-a", undefined), false);
});

test("undefined character count reads as pending instead of zero", () => {
  assert.equal(formatSourceCharacterCount(undefined), "正在读取");
  assert.equal(formatSourceCharacterCount(0), "0 字");
  assert.equal(formatSourceCharacterCount(1878), "1878 字");
});

test("ReviewGrid resolves loading and error before rendering an iframe", () => {
  const reviewStart = appSource.indexOf("function ReviewGrid(");
  const reviewEnd = appSource.indexOf("function TailorResultBanner(", reviewStart);
  const reviewSource = appSource.slice(reviewStart, reviewEnd);
  const resumeScrollStart = reviewSource.indexOf('<div className="resume-scroll">');
  const resumeScrollEnd = reviewSource.indexOf('<div className="resume-foot">', resumeScrollStart);
  const resumeScrollSource = reviewSource.slice(resumeScrollStart, resumeScrollEnd);
  const loadingIndex = resumeScrollSource.indexOf('preview.mode === "loading"');
  const errorIndex = resumeScrollSource.indexOf('preview.mode === "error"', loadingIndex);
  const iframeIndex = resumeScrollSource.indexOf("activePreviewHtml && bundle", errorIndex);

  assert.ok(loadingIndex >= 0, "loading branch must exist");
  assert.ok(errorIndex > loadingIndex, "error branch must follow loading");
  assert.ok(iframeIndex > errorIndex, "iframe branch must not mask loading/error");
  assert.match(reviewSource, /bundle && preview\.mode === "coordinate"/);
  assert.doesNotMatch(appSource, /coordinatePreviewHtml\s*\|\|\s*flowPreviewHtml/);
  assert.doesNotMatch(appSource, /sourceCharacterCount\s*\|\|\s*0/);
});

function loadPureFunctions(source: string, names: string[]) {
  const sourceFile = ts.createSourceFile(
    "App.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const wanted = new Set(names);
  const declarations: string[] = [];

  sourceFile.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name && wanted.has(node.name.text)) {
      declarations.push(node.getText(sourceFile));
      wanted.delete(node.name.text);
    }
  });

  assert.deepEqual([...wanted], [], `missing pure functions: ${[...wanted].join(", ")}`);
  const output = ts.transpileModule(declarations.join("\n"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  const evaluate = new Function("module", "exports", output);
  evaluate(module, module.exports);
  return module.exports;
}
