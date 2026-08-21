(() => {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

  const statusPrefixPattern = /^(?:(?:应聘|申请|投递|招聘|流程|当前)状态)\s*[：:]?\s*/i;
  const terminalPattern = /不通过|未通过|不合适|淘汰|流程终止|流程结束|已结束|拒绝|未录用|已撤回/i;
  const processOnlyPattern = /^(?:(?:简历|网申|在线|AI|人才|资格|视频|业务|主管|薪酬|录用|Offer)?(?:投递|提交|筛选|初筛|复筛|评估|审核|测评|笔试|面试|一面|二面|三面|HR面|群面|终面|沟通|背调|背景调查|体检|签约|审批|发放|意向书|Offer评估|Offer|录用|入职)(?:简历|申请)?(?:中|完成|通过|不通过|结果|待定)?|等待.{0,10}(?:筛选|评估|审核|面试|笔试|测评|背调|体检|审批|结果)|待(?:筛选|评估|审核|面试|笔试|测评|背调|体检|签约|审批|入职)|未通过|不合适|淘汰|流程终止|已结束|拒绝|未录用|已撤回)$/i;
  const processCombinationPattern = /^(?:AI面试|简历投递|投递简历|提交简历|简历初筛|简历筛选|简历复筛|简历评估|简历审核|资格审核|在线测评|人才测评|Offer评估)(?:中|完成|通过|不通过|结果)?$/i;
  const nonPositionPattern = /^(?:职位|岗位|职位名称|岗位名称|所属部门|申请日期|申请编号|投递时间|申请时间|工作地点|城市|状态|详情|操作|刷新活跃度|网申投递|专场招聘会投递|我的简历|首页|应聘记录|投递记录|申请记录|我的申请|校园招聘|社会招聘|实习生招聘|招聘门户|招聘首页|编辑|返回|没有更多了|登录|注册|暂存投递)$/i;
  const metadataPattern = /^(?:20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?|\d{8,16}|[A-Z]\d{5,})$/i;
  const campaignPattern = /(?:校园招聘|社会招聘|实习生招聘|招聘官网|招聘平台|招聘门户|招聘首页|招聘计划|实习生计划|管培计划|专项计划|专场招聘|招聘项目|\d{4}届(?:实习生|应届生|校招生)|JD\s*YOUNG)/i;

  const strongOccupationPatterns = [
    /产品经理/i,
    /项目经理/i,
    /工程师/i,
    /设计师/i,
    /架构师/i,
    /分析师/i,
    /研究员/i,
    /科学家/i,
    /算法/i,
    /开发/i,
    /测试/i,
    /运营/i,
    /销售/i,
    /市场/i,
    /顾问/i,
    /管培生/i,
    /实习生/i,
    /专员/i,
    /主管/i,
    /总监/i,
    /HRBP/i,
    /财务/i,
    /法务/i,
    /审计/i,
    /采购/i,
    /供应链/i,
    /商务/i,
    /策划/i,
    /编辑/i,
    /翻译/i,
    /教师/i,
    /讲师/i,
    /医生/i
  ];

  const weakOccupationPatterns = [
    /经理/i,
    /助理/i,
    /技术/i,
    /研发/i,
    /数据/i,
    /安全/i,
    /风控/i,
    /职能/i,
    /客服/i,
    /行政/i,
    /人力/i,
    /品牌/i,
    /内容/i
  ];

  const platformAdapters = [
    {
      id: "feishu-jobs",
      hostPattern: /(?:^|\.)jobs\.feishu\.cn$/i,
      defaultCompany: "",
      positionSelectors: [
        '[class*="position-title"]',
        '[class*="positionTitle"]',
        '[class*="position-name"]',
        '[class*="positionName"]',
        '[class*="job-title"]',
        '[class*="jobTitle"]',
        "h1",
        "h2",
        "h3",
        "h4"
      ],
      cardSelectors: [
        '[class*="application-item"]',
        '[class*="applicationItem"]',
        '[class*="position-item"]',
        '[class*="positionItem"]',
        '[class*="job-card"]',
        '[class*="jobCard"]'
      ],
      sectionCompany: false,
      numericApplicationIds: false
    },
    {
      id: "jd",
      hostPattern: /(?:^|\.)jd\.com$/i,
      defaultCompany: "京东",
      positionSelectors: [
        'a[href*="job"]',
        '[class*="job-title"]',
        '[class*="jobTitle"]',
        '[class*="job-name"]',
        '[class*="jobName"]',
        '[class*="position"]'
      ],
      cardSelectors: [
        '[class*="delivery"]',
        '[class*="application"]',
        '[class*="apply-item"]',
        '[class*="progress-item"]'
      ],
      sectionCompany: false,
      numericApplicationIds: true
    },
    {
      id: "alibaba",
      hostPattern: /(?:^|\.)(?:alibaba|aliyun|aliwork|alibabacloud)\.(?:com|cn)$/i,
      defaultCompany: "阿里巴巴",
      positionSelectors: [
        'a[href*="job"]',
        'a[href*="position"]',
        '[class*="position"] a',
        '[class*="job"] a',
        '[class*="job-title"]',
        '[class*="jobTitle"]'
      ],
      cardSelectors: [
        "tr",
        '[class*="application"]',
        '[class*="apply-item"]',
        '[class*="delivery"]'
      ],
      sectionCompany: true,
      numericApplicationIds: true
    },
    {
      id: "baidu",
      hostPattern: /(?:^|\.)baidu\.com$/i,
      defaultCompany: "百度",
      positionSelectors: [
        "h1",
        "h2",
        "h3",
        '[class*="position"]',
        '[class*="job-title"]',
        '[class*="jobTitle"]'
      ],
      cardSelectors: [
        '[class*="application"]',
        '[class*="apply-item"]',
        '[class*="job-card"]',
        '[class*="progress"]'
      ],
      sectionCompany: false,
      numericApplicationIds: false
    },
    {
      id: "zhiye",
      hostPattern: /(?:^|\.)zhiye\.com$/i,
      defaultCompany: "",
      positionSelectors: [
        '[class*="job_name"]',
        '[class*="job-name"]',
        '[class*="jobTitle"]',
        '[class*="position"]',
        'a[href*="job"]',
        'a[href*="position"]',
        'a[href*="detail"]'
      ],
      cardSelectors: [
        '[class*="delivery-list-item"]',
        '[class*="delivery-list"]',
        '[class*="apply-item"]',
        '[class*="application"]'
      ],
      sectionCompany: false,
      numericApplicationIds: false
    }
  ];

  const genericAdapter = {
    id: "generic",
    defaultCompany: "",
    positionSelectors: [
      'a[href*="job"]',
      'a[href*="position"]',
      "h1",
      "h2",
      "h3",
      "h4",
      '[class*="job-title"]',
      '[class*="jobTitle"]',
      '[class*="position"]'
    ],
    cardSelectors: [
      "tr",
      '[class*="application"]',
      '[class*="apply-item"]',
      '[class*="delivery"]',
      '[class*="job-card"]'
    ],
    sectionCompany: true,
    numericApplicationIds: false
  };

  const stageTextValue = (value) => clean(value).replace(statusPrefixPattern, "");

  const occupationScore = (value) => {
    const text = clean(value);
    if (!text) return 0;
    const strongMatches = strongOccupationPatterns.filter((pattern) => pattern.test(text)).length;
    const weakMatches = weakOccupationPatterns.filter((pattern) => pattern.test(text)).length;
    return strongMatches * 3 + weakMatches;
  };

  const isProcessText = (value) => {
    const text = stageTextValue(value);
    if (!text || text.length > 40) return false;
    if (terminalPattern.test(text)) return true;
    if (processOnlyPattern.test(text) || processCombinationPattern.test(text)) return true;
    const processWord = /投递|筛选|初筛|复筛|评估|审核|测评|笔试|面试|群面|沟通|背调|背景调查|体检|签约|审批|发放|意向书|Offer|录用|入职/i.test(text);
    return processWord && occupationScore(text) === 0 && text.length <= 16;
  };

  const classifyText = (value) => {
    const text = clean(value);
    if (!text) return "empty";
    if (nonPositionPattern.test(text)) return "label";
    if (metadataPattern.test(text)) return "metadata";
    if (isProcessText(text)) return "process";
    const roleScore = occupationScore(text);
    if (campaignPattern.test(text) && roleScore <= 3) return "campaign";
    if (roleScore >= 3) return "occupation";
    return "unknown";
  };

  const isHardRejectedPosition = (value) => {
    const category = classifyText(value);
    return ["empty", "label", "metadata", "process", "campaign"].includes(category);
  };

  const isLikelyPosition = (value, allowUnknown = false) => {
    const text = clean(value);
    if (text.length < 2 || text.length > 80 || isHardRejectedPosition(text)) return false;
    return classifyText(text) === "occupation" || allowUnknown;
  };

  const normalizePosition = (value) =>
    clean(value)
      .replace(/[（(]?\b[A-Z]\d{5,}\b[）)]?/gi, "")
      .replace(/[\s\-—_｜|（）()【】\[\]]/g, "")
      .toLowerCase();

  const getAdapter = (hostname) =>
    platformAdapters.find((adapter) => adapter.hostPattern.test(clean(hostname))) || genericAdapter;

  const extractApplicationId = (value, adapter = genericAdapter) => {
    const text = clean(value);
    const alphaNumeric = text.match(/\b[A-Z]\d{5,}\b/i)?.[0];
    if (alphaNumeric) return alphaNumeric;
    if (adapter.numericApplicationIds) return text.match(/\b\d{10,16}\b/)?.[0];
    return undefined;
  };

  const api = Object.freeze({
    campaignPattern,
    classifyText,
    clean,
    extractApplicationId,
    genericAdapter,
    getAdapter,
    isHardRejectedPosition,
    isLikelyPosition,
    isProcessText,
    normalizePosition,
    occupationScore,
    platformAdapters,
    stageTextValue,
    statusPrefixPattern,
    terminalPattern
  });

  globalThis.OfferFlowExtractionRules = api;
})();
