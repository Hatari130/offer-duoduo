(() => {
  // Versioned, site-aware mapping library. Keep this file data-first so a new
  // ATS label can be added without changing the scanner or the AI prompt.
  const VERSION = "2026.08.21";
  const STORAGE_KEY = "offerflow.formMappingOverrides";

  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const normalize = (value) =>
    clean(value)
      .replace(/[＊*]/g, "")
      .replace(/请输入|请选择|点击选择|选择日期/gi, "")
      .replace(/[：:]/g, "")
      .replace(/\s+/g, "")
      .toLowerCase();

  const commonMappings = [
    ["fullName", "姓名|真实姓名|应聘者姓名|候选人姓名|申请人姓名|full.?name|applicant.?name"],
    ["nationality", "民族|国籍|nation|nationality"],
    ["phone", "手机号|手机号码|联系电话|电话号码|移动电话|电话|mobile|phone|telephone"],
    ["email", "邮箱|电子邮箱|电子邮件|邮件地址|e-?mail|email.?address"],
    ["idType", "证件类型|身份证类型|证件类别|id.?type|identity.?type"],
    ["idNumber", "证件号码|身份证号|身份证号码|证件编号|id.?number|identity.?number"],
    ["gender", "性别|gender|sex"],
    ["birthDate", "出生日期|出生年月|生日|出生年月日|birth.?date|date.?of.?birth"],
    ["wechat", "微信号|微信|wechat|weixin"],
    ["qq", "QQ号?|qq.?number"],
    ["politicalStatus", "政治面貌|政治身份|political.?status"],
    ["maritalStatus", "婚姻状况|婚姻|marital.?status"],
    ["graduationDate", "毕业时间|毕业日期|毕业年份|预计毕业|毕业年月|graduation|graduate.?date|graduate.?year"],
    ["currentCity", "现居城市|当前城市|所在城市|所在地点|所在地|居住地|现居地|current.?city|current.?location"],
    ["nativePlace", "籍贯|户籍|户口|户口所在地|家乡|生源地|native.?place|hometown"],
    ["height", "身高|身高（厘米）|身高\\(厘米\\)|height"],
    ["weight", "体重|体重（公斤）|体重\\(公斤\\)|weight"],
    ["recruitmentType", "是否统招|统招|统一招生|全日制统招|recruitment.?type|full.?time.?education"],
    ["graduateStatus", "应届.?往届|应届生|往届生|毕业身份|是否应届|graduate.?status|fresh.?graduate"],
    ["healthStatus", "健康状况|健康情况|身体状况|health.?status"],
    ["specialty", "特长|专长|specialty"],
    ["workYears", "工作年限|工作经验年限|工作经验|从业年限|work.?years?"],
    ["emergencyContactName", "紧急联系人姓名|紧急联系人名称|emergency.?contact.?name"],
    ["emergencyContactPhone", "紧急联系人电话|紧急联系人手机|emergency.?contact.?phone"],
    ["countryRegion", "国家/地区|国家或地区|国家地区|所在国家|country|region"],
    ["address", "详细地址|联系地址|通信地址|通讯地址|居住地址|现居住地|address|mailing.?address"],
    ["targetRole", "意向岗位|意向职位|期望职位|目标岗位|应聘职位|申请职位|职位名称|职位|工作职位|意向职位|target.?role|target.?position|desired.?position"],
    ["targetCities", "意向城市|期望城市|工作地点偏好|期望工作地点|期望工作城市|工作城市|preferred.?city|preferred.?location"],
    ["earliestStartDate", "预计入职时间|到岗时间|可入职时间|最早到岗|入职时间|available.?date"],
    ["expectedSalary", "期望薪资|期望工资|期望月薪|薪资要求|expected.?salary"],
    ["referralCode", "推荐码|邀请码|内推码|referral.?code"],
    ["portfolioUrl", "作品集|个人作品|作品链接|portfolio"],
    ["githubUrl", "github|代码仓库|开源地址|git.?hub"],
    ["school", "毕业院校|学校名称|就读学校|所在学校|学校|院校|毕业学校|university|college|school"],
    ["major", "专业名称|所学专业|主修专业|专业|major|field.?of.?study"],
    ["degree", "学历|学位|最高学历|教育程度|degree|education.?level"],
    ["gpa", "绩点|平均成绩|平均分|gpa|grade.?point"],
    ["selfIntroduction", "自我介绍|自我描述|个人简介|个人总结|自我评价|about.?you|self.?intro|profile"],
    ["strengths", "个人优势|核心优势|优势与不足|优点|strength|advantage"],
    ["careerPlan", "职业规划|未来规划|发展规划|职业目标|career.?plan|career.?goal"],
    ["hobbies", "兴趣爱好|兴趣|爱好|hobbies?"],
    ["politicalStatus", "政治面貌|政治身份|政治面貌（必填）|政治状况|党派"],
    ["maritalStatus", "婚姻状况|婚姻|已婚|未婚|离异|婚姻状况（必填）"],
    ["healthStatus", "健康状况|健康情况|身体状况|身体健康|健康（必填）"],
    ["idType", "证件类型|身份证类型|证件类别|id.?type|identity.?type|证件种类"],
    ["idNumber", "证件号码|身份证号|身份证号码|证件编号|id.?number|identity.?number|证件号"],
    ["nativePlace", "籍贯|户籍|户口|户口所在地|生源地|家乡|原籍|_native_place"],
    ["currentCity", "现居城市|当前城市|所在城市|所在地点|所在地|居住地|现居地|居住城市|现住址"],
    ["phone", "手机号|手机号码|联系电话|电话号码|移动电话|电话|mobile|phone|telephone|联系手机"],
    ["email", "邮箱|电子邮箱|电子邮件|邮件地址|e-?mail|email.?address|联系邮箱"],
    ["birthDate", "出生日期|出生年月|生日|出生年月日|birth.?date|date.?of.?birth|出生时间"],
    ["gender", "性别|gender|sex|男|女"],
    ["nationality", "民族|国籍|nation|nationality|族群"],
    ["wechat", "微信号|微信|wechat|weixin|微信账号"],
    ["qq", "QQ号?|qq.?number|QQ|腾讯QQ"],
    ["height", "身高|身高（厘米）|身高\\(厘米\\)|height| stature"],
    ["weight", "体重|体重（公斤）|体重\\(公斤\\)|weight|体重（kg）"],
    ["graduationDate", "毕业时间|毕业日期|毕业年份|预计毕业|毕业年月|graduation|graduate.?date|graduate.?year|离校时间"],
    ["recruitmentType", "是否统招|统招|统一招生|全日制统招|recruitment.?type|full.?time.?education|招生类型"],
    ["graduateStatus", "应届.?往届|应届生|往届生|毕业身份|是否应届|graduate.?status|fresh.?graduate|毕业生身份"],
    ["workYears", "工作年限|工作经验年限|工作经验|从业年限|work.?years?|工龄"],
    ["expectedSalary", "期望薪资|期望工资|期望月薪|薪资要求|expected.?salary|年薪要求|税前"],
    ["targetRole", "意向岗位|意向职位|期望职位|目标岗位|应聘职位|申请职位|职位名称|职位|工作职位|意向职位|target.?role|target.?position|desired.?position|求职意向"],
    ["targetCities", "意向城市|期望城市|工作地点偏好|期望工作地点|期望工作城市|工作城市|preferred.?city|preferred.?location|期望工作地区"],
    ["earliestStartDate", "预计入职时间|到岗时间|可入职时间|最早到岗|入职时间|available.?date|报到时间"],
    ["referralCode", "推荐码|邀请码|内推码|referral.?code|内推编号"],
    ["portfolioUrl", "作品集|个人作品|作品链接|portfolio|作品网址"],
    ["githubUrl", "github|代码仓库|开源地址|git.?hub|代码地址"],
    ["school", "毕业院校|学校名称|就读学校|所在学校|学校|院校|毕业学校|university|college|school|学校全称"],
    ["major", "专业名称|所学专业|主修专业|专业|major|field.?of.?study|专业方向"],
    ["degree", "学历|学位|最高学历|教育程度|degree|education.?level|最高学位"],
    ["address", "详细地址|联系地址|通信地址|通讯地址|居住地址|现居住地|address|mailing.?address|家庭地址"],
    ["emergencyContactName", "紧急联系人姓名|紧急联系人名称|emergency.?contact.?name|紧急联系人"],
    ["emergencyContactPhone", "紧急联系人电话|紧急联系人手机|emergency.?contact.?phone|紧急联系人手机"],
    ["countryRegion", "国家/地区|国家或地区|国家地区|所在国家|country|region|国籍地区"],
    ["specialty", "特长|专长|specialty|专业技能"],
    ["hobbies", "兴趣爱好|兴趣|爱好|hobbies?|个人爱好"]
  ];

  const adapters = [
    {
      id: "beisen",
      name: "北森 Beisen",
      hosts: [/\.zhiye\.com$/i, /(^|\.)beisen\.com$/i, /beisen/i],
      markers: ["[data-nc-label]", "[data-nc-cls]", ".phoenix-radio-group", ".phoenix-select"],
      mappings: [
        ["fullName", "姓名|真实姓名|候选人姓名|申请人姓名|应聘者姓名|full.?name|applicant.?name|姓名（必填）"],
        ["phone", "手机号码|手机号|联系电话|联系电话（必填）|联系手机"],
        ["email", "邮箱|电子邮箱|电子邮件|联系邮箱"],
        ["gender", "性别|男|女"],
        ["birthDate", "出生日期|出生年月|出生时间"],
        ["idType", "证件类型|身份证类型"],
        ["idNumber", "证件号码|身份证号|证件编号"],
        ["nationality", "民族"],
        ["politicalStatus", "政治面貌"],
        ["maritalStatus", "婚姻状况"],
        ["healthStatus", "健康状况"],
        ["school", "学校名称|毕业院校|学校全称"],
        ["major", "专业名称|所学专业|专业方向"],
        ["degree", "学历|学位|最高学历|最高学位"],
        ["graduationDate", "毕业时间|毕业日期|离校时间"],
        ["recruitmentType", "是否统招|统招|招生类型"],
        ["graduateStatus", "应届.?往届|应届生|往届生|毕业生身份"],
        ["nativePlace", "籍贯|户籍|原籍"],
        ["currentCity", "现居城市|居住地|居住城市"],
        ["height", "身高"],
        ["weight", "体重"],
        ["wechat", "微信号|微信"],
        ["qq", "QQ号?|QQ"],
        ["workYears", "工作经验|工作年限"],
        ["expectedSalary", "期望薪资|期望月薪"],
        ["targetRole", "应聘职位|申请职位|意向职位|求职意向"],
        ["targetCities", "期望工作地点|期望工作城市|期望工作地区"],
        ["earliestStartDate", "预计入职时间|到岗时间|报到时间"],
        ["selfIntroduction", "自我介绍|个人简介|自我评价"],
        ["address", "详细地址|家庭地址"],
        ["emergencyContactName", "紧急联系人姓名|紧急联系人"],
        ["emergencyContactPhone", "紧急联系人电话|紧急联系人手机"],
        ["countryRegion", "国家/地区|所在国家"],
        ["specialty", "特长|专业技能"],
        ["hobbies", "兴趣爱好|个人爱好"]
      ]
    },
    {
      id: "moka",
      name: "Moka",
      hosts: [/\.mokahr\.com$/i, /(^|\.)moka\.com$/i, /moka/i],
      markers: ["[data-nav-id]", "[class*='sd-Select-container-']", "[class*='apply-field-']", "[data-field]", "[data-question]"],
      mappings: [
        ["fullName", "姓名|真实姓名|申请人"],
        ["phone", "手机号|手机号码|联系电话"],
        ["email", "邮箱|电子邮箱|email"],
        ["gender", "性别"],
        ["birthDate", "出生日期|出生年月"],
        ["idType", "证件类型"],
        ["idNumber", "证件号码"],
        ["workYears", "工作经验|工作年限"],
        ["currentCity", "所在地|现居城市|当前城市"],
        ["expectedSalary", "期望薪资"],
        ["targetRole", "应聘职位|申请职位|意向职位"],
        ["targetCities", "期望工作地点|工作地点|意向城市"],
        ["school", "学校|毕业院校|教育经历"],
        ["major", "专业|主修专业"],
        ["degree", "学历|最高学历"],
        ["selfIntroduction", "自我介绍|自我描述|个人简介|自我评价"]
      ]
    },
    {
      id: "nowcoder",
      name: "牛客",
      hosts: [/\.nowcoder\.com$/i, /nowcoder/i],
      markers: ["[class*='resume']", "[class*='apply']", "[class*='job']"],
      mappings: [
        ["fullName", "姓名|真实姓名|候选人姓名"],
        ["phone", "手机号|手机号码|联系电话"],
        ["email", "邮箱|电子邮箱|邮件"],
        ["nationality", "民族|国籍"],
        ["idType", "证件类型|身份证类型"],
        ["idNumber", "证件号码|身份证号|证件编号"],
        ["gender", "性别"],
        ["birthDate", "出生日期|出生年月"],
        ["wechat", "微信号|微信"],
        ["qq", "QQ号?|QQ"],
        ["politicalStatus", "政治面貌"],
        ["maritalStatus", "婚姻状况"],
        ["healthStatus", "健康状况"],
        ["specialty", "特长"],
        ["workYears", "工作年限"],
        ["emergencyContactName", "紧急联系人姓名"],
        ["emergencyContactPhone", "紧急联系人电话"],
        ["countryRegion", "国家/地区|国家或地区"],
        ["address", "通信地址|通讯地址|详细地址"],
        ["school", "学校|毕业院校|教育背景"],
        ["major", "专业|所学专业"],
        ["degree", "学历|最高学历"],
        ["graduationDate", "毕业时间|毕业年份"],
        ["targetRole", "应聘职位|意向岗位"],
        ["targetCities", "期望城市|工作地点"],
        ["earliestStartDate", "预计入职时间|到岗时间"],
        ["expectedSalary", "期望薪资|期望月薪"],
        ["selfIntroduction", "自我介绍|个人优势"]
      ]
    },
    {
      id: "tencent",
      name: "腾讯招聘",
      hosts: [/join\.qq\.com$/i, /(^|\.)tencent\.com$/i, /(^|\.)qq\.com$/i, /tencent/i],
      markers: ["[class*='resume']", "[class*='apply']", "[class*='candidate']"],
      mappings: [
        ["fullName", "姓名|真实姓名"],
        ["phone", "手机|手机号码|联系电话"],
        ["email", "邮箱|电子邮件"],
        ["gender", "性别"],
        ["birthDate", "出生日期|出生年月"],
        ["school", "毕业院校|学校名称|学校"],
        ["major", "专业名称|所学专业|专业"],
        ["degree", "学历|学位|最高学历"],
        ["graduationDate", "毕业时间|毕业年份"],
        ["targetRole", "应聘职位|申请职位|意向岗位"],
        ["targetCities", "期望工作城市|工作地点|意向城市"],
        ["selfIntroduction", "自我介绍|个人简介"]
      ]
    },
    {
      id: "xiaomi",
      name: "小米招聘",
      hosts: [/\.mioffice\.cn$/i],
      markers: ["[class*='resume']", "[class*='apply']", "[class*='experience']"],
      mappings: []
    },
    {
      id: "feishu-career",
      name: "飞书招聘 ATSX",
      // ATSX uses a tenant-owned career domain. Keep known tenants here so
      // their Formily/Universe controls never depend on generic detection.
      hosts: [/^campus\.duxiaoman\.com$/i, /^campus\.dewu\.com$/i],
      markers: [".ud-formily-item", ".ud__select", ".throne-biz-date-range-picker-wrapper"],
      mappings: [
        ["fullName", "姓名|name"],
        ["email", "邮箱|email"],
        ["gender", "性别|gender"],
        ["targetCities", "期望工作地点|preferred.?city"],
        ["nationality", "国籍（地区）|国籍|nationality"],
        ["currentCity", "所在地点|现居地点|current.?city"],
        ["school", "学校名称|school"],
        ["degree", "学历|degree"],
        ["major", "专业|field.?of.?study"]
      ]
    },
    {
      id: "generic",
      name: "通用表单",
      hosts: [],
      markers: [],
      mappings: []
    }
  ];

  const compiled = (mapping) => mapping.map(([key, pattern]) => ({
    key,
    pattern: new RegExp(pattern, "i")
  }));

  adapters.forEach((adapter) => {
    adapter.compiled = (
      compiled(adapter.mappings || [])
        .map((m) => ({ ...m, isAdapterRule: true }))
        .concat(compiled(commonMappings))
    );
  });

  const overrides = new Map();
  const applyOverrides = (payload) => {
    if (!payload || typeof payload !== "object") return;
    Object.entries(payload).forEach(([adapterId, entries]) => {
      if (!Array.isArray(entries)) return;
      const adapter = adapters.find((item) => item.id === adapterId);
      if (!adapter) return;
      const valid = entries.filter((entry) => entry && entry.key && entry.pattern);
      if (!valid.length) return;
      const extra = valid.map((entry) => ({ key: String(entry.key), pattern: new RegExp(String(entry.pattern), "i") }));
      overrides.set(adapterId, extra);
    });
  };

  const loadStoredOverrides = async () => {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        applyOverrides(result?.[STORAGE_KEY]);
      }
    } catch {
      // Built-in mappings remain available if storage is unavailable.
    }
  };

  const resolve = (locationLike = window.location) => {
    const host = String(locationLike.hostname || "").toLowerCase();
    const pathname = String(locationLike.pathname || "");
    const found = adapters.find((adapter) =>
      adapter.hosts.some((pattern) => pattern.test(host))
    );
    if (found) return found;
    // Some Tencent pages are hosted by a CDN/custom domain. DOM markers are a
    // safe secondary signal when the page title or body explicitly says腾讯.
    const bodyText = clean(document.body?.innerText || "").slice(0, 1600);
    if (/腾讯招聘|Tencent Careers/i.test(`${document.title} ${bodyText}`)) {
      return adapters.find((adapter) => adapter.id === "tencent");
    }
    if (
      document.querySelector("[data-nav-id='block-basicInfo'],[data-nav-id='block-educationInfo']") &&
      document.querySelector("[class*='sd-Select-container-'],[class*='apply-field-']")
    ) {
      return adapters.find((adapter) => adapter.id === "moka");
    }
    if (
      document.querySelector(".ud-formily-item [data-form-field-id],.ud-formily-item [data-form-field-name]") &&
      document.querySelector(".ud__select,.throne-biz-date-range-picker-wrapper")
    ) {
      return adapters.find((adapter) => adapter.id === "feishu-career");
    }
    return adapters.find((adapter) => adapter.id === "generic") || { id: "generic", name: "通用表单", markers: [], compiled: [] };
  };

  const match = (element, label, adapter = resolve()) => {
    // First check adapter-specific mappings (higher priority)
    const adapterCandidates = adapter.compiled?.filter((c) => c.isAdapterRule);
    const commonCandidates = adapter.compiled?.filter((c) => !c.isAdapterRule);

    const attributes = element
      ? [
          "name", "id", "placeholder", "aria-label", "data-nc-label", "data-field", "data-question",
          "data-form-field-id", "data-form-field-name", "data-form-field-i18n-name"
        ]
          .map((name) => element.getAttribute?.(name) || "")
          .filter(Boolean)
      : [];
    const text = normalize([label, ...attributes].join(" "));

    // Check adapter rules first (confidence 0.96)
    for (const rule of adapterCandidates || []) {
      if (rule.pattern.test(text)) {
        return {
          key: rule.key,
          confidence: 0.96,
          source: "rules",
          evidence: [`${adapter.name} 字段映射库`, `匹配标签：${clean(label).slice(0, 60)}`]
        };
      }
    }

    // Fall back to common rules (confidence 0.86)
    for (const rule of commonCandidates || []) {
      if (rule.pattern.test(text)) {
        return {
          key: rule.key,
          confidence: 0.86,
          source: "rules",
          evidence: [`${adapter.name} 字段映射库`, `匹配标签：${clean(label).slice(0, 60)}`]
        };
      }
    }

    return undefined;
  };

  window.OfferFlowFormAdapters = {
    version: VERSION,
    storageKey: STORAGE_KEY,
    adapters,
    ready: loadStoredOverrides(),
    resolve,
    match,
    applyOverrides,
    loadStoredOverrides
  };
})();
