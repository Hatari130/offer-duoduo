import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].filter(Boolean);

const chromePath = chromeCandidates.find(existsSync);
if (!chromePath) {
  console.log("DOM extraction fixture skipped: Chrome/Chromium was not found.");
  process.exit(0);
}

const fixturePath = fileURLToPath(
  new URL("./fixtures/progress-page.html", import.meta.url)
);
const zhiyeFixturePath = fileURLToPath(
  new URL("./fixtures/zhiye-delivery.html", import.meta.url)
);
const zhiyeDetailEndedPath = fileURLToPath(
  new URL("./fixtures/zhiye-detail-ended.html", import.meta.url)
);
const webAppPath = fileURLToPath(
  new URL("./fixtures/web-app-applications.html", import.meta.url)
);
const repeatFormPath = fileURLToPath(
  new URL("./fixtures/application-form-repeat.html", import.meta.url)
);
const profileDirectory = mkdtempSync(join(tmpdir(), "offerflow-dom-test-"));

const runFixture = (fixture, virtualTimeBudget = 2500) => {
  const result = spawnSync(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-gpu-compositing",
      "--disable-accelerated-2d-canvas",
      "--disable-features=Dawn,Vulkan,UseSkiaRenderer,CanvasOopRasterization",
      "--no-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      "--allow-file-access-from-files",
      `--virtual-time-budget=${virtualTimeBudget}`,
      `--user-data-dir=${profileDirectory}`,
      "--dump-dom",
      pathToFileURL(fixture).href
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
  );

  assert.equal(result.status, 0, result.stderr || "headless Chrome failed");
  const encoded = result.stdout.match(/data-result="([^"]+)"/)?.[1];
  assert(encoded, "fixture did not publish an extraction result");
  const response = JSON.parse(decodeURIComponent(encoded.replaceAll("&amp;", "&")));
  assert.equal(response.ok, true);
  return response.data;
};

try {
  const data = runFixture(fixturePath);
  const evidence = data.progressEvidence;
  assert.equal(evidence.length, 3);
  assert.deepEqual(
    evidence.map((item) => ({
      company: item.company,
      position: item.position,
      progress: item.currentStage
    })),
    [
      { company: "京东", position: "技术产品经理", progress: "简历筛选中" },
      {
        company: "Token Foundry",
        position: "日常实习生-AI产品经理-未来生活实验室",
        progress: "简历投递"
      },
      { company: "百度", position: "北京-AI产品经理(J100665)", progress: "简历筛选" }
    ]
  );
  assert.equal(evidence[2].jobId, "J100665");
  assert.equal(evidence[2].appliedAt, "2026-07-16");
  assert.equal(
    evidence.some((item) => ["AI面试", "简历投递"].includes(item.position)),
    false
  );
  console.log("DOM extraction fixture passed for JD, Alibaba and Baidu examples.");

  const zhiye = runFixture(zhiyeFixturePath);
  assert.equal(zhiye.progressEvidence.length, 2);
  assert.deepEqual(
    zhiye.progressEvidence.map((item) => ({
      position: item.position,
      jobId: item.jobId,
      progress: item.currentStage,
      appliedAt: item.appliedAt
    })),
    [
      {
        position: "【27校招】办公平台AI产品经理/AI Agent工程师（J14442）",
        jobId: "J14442",
        progress: "当前进度：简历筛选·初筛进行中",
        appliedAt: "2026-08-08 19:03"
      },
      {
        position: "27届校招-AI产品经理（J14379）",
        jobId: "J14379",
        progress: "当前进度：简历筛选·初筛进行中",
        appliedAt: "2026-08-08 19:02"
      }
    ]
  );
  assert.equal(zhiye.progressEvidence[0].company, undefined);
  assert.equal(zhiye.progressEvidence[0].position.includes("实习生招聘"), false);
  assert.equal(
    zhiye.rawExcerpt.includes("/*project config start*/"),
    true,
    "rawExcerpt still carries the portal marker (AI prompt sanitization is tested separately)"
  );
  console.log("DOM extraction fixture passed for the zhiye delivery-record page.");

  const detail = runFixture(zhiyeDetailEndedPath);
  assert.equal(
    detail.position,
    "【27校招】办公平台AI产品经理/AI Agent工程师（J14442）",
    "job detail headings should remain the position instead of the portal title"
  );
  assert.deepEqual(
    detail.responsibilities,
    ["负责办公平台 AI 产品规划"],
    "job detail responsibilities should be split into readable items"
  );
  assert.equal(
    detail.progressEvidence.length,
    0,
    "a job-detail page whose position ended must not mark the application as terminated"
  );
  console.log("DOM extraction fixture passed: ended job details never produce terminal evidence.");

  const webApp = runFixture(webAppPath);
  assert.equal(
    webApp.skipped,
    true,
    "the OfferFlow web app must never be captured as a recruitment page"
  );
  assert.equal(webApp.progressEvidence.length, 0);
  console.log("DOM extraction fixture passed: the OfferFlow web app is excluded from capture.");

  const repeatedForm = runFixture(repeatFormPath, 4000);
  assert.equal(repeatedForm.scan.repeatersExpanded, true);
  assert.equal(repeatedForm.entries.length, 2);
  assert.deepEqual(
    repeatedForm.entries.map(({ school, major, degree }) => ({ school, major, degree })),
    [
      { school: "南京大学", major: "城乡规划", degree: "硕士" },
      { school: "北京林业大学", major: "城乡规划", degree: "本科" }
    ]
  );
  assert.deepEqual(
    repeatedForm.scan.fields.filter((field) => field.key === "school").map((field) => field.repeatIndex),
    [0, 1]
  );
  assert.equal(
    repeatedForm.scan.fields.filter((field) => field.key === "targetCities").length,
    1,
    "an Element UI multi-select must be scanned as one field, not once per internal input"
  );
  assert.equal(
    repeatedForm.scan.fields.some((field) => ["上海", "深圳"].includes(field.label)),
    false,
    "dropdown options must not be mistaken for form fields"
  );
  assert.equal(repeatedForm.fill.filled, repeatedForm.scan.fields.length);
  console.log("DOM form fixture passed: a second education entry is added, mapped and filled independently.");
} finally {
  rmSync(profileDirectory, { recursive: true, force: true });
}
