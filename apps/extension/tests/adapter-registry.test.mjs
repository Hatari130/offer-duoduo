import assert from "node:assert/strict";
import test from "node:test";

const documentStub = {
  title: "",
  body: { innerText: "" },
  querySelector: () => null
};
let lastStoredPayload;
globalThis.window = globalThis;
globalThis.document = documentStub;
globalThis.location = { hostname: "example.test", pathname: "/apply" };
globalThis.chrome = {
  storage: {
    local: {
      get: async () => ({}),
      set: async (payload) => {
        lastStoredPayload = payload;
      }
    }
  }
};

await import("../public/adapter-registry.js");
await import("../public/extraction-rules.js");
await import("../public/form-adapters.js");

const registry = globalThis.OfferFlowAdapterRegistry;
const formAdapters = globalThis.OfferFlowFormAdapters;
await Promise.all([registry.ready, formAdapters.ready]);

const locationLike = (hostname, pathname = "/apply") => ({ hostname, pathname });
const element = (attributes = {}) => ({
  getAttribute: (name) => attributes[name] || ""
});

test("unknown hosts resolve to the generic fallback", () => {
  const route = registry.resolve({ location: locationLike("unseen-company.example"), document: documentStub });
  assert.equal(route.layer, "generic");
  assert.equal(route.platformId, "generic");
  assert.equal(route.formAdapterId, "generic");
  assert.deepEqual(route.chain, ["generic"]);
});

test("generic job/apply class names do not impersonate a known ATS", () => {
  const genericLookingDocument = {
    ...documentStub,
    querySelector(selector) {
      return selector.includes("[class*='job']") || selector.includes("[class*='apply']") ? {} : null;
    }
  };
  const route = registry.resolve({
    location: locationLike("careers.unknown-company.test"),
    document: genericLookingDocument
  });
  assert.equal(route.layer, "generic");
  assert.equal(route.platformId, "generic");
});

test("one generic data-field marker is not enough to impersonate Moka", () => {
  const oneMarkerDocument = {
    ...documentStub,
    querySelector: (selector) => selector === "[data-field]" ? {} : null
  };
  const route = registry.resolve({
    location: locationLike("careers.unknown-company.test"),
    document: oneMarkerDocument
  });
  assert.equal(route.platformId, "generic");
});

test("multiple Moka-specific markers identify a custom-domain tenant", () => {
  const mokaDocument = {
    ...documentStub,
    querySelector: (selector) => ["[data-nav-id]", "[class*='sd-Select-container-']"].includes(selector) ? {} : null
  };
  const route = registry.resolve({
    location: locationLike("campus.custom-domain.test"),
    document: mokaDocument
  });
  assert.equal(route.layer, "platform");
  assert.equal(route.platformId, "moka");
});

test("an unseen Feishu tenant immediately inherits the Feishu platform", () => {
  const route = registry.resolve({ location: locationLike("brand-new.jobs.feishu.cn"), document: documentStub });
  assert.equal(route.layer, "platform");
  assert.equal(route.companyId, undefined);
  assert.equal(route.platformId, "feishu");
  assert.equal(route.formAdapterId, "feishu-career");
  assert.equal(route.extractionAdapterId, "feishu-jobs");
  assert.deepEqual(route.chain, ["feishu", "generic"]);
  const adapter = formAdapters.resolve(locationLike("brand-new.jobs.feishu.cn", "/resume/example/apply"));
  assert.equal(formAdapters.match(element(), "学历类型", adapter)?.key, "educationForm");
});

test("Hotjob tenants route to the shared Wecruit platform layer", () => {
  const adapter = formAdapters.resolve(locationLike("wecruit.hotjob.cn", "/tenant/pb/resumeOperation.html"));
  assert.equal(adapter.route.layer, "platform");
  assert.equal(adapter.route.platformId, "hotjob");
  assert.equal(adapter.route.formAdapterId, "hotjob");
  assert.equal(formAdapters.match(element(), "企业名称", adapter)?.key, "experienceOrganization");
});

test("Beisen tenants inherit internship and work field aliases", () => {
  const adapter = formAdapters.resolve(locationLike("ikingtec.zhiye.com", "/form"));
  assert.equal(adapter.route.platformId, "beisen");
  assert.equal(formAdapters.match(element(), "单位名称", adapter)?.key, "experienceOrganization");
  assert.equal(formAdapters.match(element(), "职位名称", adapter)?.key, "experienceTitle");
  assert.equal(formAdapters.match(element(), "实习内容", adapter)?.key, "experienceDescription");
  assert.equal(formAdapters.match(element(), "工作职责", adapter)?.key, "experienceDescription");
});

test("a company overlay inherits its base ATS and stays the most specific layer", () => {
  const route = registry.resolve({ location: locationLike("campus.duxiaoman.com"), document: documentStub });
  assert.equal(route.layer, "company");
  assert.equal(route.companyId, "duxiaoman");
  assert.equal(route.platformId, "feishu");
  assert.equal(route.formAdapterId, "feishu-career");
  assert.deepEqual(route.chain, ["duxiaoman", "feishu", "generic"]);
});

test("a company-owned recruitment system stays in the company layer", () => {
  const route = registry.resolve({ location: locationLike("campus.jd.com"), document: documentStub });
  assert.equal(route.layer, "company");
  assert.equal(route.companyId, "jd");
  assert.equal(route.platformId, "generic");
  assert.equal(route.extractionAdapterId, "jd");
  assert.deepEqual(route.chain, ["jd", "generic"]);
});

test("Pupumall routes to its archived company form adapter", () => {
  const adapter = formAdapters.resolve(locationLike(
    "jobs.pupumall.net",
    "/recruit-webapp/candidate/school/deliverySchoolResume"
  ));
  assert.equal(adapter.route.layer, "company");
  assert.equal(adapter.route.companyId, "pupumall");
  assert.equal(adapter.route.platformId, "generic");
  assert.equal(adapter.id, "pupumall");
  assert.equal(formAdapters.match(element({ id: "schoolName" }), "毕业院校", adapter)?.key, "school");
  assert.equal(formAdapters.match(element({ id: "enrollmentTime" }), "在读时间", adapter)?.key, "educationStartDate");
  assert.equal(formAdapters.match(element({ id: "companyName" }), "企业名称", adapter)?.key, "experienceOrganization");
});

test("archived company rules override their platform and generic mappings", () => {
  registry.applyOverrides({
    companies: {
      "acme-campus": {
        name: "Acme Campus",
        hosts: ["^apply\\.acme\\.test$"],
        basePlatformId: "beisen",
        formAdapterId: "beisen",
        mappings: [{ key: "referralCode", pattern: "内部候选码" }]
      }
    }
  });
  const adapter = formAdapters.resolve(locationLike("apply.acme.test"));
  assert.equal(adapter.route.layer, "company");
  assert.equal(adapter.route.companyId, "acme-campus");
  assert.equal(adapter.route.platformId, "beisen");
  assert.equal(formAdapters.match(element(), "内部候选码", adapter)?.key, "referralCode");
});

test("legacy platform overrides are applied before built-in mappings", () => {
  registry.applyOverrides({
    "feishu-career": [{ key: "githubUrl", pattern: "邮箱" }]
  });
  const adapter = formAdapters.resolve(locationLike("another.jobs.feishu.cn"));
  const match = formAdapters.match(element(), "邮箱", adapter);
  assert.equal(match?.key, "githubUrl");
  assert.match(match?.evidence?.[0] || "", /platform 规则：feishu/);
});

test("company archives are stored in the versioned structured format", async () => {
  await registry.saveOverrides({
    companies: {
      "stored-company": {
        hosts: [/^jobs\.stored-company\.test$/i],
        basePlatformId: "moka"
      }
    }
  });
  const stored = lastStoredPayload?.[registry.storageKey];
  assert.equal(stored?.schemaVersion, 1);
  assert.equal(stored?.companies?.["stored-company"]?.basePlatformId, "moka");
  assert.deepEqual(stored?.companies?.["stored-company"]?.hosts, ["^jobs\\.stored-company\\.test$"]);
});

test("CITIC Bank routes to its company form adapter and matches Microdone fields", () => {
  const adapter = formAdapters.resolve(locationLike("job.citicbank.com", "/CustStyle/zpmhys/addSchoolResume4.html"));
  assert.equal(adapter.route.layer, "company");
  assert.equal(adapter.route.companyId, "citicbank");
  assert.equal(adapter.id, "citicbank");
  assert.equal(formAdapters.match(element({ id: "a0101", name: "a0101", "way-data": "grjbxx.a0101" }), "姓名", adapter)?.key, "fullName");
  assert.equal(formAdapters.match(element({ id: "a0118", name: "a0118", "way-data": "grjbxx.a0118" }), "移动电话", adapter)?.key, "phone");
  assert.equal(formAdapters.match(element({ id: "a0102", name: "a0102" }), "性别", adapter)?.key, "gender");
  assert.equal(formAdapters.match(element({ id: "a0213", name: "a0213" }), "身高", adapter)?.key, "height");
  assert.equal(formAdapters.match(element({ id: "jyjlbyyx0", name: "byyx", "way-data": "jyjl.byyx" }), "毕业院校", adapter)?.key, "school");
  assert.equal(formAdapters.match(element({ name: "rxsj", "way-data": "jyjl.rxsj" }), "入学时间", adapter)?.key, "educationStartDate");
  assert.equal(formAdapters.match(element({ name: "bysj", "way-data": "jyjl.bysj" }), "毕业时间", adapter)?.key, "educationEndDate");
  assert.equal(formAdapters.match(element({ name: "rzsj", "way-data": "sxjl.rzsj" }), "入职时间", adapter)?.key, "experienceStartDate");
  assert.equal(formAdapters.match(element({ name: "lzsj", "way-data": "sxjl.lzsj" }), "离职时间", adapter)?.key, "experienceEndDate");
  assert.equal(formAdapters.match(element({ name: "gzdw", "way-data": "sxjl.gzdw" }), "单位名称", adapter)?.key, "experienceOrganization");
});
