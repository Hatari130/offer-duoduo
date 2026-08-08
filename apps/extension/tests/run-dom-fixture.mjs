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
const profileDirectory = mkdtempSync(join(tmpdir(), "offerflow-dom-test-"));

const runFixture = (fixture) => {
  const result = spawnSync(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--allow-file-access-from-files",
      "--virtual-time-budget=2500",
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
} finally {
  rmSync(profileDirectory, { recursive: true, force: true });
}
