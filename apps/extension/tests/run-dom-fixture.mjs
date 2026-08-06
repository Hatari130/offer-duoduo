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
const profileDirectory = mkdtempSync(join(tmpdir(), "offerflow-dom-test-"));

try {
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
      pathToFileURL(fixturePath).href
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
  );

  assert.equal(result.status, 0, result.stderr || "headless Chrome failed");
  const encoded = result.stdout.match(/data-result="([^"]+)"/)?.[1];
  assert(encoded, "fixture did not publish an extraction result");
  const response = JSON.parse(decodeURIComponent(encoded.replaceAll("&amp;", "&")));
  assert.equal(response.ok, true);

  const evidence = response.data.progressEvidence;
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
} finally {
  rmSync(profileDirectory, { recursive: true, force: true });
}
