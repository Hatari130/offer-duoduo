(() => {
  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
  const extractionRules = globalThis.OfferFlowExtractionRules;
  if (!extractionRules) {
    console.error("OfferFlow extraction rules were not loaded");
    return;
  }
  const platformAdapter = extractionRules.getAdapter(location.hostname);

  const firstMatch = (text, patterns) => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) return clean(match[1]);
    }
    return undefined;
  };

  const textList = (value) => {
    if (Array.isArray(value)) return value.map((item) => clean(String(item))).filter(Boolean);
    if (typeof value !== "string") return [];
    return value
      .split(/\n|；|;/)
      .map(clean)
      .filter((item) => item.length > 5)
      .slice(0, 12);
  };

  const getPosting = () => {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent || "null");
        const records = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed && parsed["@graph"])
            ? parsed["@graph"]
            : [parsed];
        const posting = records.find((record) => record && record["@type"] === "JobPosting");
        if (posting) return posting;
      } catch {
        // Ignore malformed third-party JSON-LD.
      }
    }
    return undefined;
  };

  const visibleText = () => {
    const clone = document.body.cloneNode(true);
    clone
      .querySelectorAll("script,style,noscript,nav,footer,svg,canvas")
      .forEach((element) => element.remove());
    // innerText must be read from the live rendered body. A detached clone can
    // return an empty string in Chromium, which previously hid SPA card content.
    return clean(document.body.innerText || clone.textContent || "").slice(0, 30000);
  };

  const meta = (...names) => {
    for (const name of names) {
      const element = document.querySelector(
        `meta[name="${name}"],meta[property="${name}"]`
      );
      if (element && element.content) return clean(element.content);
    }
    return "";
  };

  const terminalPattern = extractionRules.terminalPattern;
  const statusPrefixPattern = extractionRules.statusPrefixPattern;
  const stageTextValue = extractionRules.stageTextValue;
  const isStageText = extractionRules.isProcessText;

  const ownText = (element) =>
    clean(
      Array.from(element?.childNodes || [])
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || "")
        .join(" ")
    );

  const colorKind = (value) => {
    const match = String(value || "").match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,/\s]+([\d.]+))?/i);
    if (!match) return "neutral";
    const [red, green, blue] = match.slice(1, 4).map(Number);
    const alpha = match[4] === undefined ? 1 : Number(match[4]);
    if (alpha < 0.35 || Math.max(red, green, blue) - Math.min(red, green, blue) < 42) {
      return "neutral";
    }
    if (green > red * 1.08 && green > blue * 0.9) return "completed";
    if (blue > red * 1.12 && blue >= green * 0.95) return "current";
    if (red > green * 1.2) return "failed";
    return "neutral";
  };

  const stageVisualState = (labelElement, card) => {
    let group = labelElement;
    for (let depth = 0; depth < 4 && group.parentElement && group.parentElement !== card; depth += 1) {
      const parent = group.parentElement;
      const labelsInParent = Array.from(parent.querySelectorAll("*")).filter((element) =>
        isStageText(ownText(element))
      );
      if (labelsInParent.length > 1) break;
      group = parent;
    }

    const stateText = [labelElement, group]
      .flatMap((element) => {
        const values = [];
        let current = element;
        for (let depth = 0; current && depth < 3; depth += 1, current = current.parentElement) {
          values.push(
            current.className,
            current.getAttribute?.("aria-current"),
            current.getAttribute?.("data-status"),
            current.getAttribute?.("data-state")
          );
        }
        return values;
      })
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (/failed|failure|error|reject|terminate/.test(stateText)) return "failed";
    if (/current|active|processing|doing|selected/.test(stateText)) return "current";
    if (/complete|completed|finish|finished|success|passed|done/.test(stateText)) return "completed";
    if (/pending|disabled|inactive|waiting|wait/.test(stateText)) return "pending";

    const visualNodes = [group, ...Array.from(group.querySelectorAll("*"))].slice(0, 80);
    const visualStates = new Set();
    for (const element of visualNodes) {
      const style = getComputedStyle(element);
      [style.color, style.backgroundColor, style.borderColor, style.fill, style.stroke]
        .map(colorKind)
        .filter((state) => state !== "neutral")
        .forEach((state) => visualStates.add(state));
    }
    if (visualStates.has("failed")) return "failed";
    if (visualStates.has("current")) return "current";
    if (visualStates.has("completed")) return "completed";
    return "unknown";
  };

  const isVisibleElement = (element) => {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const stageFamily = (value) => {
    const stage = stageTextValue(value)
      .replace(/(?:中|完成|通过|不通过|结果)$/i, "")
      .toLowerCase();
    if (/投递|提交/.test(stage)) return "application";
    if (/筛选|初筛|复筛|审核/.test(stage)) return "screening";
    if (/offer|录用|背调|背景调查|体检|薪酬|签约|审批|发放|意向书/.test(stage)) return "offer";
    if (/评估|测评|笔试/.test(stage)) return "assessment";
    if (/面试|一面|二面|三面|hr面|群面|业务面|主管面|终面/.test(stage)) return "interview";
    if (/入职/.test(stage)) return "onboarding";
    if (terminalPattern.test(stage)) return "closed";
    return stage;
  };

  const stageElementsIn = (root) =>
    [root, ...Array.from(root.querySelectorAll("*"))].filter((element) => {
      const value = ownText(element);
      return value && isStageText(value) && isVisibleElement(element);
    });

  const findProgressRegions = (allElements) => {
    const stageElements = allElements.filter((element) => {
      const value = ownText(element);
      return value && isStageText(value) && isVisibleElement(element);
    });
    const regions = [];
    for (const stageElement of stageElements) {
      let current = stageElement.parentElement;
      for (let depth = 0; current && current !== document.body && depth < 8; depth += 1) {
        const text = clean(current.innerText || "");
        if (!text || text.length > 2600) break;
        const labels = stageElementsIn(current).map((element) => stageTextValue(ownText(element)));
        const families = new Set(labels.map(stageFamily).filter(Boolean));
        if (labels.length >= 2 && families.size >= 2) {
          regions.push(current);
          break;
        }
        current = current.parentElement;
      }
    }
    return regions.filter(
      (region, index) =>
        regions.indexOf(region) === index &&
        !regions.some(
          (candidate) =>
            candidate !== region &&
            region.contains(candidate) &&
            clean(candidate.innerText || "").length <= clean(region.innerText || "").length
        )
    );
  };

  const isWithinAnyRegion = (element, regions) =>
    regions.some((region) => region.contains(element) || element.contains(region));

  const candidateTexts = (element) => {
    const values = new Set();
    const direct = ownText(element);
    if (direct) values.add(direct);
    const rendered = String(element.innerText || "");
    rendered
      .split(/\n+/)
      .map(clean)
      .filter(Boolean)
      .forEach((value) => values.add(value));
    if (!rendered.includes("\n") && clean(rendered)) values.add(clean(rendered));
    return [...values];
  };

  const positionCandidateFromCard = (card, progressRegions) => {
    const adapterSelector = platformAdapter.positionSelectors.join(",");
    const genericSelector =
      'a[href],h1,h2,h3,h4,h5,h6,strong,[class*="job-title"],[class*="jobTitle"],[class*="job-name"],[class*="jobName"],[class*="position"],[class*="title"]';
    const preferredElements = adapterSelector
      ? Array.from(card.querySelectorAll(adapterSelector))
      : [];
    const elements = Array.from(
      new Set([
        ...preferredElements,
        ...Array.from(card.querySelectorAll(genericSelector)),
        ...Array.from(card.querySelectorAll("*")).slice(0, 900)
      ])
    );
    const cardRect = card.getBoundingClientRect();
    const candidates = [];

    for (const element of elements) {
      if (!isVisibleElement(element) || isWithinAnyRegion(element, progressRegions)) continue;
      if (/^(?:BUTTON|INPUT|SELECT|OPTION|LABEL|NAV)$/.test(element.tagName)) continue;
      const className = String(element.className || "");
      const preferred = preferredElements.includes(element);
      for (const value of candidateTexts(element)) {
        const normalized = clean(value.replace(terminalPattern, ""));
        if (!normalized || normalized.length < 2 || normalized.length > 80) continue;
        if (extractionRules.isHardRejectedPosition(normalized)) continue;
        if (/工作地|投递方式|投递时间|申请时间|所属部门|申请编号|\d{4}[./-]\d{1,2}/.test(normalized)) {
          continue;
        }

        const category = extractionRules.classifyText(normalized);
        const tagScore = /^H[1-6]$/.test(element.tagName)
          ? 30
          : element.tagName === "A"
            ? 28
            : element.tagName === "STRONG"
              ? 12
              : 0;
        const classScore = /job-title|jobTitle|job-name|jobName|position/i.test(className)
          ? 24
          : /title/i.test(className)
            ? 12
            : 0;
        const roleScore = extractionRules.occupationScore(normalized) * 6;
        const elementRect = element.getBoundingClientRect();
        const relativeTop = cardRect.height
          ? (elementRect.top - cardRect.top) / cardRect.height
          : 1;
        const locationScore = relativeTop >= -0.05 && relativeTop <= 0.55 ? 8 : 0;
        const score =
          (preferred ? 32 : 0) +
          tagScore +
          classScore +
          roleScore +
          locationScore +
          (category === "occupation" ? 24 : 0) -
          normalized.length * 0.03;
        if (category !== "occupation" && score < 48) continue;
        candidates.push({ value: normalized, score, element });
      }
    }

    return candidates.sort((left, right) => right.score - left.score)[0];
  };

  const cardContainsRegionCount = (card, regions) =>
    regions.filter((region) => card.contains(region)).length;

  const resolveProgressCard = (region, regions) => {
    for (const selector of platformAdapter.cardSelectors) {
      const candidate = region.closest(selector);
      if (
        candidate &&
        candidate !== document.body &&
        cardContainsRegionCount(candidate, regions) === 1 &&
        positionCandidateFromCard(candidate, [region])?.score >= 48
      ) {
        return candidate;
      }
    }

    let current = region.parentElement;
    let best;
    for (let depth = 0; current && current !== document.body && depth < 10; depth += 1) {
      const value = clean(current.innerText || "");
      if (!value || value.length > 3600) break;
      if (cardContainsRegionCount(current, regions) > 1) break;
      const position = positionCandidateFromCard(current, [region]);
      if (position && (!best || position.score > best.position.score)) {
        best = { card: current, position };
      }
      if (position?.score >= 58) return current;
      current = current.parentElement;
    }
    return best?.position.score >= 48 ? best.card : undefined;
  };

  const sectionCompanyFromCard = (card) => {
    if (!platformAdapter.sectionCompany) return platformAdapter.defaultCompany || undefined;
    let current = card;
    for (let depth = 0; current && current !== document.body && depth < 6; depth += 1) {
      let sibling = current.previousElementSibling;
      for (let offset = 0; sibling && offset < 4; offset += 1) {
        const siblingText = clean(sibling.innerText || ownText(sibling));
        if (siblingText.length > 0 && siblingText.length <= 80) {
          const headings = [sibling, ...Array.from(sibling.querySelectorAll("h1,h2,h3,h4,strong"))];
          const candidate = headings
            .flatMap(candidateTexts)
            .map(clean)
            .find(
              (value) =>
                value.length >= 2 &&
                value.length <= 40 &&
                !/职位|岗位|所属部门|申请日期|申请编号|投递时间|进度|状态|操作/.test(value) &&
                !extractionRules.isHardRejectedPosition(value) &&
                extractionRules.classifyText(value) !== "occupation"
            );
          if (candidate) return candidate;
        }
        sibling = sibling.previousElementSibling;
      }
      current = current.parentElement;
    }
    return platformAdapter.defaultCompany || undefined;
  };

  const explicitStageFromRegion = (region) => {
    const labels = stageElementsIn(region).map((element) => ({
      element,
      original: ownText(element),
      label: stageTextValue(ownText(element))
    }));
    return labels.find(({ original, label }) => terminalPattern.test(label) || statusPrefixPattern.test(original)) ||
      labels.find(({ label }) => /中$|^等待|^待/i.test(label));
  };

  const evidenceFromCard = (card, region) => {
    const cardText = clean(card.innerText || "");
    const positionCandidate = positionCandidateFromCard(card, [region]);
    if (!positionCandidate || extractionRules.isHardRejectedPosition(positionCandidate.value)) {
      return undefined;
    }

    const explicitStage = explicitStageFromRegion(region);
    const terminalStatus = explicitStage && terminalPattern.test(explicitStage.label)
      ? explicitStage.label
      : cardText.match(terminalPattern)?.[0];
    const rawStepElements = stageElementsIn(region);
    const baseLabels = new Set(
      rawStepElements
        .map((element) => stageTextValue(ownText(element)))
        .filter((label) => label && !terminalPattern.test(label))
        .map((label) => label.replace(/(?:中|完成|通过|不通过|结果)$/i, ""))
    );
    const uniqueSteps = [];
    const seenFamilies = new Set();
    for (const element of rawStepElements) {
      const label = stageTextValue(ownText(element));
      if (!label || terminalPattern.test(label)) continue;
      const baseLabel = label.replace(/(?:中|完成|通过|不通过|结果)$/i, "");
      if (label !== baseLabel && baseLabels.has(baseLabel)) continue;
      const family = stageFamily(label);
      if (seenFamilies.has(family)) continue;
      seenFamilies.add(family);
      uniqueSteps.push({
        label,
        state: explicitStage?.label === label ? "current" : stageVisualState(element, region)
      });
    }
    if (!uniqueSteps.length && !terminalStatus) return undefined;

    let currentIndex = uniqueSteps.findIndex((step) => step.state === "current");
    if (currentIndex < 0) {
      for (let index = uniqueSteps.length - 1; index >= 0; index -= 1) {
        if (["completed", "failed"].includes(uniqueSteps[index].state)) {
          currentIndex = index;
          break;
        }
      }
    }
    const currentStage =
      (!terminalStatus && explicitStage?.label) ||
      (currentIndex >= 0 ? uniqueSteps[currentIndex].label : undefined);
    const applicationId = extractionRules.extractApplicationId(cardText, platformAdapter);
    const recordUrl = Array.from(card.querySelectorAll("a[href]"))
      .map((anchor) => anchor.href)
      .find((href) => /(?:job|position|apply|application|delivery|resume|detail)/i.test(href));
    const appliedAt = cardText.match(
      /(?:投递时间|申请时间|提交时间|申请日期)[：:\s]*(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?)/i
    )?.[1];
    const city = cardText.match(
      /(?:工作地点|工作城市|职位地点|办公地点)[：:\s]+([^\s，,；;]{2,20})/i
    )?.[1];
    const positionConfidence = positionCandidate.score >= 80
      ? 0.98
      : positionCandidate.score >= 62
        ? 0.92
        : 0.82;
    const progressConfidence = terminalStatus || explicitStage
      ? 0.97
      : currentStage
        ? 0.86
        : 0.76;

    return {
      jobId: applicationId,
      recordUrl,
      position: positionCandidate.value,
      company: sectionCompanyFromCard(card),
      city,
      appliedAt: appliedAt
        ? appliedAt.replace(/[年月./]/g, "-").replace(/日$/, "")
        : undefined,
      currentStage,
      terminalStatus,
      context: cardText.slice(0, 1200),
      adapterId: platformAdapter.id,
      steps: uniqueSteps.map((step, index) => ({
        ...step,
        state: terminalStatus && index === currentIndex ? "failed" : step.state
      })),
      confidence: Math.min(positionConfidence, progressConfidence)
    };
  };

  const extractProgressEvidence = () => {
    const allElements = Array.from(document.body.querySelectorAll("*")).slice(0, 16000);
    const regions = findProgressRegions(allElements);
    const byCard = new Map();
    for (const region of regions) {
      const card = resolveProgressCard(region, regions);
      if (!card) continue;
      const item = evidenceFromCard(card, region);
      if (!item) continue;
      const existing = byCard.get(card);
      if (!existing || item.confidence > existing.confidence) byCard.set(card, item);
    }

    return [...byCard.entries()]
      .sort((left, right) => {
        const relation = left[0].compareDocumentPosition(right[0]);
        return relation & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      })
      .map(([, item]) => item)
      .filter((item, index, items) => {
        const normalizedPosition = extractionRules.normalizePosition(item.position);
        return items.findIndex((candidate) => {
          if (item.jobId || candidate.jobId) {
            return Boolean(
              item.jobId &&
              candidate.jobId &&
              item.jobId.toLowerCase() === candidate.jobId.toLowerCase()
            );
          }
          const itemIdentity = [
            normalizedPosition,
            clean(item.company),
            clean(item.city),
            clean(item.appliedAt),
            clean(item.recordUrl)
          ].join("|");
          const candidateIdentity = [
            extractionRules.normalizePosition(candidate.position),
            clean(candidate.company),
            clean(candidate.city),
            clean(candidate.appliedAt),
            clean(candidate.recordUrl)
          ].join("|");
          return candidateIdentity === itemIdentity;
        }) === index;
      });
  };

  const extract = () => {
    const posting = getPosting();
    const text = visibleText();
    const title = clean(
      (posting && posting.title) ||
        meta("og:title", "twitter:title") ||
        (document.querySelector("h1") && document.querySelector("h1").textContent) ||
        document.title
    );
    const organization = posting && posting.hiringOrganization;
    const address = posting && posting.jobLocation && posting.jobLocation.address;
    const titleParts = title.split(/[-–—_|｜]/).map(clean).filter(Boolean);

    const company =
      clean(organization && organization.name) ||
      firstMatch(text, [
        /(?:公司名称|招聘单位|企业名称)[：:\s]+([^\s｜|]{2,30})/i,
        /([^\s｜|]{2,30}(?:有限公司|集团))/
      ]) ||
      titleParts.at(-1) ||
      location.hostname.replace(/^www\./, "").split(".")[0];

    const position =
      clean(posting && posting.title) ||
      firstMatch(text, [
        /(?:职位名称|招聘职位|岗位名称)[：:\s]+(.{2,40}?)(?=\s{2,}|工作地点|职位类别)/i
      ]) ||
      titleParts[0] ||
      title;

    const url = new URL(location.href);
    const jobId =
      firstMatch(text, [
        /(?:职位|岗位|Job)\s*(?:编号|ID|Id|id|Code)[：:#\s]*([A-Za-z0-9_-]{3,30})/i,
        /(?:职位编号|岗位编号)[：:\s]*([^\s，,；;]{3,30})/
      ]) ||
      url.searchParams.get("jobId") ||
      url.searchParams.get("id") ||
      undefined;

    const city =
      clean(address && (address.addressLocality || address.addressRegion)) ||
      firstMatch(text, [
        /(?:工作地点|工作城市|职位地点|办公地点)[：:\s]+([^\s，,；;]{2,20})/i
      ]);

    const deadlineRaw =
      clean(posting && posting.validThrough) ||
      firstMatch(text, [
        /(?:截止日期|截止时间|申请截止|网申截止)[：:\s]*(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?)/i
      ]);
    const appliedAtRaw = firstMatch(text, [
      /(?:投递时间|申请时间|提交时间)[：:\s]*(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?(?:\s+\d{1,2}:\d{2})?)/i
    ]);

    const description = clean(
      (posting && posting.description) ||
        meta("description", "og:description") ||
        text.slice(0, 1200)
    );
    const responsibilities = textList(
      (posting && posting.responsibilities) ||
        firstMatch(text, [
          /(?:岗位职责|职位职责|工作职责)[：:\s]*(.*?)(?=任职要求|职位要求|岗位要求|$)/i
        ])
    );
    const requirements = textList(
      (posting && posting.qualifications) ||
        firstMatch(text, [
          /(?:任职要求|职位要求|岗位要求)[：:\s]*(.*?)(?=加分项|福利|工作地点|$)/i
        ])
    );
    const confidenceParts = [posting, company, position, jobId, city].filter(Boolean).length;

    return {
      company,
      position,
      jobId,
      city,
      deadline: deadlineRaw
        ? deadlineRaw.replace(/[年月./]/g, "-").replace(/日$/, "")
        : undefined,
      appliedAt: appliedAtRaw
        ? appliedAtRaw.replace(/[年月./]/g, "-").replace(/日(?=\s|$)/, "")
        : undefined,
      nextAction: "确认是否投递",
      summary: description.slice(0, 280),
      responsibilities,
      requirements,
      sourceUrl: location.href,
      sourceHost: location.hostname,
      rawExcerpt: text.slice(0, 16000),
      progressEvidence: extractProgressEvidence(),
      confidence: Math.min(0.98, 0.45 + confidenceParts * 0.1)
    };
  };

  const formFieldPatterns = [
    ["fullName", /姓名|真实姓名|应聘者姓名|候选人姓名|full\s*name|applicant\s*name/i],
    ["nationality", /民族|国籍|nationality/i],
    ["phone", /手机|联系电话|电话号码|手机号|电话|mobile|phone/i],
    ["email", /邮箱|电子邮件|e-?mail/i],
    ["idType", /证件类型|身份证类型|证件类别|id\s*type/i],
    ["idNumber", /证件号码|身份证号|身份证号码|证件编号|id\s*(number|no)/i],
    ["gender", /性别|gender|sex/i],
    ["birthDate", /出生日期|出生年月|生日|birth/i],
    ["wechat", /微信号|微信|wechat|weixin/i],
    ["qq", /QQ号?|qq\s*number/i],
    ["politicalStatus", /政治面貌|政治身份|political\s*status/i],
    ["maritalStatus", /婚姻状况|婚姻|marital\s*status/i],
    ["graduationDate", /毕业时间|毕业日期|graduation|graduates*date/i],
    ["currentResidence", /现居住地|居住地址|current\s*residence/i],
    ["currentCity", /现居城市|当前城市|所在城市|current\s*city|current\s*location/i],
    ["studentSource", /生源地|生源|student\s*source/i],
    ["nativePlace", /籍贯|户籍|户口|户口所在地|家乡|natives*place|hometown/i],
    ["height", /身高|height/i],
    ["weight", /体重|weight/i],
    ["recruitmentType", /是否统招|统招|统一招生|recruitments*type/i],
    ["graduateStatus", /应届|往届|毕业身份|应届往届|graduates*status/i],
    ["healthStatus", /健康状况|健康情况|身体状况|health/i],
    ["specialty", /特长|专长|specialty|strengths?/i],
    ["workYears", /工作年限|工作经验年限|从业年限|work\s*years?/i],
    ["emergencyContactName", /紧急联系人姓名|紧急联系人|emergency\s*contact.*name/i],
    ["emergencyContactPhone", /紧急联系人电话|紧急联系人手机|emergency\s*contact.*phone/i],
    ["countryRegion", /国家[与或/]地区|国家地区|所在国家|country|region/i],
    ["address", /详细地址|联系地址|通信地址|通讯地址|现居住地|居住地址|address/i],
    ["targetRole", /意向岗位|意向职位|期望职位|目标岗位|应聘职位|申请职位|职位名称|target\s*(role|position)|desired\s*position/i],
    ["targetCities", /意向城市|期望城市|工作地点偏好|期望工作地点|期望工作城市|工作城市|preferred\s*(city|location)/i],
    ["earliestStartDate", /预计入职时间|到岗时间|可入职时间|最早到岗|入职时间|available\s*date/i],
    ["expectedSalary", /期望薪资|期望工资|期望月薪|薪资要求|expected\s*salary/i],
    ["referralCode", /推荐码|邀请码|内推码|referral\s*code/i],
    ["portfolioUrl", /作品集|个人作品|portfolio/i],
    ["githubUrl", /github|代码仓库/i],
    ["school", /毕业院校|学校名称|就读学校|所在学校|院校|university|college|school/i],
    ["major", /专业名称|所学专业|专业|major/i],
    ["degree", /学历|学位|degree|education\s*level/i],
    ["gpa", /绩点|gpa|平均成绩/i],
    ["selfIntroduction", /自我介绍|个人简介|个人总结|self.?intro|about\s*you/i],
    ["strengths", /个人优势|优势与不足|核心优势|strength/i],
    ["careerPlan", /职业规划|未来规划|发展规划|职业目标|career\s*plan/i],
    ["hobbies", /兴趣爱好|兴趣|爱好|hobbies?/i]
  ];

  const labelText = (label) => {
    if (!label) return "";
    const clone = label.cloneNode(true);
    clone.querySelectorAll("input,select,textarea,button").forEach((control) => control.remove());
    return clean(clone.innerText || clone.textContent || "");
  };

  const normalizeFieldText = (value) =>
    clean(value)
      .replace(/[＊*]/g, " ")
      .replace(/请输入|请选择|点击选择|请选择内容|选择日期/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

  const nearbyFieldTexts = (element) => {
    const values = [];
    let current = element;
    for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
      const parent = current.parentElement;
      if (!parent) break;
      const direct = ownText(parent);
      if (direct) values.push(direct);
      let sibling = current.previousElementSibling;
      for (let count = 0; sibling && count < 3; count += 1, sibling = sibling.previousElementSibling) {
        const siblingText = normalizeFieldText(sibling.innerText || sibling.textContent || "");
        if (siblingText && siblingText.length <= 100) values.push(siblingText);
      }
      const parentText = normalizeFieldText(parent.innerText || parent.textContent || "");
      if (parentText && parentText.length <= 180) values.push(parentText);
    }
    return Array.from(new Set(values.map(normalizeFieldText).filter(Boolean)));
  };

  const ariaLabelledByText = (element) =>
    (element.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((node) => normalizeFieldText(node.innerText || node.textContent || ""))
      .filter(Boolean)
      .join(" ");

  const ancestorAttributeText = (element, attribute) => {
    let current = element;
    for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
      const value = normalizeFieldText(current.getAttribute?.(attribute) || "");
      if (value) return value;
    }
    return "";
  };

  const nearbyLabelText = (element) => {
    let current = element;
    for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
      const parent = current.parentElement;
      if (!parent) break;
      const candidates = [
        current.previousElementSibling,
        current.previousElementSibling?.previousElementSibling
      ];
      for (const candidate of candidates) {
        const value = normalizeFieldText(ownText(candidate) || candidate?.innerText || candidate?.textContent || "");
        if (value && value.length <= 60 && !/^(请输入|请选择|选择|搜索|search)$/i.test(value)) {
          return value;
        }
      }
      const direct = normalizeFieldText(ownText(parent));
      if (direct && direct.length <= 60 && !/^(请输入|请选择|选择|搜索|search)$/i.test(direct)) {
        return direct;
      }
    }
    return "";
  };

  const fieldLabel = (element) => {
    const labels = element.labels ? Array.from(element.labels) : [];
    const explicit = labels.map(labelText).find(Boolean) || "";
    const wrapping = element.closest("label");
    const formItem = element.closest(".el-form-item,[class~='form-item'],fieldset");
    const structural = formItem?.querySelector(
      "label.el-form-item__label,[class~='el-form-item__label'],.form-item__text,[class*='form-item__text']"
    );
    const labelledBy = ariaLabelledByText(element);
    const siteLabel = ancestorAttributeText(element, "data-nc-label");
    const dataField = ancestorAttributeText(element, "data-field");
    const nearby = nearbyLabelText(element);
    return clean(
      explicit ||
        labelText(structural) ||
        normalizeFieldText(wrapping?.innerText || "") ||
        labelledBy ||
        siteLabel ||
        dataField ||
        nearby ||
        normalizeFieldText(element.getAttribute("aria-label") || "") ||
        normalizeFieldText(element.getAttribute("placeholder") || "") ||
        normalizeFieldText(element.getAttribute("name") || "") ||
        normalizeFieldText(element.id || "") ||
        "未命名字段"
    ).slice(0, 80);
  };

  const displayFieldLabel = (element) => {
    const explicit = element.labels
      ? Array.from(element.labels).map(labelText).find(Boolean)
      : "";
    const formItem = element.closest(".el-form-item,[class~='form-item'],fieldset");
    const structural = formItem?.querySelector(
      "label.el-form-item__label,[class~='el-form-item__label'],.form-item__text,[class*='form-item__text']"
    );
    const container = element.closest(
      '[class*="form-item"],[class*="formItem"],[class*="field"],[class*="control"],[class*="question"]'
    );
    const nearby = nearbyFieldTexts(element)
      .map(normalizeFieldText)
      .find((value) => value && !/^(请输入|请选择|选择|搜索|search)$/i.test(value) && value.length <= 60) || "";
    return clean(
      explicit ||
        labelText(structural) ||
        ancestorAttributeText(element, "data-nc-label") ||
        ancestorAttributeText(element, "data-field") ||
        nearby ||
        ariaLabelledByText(element) ||
        element.getAttribute("aria-label") ||
        element.getAttribute("name") ||
        element.id ||
        "未命名字段"
    ).slice(0, 60);
  };

  const matchedProfileField = (label, element, adapter, section) => {
    const context = normalizeFieldText(section || "");
    const map = (key, evidence, confidence = 0.94) => ({
      key,
      confidence,
      source: "rules",
      evidence: [evidence]
    });
    const byLabel = (pattern, key, evidence = "分区字段规则") =>
      pattern.test(label) ? map(key, evidence) : undefined;
    const isEducation = /教育|学历|学业|education|academic/i.test(context);
    const isExperience = /工作|实习|任职|employment|work/i.test(context) && !/项目|在校/i.test(context);
    const isProject = /项目|project/i.test(context);
    const isCampus = /在校|校园|学生干部|campus|schools*experience/i.test(context);
    const isAward = /获奖|奖项|奖励|award/i.test(context);
    const isLanguage = /外语|语言|英语|language|english/i.test(context);
    const isComputer = /计算机|电脑|技能|computer|skill/i.test(context) && !isLanguage;
    const isQualification = /资格证书|证书|certificate|qualification/i.test(context) && !isLanguage;
    const isFamily = /家庭|家属|family/i.test(context);
    const isPublication = /论文|期刊|刊物|publication|paper|journal/i.test(context);
    const isPatent = /专利|patent/i.test(context);
    const isPortfolio = /作品集|作品|portfolio/i.test(context);
    const isCompetition = /竞赛|比赛|competition|contest/i.test(context);
    if (/^推荐码$|^邀请码$|^内推码$|referral\s*code/i.test(label)) {
      return map("referralCode", "通用字段规则");
    }
    if (/^至今$|当前在职|仍在职|current\s*employment/i.test(label)) {
      return map("experienceCurrent", "工作经历状态规则");
    }
    if (/基本信息|个人信息|basic|personal/i.test(context)) {
      for (const result of [
        byLabel(/紧急联系人姓名|紧急联系人名称|emergency\s*contact.*name/i, "emergencyContactName", "基本信息上下文"),
        byLabel(/紧急联系人电话|紧急联系人手机|emergency\s*contact.*phone/i, "emergencyContactPhone", "基本信息上下文"),
        byLabel(/现居住地|居住地址|current\s*residence/i, "currentResidence", "基本信息上下文"),
        byLabel(/生源地|生源|student\s*source/i, "studentSource", "基本信息上下文"),
        byLabel(/籍贯|户籍|户口|籍贯地|native\s*place/i, "nativePlace", "基本信息上下文")
      ].filter(Boolean)) return result;
    }
    if (isEducation) {
      for (const result of [
        byLabel(/开始时间|入学时间|就读时间|start\s*date/i, "educationStartDate", "教育经历上下文"),
        byLabel(/结束时间|毕业时间|离校时间|end\s*date/i, "educationEndDate", "教育经历上下文"),
        byLabel(/学院|院系|系别|college|department/i, "educationCollege", "教育经历上下文"),
        byLabel(/辅修|双学位|minor/i, "minorMajor", "教育经历上下文"),
        byLabel(/学位|学士|硕士|博士|education\s*degree/i, "educationDegree", "教育经历上下文"),
        byLabel(/学历|教育程度|education\s*level/i, "degree", "教育经历上下文"),
        byLabel(/学习形式|培养方式|教育形式|study\s*form/i, "educationForm", "教育经历上下文"),
        byLabel(/专业课程|课程|course/i, "educationCourses", "教育经历上下文"),
        byLabel(/研究方向|研究领域|research/i, "educationResearchDirection", "教育经历上下文"),
        byLabel(/毕业论文|学位论文|thesis/i, "educationThesis", "教育经历上下文"),
        byLabel(/专业排名|排名|ranking/i, "educationRank", "教育经历上下文"),
        byLabel(/海外教育|境外教育|留学|overseas/i, "overseasEducation", "教育经历上下文"),
        byLabel(/导师|指导老师|advisor/i, "advisorName", "教育经历上下文"),
        byLabel(/学校|院校|大学|university|school/i, "school", "教育经历上下文"),
        byLabel(/专业名称|所学专业|专业|major/i, "major", "教育经历上下文"),
        byLabel(/绩点|GPA|平均成绩|成绩|grade/i, "gpa", "教育经历上下文")
      ].filter(Boolean)) return result;
    }
    if (isExperience) {
      for (const result of [
        byLabel(/开始时间|入职时间|start\s*date/i, "experienceStartDate", "工作经历上下文"),
        byLabel(/结束时间|离职时间|end\s*date/i, "experienceEndDate", "工作经历上下文"),
        byLabel(/工作类型|任职类型|employment\s*type/i, "experienceType", "工作经历上下文"),
        byLabel(/公司名称|公司|工作单位|所在公司|雇主|organization|employer|company/i, "experienceOrganization", "工作经历上下文"),
        byLabel(/部门|所属部门|department/i, "experienceDepartment", "工作经历上下文"),
        byLabel(/工资|薪资|薪酬|工资待遇|salary/i, "experienceSalary", "工作经历上下文"),
        byLabel(/工作职责|工作内容|经历描述|工作描述|job\s*description|responsibilities/i, "experienceDescription", "工作经历上下文"),
        byLabel(/工作成果|工作业绩|业绩成果|achievement|result/i, "experienceAchievements", "工作经历上下文"),
        byLabel(/证明人姓名|推荐人姓名|referee.*name/i, "refereeName", "工作经历上下文"),
        byLabel(/证明人职位|推荐人职位|referee.*title/i, "refereeTitle", "工作经历上下文"),
        byLabel(/证明人联系方式|证明人电话|referee.*contact/i, "refereeContact", "工作经历上下文"),
        byLabel(/职位名称|职位|工作职位|岗位名称|职务|job\s*title|position/i, "experienceTitle", "工作经历上下文"),
        byLabel(/离职原因|离职理由|leaving\s*reason/i, "leavingReason", "工作经历上下文"),
        byLabel(/下属人数|下属|管理人数|subordinate/i, "subordinateCount", "工作经历上下文")
      ].filter(Boolean)) return result;
    }
    if (isProject) {
      for (const result of [
        byLabel(/开始时间|项目开始|start\s*date/i, "projectStartDate", "项目经历上下文"),
        byLabel(/结束时间|项目结束|end\s*date/i, "projectEndDate", "项目经历上下文"),
        byLabel(/项目名称|项目名|project\s*name/i, "projectName", "项目经历上下文"),
        byLabel(/职位|角色|担任角色|项目职位|role|position/i, "projectRole", "项目经历上下文"),
        byLabel(/项目内容|项目描述|项目介绍|project\s*description|content/i, "projectDescription", "项目经历上下文"),
        byLabel(/本人职责|个人职责|项目职责|project\s*responsibilit/i, "projectDescription", "项目经历上下文"),
        byLabel(/项目成果|项目业绩|project\s*achievement|result/i, "projectAchievement", "项目经历上下文"),
        byLabel(/项目链接|项目地址|project\s*link|url/i, "projectLink", "项目经历上下文")
      ].filter(Boolean)) return result;
    }
    if (isCampus) {
      for (const result of [
        byLabel(/开始时间|start\s*date/i, "campusExperienceStartDate", "在校经历上下文"),
        byLabel(/结束时间|end\s*date/i, "campusExperienceEndDate", "在校经历上下文"),
        byLabel(/经历类型|活动类型|experience\s*type/i, "campusExperienceType", "在校经历上下文"),
        byLabel(/职位|职务|岗位|角色|position|role/i, "campusExperienceRole", "在校经历上下文"),
        byLabel(/工作内容|经历内容|活动内容|description|content/i, "campusExperienceDescription", "在校经历上下文")
      ].filter(Boolean)) return result;
    }
    if (isAward) {
      for (const result of [
        byLabel(/获奖时间|奖励时间|award\s*date|date/i, "awardDate", "获奖情况上下文"),
        byLabel(/奖励名称|奖项名称|奖品名称|award\s*name/i, "awardName", "获奖情况上下文"),
        byLabel(/奖励等级|奖项等级|级别|award\s*level/i, "awardLevel", "获奖情况上下文"),
        byLabel(/奖励描述|获奖描述|award\s*description|description/i, "awardDescription", "获奖情况上下文")
      ].filter(Boolean)) return result;
    }
    if (isLanguage) {
      for (const result of [
        byLabel(/外语语种|语言种类|语种|language/i, "languageName", "外语能力上下文"),
        byLabel(/证书名称|语言证书|certificate/i, "languageCertificate", "外语能力上下文"),
        byLabel(/英语水平|english\s*level/i, "englishLevel", "外语能力上下文"),
        byLabel(/成绩|分数|语言成绩|score/i, "languageScore", "外语能力上下文"),
        byLabel(/掌握程度|熟练程度|proficiency/i, "languageProficiency", "外语能力上下文"),
        byLabel(/听说能力|口语能力|listening|speaking/i, "listeningSpeaking", "外语能力上下文"),
        byLabel(/读写能力|阅读能力|写作能力|reading|writing/i, "readingWriting", "外语能力上下文")
      ].filter(Boolean)) return result;
    }
    if (isComputer) {
      for (const result of [
        byLabel(/技能类型|计算机技能|电脑技能|skill\s*type/i, "computerSkillType", "计算机技能上下文"),
        byLabel(/掌握程度|熟练程度|skill\s*proficiency/i, "computerSkillProficiency", "计算机技能上下文")
      ].filter(Boolean)) return result;
    }
    if (isQualification) {
      for (const result of [
        byLabel(/获得时间|取得时间|证书时间|date/i, "qualificationDate", "资格证书上下文"),
        byLabel(/证书名称|资格名称|certificate\s*name/i, "qualificationName", "资格证书上下文"),
        byLabel(/证书编号|证书号|编号|certificate\s*(number|no)/i, "qualificationNumber", "资格证书上下文"),
        byLabel(/证书说明|资格说明|certificate\s*description|description/i, "qualificationDescription", "资格证书上下文")
      ].filter(Boolean)) return result;
    }
    if (isFamily) {
      for (const result of [
        byLabel(/姓名|成员姓名|family.*name/i, "familyName", "家庭情况上下文"),
        byLabel(/关系|亲属关系|family.*relation/i, "familyRelation", "家庭情况上下文"),
        byLabel(/电话|手机|联系方式|phone/i, "familyPhone", "家庭情况上下文"),
        byLabel(/公司|工作单位|company/i, "familyCompany", "家庭情况上下文"),
        byLabel(/职位|职务|岗位|position/i, "familyPosition", "家庭情况上下文"),
        byLabel(/政治面貌|political/i, "familyPoliticalStatus", "家庭情况上下文")
      ].filter(Boolean)) return result;
    }
    if (isPublication) {
      for (const result of [
        byLabel(/发表时间|出版时间|publication\s*date|date/i, "publicationDate", "论文期刊上下文"),
        byLabel(/刊物名称|期刊名称|杂志名称|journal/i, "publicationJournal", "论文期刊上下文"),
        byLabel(/刊物层级|期刊级别|刊物级别|level/i, "publicationLevel", "论文期刊上下文"),
        byLabel(/论文名称|论文题目|paper\s*title|title/i, "publicationTitle", "论文期刊上下文"),
        byLabel(/论文描述|摘要|paper\s*description|description/i, "publicationDescription", "论文期刊上下文"),
        byLabel(/论文作者|作者|author/i, "publicationAuthors", "论文期刊上下文"),
        byLabel(/影响因子|impact\s*factor/i, "publicationImpactFactor", "论文期刊上下文"),
        byLabel(/论文链接|文章链接|paper\s*link|url/i, "publicationLink", "论文期刊上下文")
      ].filter(Boolean)) return result;
    }
    if (isPatent) {
      for (const result of [
        byLabel(/发表时间|申请时间|专利时间|patent\s*date|date/i, "patentDate", "专利上下文"),
        byLabel(/专利名称|专利名|patent\s*name/i, "patentName", "专利上下文"),
        byLabel(/专利编号|专利号|编号|patent\s*(number|no)/i, "patentNumber", "专利上下文"),
        byLabel(/专利类型|类型|patent\s*type/i, "patentType", "专利上下文"),
        byLabel(/专利成果|专利描述|patent\s*achievement|result/i, "patentAchievement", "专利上下文")
      ].filter(Boolean)) return result;
    }
    if (isPortfolio) {
      for (const result of [
        byLabel(/作品名称|作品名|work\s*name/i, "workName", "作品集上下文"),
        byLabel(/作品链接|作品地址|work\s*link|url/i, "workLink", "作品集上下文"),
        byLabel(/描述|作品描述|description/i, "workDescription", "作品集上下文")
      ].filter(Boolean)) return result;
    }
    if (isCompetition) {
      for (const result of [
        byLabel(/竞赛名称|比赛名称|competition\s*name/i, "competitionName", "竞赛上下文"),
        byLabel(/参与时间|参赛时间|competition\s*date|date/i, "competitionDate", "竞赛上下文"),
        byLabel(/详情内容|竞赛内容|比赛内容|competition\s*description|description/i, "competitionDescription", "竞赛上下文")
      ].filter(Boolean)) return result;
    }
    const siteMatch = window.OfferFlowFormAdapters?.match?.(element, label, adapter);
    if (siteMatch?.key) return siteMatch;
    for (const [key, pattern] of formFieldPatterns) {
      if (pattern.test(label)) {
        return {
          key,
          confidence: 0.86,
          source: "rules",
          evidence: ["通用字段规则", `匹配标签：${clean(label).slice(0, 60)}`]
        };
      }
    }
    return undefined;
  };

  const fieldSection = (element) => {
    const siteSection = normalizeFieldText(element.getAttribute("data-nc-cls") || "");
    if (siteSection) return siteSection.slice(0, 80);
    const moduleCard = element.closest(
      ".module-card,section[id^='module-'],[class~='resume-section']"
    );
    const moduleHeading = moduleCard?.querySelector(
      ".section-header__title,[class*='section-header__title'],[class*='section-title'],h1,h2,h3,h4,h5,h6"
    );
    if (moduleHeading) {
      const value = clean(moduleHeading.innerText || moduleHeading.textContent || "");
      if (value) return value.slice(0, 80);
    }
    const container = element.closest(
      '[class*="form-item"],[class*="formItem"],[class*="field"],[class*="question"],fieldset,section'
    );
    const heading = container?.querySelector("h1,h2,h3,h4,h5,h6,legend,[class*='title'],[class*='Title']");
    return clean(heading?.innerText || heading?.textContent || "").slice(0, 80) || undefined;
  };

  const fieldOptions = (element) => {
    if (element instanceof HTMLSelectElement) {
      return Array.from(element.options).map((option) => clean(option.text || option.value)).filter(Boolean).slice(0, 30);
    }
    const container = element.closest("[role='radiogroup'],[role='listbox'],fieldset,[class*='form-item'],[class*='question']") || element.parentElement;
    return Array.from(container?.querySelectorAll("[role='option'],[role='radio'],label") || [])
      .map((option) => clean(option.innerText || option.textContent || ""))
      .filter((value) => value && value.length < 80)
      .concat(
        Array.from(container?.querySelectorAll(".phoenix-radio-group__radioItem,.phoenix-select__option,[class*='option']") || [])
          .map((option) => clean(option.innerText || option.textContent || ""))
          .filter((value) => value && value.length < 80)
      )
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 30);
  };

  // Match the component root only. A substring selector such as
  // [class*="radio-group"] also matches Phoenix's radioItem/radio descendants,
  // creating one preview row per option.
  const radioGroupSelector = ".phoenix-radio-group,[class~='radio-group'],[class$='-radio-group']";
  const checkboxSelector = ".phoenix-checkbox,[class~='checkbox'],[class$='-checkbox']";
  const cascaderSelector = ".city-cascader,[class~='cascader']";

  const repeatableFieldKeys = {
    education: [
      "school", "major", "degree", "gpa", "educationStartDate", "educationEndDate",
      "educationCollege", "educationDegree", "educationForm", "educationCourses",
      "educationResearchDirection", "educationThesis", "educationRank", "overseasEducation",
      "minorMajor", "advisorName"
    ],
    experience: [
      "experienceOrganization", "experienceTitle", "experienceStartDate", "experienceEndDate",
      "experienceDescription", "experienceType", "experienceDepartment", "experienceSalary",
      "experienceAchievements", "refereeName", "refereeTitle", "refereeContact", "leavingReason",
      "subordinateCount", "experienceCurrent"
    ],
    project: [
      "projectName", "projectRole", "projectStartDate", "projectEndDate", "projectDescription",
      "projectAchievement", "projectLink"
    ],
    campus: [
      "campusExperienceType", "campusExperienceRole", "campusExperienceStartDate",
      "campusExperienceEndDate", "campusExperienceDescription"
    ],
    award: ["awardDate", "awardName", "awardLevel", "awardDescription"],
    language: ["languageName", "languageCertificate", "englishLevel", "languageScore", "languageProficiency", "listeningSpeaking", "readingWriting"],
    computer: ["computerSkillType", "computerSkillProficiency"],
    qualification: ["qualificationDate", "qualificationName", "qualificationNumber", "qualificationDescription"],
    family: ["familyName", "familyRelation", "familyPhone", "familyCompany", "familyPosition", "familyPoliticalStatus"],
    publication: ["publicationDate", "publicationJournal", "publicationLevel", "publicationTitle", "publicationDescription", "publicationAuthors", "publicationImpactFactor", "publicationLink"],
    patent: ["patentDate", "patentName", "patentNumber", "patentType", "patentAchievement"],
    portfolio: ["workName", "workLink", "workDescription"],
    competition: ["competitionName", "competitionDate", "competitionDescription"]
  };

  const repeatableGroupForKey = (key) =>
    Object.entries(repeatableFieldKeys).find(([, keys]) => keys.includes(key))?.[0];

  const repeatableFieldCount = (fields, group) => {
    const keys = repeatableFieldKeys[group] || [];
    return Math.max(
      0,
      ...keys.map((key) => fields.filter((field) => field.repeatGroup === group && field.key === key).length)
    );
  };

  const controlType = (element) => {
    if (element.getAttribute("contenteditable") === "true") return "contenteditable";
    if (element.matches?.(radioGroupSelector)) return "radio-group";
    if (element.matches?.(cascaderSelector)) return "cascader";
    if (element.closest?.(".phoenix-select")) return "custom-select";
    if (element.closest?.(".el-select")) return "custom-select";
    if (element.matches?.(checkboxSelector)) return "checkbox";
    return element.getAttribute("role") || (element.tagName || "field").toLowerCase();
  };

  const readControlValue = (element) => {
    if (element instanceof HTMLSelectElement) return clean(element.selectedOptions[0]?.text || element.value || "");
    if (element instanceof HTMLInputElement && element.type === "radio") {
      const checked = Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`)).find((item) => item.checked);
      return clean(checked?.value || checked?.getAttribute("aria-label") || "");
    }
    if (element instanceof HTMLInputElement && element.type === "checkbox") return element.checked ? "是" : "否";
    if (element.getAttribute("role") === "radio") {
      return element.getAttribute("aria-checked") === "true" ? clean(element.innerText || element.textContent || "是") : "";
    }
    if (element.getAttribute("role") === "checkbox") {
      return element.getAttribute("aria-checked") === "true" ? "是" : "否";
    }
    if (element.getAttribute("role") === "combobox") {
      return clean(element.getAttribute("aria-valuetext") || element.innerText || element.textContent || "");
    }
    if (element.matches?.(radioGroupSelector)) {
      const selected = Array.from(element.querySelectorAll(".phoenix-radio-group__radioItem")).find((item) => {
        const radio = item.querySelector(".phoenix-radio,[class*='radio--withLabel']");
        const state = String(item.className || "") + " " + String(radio?.className || "") + " " +
          String(item.getAttribute("aria-checked") || "") + " " + String(radio?.getAttribute("aria-checked") || "");
        return /checked|selected|active/.test(state.toLowerCase());
      });
      return clean(selected?.innerText || selected?.textContent || "");
    }
    if (element.closest?.(".phoenix-select")) {
      const root = element.closest(".phoenix-select");
      const selected = root.querySelector("[class*='selected'],[class*='value'],[class*='choice']");
      return clean(selected?.innerText || selected?.textContent || element.value || root.innerText || "");
    }
    if (element.closest?.(".el-select")) {
      const root = element.closest(".el-select");
      const selected = root.querySelector(".el-input__inner");
      return clean(selected?.value || element.value || "");
    }
    if (element.matches?.(cascaderSelector)) {
      return clean(element.querySelector(".city-cascader-value,[class*='cascader-value']")?.innerText || element.innerText || "");
    }
    if (element.matches?.(checkboxSelector)) {
      const input = element.querySelector("input[type='checkbox']");
      return input?.checked ? "是" : "否";
    }
    if (element.getAttribute("contenteditable") === "true") return clean(element.innerText || element.textContent || "");
    return clean(element.value || "");
  };

  const isLikelyFormField = (element, label, key) => {
    const inputType = element instanceof HTMLInputElement ? (element.type || "text").toLowerCase() : "";
    if (["hidden", "submit", "button", "reset", "image", "file"].includes(inputType)) return false;
    const searchEvidence = `${label} ${element.getAttribute?.("placeholder") || ""} ${element.getAttribute?.("aria-label") || ""}`;
    if (inputType === "search" || /搜索职位|搜索关键词|搜职位|keyword|search/i.test(searchEvidence)) return false;
    if (!label || /^(搜索|搜职位|关键字|keyword|search)$/i.test(label)) return false;
    if (key) return true;
    if (element.getAttribute("required") !== null || element.getAttribute("aria-required") === "true") return true;
    if (element.closest("nav,header,footer,[role='navigation']")) return false;
    return label.length >= 2;
  };

  const scanApplicationForm = () => {
    const adapter = window.OfferFlowFormAdapters?.resolve?.(location) || {
      id: "generic",
      name: "通用表单",
      version: "builtin",
      compiled: []
    };
    const selector = [
      "input", "textarea", "select", "[contenteditable='true']",
      "[role='textbox']", "[role='combobox']", "[role='radio']", "[role='checkbox']",
      radioGroupSelector, checkboxSelector, cascaderSelector
    ].join(",");
    const elements = Array.from(document.querySelectorAll(selector))
      .filter((element, index, all) => {
        if (all.indexOf(element) !== index) return false;
        if (element.disabled) return false;
        if (element.matches("input,textarea") && element.closest(checkboxSelector)) return false;
        return element.getClientRects().length > 0;
      });
    const seenRadioGroups = new Set();
    const seenSiteFieldIds = new Set();
    const repeatCounters = new Map();
    const matches = [];
    let ruleMatched = 0;

    elements.forEach((element, index) => {
      const label = fieldLabel(element);
      const section = fieldSection(element);
      const ruleMatch = matchedProfileField(label, element, adapter, section);
      const key = ruleMatch?.key;
      if (!isLikelyFormField(element, label, key)) return;
      const siteFieldId = ancestorAttributeText(element, "data-nc-id");
      if (siteFieldId) {
        if (seenSiteFieldIds.has(siteFieldId)) return;
        seenSiteFieldIds.add(siteFieldId);
      }
      if ((element instanceof HTMLInputElement && element.type === "radio") || element.getAttribute("role") === "radio") {
        const group = `${element.getAttribute("name") || element.closest("fieldset,[role='radiogroup']")?.id || "radio"}-${key || "unknown"}`;
        if (seenRadioGroups.has(group)) return;
        seenRadioGroups.add(group);
      }
      const id = `offerflow-field-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`;
      element.dataset.offerflowFieldId = id;
      const type = controlType(element);
      const repeatGroup = repeatableGroupForKey(key);
      const repeatCounterKey = repeatGroup ? `${repeatGroup}:${key}` : "";
      const repeatIndex = repeatCounterKey ? (repeatCounters.get(repeatCounterKey) || 0) : undefined;
      if (repeatCounterKey) repeatCounters.set(repeatCounterKey, (repeatIndex || 0) + 1);
      const requiredEvidence = [
        fieldLabel(element),
        ...nearbyFieldTexts(element),
        element.closest("[class*='form-item'],[class*='formItem'],[class*='field'],[class*='question']")?.innerText || ""
      ].join(" ");
      const required = element.required === true ||
        element.getAttribute("aria-required") === "true" ||
        /[＊*]|必填|必选/.test(requiredEvidence) ||
        Boolean(element.closest("[class*='form-item'],[class*='formItem']")?.querySelector(".required,[class*='required']"));
      matches.push({
        id,
        label: displayFieldLabel(element),
        key,
        repeatGroup,
        repeatIndex,
        type,
        section,
        required,
        options: fieldOptions(element),
        currentValue: readControlValue(element),
        confidence: ruleMatch?.confidence || (key ? 0.86 : 0.2),
        source: ruleMatch?.source,
        evidence: ruleMatch?.evidence || [fieldLabel(element)].filter(Boolean),
        adapterId: adapter.id
      });
      if (key) ruleMatched += 1;
    });
    return {
      fields: matches,
      platform: {
        id: adapter.id,
        name: adapter.name,
        version: window.OfferFlowFormAdapters?.version || "builtin",
        total: matches.length,
        ruleMatched,
        unknown: matches.length - ruleMatched
      }
    };
  };

  const dispatchInputEvents = (element) => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  };

  const prepareControlInteraction = (element) => {
    const target = element.closest?.(".phoenix-select,.el-select") || element;
    try {
      target.scrollIntoView?.({ behavior: "auto", block: "center", inline: "nearest" });
      target.focus?.({ preventScroll: true });
    } catch {
      // Some custom controls expose neither focus nor scrollIntoView.
    }
  };

  const clickControl = (element) => {
    if (!element) return;
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    if (typeof element.click === "function") element.click();
    else element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
  };

  const nextFrame = () =>
    new Promise((resolve) => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(resolve);
      else setTimeout(resolve, 0);
    });

  const sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));

  const repeatAddPatterns = {
    education: /(?:添加|新增|增加|继续添加|再添加)\s*(?:教育经历|教育背景|学历经历)|(?:教育经历|教育背景|学历经历)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+education/i,
    experience: /(?:添加|新增|增加|继续添加|再添加)\s*(?:工作经历|实习经历|工作背景)|(?:工作经历|实习经历|工作背景)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+(?:work|experience)/i,
    project: /(?:添加|新增|增加|继续添加|再添加)\s*(?:项目经历|项目)|(?:项目经历|项目)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+project/i,
    campus: /(?:添加|新增|增加|继续添加|再添加)\s*(?:在校经历|校园经历)|(?:在校经历|校园经历)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+campus/i,
    award: /(?:添加|新增|增加|继续添加|再添加)\s*(?:获奖情况|获奖经历|奖励)|(?:获奖情况|获奖经历|奖励)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+award/i,
    language: /(?:添加|新增|增加|继续添加|再添加)\s*(?:外语能力|语言能力)|(?:外语能力|语言能力)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+language/i,
    computer: /(?:添加|新增|增加|继续添加|再添加)\s*(?:计算机技能|电脑技能)|(?:计算机技能|电脑技能)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+computer/i,
    qualification: /(?:添加|新增|增加|继续添加|再添加)\s*(?:资格证书|证书)|(?:资格证书|证书)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+qualification/i,
    family: /(?:添加|新增|增加|继续添加|再添加)\s*(?:家庭成员|家庭情况)|(?:家庭成员|家庭情况)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+family/i,
    publication: /(?:添加|新增|增加|继续添加|再添加)\s*(?:论文期刊|论文)|(?:论文期刊|论文)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+publication/i,
    patent: /(?:添加|新增|增加|继续添加|再添加)\s*专利|专利\s*(?:添加|新增|增加)|add(?:\s+another)?\s+patent/i,
    portfolio: /(?:添加|新增|增加|继续添加|再添加)\s*(?:作品集|作品)|(?:作品集|作品)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+portfolio/i,
    competition: /(?:添加|新增|增加|继续添加|再添加)\s*(?:竞赛|比赛)|(?:竞赛|比赛)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+competition/i
  };

  const repeatAddButton = (group) => {
    const pattern = repeatAddPatterns[group];
    if (!pattern) return undefined;
    const selector = [
      "button", "a", "[role='button']", "[onclick]",
      "[class*='add']", "[class*='Add']", "[class*='append']", "[class*='Append']"
    ].join(",");
    const candidates = Array.from(document.querySelectorAll(selector))
      .filter((element, index, all) => all.indexOf(element) === index)
      .filter((element) => {
        if (!element.getClientRects().length) return false;
        if (element.disabled || element.getAttribute("aria-disabled") === "true") return false;
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") return false;
        const text = clean(element.innerText || element.textContent || "");
        return text && text.length <= 80 && pattern.test(text);
      });
    return candidates.sort((left, right) => {
      const leftInteractive = left.matches("button,a,[role='button']") ? 0 : 1;
      const rightInteractive = right.matches("button,a,[role='button']") ? 0 : 1;
      return leftInteractive - rightInteractive ||
        clean(left.innerText || left.textContent || "").length - clean(right.innerText || right.textContent || "").length;
    })[0];
  };

  const ensureRepeatableEntries = async (repeatCounts, initialScan) => {
    let scan = initialScan;
    let changed = false;
    for (const group of Object.keys(repeatableFieldKeys)) {
      const desired = Math.max(0, Math.floor(Number(repeatCounts?.[group]) || 0));
      if (desired <= 1) continue;
      let current = repeatableFieldCount(scan.fields, group);
      let attempts = 0;
      while (current < desired && attempts < desired + 2) {
        const button = repeatAddButton(group);
        if (!button) break;
        try {
          button.scrollIntoView?.({ behavior: "auto", block: "center", inline: "nearest" });
        } catch {
          // Ignore pages with a custom scroll container.
        }
        clickControl(button);
        changed = true;
        attempts += 1;
        await nextFrame();
        await nextFrame();
        await sleep(100);
        scan = scanApplicationForm();
        const nextCount = repeatableFieldCount(scan.fields, group);
        if (nextCount <= current) {
          await sleep(180);
          scan = scanApplicationForm();
        }
        current = repeatableFieldCount(scan.fields, group);
      }
    }
    return { scan, changed };
  };

  const sendFillProgress = (payload) => {
    try {
      const pending = chrome.runtime?.sendMessage?.({
        type: "OFFERFLOW_FILL_PROGRESS",
        ...payload
      });
      pending?.catch?.(() => {});
    } catch {
      // The side panel may close while a fill is still running.
    }
  };
  const findRenderedOption = async (selectors, value, attempts = 8) => {
    const normalized = clean(value).toLowerCase();
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const target = Array.from(document.querySelectorAll(selectors)).find((option) =>
        clean(option.innerText || option.textContent || "").toLowerCase().includes(normalized)
      );
      if (target) return target;
      await nextFrame();
    }
    return undefined;
  };

  // Beisen/Phoenix does not use role="option" for its virtualized lists. The
  // actual selectable rows are phoenix-selectList__listItem elements rendered
  // in a portal, so the field root cannot be used to scope this lookup.
  const findPhoenixSelectOption = async (value, attempts = 10) => {
    const normalized = clean(value).toLowerCase();
    if (!normalized) return undefined;
    const selectors = [
      ".phoenix-selectList__listItem",
      "[role='option']",
      ".phoenix-select__option",
      "[class*='option']",
      "[class*='Option']",
      "[class*='menuItem']",
      "[class*='menu-item']",
      "[class*='listItem']"
    ].join(",");
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const candidates = Array.from(document.querySelectorAll(selectors)).filter((candidate) => {
        if (!candidate.getClientRects().length) return false;
        const style = window.getComputedStyle(candidate);
        return style.display !== "none" && style.visibility !== "hidden";
      });
      const texts = candidates.map((candidate) => ({
        candidate,
        text: clean(candidate.innerText || candidate.textContent || "").toLowerCase()
      }));
      const exact = texts.find(({ text }) => text === normalized);
      if (exact) return exact.candidate;
      const fuzzy = texts.find(({ text }) =>
        text && (text.includes(normalized) || normalized.includes(text))
      );
      if (fuzzy) return fuzzy.candidate;
      await nextFrame();
    }
    return undefined;
  };

  const findVisibleElement = async (selector, root = document, attempts = 12) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const target = Array.from(root.querySelectorAll(selector)).find((element) => {
        if (!element.getClientRects().length) return false;
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      });
      if (target) return target;
      await nextFrame();
    }
    return undefined;
  };

  const phoenixFieldLabel = (element) =>
    normalizeFieldText(element.getAttribute?.("data-nc-label") || "");

  const isPhoenixDateControl = (element) => {
    const root = element.closest?.(".phoenix-select");
    if (!root) return false;
    const icon = Array.from(root.querySelectorAll("use")).some((use) =>
      (use.getAttribute("href") || "") + " " + (use.getAttribute("xlink:href") || "")
        .includes("field_date_time_picker")
    );
    return icon || /日期|时间|生日|date/i.test(phoenixFieldLabel(element));
  };

  const isPhoenixAreaControl = (element) => {
    const root = element.closest?.(".phoenix-select");
    if (!root) return false;
    return /籍贯|户籍|户口|生源地|现居住地|现居城市|居住地|所在城市/i.test(phoenixFieldLabel(element));
  };

  const parsePhoenixDate = (value) => {
    const match = String(value || "").match(/(\d{4})[年./-](\d{1,2})(?:[月./-](\d{1,2}))?/);
    if (!match) return undefined;
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3] || 1)
    };
  };

  const choosePhoenixDate = async (element, value) => {
    const date = parsePhoenixDate(value);
    if (!date || date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) return false;
    const root = element.closest?.(".phoenix-select");
    if (!root) return false;
    let picker = await findVisibleElement(".phoenix-date-picker", document, 1);
    if (!picker) clickControl(root);
    picker = picker || await findVisibleElement(".phoenix-date-picker");
    if (!picker) return false;

    const yearButton = await findVisibleElement(".phoenix-calendar-year-select", picker);
    if (yearButton) {
      clickControl(yearButton);
      await nextFrame();
      let chosenYear = false;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const yearOption = Array.from(picker.querySelectorAll(".phoenix-calendar-year-panel-year")).find(
          (option) => Number(clean(option.innerText || option.textContent || "")) === date.year
        );
        if (yearOption) {
          clickControl(yearOption);
          await nextFrame();
          chosenYear = true;
          break;
        }
        const rangeText = clean(
          picker.querySelector(".phoenix-calendar-year-panel-decade-select")?.innerText || ""
        );
        const rangeStart = Number(rangeText.split("-")[0]);
        const button = date.year >= rangeStart
          ? picker.querySelector(".phoenix-calendar-year-panel-next-decade-btn")
          : picker.querySelector(".phoenix-calendar-year-panel-prev-decade-btn");
        if (!button) return false;
        clickControl(button);
        await nextFrame();
      }
      if (!chosenYear) return false;
    }

    const monthButton = await findVisibleElement(".phoenix-calendar-month-select", picker);
    if (monthButton) {
      clickControl(monthButton);
      await nextFrame();
      const monthOption = Array.from(picker.querySelectorAll(".phoenix-calendar-month-panel-month")).find(
        (option) => Number(clean(option.innerText || option.textContent || "").replace(/月/g, "")) === date.month
      );
      if (!monthOption) return false;
      clickControl(monthOption);
      await nextFrame();
    }

    const dayCell = Array.from(picker.querySelectorAll("td.phoenix-calendar-cell")).find((cell) => {
      const classes = String(cell.className || "");
      if (/last-month-cell|next-month-btn-day/.test(classes)) return false;
      const text = clean(cell.querySelector(".phoenix-calendar-date")?.innerText || cell.innerText || "");
      return text === String(date.day);
    });
    if (!dayCell) return false;
    clickControl(dayCell.querySelector(".phoenix-calendar-date") || dayCell);
    await nextFrame();
    await nextFrame();
    return true;
  };

  const normalizeAreaToken = (value) =>
    clean(value)
      .replace(/\s+/g, "")
      .replace(/(特别行政区|自治区|省|市|区|县)$/g, "");

  const choosePhoenixArea = async (element, value) => {
    const root = element.closest?.(".phoenix-select");
    if (!root) return false;
    const rawParts = String(value || "")
      .split(/[,，、/|>]+/)
      .map((part) => normalizeAreaToken(part))
      .filter(Boolean);
    if (!rawParts.length) return false;
    let selector = await findVisibleElement(".area-selector-container", document, 1);
    if (!selector) clickControl(root);
    selector = selector || await findVisibleElement(".area-selector-container");
    if (!selector) return false;

    for (const part of rawParts) {
      let option = Array.from(selector.querySelectorAll(".area-text-label")).find((candidate) => {
        if (!candidate.getClientRects().length) return false;
        const text = normalizeAreaToken(candidate.innerText || candidate.textContent || "");
        return text === part || text.includes(part) || part.includes(text);
      });
      if (!option) {
        const search = await findVisibleElement(".area-search-input input", selector);
        if (search) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          if (setter) setter.call(search, part);
          else search.value = part;
          search.dispatchEvent(new Event("input", { bubbles: true }));
          search.dispatchEvent(new Event("change", { bubbles: true }));
          await nextFrame();
          option = Array.from(selector.querySelectorAll(".area-text-label")).find((candidate) => {
            if (!candidate.getClientRects().length) return false;
            const text = normalizeAreaToken(candidate.innerText || candidate.textContent || "");
            return text === part || text.includes(part) || part.includes(text);
          });
        }
      }
      if (!option) return false;
      // Phoenix binds the selection handler to the text label. Clicking the
      // outer layout wrapper looks correct but does not advance the cascade.
      clickControl(option);
      await nextFrame();
    }

    const confirm = Array.from(document.querySelectorAll(".phoenix-button")).find(
      (button) => button.getClientRects().length && clean(button.innerText || button.textContent || "") === "确定"
    );
    if (!confirm) return false;
    clickControl(confirm);
    await nextFrame();
    await nextFrame();
    return true;
  };

  const setNativeValue = async (element, value) => {
    prepareControlInteraction(element);
    if (element instanceof HTMLSelectElement) {
      const normalized = clean(value).toLowerCase();
      const option = Array.from(element.options).find((item) => {
        const text = clean(`${item.text} ${item.value}`).toLowerCase();
        return text === normalized || text.includes(normalized) || normalized.includes(text);
      });
      if (!option) return false;
      element.value = option.value;
    } else if (element instanceof HTMLInputElement && element.type === "radio") {
      const radios = Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`));
      const normalized = clean(value).toLowerCase();
      const target = radios.find((radio) => clean(`${radio.value} ${fieldLabel(radio)}`).toLowerCase().includes(normalized));
      if (!target) return false;
      target.checked = true;
      element = target;
    } else if (element instanceof HTMLInputElement && element.type === "checkbox") {
      const normalized = clean(value).toLowerCase();
      const checked = /^(1|true|yes|y|是|接受|愿意|同意|有)$/.test(normalized);
      element.checked = checked;
    } else if (element.getAttribute("role") === "radio") {
      const normalized = clean(value).toLowerCase();
      const container = element.closest("[role='radiogroup'],fieldset,[class*='form-item'],[class*='question']") || element.parentElement;
      const options = Array.from(container?.querySelectorAll("[role='radio'],input[type='radio'],label") || []);
      const target = options.find((option) => clean(`${option.getAttribute("aria-label") || ""} ${option.innerText || option.textContent || ""} ${option.getAttribute("data-value") || ""}`).toLowerCase().includes(normalized));
      if (!target) return false;
      const targetRadio = target.matches("[role='radio'],input[type='radio']")
        ? target
        : target.querySelector("[role='radio'],input[type='radio']") || target;
      clickControl(targetRadio);
      targetRadio.setAttribute("aria-checked", "true");
      element = targetRadio;
    } else if (element.getAttribute("role") === "checkbox") {
      const normalized = clean(value).toLowerCase();
      const shouldCheck = /^(1|true|yes|y|是|接受|愿意|同意|有)$/.test(normalized);
      const checked = element.getAttribute("aria-checked") === "true";
      if (shouldCheck !== checked) clickControl(element);
      element.setAttribute("aria-checked", String(shouldCheck));
    } else if (element.matches?.(radioGroupSelector)) {
      const normalized = clean(value).toLowerCase();
      const options = Array.from(element.querySelectorAll(".phoenix-radio-group__radioItem,[class*='radio--withLabel']"));
      const target = options.find((option) => clean(option.innerText || option.textContent || "").toLowerCase().includes(normalized));
      if (!target) return false;
      // Phoenix attaches React's onClick to the inner .phoenix-radio node,
      // while the outer radioItem is only a layout wrapper.
      const clickable = target.matches?.(".phoenix-radio,[class*='radio--withLabel']")
        ? target
        : target.querySelector(".phoenix-radio,[class*='radio--withLabel']") || target;
      clickControl(clickable);
    } else if (element.matches?.(checkboxSelector)) {
      const input = element.querySelector("input[type='checkbox']");
      if (!input) return false;
      const normalized = clean(value).toLowerCase();
      const shouldCheck = /^(1|true|yes|y|是|接受|愿意|同意|有)$/.test(normalized);
      if (input.checked !== shouldCheck) clickControl(element);
    } else if (element.matches?.(cascaderSelector)) {
      clickControl(element);
      const target = await findRenderedOption(
        "[role='option'],.el-cascader-node,.el-cascader-menu__item,[class*='cascader'] li",
        value
      );
      if (!target) return false;
      clickControl(target);
    } else if (element.getAttribute("role") === "combobox") {
      const nativeInput = element instanceof HTMLInputElement ? element : element.querySelector("input");
      if (nativeInput) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (setter) setter.call(nativeInput, value);
        else nativeInput.value = value;
        dispatchInputEvents(nativeInput);
        nativeInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        nativeInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      } else {
        clickControl(element);
        const target = await findRenderedOption("[role='option'],li,[class*='option'],[class*='Option']", value);
        if (!target) return false;
        clickControl(target);
      }
    } else if (element.closest?.(".el-select")) {
      const root = element.closest(".el-select");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(element, value);
      else element.value = value;
      dispatchInputEvents(element);
      clickControl(root);
      const target = await findRenderedOption(
        ".el-select-dropdown__item,[role='option'],[class*='option']",
        value
      );
      if (target) clickControl(target);
    } else if (element.closest?.(".phoenix-select") && isPhoenixDateControl(element)) {
      const selected = await choosePhoenixDate(element, value);
      if (!selected) return false;
    } else if (element.closest?.(".phoenix-select") && isPhoenixAreaControl(element)) {
      const selected = await choosePhoenixArea(element, value);
      if (!selected) return false;
    } else if (element.closest?.(".phoenix-select")) {
      const root = element.closest(".phoenix-select");
      // Open first, then choose the rendered row. Writing the hidden input
      // before opening can make Phoenix filter away the very option we need.
      clickControl(root.querySelector(".phoenix-select__input") || root);
      await nextFrame();
      const target = await findPhoenixSelectOption(value);
      if (!target) return false;
      clickControl(target.closest?.(".phoenix-selectList__listItem") || target);
      await nextFrame();
    } else if (element.getAttribute("contenteditable") === "true") {
      element.textContent = value;
    } else {
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(element, value);
      else element.value = value;
    }
    dispatchInputEvents(element);
    return true;
  };

  const fillApplicationForm = async (fields, values, options = {}) => {
    const items = Array.isArray(fields) ? fields : [];
    const profileValues = values || {};
    const fieldValues = options.fieldValues && typeof options.fieldValues === "object"
      ? options.fieldValues
      : {};
    const requestedDelay = Number(options.delayMs);
    const delayMs = Number.isFinite(requestedDelay)
      ? Math.max(0, Math.min(180, requestedDelay))
      : 55;
    const results = [];
    const total = items.length;
    const pauseBetweenFields = async () => {
      if (delayMs > 0) await sleep(delayMs);
    };
    const publishField = async (field, index, result) => {
      results.push(result);
      sendFillProgress({
        stage: "field",
        current: index + 1,
        total,
        label: field.label,
        field: { id: field.id, label: field.label, key: field.key },
        result
      });
      await pauseBetweenFields();
    };
    sendFillProgress({ stage: "started", current: 0, total });
    for (let index = 0; index < items.length; index += 1) {
      const field = items[index];
      const hasFieldValue = Object.prototype.hasOwnProperty.call(fieldValues, field.id);
      const value = hasFieldValue ? fieldValues[field.id] : field.key ? profileValues[field.key] : undefined;
      const base = { id: field.id, label: field.label, key: field.key, expectedValue: value ? String(value) : undefined };
      if (!field.key || !value) {
        await publishField(field, index, { ...base, status: field.key ? "missing" : "skipped", reason: field.key ? "个人资料未填写" : "未匹配到资料字段" });
        continue;
      }
      const element = document.querySelector(`[data-offerflow-field-id="${CSS.escape(field.id)}"]`);
      if (!element) {
        await publishField(field, index, { ...base, status: "failed", reason: "页面控件已变化，请重新识别" });
        continue;
      }
      try {
        const written = await setNativeValue(element, String(value));
        // Give the browser one paint opportunity per field. This keeps the
        // page-following interaction visible while remaining very fast.
        await nextFrame();
        const actualValue = readControlValue(element);
        const normalizedExpected = clean(String(value)).toLowerCase();
        const normalizedActual = actualValue.toLowerCase();
        const verified = written && (normalizedActual === normalizedExpected || normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual));
        await publishField(field, index, { ...base, status: verified ? "filled" : "failed", actualValue, reason: verified ? undefined : "写入后回读值不一致" });
      } catch (error) {
        await publishField(field, index, { ...base, status: "failed", reason: error instanceof Error ? error.message : "控件不支持写入" });
      }
    }
    const filled = results.filter((result) => result.status === "filled").length;
    sendFillProgress({ stage: "done", current: total, total, filled });
    return {
      filled,
      results
    };
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return;
    if (message.type === "OFFERFLOW_TOGGLE_OVERLAY") {
      const existing = document.getElementById("offerflow-overlay-host");
      if (existing) {
        existing.remove();
        sendResponse({ ok: true, open: false });
        return;
      }

      const host = document.createElement("div");
      host.id = "offerflow-overlay-host";
      Object.assign(host.style, {
        position: "fixed",
        zIndex: "2147483647",
        top: "14px",
        right: "16px",
        width: "min(430px, calc(100vw - 28px))",
        height: "calc(100vh - 28px)",
        minHeight: "520px",
        borderRadius: "20px",
        overflow: "hidden",
        background: "#ffffff",
        border: "1px solid rgba(20, 24, 22, 0.10)",
        boxShadow: "0 24px 70px rgba(20, 24, 22, 0.20), 0 3px 12px rgba(20, 24, 22, 0.08)",
        isolation: "isolate"
      });

      const frame = document.createElement("iframe");
      frame.src = chrome.runtime.getURL("sidepanel.html?surface=overlay");
      frame.title = "OfferDuoDuo";
      frame.setAttribute("allow", "clipboard-write");
      Object.assign(frame.style, {
        width: "100%",
        height: "100%",
        display: "block",
        border: "0",
        background: "#ffffff"
      });
      host.appendChild(frame);
      document.documentElement.appendChild(host);
      sendResponse({ ok: true, open: true });
      return;
    }

    if (message.type === "OFFERFLOW_SCAN_APPLICATION_FORM") {
      Promise.resolve(window.OfferFlowFormAdapters?.ready)
        .then(async () => {
          try {
            const initialScan = scanApplicationForm();
            const ensured = await ensureRepeatableEntries(message.repeatCounts || {}, initialScan);
            sendResponse({ ok: true, ...ensured.scan, repeatersExpanded: ensured.changed });
          } catch (error) {
            sendResponse({ ok: false, error: error instanceof Error ? error.message : "表单识别失败" });
          }
        })
        .catch((error) => {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "表单识别失败" });
        });
      return true;
    }

    if (message.type === "OFFERFLOW_FILL_APPLICATION_FORM") {
      fillApplicationForm(message.fields || [], message.values || {}, {
        delayMs: message.delayMs,
        fieldValues: message.fieldValues || {}
      })
        .then((report) => sendResponse({ ok: true, ...report }))
        .catch((error) => {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "表单填写失败" });
        });
      return true;
    }

    if (message.type !== "OFFERFLOW_EXTRACT_PAGE") return;
    try {
      sendResponse({ ok: true, data: extract() });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "页面解析失败"
      });
    }
  });

  window.addEventListener("message", (event) => {
    if (event.data?.type === "OFFERFLOW_CLOSE_OVERLAY") {
      document.getElementById("offerflow-overlay-host")?.remove();
    }
  });

  let lastProgressSignature = "";
  let monitorTimer;

  const progressSnapshot = () => {
    const data = extract();
    const evidence = (data.progressEvidence || [])
      .filter(
        (item) =>
          item.position &&
          (item.currentStage || item.terminalStatus) &&
          item.confidence >= 0.8
      )
      .map((item) => ({
        jobId: item.jobId || "",
        recordUrl: item.recordUrl || "",
        company: item.company || "",
        position: extractionRules.normalizePosition(item.position),
        city: item.city || "",
        appliedAt: item.appliedAt || "",
        currentStage: item.currentStage || "",
        terminalStatus: item.terminalStatus || "",
        steps: item.steps.map((step) => `${step.label}:${step.state}`)
      }))
      .sort((left, right) =>
        `${left.jobId}|${left.position}`.localeCompare(`${right.jobId}|${right.position}`)
      );

    if (!evidence.length) return undefined;
    return {
      data,
      signature: JSON.stringify({
        page: `${location.hostname}${location.pathname}`,
        evidence
      })
    };
  };

  const reportProgressPage = () => {
    const snapshot = progressSnapshot();
    if (!snapshot || snapshot.signature === lastProgressSignature) return;
    lastProgressSignature = snapshot.signature;

    chrome.runtime.sendMessage({
      type: "OFFERFLOW_PROGRESS_PAGE_CHANGED",
      signature: snapshot.signature,
      data: snapshot.data
    }).catch(() => {
      // The extension may have been reloaded while this page remained open.
    });
  };

  const scheduleProgressCheck = (delay = 1800) => {
    clearTimeout(monitorTimer);
    monitorTimer = setTimeout(reportProgressPage, delay);
  };

  const observer = new MutationObserver(() => scheduleProgressCheck());
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "aria-current", "data-status", "data-state"]
  });

  // Initial silent sync after SPA content has had time to render.
  scheduleProgressCheck(2600);
})();

