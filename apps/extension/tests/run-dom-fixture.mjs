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
const feishuFixturePath = fileURLToPath(
  new URL("./fixtures/feishu-jobs-application.html", import.meta.url)
);
const zhiyeDetailEndedPath = fileURLToPath(
  new URL("./fixtures/zhiye-detail-ended.html", import.meta.url)
);
const mokahrJobDetailPath = fileURLToPath(
  new URL("./fixtures/mokahr-job-detail.html", import.meta.url)
);
const webAppPath = fileURLToPath(
  new URL("./fixtures/web-app-applications.html", import.meta.url)
);
const repeatFormPath = fileURLToPath(
  new URL("./fixtures/application-form-repeat.html", import.meta.url)
);
const xiaomiRepeatFormPath = fileURLToPath(
  new URL("./fixtures/application-form-xiaomi-repeat.html", import.meta.url)
);
const antSelectFormPath = fileURLToPath(
  new URL("./fixtures/application-form-ant-select.html", import.meta.url)
);
const dynamicConfirmFormPath = fileURLToPath(
  new URL("./fixtures/application-form-dynamic-confirm.html", import.meta.url)
);
const controlDriverFormPath = fileURLToPath(
  new URL("./fixtures/application-form-control-drivers.html", import.meta.url)
);
const mokaFormPath = fileURLToPath(
  new URL("./fixtures/application-form-moka.html", import.meta.url)
);
const reinjectionFormPath = fileURLToPath(
  new URL("./fixtures/application-form-reinjection.html", import.meta.url)
);
const duxiaomanFormPath = fileURLToPath(
  new URL("./fixtures/application-form-duxiaoman.html", import.meta.url)
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

  const feishu = runFixture(feishuFixturePath);
  assert.equal(feishu.company, "蔚来");
  assert.equal(feishu.progressEvidence.length, 3);
  assert.deepEqual(
    feishu.progressEvidence.map((item) => ({
      company: item.company,
      position: item.position,
      city: item.city,
      progress: item.currentStage,
      appliedAt: item.appliedAt
    })),
    [
      { company: "蔚来", position: "提前批-AI产品经理（创新产品）", city: "上海", progress: "已投递", appliedAt: "2026-08-07" },
      { company: "蔚来", position: "提前批-AI产品经理（AI平台）", city: "上海", progress: "已投递", appliedAt: "2026-08-07" },
      { company: "蔚来", position: "提前批-产品经理（APP产品）", city: "上海", progress: "已投递", appliedAt: "2026-08-07" }
    ]
  );
  assert.equal(feishu.recruitmentType, "autumn_early");
  assert.equal(feishu.progressEvidence.some((item) => item.position.includes("项目：")), false);
  console.log("DOM extraction fixture passed for the Feishu Jobs application page.");

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

  const mokahrJob = runFixture(mokahrJobDetailPath);
  assert.deepEqual(
    {
      company: mokahrJob.company,
      position: mokahrJob.position,
      city: mokahrJob.city,
      appliedAt: mokahrJob.appliedAt
    },
    {
      company: "作业帮教育科技（北京）有限公司",
      position: "平台产品经理（企业）-27秋招",
      city: "北京市",
      appliedAt: undefined
    },
    "Moka job details must use labeled job and company sections, never footer text or publication dates"
  );
  console.log("DOM extraction fixture passed: Moka job details use labeled company, role and location fields.");

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
  assert.equal(
    repeatedForm.decoyAddClicks,
    0,
    "repeat expansion must click the add button in the matching form module, not an identically named decoy"
  );
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

  const xiaomiRepeatedForm = runFixture(xiaomiRepeatFormPath, 4000);
  assert.deepEqual(
    xiaomiRepeatedForm.scan.fields
      .filter((field) => field.key === "experienceOrganization")
      .map((field) => field.repeatIndex),
    [0, 1],
    "separately wrapped Xiaomi experience cards must receive distinct indexes"
  );
  assert.deepEqual(
    xiaomiRepeatedForm.entries.map(({ company, position, startDate, endDate }) => ({ company, position, startDate, endDate })),
    [
      { company: "携程集团", position: "AI产品经理", startDate: "2026-04", endDate: "2026-07" },
      { company: "南京开为网络科技有限公司", position: "产品部门｜AI产品经理", startDate: "2025-11", endDate: "2026-03" }
    ]
  );
  assert.equal(
    xiaomiRepeatedForm.scan.fields.filter((field) => field.key === "degree").length,
    1,
    "an ATSX select and its nested search input must be scanned as one field"
  );
  assert.equal(xiaomiRepeatedForm.degree, "硕士", "the exact ATSX option must be committed");
  assert.equal(xiaomiRepeatedForm.openAtsxSelects, 0, "all ATSX dropdowns must be closed after filling");
  console.log("DOM form fixture passed: Xiaomi-style wrapped work experiences are filled independently.");

  const antSelectForm = runFixture(antSelectFormPath, 4000);
  assert.equal(
    antSelectForm.scan.fields.filter((field) => field.type === "custom-select").length,
    1,
    "an Ant Design select and its nested combobox must be scanned as one field"
  );
  assert.equal(antSelectForm.fill.filled, 1, "the Ant Design option must be reported as committed");
  assert.equal(antSelectForm.selected, "硕士研究生", "the real Ant Design option row must be clicked");
  assert.equal(antSelectForm.openSelects, 0, "the Ant Design select must be closed after filling");
  assert.equal(antSelectForm.visibleDropdowns, 0, "no Ant Design dropdown may remain visible");
  console.log("DOM form fixture passed: Ant Design options are selected and confirmed automatically.");

  const dynamicConfirmForm = runFixture(dynamicConfirmFormPath, 5000);
  assert.equal(dynamicConfirmForm.gender, "男", "a popup selection must be committed through its confirm button");
  assert.equal(dynamicConfirmForm.confirmClicks, 1, "the popup confirm action must run exactly once");
  assert.equal(dynamicConfirmForm.popupOpen, false, "the confirmed popup must be closed");
  assert.equal(dynamicConfirmForm.city, "南京", "a field rendered after confirmation must be found and filled in a later round");
  assert.equal(dynamicConfirmForm.fill.rounds >= 2, true, "dynamic fields require at least one rescan round");
  assert.equal(dynamicConfirmForm.fill.rescanned, true, "the fill report must expose that the page was rescanned");
  console.log("DOM form fixture passed: popup confirmation and multi-round dynamic filling work together.");

  const controlDriverForm = runFixture(controlDriverFormPath, 7000);
  assert.equal(controlDriverForm.degree, "硕士", "a searchable iView select must wait for and choose its async option");
  assert.equal(controlDriverForm.degreeSearches >= 1, true, "the driver must type into a searchable control when initial options do not match");
  assert.equal(controlDriverForm.city, "江苏省/南京市", "a cascader must select each hierarchy level before confirmation");
  assert.equal(controlDriverForm.cityConfirmClicks, 1, "the cascader popup confirm button must be clicked exactly once");
  assert.equal(controlDriverForm.workYears, "Less than 1 year", "a component without a confirm button must commit through Enter");
  assert.equal(controlDriverForm.yearsEnterConfirmations, 1, "the Enter fallback must run exactly once");
  assert.equal(controlDriverForm.decoyConfirmClicks, 0, "a simultaneously visible unrelated popup must never be confirmed");
  assert.equal(controlDriverForm.cityPopupOpen, false, "the cascader popup must close after confirmation");
  assert.equal(controlDriverForm.finalSubmitClicks, 0, "component confirmation must never click the application's final submit button");
  assert.equal(controlDriverForm.fill.filled, 3, "all registered component drivers must pass value verification");
  assert.equal(controlDriverForm.fill.results.some((result) => result.controlDriver === "iview"), true);
  assert.equal(
    controlDriverForm.fill.results.some((result) => result.controlDriver === "semi" && result.commitMethod === "button"),
    true,
    "fill diagnostics must report the driver and its scoped confirmation method"
  );
  assert.equal(
    controlDriverForm.fill.results.some((result) => result.controlDriver === "generic" && result.commitMethod === "enter"),
    true,
    "fill diagnostics must report Enter when the owned popup has no confirm button"
  );
  console.log("DOM form fixture passed: registered search/cascade drivers confirm only their owning popup.");

  const mokaForm = runFixture(mokaFormPath, 30000);
  assert.equal(mokaForm.scan.platform.id, "moka", "Sugar Design markers must resolve the Moka adapter");
  assert.equal(
    mokaForm.scan.fields.find((field) => field.label === "最高学历")?.repeatGroup,
    undefined,
    "Moka personal highest degree must stay a single profile field"
  );
  assert.equal(mokaForm.educationAdds, 1, "Moka must add the second education card in its own block");
  assert.equal(mokaForm.internshipAdds, 1, "Moka must add the second internship card instead of duplicating the work block");
  assert.equal(mokaForm.workCompany, "", "internship-only profiles must not be copied into Moka work experience");
  assert.deepEqual(
    mokaForm.education.map((entry) => ({
      school: entry.fields["学校名称"],
      major: entry.fields["专业名称"],
      degree: entry.fields["学历"],
      date: entry.date
    })),
    [
      { school: "南京大学", major: "城乡规划", degree: "硕士", date: ["2024", "9", "2027", "6"] },
      { school: "北京林业大学", major: "城乡规划", degree: "本科", date: ["2018", "9", "2023", "6"] }
    ]
  );
  assert.deepEqual(
    mokaForm.internship.map((entry) => ({
      company: entry.fields["公司名称"],
      title: entry.fields["职位名称"],
      description: entry.fields["工作职责"],
      date: entry.date
    })),
    [
      { company: "携程集团", title: "AI产品经理", description: "第一段实习", date: ["2026", "4", "2026", "7"] },
      { company: "南京开为网络科技有限公司", title: "AI产品经理", description: "第二段实习", date: ["2025", "11", "2026", "3"] }
    ]
  );
  assert.equal(mokaForm.gender, "男", "Moka's unlabelled Sugar select must click the real option row");
  assert.deepEqual(mokaForm.awardDate.slice(0, 2), ["2024", "7"], "Moka's two-part award month must be filled as one field");
  assert.equal(mokaForm.openPopups, 0, "no Sugar Design dropdown may remain open after filling");
  assert.equal(mokaForm.fill.results.every((result) => result.status === "filled"), true);
  console.log("DOM form fixture passed: Moka Sugar selects, async search, dates and repeated sections fill independently.");

  const duxiaomanForm = runFixture(duxiaomanFormPath, 15000);
  assert.equal(duxiaomanForm.scan.platform.id, "feishu-career", "Formily and Universe markers must resolve the Feishu Career adapter");
  assert.equal(duxiaomanForm.dewuAdapter, "feishu-career", "campus.dewu.com must resolve directly to the ATSX adapter without Formily marker detection");
  assert.deepEqual(
    duxiaomanForm.scan.fields.filter((field) => ["gender", "currentCity", "degree"].includes(field.key)).map((field) => field.key),
    ["gender", "currentCity", "degree"],
    "Universe search-backed selects must be kept as form fields instead of being discarded as search boxes"
  );
  assert.equal(duxiaomanForm.scan.fields.filter((field) => field.type === "date-range").length, 3, "ATSX time_period fields must be recognized once in education, internship and project sections");
  assert.equal(duxiaomanForm.educationAdds, 1, "the Feishu Career module-level add action must create the second education record");
  assert.equal(duxiaomanForm.name, "林知夏");
  assert.equal(duxiaomanForm.gender, "女");
  assert.equal(duxiaomanForm.city, "南京");
  assert.deepEqual(duxiaomanForm.education, [
    { school: "南京大学", degree: "硕士", major: "城乡规划", dates: ["2024-09", "2027-06"] },
    { school: "北京林业大学", degree: "本科", major: "城乡规划", dates: ["2018-09", "2023-06"] }
  ]);
  assert.deepEqual(duxiaomanForm.experience, {
    company: "携程集团",
    title: "AI产品经理",
    dates: ["2026-04", ""],
    current: true,
    description: "负责 AI 产品对话体验与增长闭环"
  }, "Dewu internship ranges must commit through React while current is stored as a separate toggle");
  assert.deepEqual(duxiaomanForm.project, {
    name: "Agents APP",
    role: "产品负责人",
    dates: ["2025-09", ""],
    current: true,
    description: "搭建智能体工作流并优化多轮引导策略"
  }, "Dewu project time_period fields must use the same React range driver and separate current toggle");
  assert.equal(duxiaomanForm.openDropdowns, 0, "Universe dropdowns must be closed after each committed option");
  assert.equal(duxiaomanForm.fill.results.every((result) => result.status === "filled"), true);
  console.log("DOM form fixture passed: Duxiaoman Formily labels, Universe selects, date ranges and repeated education fill correctly.");

  const reinjectionForm = runFixture(reinjectionFormPath, 4000);
  assert.equal(reinjectionForm.listenerCount, 1, "reinjecting a new extension session must replace the stale listener");
  assert.equal(reinjectionForm.contentSession, "test-session-b");
  assert.equal(reinjectionForm.runtimeVersion, "2026-08-21.autofill-v8");
  assert.equal(reinjectionForm.fieldCount, 1, "the replacement listener must still scan the application form");
  console.log("DOM form fixture passed: extension reload replaces stale autofill listeners without duplicates.");
} finally {
  rmSync(profileDirectory, { recursive: true, force: true });
}
