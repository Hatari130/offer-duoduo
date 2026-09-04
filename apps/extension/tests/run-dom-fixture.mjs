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
const feishuRepeatFormPath = fileURLToPath(
  new URL("./fixtures/application-form-feishu-repeat.html", import.meta.url)
);
const feishuEducationFormPath = fileURLToPath(
  new URL("./fixtures/application-form-feishu-education-form.html", import.meta.url)
);
const beisenRepeatFormPath = fileURLToPath(
  new URL("./fixtures/application-form-beisen-repeat.html", import.meta.url)
);
const beisenExperienceKindsPath = fileURLToPath(
  new URL("./fixtures/application-form-beisen-experience-kinds.html", import.meta.url)
);
const hotjobFormPath = fileURLToPath(
  new URL("./fixtures/application-form-hotjob.html", import.meta.url)
);
const pupumallFormPath = fileURLToPath(
  new URL("./fixtures/application-form-pupumall.html", import.meta.url)
);
const citicbankFormPath = fileURLToPath(
  new URL("./fixtures/application-form-citicbank.html", import.meta.url)
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
  assert.equal(controlDriverForm.school, "南京大学", "the live Universe school input must type before choosing its remote option");
  assert.equal(controlDriverForm.yearsEnterConfirmations, 1, "the Enter fallback must run exactly once");
  assert.equal(controlDriverForm.schoolSearches >= 1, true, "the Universe driver must type into a data-form-field-name school input without a combobox role");
  assert.equal(controlDriverForm.decoyConfirmClicks, 0, "a simultaneously visible unrelated popup must never be confirmed");
  assert.equal(controlDriverForm.cityPopupOpen, false, "the cascader popup must close after confirmation");
  assert.equal(controlDriverForm.finalSubmitClicks, 0, "component confirmation must never click the application's final submit button");
  assert.equal(controlDriverForm.fill.filled, 4, "all registered component drivers must pass value verification");
  assert.equal(controlDriverForm.fill.results.some((result) => result.controlDriver === "iview"), true);
  assert.equal(controlDriverForm.fill.results.some((result) => result.controlDriver === "feishu"), true);
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
  assert.equal(duxiaomanForm.scan.repeatersExpanded, false, "a product scan must be read-only and leave repeat expansion to the fill transaction");
  assert.deepEqual(duxiaomanForm.addsAfterScan, { education: 0, experience: 0 }, "read-only scanning must never click a Formily add action");
  assert.equal(duxiaomanForm.dewuAdapter, "feishu-career", "campus.dewu.com must resolve directly to the ATSX adapter without Formily marker detection");
  assert.deepEqual(
    duxiaomanForm.scan.fields.filter((field) => ["gender", "currentCity", "degree"].includes(field.key)).map((field) => field.key),
    ["gender", "currentCity", "degree"],
    "Universe search-backed selects must be kept as form fields instead of being discarded as search boxes"
  );
  assert.equal(duxiaomanForm.scan.fields.filter((field) => field.type === "date-range").length, 3, "ATSX time_period fields must be recognized once in education, internship and project sections");
  assert.equal(duxiaomanForm.educationAdds, 2, "the Feishu Career module-level add action must create all missing education records");
  assert.equal(duxiaomanForm.experienceAdds, 1, "the Feishu Career module-level add action must create the second internship record");
  assert.deepEqual(duxiaomanForm.addsAfterFirstFill, { education: 2, experience: 1 });
  assert.deepEqual(
    { education: duxiaomanForm.educationAdds, experience: duxiaomanForm.experienceAdds },
    duxiaomanForm.addsAfterFirstFill,
    "a second fill transaction must count existing Formily cards and remain idempotent"
  );
  assert.equal(duxiaomanForm.name, "林知夏");
  assert.equal(duxiaomanForm.gender, "女");
  assert.equal(duxiaomanForm.city, "南京");
  assert.deepEqual(duxiaomanForm.education, [
    { school: "南京大学", degree: "硕士", major: "城乡规划", dates: ["2024-09", "2027-06"] },
    { school: "北京林业大学", degree: "本科", major: "城乡规划", dates: ["2018-09", "2023-06"] },
    { school: "同济大学", degree: "本科", major: "城市规划", dates: ["2014-09", "2018-06"] }
  ]);
  const duxiaomanDateFields = duxiaomanForm.fill.finalFields.filter((field) => field.type === "date-range");
  assert.equal(duxiaomanDateFields.length, 6, "every deep Formily education, internship and project card must expose one date range");
  assert.equal(new Set(duxiaomanDateFields.map((field) => field.id)).size, 6, "deep Formily date ranges must keep collision-free identities after repeat expansion");
  assert.equal(duxiaomanForm.fill.finalFields.some((field) => field.identityCollision), false, "live Formily cards with reused inner ids must still receive unique OfferFlow identities");
  assert.deepEqual(
    duxiaomanForm.fill.finalFields.filter((field) => field.key === "school").map((field) => field.repeatIndex),
    [0, 1, 2],
    "three Formily education cards must keep independent structural indexes"
  );
  assert.deepEqual(
    duxiaomanForm.fill.finalFields.filter((field) => field.key === "experienceOrganization").map((field) => field.repeatIndex),
    [0, 1],
    "two Formily internship cards must keep independent structural indexes"
  );
  assert.deepEqual(duxiaomanForm.experience, [
    {
      company: "携程集团",
      title: "AI产品经理",
      dates: ["2026-04", ""],
      current: true,
      description: "负责 AI 产品对话体验与增长闭环"
    },
    {
      company: "南京开为网络科技有限公司",
      title: "产品部门 AI产品经理",
      dates: ["2025-11", "2026-03"],
      current: false,
      description: "负责 Agnes APP 对话体验与留存增长"
    }
  ], "Dewu internship ranges and descriptions must stay bound to their own Formily cards");
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

  const feishuRepeatForm = runFixture(feishuRepeatFormPath, 8000);
  assert.equal(feishuRepeatForm.scan.platform.id, "feishu-career", "Feishu's createFormSection/ATSX DOM must resolve to the Feishu Career adapter");
  assert.equal(feishuRepeatForm.scan.repeatersExpanded, true);
  assert.deepEqual(feishuRepeatForm.addClicks, { education: 1, internship: 2, project: 2 });
  assert.deepEqual(feishuRepeatForm.education, ["南京大学", "北京林业大学"]);
  assert.deepEqual(feishuRepeatForm.internships, ["携程集团", "南京开为网络科技有限公司"]);
  assert.deepEqual(feishuRepeatForm.internshipDetails, [
    { company: "携程集团", title: "AI产品经理", description: "携程集团：负责酒店业务 AI 产品体验" },
    { company: "南京开为网络科技有限公司", title: "产品部门 AI产品经理", description: "南京开为：负责 Agnes APP 对话与留存增长" }
  ], "every field in one Feishu internship card must stay bound to the same profile record across fill rounds");
  assert.deepEqual(feishuRepeatForm.projects, ["TripYoYo", "OfferFlow"]);
  assert.deepEqual(feishuRepeatForm.educationDates, [["2024", "09", "2027", "06"], ["2018", "09", "2023", "06"]]);
  assert.deepEqual(feishuRepeatForm.internshipDates, [["2026", "04", "2026", "08"], ["2025", "11", "2026", "03"]]);
  assert.deepEqual(feishuRepeatForm.projectDates, [["2026", "03", "至今", ""], ["2025", "01", "2025", "12"]]);
  assert.deepEqual(
    feishuRepeatForm.scan.fields.filter((field) => field.key === "experienceOrganization").map((field) => field.repeatIndex),
    [0, 1],
    "newly added internship cards must retain independent repeat indexes"
  );
  assert.deepEqual(
    feishuRepeatForm.scan.fields.filter((field) => field.key === "projectName").map((field) => field.repeatIndex),
    [0, 1],
    "newly added project cards must retain independent repeat indexes"
  );
  console.log("DOM form fixture passed: Feishu createFormSection div actions expand and fill initially empty internship/project sections.");

  const feishuEducationForm = runFixture(feishuEducationFormPath, 12000);
  assert.equal(feishuEducationForm.scan.platform.id, "feishu-career");
  assert.equal(
    feishuEducationForm.scan.fields.every((field) => field.key === "educationForm"),
    true,
    "学历类型 must map to educationForm before the broader 学历/degree rule"
  );
  assert.deepEqual(feishuEducationForm.selected, ["统招全日制", "统招非全日制", "自考", "海外及港澳台", "其他"]);
  assert.equal(feishuEducationForm.fill.results.every((result) => result.status === "filled"), true);
  assert.equal(feishuEducationForm.openDropdowns, 0);
  console.log("DOM form fixture passed: Feishu education-form aliases resolve to the tenant's shorter education-type enum.");

  const beisenRepeatForm = runFixture(beisenRepeatFormPath, 10000);
  assert.equal(beisenRepeatForm.scan.platform.id, "beisen", "zhiye/Phoenix controls must resolve the Beisen platform adapter");
  assert.equal(beisenRepeatForm.scan.repeatersExpanded, true);
  assert.equal(beisenRepeatForm.addClicks, 1, "Beisen's generated div addButton must create the second education record");
  assert.deepEqual(beisenRepeatForm.entries, [
    { school: "南京大学", start: "2024-09", end: "2027-06", major: "城乡规划", degree: "硕士研究生" },
    { school: "北京林业大学", start: "2018-09", end: "2023-06", major: "城乡规划", degree: "本科" }
  ]);
  assert.equal(beisenRepeatForm.openPopups, 0, "Phoenix date/select portals must be closed after every committed value");
  assert.equal(beisenRepeatForm.fill.results.every((result) => result.status === "filled"), true);
  console.log("DOM form fixture passed: Beisen generated education cards, Phoenix month pickers and selects fill independently.");

  const beisenExperienceKinds = runFixture(beisenExperienceKindsPath, 15000);
  assert.equal(beisenExperienceKinds.scan.platform.id, "beisen");
  assert.deepEqual(beisenExperienceKinds.addClicks, { internship: 1, work: 1 }, "Beisen must expand internship and work sections from their own plans");
  assert.deepEqual(beisenExperienceKinds.internship, [
    { organization: "携程集团", title: "AI产品经理实习生", start: "2026-04", end: "2026-08", description: "携程实习内容" },
    { organization: "南京开为网络科技有限公司", title: "AI产品经理实习生", start: "2025-11", end: "2026-03", description: "开为实习内容" }
  ]);
  assert.deepEqual(beisenExperienceKinds.work, [
    { organization: "云圣智能", title: "产品经理", start: "2024-01", end: "2025-06", description: "云圣工作职责" },
    { organization: "另一家正式公司", title: "高级产品经理", start: "2022-01", end: "2023-12", description: "正式工作职责" }
  ]);
  assert.equal(
    beisenExperienceKinds.scan.fields.filter((field) => field.repeatEntryKind === "internship").length,
    10,
    "each Beisen internship field must retain internship identity"
  );
  assert.equal(
    beisenExperienceKinds.scan.fields.filter((field) => field.repeatEntryKind === "work").length,
    10,
    "each Beisen work field must retain work identity"
  );
  assert.equal(beisenExperienceKinds.fill.results.every((result) => result.status === "filled"), true);
  console.log("DOM form fixture passed: Beisen internship/work sections expand, bind and fill from independent profile buckets.");

  const hotjobForm = runFixture(hotjobFormPath, 60000);
  assert.equal(hotjobForm.scan.platform.id, "hotjob", "hotjob.cn structure must resolve the Hotjob / Wecruit platform adapter");
  assert.equal(hotjobForm.scan.repeatersExpanded, true);
  assert.deepEqual(hotjobForm.addClicks, { education: 3, experience: 4, project: 4 });
  assert.equal(hotjobForm.gender, "男", "anonymous Ant v3 radios must remain scoped to their own group");
  assert.deepEqual(hotjobForm.location, ["江苏省", "南京"], "Hotjob's two-level location control must select province before city");
  assert.deepEqual(hotjobForm.basicEducationSummary, {
    values: ["南京大学", "2027-06-30", "城乡规划"],
    selects: ["硕士研究生", "硕士"]
  }, "education-summary fields in personal basic information must use the primary profile record without joining the education repeater");
  assert.equal(
    hotjobForm.scan.fields
      .filter((field) => field.section === "个人基本信息" && ["school", "major", "degree", "educationDegree"].includes(field.key))
      .every((field) => field.repeatGroup === undefined && field.repeatIndex === undefined),
    true,
    "personal basic information must not consume education repeat indexes"
  );
  assert.deepEqual(hotjobForm.education, [
    { values: ["2024-09-01", "2027-06-30", "南京大学", "建筑与城市规划学院", "城乡规划", "3.8"], selects: ["硕士研究生", "硕士", "全日制"] },
    { values: ["2018-09-01", "2023-06-30", "北京林业大学", "园林学院", "城乡规划", "3.6"], selects: ["本科", "学士", "全日制"] },
    { values: ["2014-09-01", "2018-06-30", "同济大学", "建筑与城市规划学院", "城市规划", "3.7"], selects: ["本科", "学士", "全日制"] },
    { values: ["2010-09-01", "2014-06-30", "东南大学", "建筑学院", "城乡规划", "3.5"], selects: ["本科", "学士", "全日制"] }
  ], "school modals, full-day calendars and Ant v3 selects must stay bound to each education record");
  assert.deepEqual(hotjobForm.experience, [
    { values: ["2026-04-01", "2026-08-31", "携程集团", "AI产品经理", "负责酒店业务 AI 产品体验"], selects: [] },
    { values: ["2025-11-01", "2026-03-31", "南京开为网络科技有限公司", "AI产品经理", "负责 Agnes APP 对话体验"], selects: [] },
    { values: ["2024-07-01", "2024-10-31", "第三段实践企业", "产品实习生", "负责第三段实践的用户研究"], selects: [] },
    { values: ["2023-03-01", "2023-08-31", "第四段实践企业", "产品助理", "负责第四段实践的需求分析"], selects: [] }
  ], "Hotjob's combined work/practice section must preserve the original profile experience order");
  assert.deepEqual(hotjobForm.project, [
    { values: ["2026-03-01", "2026-08-31", "TripYoYo", "企业级通用桌面智能体"], selects: [] },
    { values: ["2025-01-01", "2025-12-31", "OfferFlow", "招聘自动化平台"], selects: [] },
    { values: ["2024-02-01", "2024-07-31", "Project Three", "第三段项目描述"], selects: [] },
    { values: ["2023-01-01", "2023-06-30", "Project Four", "第四段项目描述"], selects: [] }
  ]);
  assert.deepEqual(
    hotjobForm.scan.fields.filter((field) => field.key === "experienceOrganization").map((field) => field.repeatIndex),
    [0, 1, 2, 3],
    "all Hotjob work/practice cards must retain their native entry indexes"
  );
  assert.equal(hotjobForm.openPortals, 0, "Hotjob popups must close after every committed value");
  assert.equal(hotjobForm.fill.results.every((result) => result.status === "filled"), true);
  console.log("DOM form fixture passed: Hotjob repeat cards, school modal, Ant v3 calendar/select/radio and location cascade fill correctly.");

  const pupumallForm = runFixture(pupumallFormPath, 12000);
  assert.equal(pupumallForm.scan.platform.id, "pupumall");
  assert.equal(pupumallForm.scan.platform.layer, "company");
  assert.equal(pupumallForm.scan.repeatersExpanded, false, "Pupumall scan must only open editor UI and leave record creation to fill");
  assert.equal(pupumallForm.name, "林知夏");
  assert.deepEqual(pupumallForm.state.adds, { education: 3, experience: 2 });
  assert.deepEqual(pupumallForm.state.saves, { education: 3, experience: 2 });
  assert.equal(pupumallForm.currentCity, "江苏省 / 南京市");
  assert.deepEqual(pupumallForm.education, [
    { value: "南京大学", dates: ["2024-09", "2027-06"] },
    { value: "北京林业大学", dates: ["2018-09", "2023-06"] },
    { value: "同济大学", dates: ["2014-09", "2018-06"] }
  ]);
  assert.deepEqual(pupumallForm.experience, [
    { value: "携程集团", dates: ["2026-04", "2026-08"] },
    { value: "南京开为网络科技有限公司", dates: ["2025-11", "2026-03"] }
  ]);
  assert.equal(pupumallForm.fill.results.every((result) => result.status === "filled"), true);
  console.log("DOM form fixture passed: Pupumall summary editors open, save and advance through repeated records exactly once.");

  const citicbankForm = runFixture(citicbankFormPath, 10000);
  assert.equal(citicbankForm.scan.platform.id, "citicbank", "job.citicbank.com must resolve CITIC Bank adapter");
  assert.equal(citicbankForm.name, "张三", "CITIC Bank a0101 must be filled with full name");
  assert.equal(citicbankForm.phone, "13800138000", "CITIC Bank a0118 must be filled with phone number");
  assert.equal(citicbankForm.gender, "1", "CITIC Bank a0102 selectpicker must select gender value");
  assert.equal(citicbankForm.height, "178", "CITIC Bank a0213 must be filled with height");
  assert.equal(citicbankForm.wayData["grjbxx.a0101"], "张三", "way.js grjbxx.a0101 must receive two-way bound name");
  assert.equal(citicbankForm.wayData["grjbxx.a0118"], "13800138000", "way.js grjbxx.a0118 must receive two-way bound phone");
  assert.equal(citicbankForm.wayData["grjbxx.a0102"], "1", "way.js grjbxx.a0102 must receive two-way bound gender");
  assert.equal(citicbankForm.addClicks, 1, "CITIC Bank +添加教育经历 must expand the second record");
  assert.deepEqual(citicbankForm.education, [
    { school: "南京大学", start: "2024-09-01", end: "2027-06-30" },
    { school: "北京林业大学", start: "2018-09-01", end: "2023-06-30" }
  ], "Microdone way-repeat education cards must be independently mapped and filled");
  assert.equal(citicbankForm.fill.results.every((result) => result.status === "filled"), true);
  console.log("DOM form fixture passed: CITIC Bank Microdone HR way.js binding, bootstrap-select and repeat education fill correctly.");

  const reinjectionForm = runFixture(reinjectionFormPath, 4000);
  assert.equal(reinjectionForm.listenerCount, 1, "reinjecting a new extension session must replace the stale listener");
  assert.equal(reinjectionForm.contentSession, "test-session-b");
  assert.equal(reinjectionForm.runtimeVersion, "2026-08-25.autofill-v28");
  assert.equal(reinjectionForm.fieldCount, 1, "the replacement listener must still scan the application form");
  console.log("DOM form fixture passed: extension reload replaces stale autofill listeners without duplicates.");
} finally {
  rmSync(profileDirectory, { recursive: true, force: true });
}
