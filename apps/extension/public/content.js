(() => {
  // The OfferFlow web app mirrors synced applications in its own tables and
  // selects. Its stage options include “已结束”, which must never be captured
  // back as recruitment-page evidence (it would auto-close records via sync).
  const isOfferFlowWebApp = Boolean(
    document.querySelector(
      'a[href^="/app/applications"], a[href^="/app/opportunities"], a[href^="/app/chat"]'
    )
  );
  if (isOfferFlowWebApp) return;

  // Static MV3 content scripts stay alive when an unpacked extension is
  // reloaded. ProfileView therefore injects the current artifact before every
  // form operation and uses versioned messages that stale listeners ignore.
  const OFFERFLOW_CONTENT_RUNTIME_VERSION = "2026-08-25.autofill-v28";
  const contentSession = globalThis.__offerflowDesiredContentSession || `manifest:${OFFERFLOW_CONTENT_RUNTIME_VERSION}`;
  if (globalThis.__offerflowContentRuntimeSession === contentSession) return;
  try {
    globalThis.__offerflowContentCleanup?.();
  } catch {
    // A listener from a reloaded extension can keep its page world while its
    // chrome.runtime context is invalid. DOM cleanup still runs where possible.
  }
  globalThis.__offerflowContentRuntimeSession = contentSession;

  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
  const formRuntime = globalThis.OfferFlowFormRuntime;
  const formControlDrivers = globalThis.OfferFlowControlDrivers;
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

  const splitListItems = (value) => String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\s+(?=\d+[.、)]\s*)/g, "\n")
    .replace(/\s+(?=[-•·●]\s*)/g, "\n")
    .split(/[\n；;]+/)
    .map((item) => item
      .replace(/^\s*(?:[-•·●]|\d+[.、)])\s*/, "")
      .replace(/^(?:岗位职责|职位职责|工作职责|任职资格|任职要求|职位要求|岗位要求|加分项)[：:]\s*/i, "")
      .trim())
    .filter((item) => item.length >= 3);

  const textList = (value) => {
    if (Array.isArray(value)) return value.flatMap((item) => splitListItems(item));
    if (typeof value !== "string") return [];
    return splitListItems(value).slice(0, 20);
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
  const normalizeProgressPosition = extractionRules.normalizePosition;

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

  // Application record lists (for example zhiye.com 投递记录) often render one
  // status line per card instead of a full multi-step timeline. A lone stage
  // label is still treated as a progress region when its container also carries
  // an application-record marker: a 投递/申请 timestamp, an application id, or
  // a job code such as J14442.
  const applicationRecordMarker =
    /(?:投递|申请|应聘|报名)(?:时间|日期)[：:\s]*20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}|20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?(?:\s+\d{1,2}:\d{2})?\s*(?:投递|申请)(?!截止|开始|时间)|[A-Z]\d{5,}|\d{10,16}/i;

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
        if (labels.length === 1 && applicationRecordMarker.test(text)) {
          regions.push(stageElement);
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

  const applicationDateValue = (value) =>
    clean(value)
      .replace(/[年月./]/g, "-")
      .replace(/日(?=\s|$)/, "");

  const applicationDateFromText = (value, allowBareDate = false) => {
    const text = String(value || "");
    const explicit =
      text.match(
        /(?:投递时间|申请时间|提交时间|申请日期)[：:\s]*(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?(?:\s+\d{1,2}:\d{2})?)/i
      )?.[1] ||
      text.match(
        /(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?(?:\s+\d{1,2}:\d{2})?)\s*(?:投递|申请)(?!截止|开始|时间)/i
      )?.[1];
    const bare = allowBareDate
      ? text.match(/(?:^|\s)(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?)(?=\s|$)/)?.[1]
      : undefined;
    return explicit || bare ? applicationDateValue(explicit || bare) : undefined;
  };

  const companyCampaignLabelPattern =
    /^(?:校园招聘|社会招聘|实习生招聘|应届生招聘|应届生|校招生|人才招聘|招聘官网|招聘平台|招聘门户|招聘首页|秋招|春招|校招|社招|招聘|\d{4}届(?:应届生|校招生|实习生)?)$/i;

  const companyFromDocumentTitle = () => {
    const title = clean(document.title);
    const titleCompany = title.match(
      /(?:^|[-–—_|｜]\s*)([^\s｜|_-]{2,30}?)(?:官方)?(?:校招|校园招聘|招聘官网|招聘平台|招聘门户|人才招聘|招聘)(?:\s*[-–—_|｜]|$)/i
    )?.[1];
    if (
      titleCompany &&
      !companyCampaignLabelPattern.test(titleCompany) &&
      !/^(?:应聘记录|投递记录|申请记录|我的申请)$/.test(titleCompany)
    ) {
      return titleCompany;
    }
    const tenant = location.hostname.toLowerCase().match(/^([a-z0-9-]+)\.jobs\.feishu\.cn$/)?.[1];
    return tenant === "nio" ? "蔚来" : undefined;
  };

  const feishuPositionCandidateFromCard = (card, excludedRegions) => {
    const candidates = Array.from(card.querySelectorAll("*")).slice(0, 1000).flatMap((element) => {
      if (!isVisibleElement(element) || isWithinAnyRegion(element, excludedRegions)) return [];
      const value = ownText(element);
      if (!value || value.length < 2 || value.length > 80) return [];
      if (extractionRules.isHardRejectedPosition(value)) return [];
      if (/项目[：:]|意向城市|投递简历|申请时间|投递时间|20\d{2}[./-]\d{1,2}/.test(value)) return [];
      // Feishu renders taxonomy as “产品 - 产品经理”. It contains an
      // occupation token but is metadata, while real titles are independent
      // leaf lines such as “提前批-AI产品经理（创新产品）”.
      if (/^.{1,12}\s+[-–—]\s+.{1,30}$/.test(value)) return [];
      const occupationScore = extractionRules.occupationScore(value);
      if (occupationScore < 3) return [];
      const style = getComputedStyle(element);
      const fontSize = Number.parseFloat(style.fontSize) || 0;
      const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
      const className = String(element.className || "");
      const score =
        occupationScore * 8 +
        (/^H[1-6]$/.test(element.tagName) ? 32 : 0) +
        (/position.*(?:title|name)|job.*(?:title|name)/i.test(className) ? 28 : 0) +
        (fontWeight >= 600 ? 10 : 0) +
        Math.min(12, Math.max(0, fontSize - 14));
      return [{ value, score, element }];
    });
    return candidates.sort((left, right) => right.score - left.score)[0];
  };

  const mokaJobDetail = () => {
    if (platformAdapter.id !== "mokahr") return undefined;

    const fieldValue = (label) => {
      const row = Array.from(document.querySelectorAll('[class*="info-row"]')).find((candidate) => {
        const heading = clean(candidate.querySelector('[class*="body-tertiary"]')?.innerText || "");
        return heading === label || heading.replace(new RegExp(`^(?:${label})\\s+`), "") === label;
      });
      return clean(row?.querySelector('[class*="value-"]')?.innerText || "") || undefined;
    };

    const companyHeading = Array.from(document.querySelectorAll("div, span"))
      .find((element) => clean(element.innerText) === "公司信息");
    const companySection = companyHeading?.parentElement;
    const company = Array.from(companySection?.querySelectorAll("div") || [])
      .map((element) => clean(element.innerText))
      .find((value) => /(?:有限公司|有限责任公司|集团)$/.test(value) && value.length <= 60);

    const panelTitle = clean(
      document.querySelector('[class*="apply-panel--jobs"] [class*="left-panel"] [class*="title-"]')?.textContent || ""
    );
    const position = fieldValue("职位名称") || panelTitle;
    const city = fieldValue("工作地点");

    if (!position || extractionRules.isHardRejectedPosition(position)) return undefined;
    return { company, position, city };
  };

  const feishuApplicationEvidence = () => {
    if (platformAdapter.id !== "feishu-jobs") {
      return [];
    }

    const allElements = Array.from(document.body.querySelectorAll("*")).slice(0, 16000);
    const anchors = allElements.filter((element) => {
      if (!isVisibleElement(element)) return false;
      const value = ownText(element);
      return /^(?:投递简历|已投递|申请成功|已申请)$/.test(value);
    });
    const cards = [];
    for (const anchor of anchors) {
      let current = anchor.parentElement;
      let best;
      for (let depth = 0; current && current !== document.body && depth < 9; depth += 1) {
        const text = clean(current.innerText || "");
        if (!text || text.length > 1800) break;
        const date = applicationDateFromText(text, true);
        const position =
          feishuPositionCandidateFromCard(current, [anchor]) ||
          positionCandidateFromCard(current, [anchor]);
        const otherAnchorCount = anchors.filter(
          (candidate) => candidate !== anchor && current.contains(candidate)
        ).length;
        if (date && position && !otherAnchorCount) {
          best = { card: current, position, appliedAt: date };
        }
        current = current.parentElement;
      }
      if (best && !cards.some((item) => item.card === best.card)) cards.push(best);
    }

    const company = companyFromDocumentTitle();
    return cards.map(({ card, position, appliedAt }) => {
      const cardText = clean(card.innerText || "");
      const recordUrl = Array.from(card.querySelectorAll("a[href]"))
        .map((anchor) => anchor.href)
        .find((href) => /(?:position|job|detail)/i.test(href));
      const jobId =
        extractionRules.extractApplicationId(cardText, platformAdapter) ||
        (() => {
          try {
            const url = new URL(recordUrl || "", location.href);
            return url.searchParams.get("jobId") || url.searchParams.get("positionId") || undefined;
          } catch {
            return undefined;
          }
        })();
      const city = cardText.match(
        /(?:^|\s)(北京|天津|上海|重庆|广州|深圳|杭州|南京|苏州|武汉|成都|西安|郑州|济南|青岛|长沙|厦门|福州|合肥|南昌|昆明|贵阳|南宁|海口|沈阳|大连|长春|哈尔滨)(?:市)?(?=\s|$)/
      )?.[1];
      return {
        jobId,
        recordUrl,
        position: position.value,
        company,
        city,
        appliedAt,
        currentStage: "已投递",
        terminalStatus: undefined,
        context: cardText.slice(0, 1200),
        adapterId: platformAdapter.id,
        steps: [{ label: "已投递", state: "current" }],
        confidence: 0.98
      };
    });
  };

  const positionCandidateFromCard = (card, progressRegions) => {
    const adapterSelector = platformAdapter.positionSelectors.join(",");
    const genericSelector =
      'a[href],h1,h2,h3,h4,h5,h6,strong,[class*="job-title"],[class*="jobTitle"],[class*="job-name"],[class*="jobName"],[class*="job_name"],[class*="position"],[class*="title"]';
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
        const classScore = /job-title|jobTitle|job-name|jobName|job_name|position/i.test(className)
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
                !/\d{4}[./-]\d{1,2}[./-]\d{1,2}/.test(value) &&
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
    const terminalCandidate = explicitStage && terminalPattern.test(explicitStage.label)
      ? explicitStage.label
      : cardText.match(terminalPattern)?.[0];
    // A terminal status on a job-detail page (“该职位已结束”) means the position
    // stopped recruiting, not that this application was terminated. Only trust
    // terminal text on application-record pages (投递记录/申请记录) or when the
    // card carries an explicit 投递/申请 timestamp.
    const isApplicationRecordPage =
      /(?:personal|account|user)\/|delivery|application|投递记录|申请记录|my[-_]?applications/i.test(
        location.href
      );
    const hasAppliedTimestamp =
      /(?:投递时间|申请时间|提交时间|申请日期)[：:\s]*20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}|20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?(?:\s+\d{1,2}:\d{2})?\s*(?:投递|申请)(?!截止|开始|时间)/i.test(
        cardText
      );
    if (terminalCandidate && !isApplicationRecordPage && !hasAppliedTimestamp) {
      return undefined;
    }
    const terminalStatus = terminalCandidate;
    const rawStepElements = stageElementsIn(region);
    const uniqueSteps = [];
    const seenFamilies = new Set();
    for (const element of rawStepElements) {
      const label = stageTextValue(ownText(element));
      if (!label || terminalPattern.test(label)) continue;
      const baseLabel = label.replace(/(?:中|完成|通过|不通过|结果)$/i, "");
      // “简历筛选中” is a variant of “简历筛选”; only skip it when a
      // different element already carries the base label. A lone “简历筛选中”
      // status (common on application record lists) must still become a step.
      const hasExplicitBase = rawStepElements.some(
        (other) =>
          other !== element &&
          stageTextValue(ownText(other)).replace(/(?:中|完成|通过|不通过|结果)$/i, "") ===
            baseLabel
      );
      if (label !== baseLabel && hasExplicitBase) continue;
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
    const appliedAt =
      cardText.match(
        /(?:投递时间|申请时间|提交时间|申请日期)[：:\s]*(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?)/i
      )?.[1] ||
      cardText.match(
        /(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?(?:\s+\d{1,2}:\d{2})?)\s*(?:投递|申请)(?!截止|开始|时间)/i
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
    const feishuEvidence = feishuApplicationEvidence();
    if (feishuEvidence.length) return feishuEvidence;

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
    const mokaDetail = mokaJobDetail();
    const headingTitle = clean(document.querySelector("h1")?.textContent || "");
    const title = clean(
      mokaDetail?.position ||
        headingTitle ||
        (posting && posting.title) ||
        meta("og:title", "twitter:title") ||
        document.title
    );
    const organization = posting && posting.hiringOrganization;
    const address = posting && posting.jobLocation && posting.jobLocation.address;
    const titleParts = title.split(/[-–—_|｜]/).map(clean).filter(Boolean);
    const roleFromText = (value) => {
      const candidate = clean(value).match(
        /【[^】]{0,24}】\s*([^\n]{2,100}?)(?=\s+(?:校园招聘|社会招聘|实习生招聘|全职|兼职|工作地点|上海市|北京市|广州市|深圳市))/i
      )?.[1];
      return candidate && extractionRules.occupationScore(candidate) >= 3 ? clean(candidate) : undefined;
    };

    const adapterCompany = platformAdapter.id === "feishu-jobs"
      ? companyFromDocumentTitle()
      : undefined;
    // A title segment that is only a recruitment campaign label (e.g. 应届生招聘)
    // is not an employer; fall through to the next candidate instead.
    const titleCompanyPart = [...titleParts]
      .reverse()
      .find((part) => !companyCampaignLabelPattern.test(part));
    const company =
      mokaDetail?.company ||
      clean(organization && organization.name) ||
      adapterCompany ||
      firstMatch(text, [
        /(?:公司名称|招聘单位|企业名称)[：:\s]+([^\s｜|]{2,30})/i,
        /([^\s｜|]{2,30}(?:有限公司|集团))/
      ]) ||
      titleCompanyPart ||
      location.hostname.replace(/^www\./, "").split(".")[0];
    const normalizedCompany = company
      .replace(/\s*(?:招聘门户|招聘官网|招聘平台|人才招聘门户|人才招聘官网)$/i, "")
      .trim();

    const postingPosition = clean(posting && posting.title);
    const position =
      mokaDetail?.position ||
      (postingPosition && !extractionRules.isHardRejectedPosition(postingPosition) ? postingPosition : undefined) ||
      roleFromText(headingTitle) ||
      roleFromText(text) ||
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
      mokaDetail?.city ||
      clean(address && (address.addressLocality || address.addressRegion)) ||
      firstMatch(text, [
        /(?:工作地点|工作城市|职位地点|办公地点)[：:\s]+([^\s，,；;]{2,20})/i
      ]);

    const appliedAtRaw = firstMatch(text, [
      /(?:投递时间|申请时间|提交时间)[：:\s]*(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?(?:\s+\d{1,2}:\d{2})?)/i,
      /(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?(?:\s+\d{1,2}:\d{2})?)\s*(?:投递|申请)(?!截止|开始|时间)/i
    ]);

    const description = clean((posting && posting.description) || meta("description", "og:description"));
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

    const recruitmentType = [position, description, text.slice(0, 6000)]
      .map((source, sourceIndex) => {
        if (/(?:秋招|秋季(?:校园)?招聘|校园招聘|校招).{0,16}提前批|提前批.{0,16}(?:秋招|秋季(?:校园)?招聘|校园招聘|校招)/i.test(source || "")) return "autumn_early";
        if (/暑期实习|暑假实习|暑期(?:项目|项目制)|summer\s+intern(?:ship)?/i.test(source || "")) return "summer_internship";
        if (/春招|春季(?:校园)?招聘|spring\s+(?:campus\s+)?recruit(?:ment)?/i.test(source || "")) return "spring";
        if (/日常实习|长期实习|滚动实习|off[- ]?cycle\s+intern(?:ship)?/i.test(source || "")) return "daily_internship";
        if (sourceIndex === 0 && /实习生(?:招聘|岗位|职位)?|(?:^|[^暑])实习(?:岗位|职位|招聘)?/i.test(source || "")) return "daily_internship";
        if (/秋招|秋季(?:校园)?招聘|校园招聘|校招|autumn\s+(?:campus\s+)?recruit(?:ment)?|campus\s+recruit(?:ment)?/i.test(source || "")) return "autumn";
        return undefined;
      })
      .find(Boolean);

    return {
      company: normalizedCompany || company,
      position,
      jobId,
      city,
      recruitmentType,
      appliedAt: appliedAtRaw
        ? appliedAtRaw.replace(/[年月./]/g, "-").replace(/日(?=\s|$)/, "")
        : undefined,
      summary: (description || responsibilities.slice(0, 2).join(" ")).slice(0, 280),
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
    ["currentCity", /现居|当前城市|所在城市|所在地点|所在地|居住地|current\s*(city|location)/i],
    ["nativePlace", /籍贯|户籍|户口|户口所在地|生源地|家乡|natives*place|hometown/i],
    ["height", /身高|height/i],
    ["weight", /体重|weight/i],
    ["recruitmentType", /是否统招|统招|统一招生|recruitments*type/i],
    ["graduateStatus", /应届|往届|毕业身份|应届往届|graduates*status/i],
    ["healthStatus", /健康状况|健康情况|身体状况|health/i],
    ["specialty", /特长|专长|specialty|strengths?/i],
    ["workYears", /工作年限|工作经验年限|工作经验|从业年限|work\s*years?/i],
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
    ["educationForm", /学历类型|学习形式|培养方式|教育形式|招生类型|入学类型|study\s*form|education\s*type/i],
    ["degree", /学历|学位|degree|education\s*level/i],
    ["gpa", /绩点|gpa|平均成绩/i],
    ["selfIntroduction", /自我介绍|自我描述|个人简介|个人总结|self.?intro|about\s*you/i],
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

  const mokaFieldTitle = (element) => {
    const field = element.closest?.("[class*='apply-field-']");
    if (!field) return "";
    const title = Array.from(field.children || []).find((child) =>
      Array.from(child.classList || []).some((className) => className.startsWith("title-"))
    );
    return normalizeFieldText(title?.innerText || title?.textContent || "");
  };

  const formilyFieldMetadata = (element) => {
    const item = element.closest?.(".ud-formily-item,[id^='formily-item-']");
    const label = normalizeFieldText(
      element.getAttribute?.("data-form-field-i18n-name") ||
      item?.querySelector?.(".ud-formily-item-label-content")?.innerText ||
      item?.querySelector?.(".ud-formily-item-label")?.innerText ||
      ""
    );
    const fieldName = normalizeFieldText(
      element.getAttribute?.("data-form-field-name") ||
      element.getAttribute?.("data-form-field-id") ||
      item?.id?.replace(/^formily-item-/, "") ||
      ""
    );
    return { item, label, fieldName };
  };

  const fieldLabel = (element) => {
    const labels = element.labels ? Array.from(element.labels) : [];
    const explicit = labels.map(labelText).find(Boolean) || "";
    const wrapping = element.closest("label");
    const formItem = element.closest(".el-form-item,.md-form-item,[class~='form-item'],fieldset");
    const structural = formItem?.querySelector(
      "label.el-form-item__label,label.md-form-item__label,[class~='el-form-item__label'],[class~='md-form-item__label'],.form-item__text,[class*='form-item__text']"
    );
    const labelledBy = ariaLabelledByText(element);
    const siteLabel = ancestorAttributeText(element, "data-nc-label");
    const dataField = ancestorAttributeText(element, "data-field");
    const mokaTitle = mokaFieldTitle(element);
    const formilyLabel = formilyFieldMetadata(element).label;
    const nearby = nearbyLabelText(element);
    return clean(
      explicit ||
        labelText(structural) ||
        mokaTitle ||
        formilyLabel ||
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
    const formItem = element.closest(".el-form-item,.md-form-item,[class~='form-item'],fieldset");
    const structural = formItem?.querySelector(
      "label.el-form-item__label,label.md-form-item__label,[class~='el-form-item__label'],[class~='md-form-item__label'],.form-item__text,[class*='form-item__text']"
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
        mokaFieldTitle(element) ||
        formilyFieldMetadata(element).label ||
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
    const mokaBlockId = element.closest?.("[data-nav-id]")?.getAttribute("data-nav-id") || "";
    if (mokaBlockId === "block-basicInfo" && /^证件号码/.test(mokaFieldTitle(element) || label)) {
      return element.closest?.("label[class*='sd-Select-container-']")
        ? map("idType", "Moka 证件类型复合字段")
        : map("idNumber", "Moka 证件号码复合字段");
    }
    const isEducation = /教育|学历|学业|education|academic/i.test(context);
    const isMiofficeApplication = /\.mioffice\.cn$/i.test(location.hostname) && /\/resume\/.+\/apply/i.test(location.pathname);
    const isMiofficeExperienceEntry = (() => {
      if (!isMiofficeApplication) return false;
      let current = element.parentElement;
      for (let depth = 0; current && depth < 9; depth += 1, current = current.parentElement) {
        const text = normalizeFieldText(current.innerText || current.textContent || "");
        if (text.length > 2400) break;
        if (/公司名称/.test(text) && /职位名称/.test(text) && /(?:起止时间|描述)/.test(text)) return true;
      }
      return false;
    })();
    const isExperience = (
      /工作|实习|任职|employment|work/i.test(context) && !/项目|在校/i.test(context)
    ) || isMiofficeExperienceEntry;
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
    const pairedDateIndex = () => {
      const container = element.closest?.(
        "label,.el-form-item,[class~='form-item'],[class*='formItem'],[class*='field'],[class*='control']"
      );
      if (!container) return -1;
      const controls = Array.from(container.querySelectorAll("input,[role='textbox'],[role='combobox']"))
        .filter((control) => {
          if (control instanceof HTMLInputElement && ["hidden", "button", "submit"].includes(control.type)) return false;
          return control.getClientRects().length > 0;
        });
      return controls.length >= 2 ? controls.indexOf(element) : -1;
    };
    if (/^推荐码$|^邀请码$|^内推码$|referral\s*code/i.test(label)) {
      return map("referralCode", "通用字段规则");
    }
    if (element.matches?.(".currently-checkbox") ||
      /^至今$|当前在职|仍在职|我?当前在这里工作|目前在职|current\s*employment/i.test(label)) {
      return map("experienceCurrent", "工作经历状态规则");
    }
    if (/基本信息|个人信息|basic|personal/i.test(context)) {
      for (const result of [
        byLabel(/紧急联系人姓名|紧急联系人名称|emergency\s*contact.*name/i, "emergencyContactName", "基本信息上下文"),
        byLabel(/紧急联系人电话|紧急联系人手机|emergency\s*contact.*phone/i, "emergencyContactPhone", "基本信息上下文")
      ].filter(Boolean)) return result;
    }
    if (isEducation) {
      for (const result of [
        byLabel(/开始时间|入学时间|就读时间|start\s*date/i, "educationStartDate", "教育经历上下文"),
        byLabel(/结束时间|毕业时间|离校时间|end\s*date/i, "educationEndDate", "教育经历上下文"),
        byLabel(/学院|院系|系别|college|department/i, "educationCollege", "教育经历上下文"),
        byLabel(/辅修|双学位|minor/i, "minorMajor", "教育经历上下文"),
        byLabel(/学位|学士|硕士|博士|education\s*degree/i, "educationDegree", "教育经历上下文"),
        byLabel(/学历类型|学习形式|培养方式|教育形式|招生类型|入学类型|study\s*form|education\s*type/i, "educationForm", "教育经历上下文"),
        byLabel(/学历|教育程度|education\s*level/i, "degree", "教育经历上下文"),
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
      if (/起止时间|起止日期|任职时间|工作时间|实习时间|employment\s*period/i.test(label)) {
        const dateIndex = pairedDateIndex();
        if (dateIndex === 0) return map("experienceStartDate", "工作经历成对日期规则");
        if (dateIndex === 1) return map("experienceEndDate", "工作经历成对日期规则");
      }
      for (const result of [
        byLabel(/开始时间|起始时间|入职时间|start\s*date/i, "experienceStartDate", "工作经历上下文"),
        byLabel(/结束时间|离职时间|end\s*date/i, "experienceEndDate", "工作经历上下文"),
        byLabel(/工作类型|任职类型|employment\s*type/i, "experienceType", "工作经历上下文"),
        byLabel(/公司名称|单位名称|公司|工作单位|实习单位|任职单位|所在公司|雇主|organization|employer|company/i, "experienceOrganization", "工作经历上下文"),
        byLabel(/部门|所属部门|department/i, "experienceDepartment", "工作经历上下文"),
        byLabel(/工资|薪资|薪酬|工资待遇|salary/i, "experienceSalary", "工作经历上下文"),
        byLabel(/^描述$|^description$|实习内容|实习职责|工作职责|工作内容|经历描述|工作描述|job\s*description|responsibilities/i, "experienceDescription", "工作经历上下文"),
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
        byLabel(/^职责$|职位|角色|担任角色|项目职位|role|position/i, "projectRole", "项目经历上下文"),
        byLabel(/^描述$|^description$|项目内容|项目描述|项目介绍|project\s*description|content/i, "projectDescription", "项目经历上下文"),
        byLabel(/本人职责|个人职责|项目(?:中|内)?职责|project\s*responsibilit/i, "projectDescription", "项目经历上下文"),
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
        byLabel(/^描述$|工作内容|经历内容|活动内容|description|content/i, "campusExperienceDescription", "在校经历上下文")
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
        byLabel(/外语语种|语言种类|语言类型|语种|language/i, "languageName", "外语能力上下文"),
        byLabel(/证书名称|语言证书|certificate/i, "languageCertificate", "外语能力上下文"),
        byLabel(/英语水平|english\s*level/i, "englishLevel", "外语能力上下文"),
        byLabel(/成绩|分数|语言成绩|score/i, "languageScore", "外语能力上下文"),
        byLabel(/掌握程度|熟练程度|proficiency/i, "languageProficiency", "外语能力上下文"),
        byLabel(/^听说$|听说能力|口语能力|listening|speaking/i, "listeningSpeaking", "外语能力上下文"),
        byLabel(/^读写$|读写能力|阅读能力|写作能力|reading|writing/i, "readingWriting", "外语能力上下文")
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
    const mokaSectionNames = {
      "block-basicInfo": "个人信息",
      "block-jobIntention": "求职意向",
      "block-experienceInfo": "工作经历",
      "block-educationInfo": "教育背景",
      "block-practiceInfo": "实习经历",
      "block-projectInfo": "项目经验",
      "block-languageInfo": "语言能力",
      "block-selfDescription": "自我描述",
      "block-awardInfo": "获奖经历"
    };
    const mokaNavId = element.closest?.("[data-nav-id]")?.getAttribute("data-nav-id") || "";
    if (mokaSectionNames[mokaNavId]) return mokaSectionNames[mokaNavId];
    const hotjobSection = element.closest?.(".form-cell");
    const hotjobTitle = normalizeFieldText(
      hotjobSection?.querySelector?.(":scope > .tit-wrap .tit > p[title],:scope > .tit-wrap .tit > p")?.innerText ||
      hotjobSection?.querySelector?.(":scope > .tit-wrap .tit > p[title],:scope > .tit-wrap .tit > p")?.getAttribute?.("title") ||
      ""
    );
    if (hotjobTitle) return hotjobTitle;
    const beisenForm = element.closest?.(".ux-standard-form > .form[id]");
    const beisenAddButton = beisenForm?.id
      ? document.getElementById(`${beisenForm.id}_addButton`)
      : undefined;
    const beisenAddText = clean(beisenAddButton?.innerText || beisenAddButton?.textContent || "");
    if (/教育|学历|education/i.test(beisenAddText)) return "教育经历";
    if (/工作|任职|employment|work/i.test(beisenAddText)) return "工作经历";
    if (/实习|intern/i.test(beisenAddText)) return "实习经历";
    if (/项目|project/i.test(beisenAddText)) return "项目经历";
    if (/在校|校园|campus/i.test(beisenAddText)) return "校园经历";
    if (/获奖|奖励|award/i.test(beisenAddText)) return "获奖经历";
    const pupumallSection = element.closest?.("[class*='FormItem__']");
    const pupumallTitle = normalizeFieldText(
      pupumallSection?.querySelector?.(":scope > [class*='FormLabel__']")?.innerText || ""
    );
    if (pupumallTitle) return pupumallTitle;
    let formilyModule = element.parentElement;
    // ATSX/Universe forms can insert many layout wrappers between a Formily
    // control and its module title. Keep walking far enough to bind fields such
    // as start_end_time to their education/experience/project section.
    for (let depth = 0; formilyModule && depth < 28; depth += 1, formilyModule = formilyModule.parentElement) {
      const titleRegion = Array.from(formilyModule.children || []).find((child) =>
        /applyFormModuleWrapper-left|createFormSection-left/.test(String(child.className || ""))
      );
      const title = normalizeFieldText(
        titleRegion?.querySelector?.(
          ".applyFormModuleWrapper-text,[class*='applyFormModuleWrapper-text'],.createFormSection-text,[class*='createFormSection-text']"
        )?.innerText ||
        titleRegion?.innerText ||
        ""
      );
      if (title) return title;
    }
    const sectionPattern = /基本信息|个人信息|教育|学历|学业|工作|实习|任职|项目|在校|校园|获奖|奖项|奖励|外语|语言|英语|计算机|技能|资格证书|证书|家庭|家属|论文|期刊|刊物|专利|作品集|竞赛|比赛|basic|personal|education|academic|employment|work|project|campus|award|language|english|computer|skill|certificate|qualification|family|publication|paper|journal|patent|portfolio|competition|contest/i;
    const candidates = [];
    const addCandidate = (value) => {
      const normalized = normalizeFieldText(value || "").slice(0, 80);
      if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
    };

    addCandidate(ancestorAttributeText(element, "data-nc-cls"));
    addCandidate(ancestorAttributeText(element, "data-section"));
    addCandidate(ancestorAttributeText(element, "data-section-title"));

    let current = element.parentElement;
    for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
      const labelledBy = current.getAttribute?.("aria-labelledby");
      if (labelledBy) {
        labelledBy.split(/\s+/).forEach((id) => {
          const label = document.getElementById(id);
          addCandidate(label?.innerText || label?.textContent || "");
        });
      }
      Array.from(current.children || []).forEach((child) => {
        if (child.matches?.("h1,h2,h3,h4,h5,h6,legend,[class*='section-title'],[class*='sectionTitle'],[class*='section-header__title']")) {
          addCandidate(child.innerText || child.textContent || "");
        }
        // Tencent's resume editor uses a plain `.title` child for section
        // headings (for example "工作经验" and "学历"). Keeping this exact
        // class check avoids mistaking ordinary field labels for headings.
        if (child.matches?.(".title,[class~='title']")) {
          addCandidate(child.innerText || child.textContent || "");
        }
        if (child.matches?.("header,[class*='header'],[class*='Header']")) {
          const heading = child.querySelector?.("h1,h2,h3,h4,h5,h6,[class*='title'],[class*='Title']");
          addCandidate(heading?.innerText || heading?.textContent || "");
        }
      });
      const matched = candidates.find((value) => sectionPattern.test(value));
      if (matched) return matched;
    }

    return candidates.find(Boolean);
  };

  const isActuallyVisible = (element) => {
    if (!element?.isConnected || !element.getClientRects().length) return false;
    for (let current = element; current && current !== document.documentElement; current = current.parentElement) {
      const style = window.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (current.classList?.contains("atsx-select-dropdown-hidden")) return false;
    }
    return true;
  };

  const atsxSelectControl = (element) => {
    const root = element?.closest?.(".atsx-select");
    if (!root) return undefined;
    return root.querySelector(".atsx-select-selection[role='combobox'],[role='combobox']") || undefined;
  };

  const atsxSelectDropdown = (element, includeHidden = false) => {
    const control = atsxSelectControl(element) || element;
    if (!control?.closest?.(".atsx-select")) return undefined;
    const dataCy = control.getAttribute("data-cy") || "";
    const controlledId = control.getAttribute("aria-controls") || "";
    const contents = [
      dataCy ? document.querySelector(`[data-cy="${CSS.escape(`${dataCy}Dropdown`)}"]`) : undefined,
      controlledId ? document.getElementById(controlledId) : undefined
    ].filter(Boolean);
    const candidates = contents
      .map((content) => ({ content, popup: content.closest(".atsx-select-dropdown") || content }))
      .filter(({ popup }) => includeHidden || isActuallyVisible(popup));
    return candidates[0];
  };

  const readAtsxSelectValue = (element) => {
    const control = atsxSelectControl(element) || element;
    const root = control?.closest?.(".atsx-select");
    if (!root) return "";
    const selected = Array.from(root.querySelectorAll("[data-cy='selectedValue'],.atsx-select-selection-selected-value"))
      .map((item) => clean(item.getAttribute("data-cy-value") || item.innerText || item.textContent || ""))
      .filter(Boolean);
    if (selected.length) return selected.join("，");
    const input = root.querySelector(".atsx-select-search__field,input");
    return clean(input?.value || "");
  };

  const antSelectControl = (element) => {
    const root = element?.closest?.(".ant-select");
    if (!root) return undefined;
    return root.querySelector("input[role='combobox'],[role='combobox']") || undefined;
  };

  const antSelectDropdown = (element, includeHidden = false) => {
    const control = antSelectControl(element) || element;
    if (!control?.closest?.(".ant-select")) return undefined;
    const controlledId = control.getAttribute("aria-controls") || "";
    const list = controlledId ? document.getElementById(controlledId) : undefined;
    const popup = list?.closest?.(".ant-select-dropdown");
    if (list && popup && (includeHidden || isActuallyVisible(popup))) return { content: popup, popup };
    if (includeHidden) return undefined;
    const visiblePopup = Array.from(document.querySelectorAll(".ant-select-dropdown"))
      .filter((candidate) => isActuallyVisible(candidate))
      .pop();
    return visiblePopup ? { content: visiblePopup, popup: visiblePopup } : undefined;
  };

  const readAntSelectValue = (element) => {
    const control = antSelectControl(element) || element;
    const root = control?.closest?.(".ant-select");
    if (!root) return "";
    const selected = Array.from(root.querySelectorAll(
      ".ant-select-selection-item,.ant-select-selection-selected-value"
    ))
      .map((item) => clean(item.getAttribute("title") || item.innerText || item.textContent || ""))
      .filter(Boolean);
    if (selected.length) return selected.join("，");
    return clean(control.value || "");
  };

  const fieldOptions = (element) => {
    if (element instanceof HTMLSelectElement) {
      return Array.from(element.options).map((option) => clean(option.text || option.value)).filter(Boolean).slice(0, 30);
    }
    const atsxDropdown = atsxSelectDropdown(element, true);
    if (atsxDropdown) {
      return Array.from(atsxDropdown.content.querySelectorAll("[role='option']"))
        .map((option) => clean(option.getAttribute("data-cy-value") || option.innerText || option.textContent || ""))
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .slice(0, 30);
    }
    const antDropdown = antSelectDropdown(element, true);
    if (antDropdown) {
      return Array.from(antDropdown.content.querySelectorAll(
        ".ant-select-item-option,.ant-select-dropdown-menu-item:not(.ant-select-dropdown-menu-item-disabled)"
      ))
        .map((option) => clean(
          option.getAttribute("title") ||
          option.querySelector(".ant-select-item-option-content")?.textContent ||
          option.textContent || ""
        ))
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .slice(0, 30);
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
  const radioGroupSelector = ".phoenix-radio-group,.ant-radio-group,[class~='radio-group'],[class$='-radio-group']";
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
    qualification: ["qualificationDate", "qualificationName", "qualificationNumber", "qualificationDescription"],
    family: ["familyName", "familyRelation", "familyPhone", "familyCompany", "familyPosition", "familyPoliticalStatus"]
  };

  const repeatableGroupForKey = (key) =>
    Object.entries(repeatableFieldKeys).find(([, keys]) => keys.includes(key))?.[0];

  const explicitlySingleSection = (section) => /^(?:个人(?:基本)?信息|个人(?:基本)?资料|基本信息|基本资料|求职意向|求职偏好|自我描述|自我介绍|联系方式)$/i
    .test(clean(section || ""));

  const contextualRepeatGroupForSection = (section) => {
    const text = section || "";
    if (/教育|学历|学业/i.test(text)) return "education";
    if (/工作|实习|实践|任职/i.test(text)) return "experience";
    if (/项目/i.test(text)) return "project";
    if (/在校|校园/i.test(text)) return "campus";
    if (/获奖|奖项|奖励/i.test(text)) return "award";
    if (/外语|语言能力|language/i.test(text)) return "language";
    if (/资格证书|职业证书|证书资格|qualification|certificate/i.test(text)) return "qualification";
    if (/家庭情况|家庭成员|family/i.test(text)) return "family";
    return undefined;
  };

  const effectiveRepeatGroupForField = (field) => {
    if (explicitlySingleSection(field?.section)) return undefined;
    if (field?.repeatGroup) return field.repeatGroup;
    const semanticGroup = repeatableGroupForKey(field?.key);
    const contextualGroup = contextualRepeatGroupForSection(field?.section);
    return contextualGroup
      ? (semanticGroup === contextualGroup ? semanticGroup : undefined)
      : semanticGroup;
  };

  const repeatableFieldCount = (fields, group) => {
    const indexes = fields
      .filter((field) => field.repeatGroup === group && Number.isInteger(field.repeatIndex))
      .map((field) => field.repeatIndex);
    if (indexes.length) return Math.max(...indexes) + 1;
    const keys = repeatableFieldKeys[group] || [];
    return Math.max(0, ...keys.map((key) =>
      fields.filter((field) => field.repeatGroup === group && field.key === key).length
    ));
  };

  const pupumallRepeatEntrySelector = "[class*='NewFormBtn__'] > [class*='FormContainer__'] > [class*='FormItemBox__']";
  const repeatEntrySelectors = {
    education: `[way-repeat='jyjl'],.create-education,.education-entry,[data-education-entry],.resumeEditForm-item.resumeEditForm-education,[data-nav-id='block-educationInfo'] > [class*='apply-fields-'][class*='multi-'],.form-cell > .form-cell-right > .form-cell-inner,${pupumallRepeatEntrySelector}`,
    experience: `[way-repeat='sxjl'],[way-repeat='gzjl'],.create-empirical,.experience-entry,.work-entry,[data-experience-entry],.resumeEditForm-item.resumeEditForm-career,.resumeEditForm-item.resumeEditForm-internship,[data-nav-id='block-experienceInfo'] > [class*='apply-fields-'][class*='multi-'],[data-nav-id='block-practiceInfo'] > [class*='apply-fields-'][class*='multi-'],.form-cell > .form-cell-right > .form-cell-inner,${pupumallRepeatEntrySelector}`,
    project: `[way-repeat='xmjl'],.project-entry,[data-project-entry],.resumeEditForm-item.resumeEditForm-project,[data-nav-id='block-projectInfo'] > [class*='apply-fields-'][class*='multi-'],.form-cell > .form-cell-right > .form-cell-inner,${pupumallRepeatEntrySelector}`,
    campus: `[way-repeat='zxjl'],.campus-entry,[data-campus-entry],.resumeEditForm-item.resumeEditForm-campus,.form-cell > .form-cell-right > .form-cell-inner,${pupumallRepeatEntrySelector}`,
    award: `[way-repeat='jcqk'],.award-entry,[data-award-entry],.resumeEditForm-item.resumeEditForm-award,[data-nav-id='block-awardInfo'] > [class*='apply-fields-'][class*='multi-'],.form-cell > .form-cell-right > .form-cell-inner,${pupumallRepeatEntrySelector}`
  };

  // ATSX gives every repeated record a native path such as
  // internship[1].company / internship[1].desc. This identity is stronger
  // than DOM order: adding another card or rerendering the section cannot make
  // fields from two records share an occurrence counter.
  const indexedRepeatEntryContext = (element) => {
    const wayRepeatContainer = element.closest?.("[way-repeat]");
    const wayRepeat = wayRepeatContainer?.getAttribute?.("way-repeat") || "";
    const wayData = element.getAttribute?.("way-data") || "";
    const wayScope = wayRepeat || wayData.split(".")[0];
    const wayGroupMap = {
      jyjl: { group: "education", kind: "education" },
      sxjl: { group: "experience", kind: "internship" },
      gzjl: { group: "experience", kind: "work" },
      xmjl: { group: "project", kind: "project" },
      zxjl: { group: "campus", kind: "campus" },
      yynl: { group: "language", kind: "language" },
      jtgx: { group: "family", kind: "family" }
    };
    if (wayScope && wayGroupMap[wayScope]) {
      const { group, kind } = wayGroupMap[wayScope];
      const keyAttr = element.getAttribute?.("key") || element.closest?.("[key]")?.getAttribute?.("key");
      let index = /^\d+$/.test(keyAttr || "") ? Number.parseInt(keyAttr, 10) : undefined;
      if (index === undefined && wayRepeatContainer?.parentElement) {
        const siblings = Array.from(wayRepeatContainer.parentElement.children)
          .filter((c) => c.getAttribute?.("way-repeat") === wayScope);
        const domIndex = siblings.indexOf(wayRepeatContainer);
        if (domIndex >= 0) index = domIndex;
      }
      if (Number.isInteger(index)) {
        return {
          group,
          kind,
          index,
          source: "attribute",
          fingerprint: `${group}:microdone:${kind}:${index}`
        };
      }
    }

    const attributes = [
      "id", "name", "data-cy", "data-field", "data-question",
      "data-form-field-id", "data-form-field-name"
    ];
    let current = element;
    for (let depth = 0; current && depth < 9; depth += 1, current = current.parentElement) {
      for (const attribute of attributes) {
        const value = String(current.getAttribute?.(attribute) || "");
        const match = value.match(/(?:^|\.)(education|career|internship|project|campus|award)\[(\d+)](?:\.|$)/i);
        if (!match) continue;
        const namespace = match[1].toLowerCase();
        const kind = namespace === "career" ? "work" : namespace;
        const group = namespace === "career" || namespace === "internship"
          ? "experience"
          : namespace;
        const index = Number.parseInt(match[2], 10);
        return {
          group,
          kind,
          index,
          source: "attribute",
          fingerprint: `${group}:atsx:${kind}:${index}`
        };
      }
    }
    return undefined;
  };

  // Modern Beisen forms clone a complete `.ux-standard-form` and deliberately
  // reuse the same inner form id for every record. The sibling add control is
  // the stable group identity: `<form-id>_addButton`. Use that relationship
  // instead of styled-component class names, which change between tenants.
  const beisenRepeatEntryContext = (element, group) => {
    const form = element.closest?.(".ux-standard-form > .form[id]");
    if (!form?.id) return undefined;
    const addButton = document.getElementById(`${form.id}_addButton`);
    const addText = clean(addButton?.innerText || addButton?.textContent || "");
    const groupPattern = group === "education"
      ? /教育|学历|education/i
      : group === "experience"
        ? /工作|实习|任职|experience|work/i
        : group === "project"
          ? /项目|project/i
          : group === "campus"
            ? /在校|校园|campus/i
            : group === "award"
              ? /获奖|奖励|award/i
              : undefined;
    if (!addButton || !groupPattern?.test(addText)) return undefined;
    let forms;
    try {
      forms = Array.from(document.querySelectorAll(`[id="${CSS.escape(form.id)}"]`))
        .filter((candidate) => candidate.matches?.(".form"))
        .filter((candidate) => isActuallyVisible(candidate));
    } catch {
      return undefined;
    }
    const index = forms.indexOf(form);
    if (index < 0) return undefined;
    const kind = group === "experience"
      ? /实习|实践|intern/i.test(addText)
        ? "internship"
        : /工作|任职|work|employment/i.test(addText)
          ? "work"
          : "combined"
      : undefined;
    return {
      index,
      kind,
      source: "structural",
      entry: form.closest(".ux-standard-form") || form,
      host: form.closest(".ux-standard-form") || form,
      container: addButton.parentElement,
      fingerprint: `${group}:beisen:${form.id}:${index}`
    };
  };

  // Hotjob/Wecruit gives each repeated field a native id in the form
  // `<section-id>_<field-id>_<entry-index>` and keeps the complete record in a
  // sibling `.form-cell-inner`. Use both identities so rerenders and multi-round
  // filling cannot move a description or date into a different record.
  const hotjobRepeatEntryContext = (element, group) => {
    const entry = element.closest?.(".form-cell > .form-cell-right > .form-cell-inner");
    const section = entry?.closest?.(".form-cell");
    const container = entry?.parentElement;
    if (!entry || !section || !container) return undefined;
    const title = normalizeFieldText(
      section.querySelector(":scope > .tit-wrap .tit > p[title],:scope > .tit-wrap .tit > p")?.innerText ||
      section.querySelector(":scope > .tit-wrap .tit > p[title],:scope > .tit-wrap .tit > p")?.getAttribute?.("title") ||
      ""
    );
    const groupPattern = group === "education"
      ? /教育|学历|education/i
      : group === "experience"
        ? /工作|实习|实践|任职|experience|work/i
        : group === "project"
          ? /项目|project/i
          : group === "campus"
            ? /在校|校园|campus/i
            : group === "award"
              ? /获奖|奖项|奖励|award/i
              : undefined;
    if (!groupPattern?.test(title)) return undefined;
    const entries = Array.from(container.children)
      .filter((candidate) => candidate.matches?.(".form-cell-inner"))
      .filter(isActuallyVisible);
    const domIndex = entries.indexOf(entry);
    if (domIndex < 0) return undefined;
    const nativeIndexes = Array.from(entry.querySelectorAll("[id]"))
      .map((candidate) => String(candidate.id || "").match(/^(\d+)_\d+_(\d+)$/))
      .filter(Boolean)
      .filter((match) => !section.id || match[1] === section.id)
      .map((match) => Number.parseInt(match[2], 10));
    const nativeIndex = nativeIndexes.find((index) => Number.isInteger(index));
    const index = Number.isInteger(nativeIndex) ? nativeIndex : domIndex;
    return {
      index,
      kind: group === "experience" ? "combined" : group,
      source: nativeIndexes.length ? "attribute" : "structural",
      entry,
      host: entry,
      container,
      fingerprint: `${group}:hotjob:${section.id || title}:${index}`
    };
  };

  // Newer Feishu Career tenants render repeated records with Formily +
  // Universe instead of ATSX. Their inner form ids are deliberately reused
  // (`formily-item-school`, `formily-item-start_end_time`, ...), so a DOM path
  // that stops at the inner field cannot distinguish record 0 from record 1.
  // Gate this fallback behind the live Formily card markers and section/field
  // signatures; native ATSX `education[n]` identities still win above it.
  const FORMILY_REPEAT_CARD_SELECTOR = "[class*='apply-form-array-card__']";

  const formilyCardSignature = (card) => new Set(Array.from(card?.querySelectorAll?.(
    "[data-form-field-name],[data-form-field-id],[id^='formily-item-']"
  ) || []).flatMap((candidate) => [
    candidate.getAttribute?.("data-form-field-name"),
    candidate.getAttribute?.("data-form-field-id"),
    candidate.id?.replace(/^formily-item-/, "")
  ]).map((value) => normalizeFieldText(value || "").toLowerCase()).filter(Boolean));

  const formilySignatureMatchesGroup = (signature, group) => {
    const has = (...names) => names.some((name) => signature.has(name));
    if (group === "education") return has("school", "degree", "field_of_study", "major");
    if (group === "experience") return has("company", "company_name", "title", "job_title") && has("desc", "work_description");
    if (group === "project") return has("name", "project_name") && has("role", "project_role", "link", "project_description", "desc");
    if (group === "campus") return has("organization", "role", "desc", "description");
    if (group === "award") return has("name", "award_name", "award_level", "level");
    return false;
  };

  const formilyRepeatEntryContext = (element, group) => {
    const entry = element.closest?.(FORMILY_REPEAT_CARD_SELECTOR);
    if (!entry || !entry.querySelector?.(".ud-formily-item,[id^='formily-item-']")) return undefined;
    const signature = formilyCardSignature(entry);
    if (!formilySignatureMatchesGroup(signature, group)) return undefined;
    const section = fieldSection(element);
    const sectionGroup = contextualRepeatGroupForSection(section);
    if (sectionGroup && sectionGroup !== group) return undefined;

    const container = entry.parentElement;
    if (!container) return undefined;
    const entries = Array.from(container.children)
      .filter((candidate) => candidate.matches?.(FORMILY_REPEAT_CARD_SELECTOR))
      .filter(isActuallyVisible)
      .filter((candidate) => formilySignatureMatchesGroup(formilyCardSignature(candidate), group));
    const index = entries.indexOf(entry);
    if (index < 0) return undefined;
    const kind = group === "experience"
      ? /实习|实践|intern|practice/i.test(section)
        ? "internship"
        : /工作|任职|employment|work/i.test(section)
          ? "work"
          : "combined"
      : group;
    return {
      index,
      kind,
      source: "structural",
      entry,
      host: entry,
      container,
      fingerprint: `${group}:formily:${kind}:${index}`
    };
  };

  const repeatEntryContext = (element, group) => {
    const hotjobContext = hotjobRepeatEntryContext(element, group);
    if (hotjobContext) return hotjobContext;
    const beisenContext = beisenRepeatEntryContext(element, group);
    if (beisenContext) return beisenContext;
    const formilyContext = formilyRepeatEntryContext(element, group);
    if (formilyContext) return formilyContext;
    if (isPupumallApplication?.()) {
      const section = element.closest?.("[class*='FormItem__']");
      const container = section?.querySelector?.(":scope > [class*='NewFormBtn__'] > [class*='FormContainer__']");
      const entry = element.closest?.("[class*='FormItemBox__']");
      const entries = Array.from(container?.children || []).filter((candidate) =>
        candidate.matches?.("[class*='FormItemBox__']") &&
        !candidate.closest("template,[data-template],[data-prototype]")
      );
      const index = entries.indexOf(entry);
      if (entry && index >= 0) {
        return {
          index,
          source: "structural",
          entry,
          host: entry,
          container,
          fingerprint: `${group}:pupumall:${index}`
        };
      }
    }
    const selector = repeatEntrySelectors[group];
    if (!selector || !formRuntime?.repeatEntryContext) return undefined;
    return formRuntime.repeatEntryContext(element, group, selector);
  };

  const repeatEntryIndex = (element, group) => {
    const runtimeContext = repeatEntryContext(element, group);
    if (runtimeContext) return runtimeContext.index;
    const selector = repeatEntrySelectors[group];
    if (!selector) return undefined;
    const entry = element.closest?.(selector);
    if (!entry?.parentElement) return undefined;

    // ATS pages do not always append repeated cards as direct siblings. Xiaomi,
    // for example, wraps every work-experience card in its own container. Looking
    // only at entry.parentElement therefore reports index 0 for every card and
    // makes all cards reuse the first profile record. Walk up to the nearest
    // common list container and index the direct children that host an entry.
    let container = entry.parentElement;
    for (let depth = 0; container && depth < 6; depth += 1, container = container.parentElement) {
      const hosts = Array.from(container.children).filter((candidate) =>
        candidate.matches?.(selector) || candidate.querySelector?.(selector)
      );
      if (hosts.length >= 2) {
        const host = hosts.find((candidate) => candidate === entry || candidate.contains(entry));
        const index = hosts.indexOf(host);
        if (index >= 0) return index;
      }
      if (container.matches?.("form,body")) break;
    }

    // A single structural match is not proof that this is the first record.
    // Let the per-field occurrence counter below assign a stable fallback index.
    return undefined;
  };

  const repeatEntryDomCount = (group) => {
    const selector = repeatEntrySelectors[group];
    if (!selector) return 0;
    return Array.from(document.querySelectorAll(selector))
      .filter((entry) => isActuallyVisible(entry))
      .filter((entry) => !entry.closest("template,[data-template],[data-prototype]"))
      // Some sites wrap a concrete card in another node whose class also
      // matches our broad selector. Count the innermost visible card once.
      .filter((entry) => !entry.querySelector(selector))
      .length;
  };

  const ATSX_DATE_RANGE_SEPARATOR = "\u001f";
  const DATE_RANGE_ROOT_SELECTOR = [
    ".throne-biz-date-range-picker-wrapper",
    ".atsx-date-picker-period-month",
    "[class*='date-range-picker-wrapper']",
    "[class*='dateRangePickerWrapper']"
  ].join(",");

  const dateRangeInputs = (root) => Array.from(root?.querySelectorAll?.("input") || [])
    .filter((input) => !["hidden", "checkbox", "radio"].includes((input.type || "text").toLowerCase()));

  const currentDateToggle = (root) => {
    if (!root) return undefined;
    const item = root.closest?.(".ud-formily-item,[id^='formily-item-']") || root;
    const candidates = Array.from(item.querySelectorAll?.("input[type='checkbox'],[role='checkbox']") || []);
    return candidates.find((candidate) => {
      const explicitLabel = candidate.id
        ? item.querySelector?.(`label[for="${CSS.escape(candidate.id)}"]`)?.textContent || ""
        : "";
      const text = clean([
        candidate.getAttribute?.("aria-label"),
        candidate.getAttribute?.("title"),
        explicitLabel,
        candidate.closest?.("label")?.textContent,
        candidate.parentElement?.textContent
      ].filter(Boolean).join(" "));
      return /至今|当前|仍在职|present|current/i.test(text);
    }) || (candidates.length === 1 && /至今|当前|仍在职|present|current/i.test(item.textContent || "")
      ? candidates[0]
      : undefined);
  };

  const dateToggleChecked = (toggle) => Boolean(toggle) && (
    (toggle instanceof HTMLInputElement && toggle.checked) ||
    toggle.getAttribute?.("aria-checked") === "true" ||
    /checked|selected|active/.test(String(toggle.className || "").toLowerCase())
  );

  const dateRangeConfig = (kind) => kind === "education"
    ? { group: "education", key: "educationStartDate", endKey: "educationEndDate" }
    : kind === "internship" || kind === "career" || kind === "experience" || kind === "work"
      ? { group: "experience", key: "experienceStartDate", endKey: "experienceEndDate" }
      : kind === "project"
        ? { group: "project", key: "projectStartDate", endKey: "projectEndDate" }
        : undefined;

  const atsxDateRangeInfo = (element) => {
    const root = element.closest?.(".atsx-date-picker-period-month[data-cy]");
    const dataCy = root?.getAttribute("data-cy") || "";
    const match = dataCy.match(/^(education|career|internship|project)\[(\d+)]\.periodInput$/i);
    if (!match) return undefined;
    const kind = match[1].toLowerCase();
    const index = Number.parseInt(match[2], 10);
    const config = dateRangeConfig(kind);
    return { ...config, index, root, engine: "atsx", mode: "date-range" };
  };

  const universeDateRangeInfo = (element) => {
    let root = element.matches?.(DATE_RANGE_ROOT_SELECTOR)
      ? element
      : element.closest?.(DATE_RANGE_ROOT_SELECTOR);
    // Some Dewu schemas omit the Universe wrapper class and render the two
    // controlled month inputs directly inside a Formily item. The item is a
    // safe fallback only when its own metadata identifies a date range.
    const formilyItem = element.closest?.(".ud-formily-item,[id^='formily-item-']");
    if (!root && formilyItem && dateRangeInputs(formilyItem).length >= 2) root = formilyItem;
    if (!root) return undefined;
    const inputs = dateRangeInputs(root);
    if (inputs.length < 2) return undefined;
    const metadata = formilyFieldMetadata(element);
    const section = fieldSection(element) || "";
    const fieldName = normalizeFieldText(
      root.getAttribute?.("data-form-field-name") ||
      root.getAttribute?.("data-form-field-id") ||
      inputs.find((input) => input.getAttribute("data-form-field-name"))?.getAttribute("data-form-field-name") ||
      inputs.find((input) => input.getAttribute("data-form-field-id"))?.getAttribute("data-form-field-id") ||
      metadata.fieldName || ""
    );
    const rangeEvidence = `${fieldName} ${metadata.label} ${root.getAttribute?.("data-cy") || ""}`;
    // ATSX tenants use different schema names for the same two-input month
    // range. Dewu uses `time_period`, whereas older tenants use
    // `start_end_time`. Restrict this to the Universe range wrapper so a
    // generic field named period cannot be mistaken for a date range.
    if (!/start.*end.*time|start_end_time|time[_\s-]*period|periodInput|起止时间/i.test(rangeEvidence)) return undefined;
    const dataCyMatch = String(root.getAttribute?.("data-cy") || "")
      .match(/(education|internship|experience|work|project)\[(\d+)]/i);
    const sectionKind = /教育|学历|academic|education/i.test(section)
      ? "education"
      : /项目|project/i.test(section)
        ? "project"
        : /工作|实习|任职|work|employment|intern/i.test(section)
          ? "experience"
          : "";
    const config = dateRangeConfig(dataCyMatch?.[1]?.toLowerCase() || sectionKind);
    return config
      ? {
          ...config,
          root,
          inputs,
          fieldName: fieldName || "time_period",
          index: dataCyMatch ? Number.parseInt(dataCyMatch[2], 10) : undefined,
          currentToggle: currentDateToggle(root),
          engine: "universe",
          mode: "date-range"
        }
      : undefined;
  };

  const mokaDateInfo = (element) => {
    const root = element.matches?.(".month-range-select.date_info")
      ? element
      : element.closest?.(".month-range-select.date_info");
    if (!root) return undefined;
    const blockId = root.closest?.("[data-nav-id]")?.getAttribute("data-nav-id") || "";
    const configs = {
      "block-experienceInfo": {
        group: "experience", key: "experienceStartDate", endKey: "experienceEndDate", mode: "date-range"
      },
      "block-practiceInfo": {
        group: "experience", key: "experienceStartDate", endKey: "experienceEndDate", mode: "date-range"
      },
      "block-educationInfo": {
        group: "education", key: "educationStartDate", endKey: "educationEndDate", mode: "date-range"
      },
      "block-projectInfo": {
        group: "project", key: "projectStartDate", endKey: "projectEndDate", mode: "date-range"
      },
      "block-awardInfo": { group: "award", key: "awardDate", mode: "month" }
    };
    const config = configs[blockId];
    if (!config) return undefined;
    const selects = Array.from(root.querySelectorAll("label[class*='sd-Select-container-']"));
    const minimum = config.mode === "date-range" ? 4 : 2;
    if (selects.length < minimum) return undefined;
    return { ...config, root, selects, engine: "moka" };
  };

  const compoundDateInfo = (element) =>
    atsxDateRangeInfo(element) || universeDateRangeInfo(element) || mokaDateInfo(element);

  const readAtsxDateRange = (element) => {
    const info = atsxDateRangeInfo(element);
    if (!info) return "";
    const values = Array.from(info.root.querySelectorAll(".atsx-date-picker-period-month-label")).map((label) => {
      const labelText = clean(label.textContent || "");
      if (/至今|present|current/i.test(labelText)) return "至今";
      const year = clean(label.querySelector("[data-cy='year']")?.textContent || "");
      const month = clean(label.querySelector("[data-cy='month']")?.textContent || "");
      if (/^\d{4}$/.test(year) && /^\d{1,2}$/.test(month)) return `${year}-${month.padStart(2, "0")}`;
      return "";
    });
    if (dateToggleChecked(currentDateToggle(info.root)) && values.length >= 2) values[1] = "至今";
    return values.length >= 2 ? `${values[0]}${ATSX_DATE_RANGE_SEPARATOR}${values[1]}` : "";
  };

  const readUniverseDateRange = (element) => {
    const info = universeDateRangeInfo(element);
    if (!info) return "";
    const values = info.inputs.slice(0, 2).map((input) => clean(input.value || ""));
    if (dateToggleChecked(info.currentToggle) && values.length >= 2) values[1] = "至今";
    return values.some(Boolean) ? `${values[0]}${ATSX_DATE_RANGE_SEPARATOR}${values[1]}` : "";
  };

  const readMokaDate = (element) => {
    const info = mokaDateInfo(element);
    if (!info) return "";
    const values = info.selects.map((select) => clean(
      select.querySelector("[class*='sd-Input-display-value-']")?.innerText ||
      select.querySelector("[class*='sd-Input-display-value-']")?.textContent ||
      select.querySelector("input")?.value || ""
    ));
    const month = (offset) => {
      const year = values[offset]?.match(/\d{4}/)?.[0] || "";
      const monthValue = values[offset + 1]?.match(/\d{1,2}/)?.[0] || "";
      return year && monthValue ? `${year}-${monthValue.padStart(2, "0")}` : "";
    };
    const start = month(0);
    if (info.mode === "month") return start;
    const current = info.root.querySelector("input[type='checkbox']")?.checked === true;
    const end = current ? "至今" : month(2);
    return start || end ? `${start}${ATSX_DATE_RANGE_SEPARATOR}${end}` : "";
  };

  const reactEventProps = (element) => {
    if (!element) return undefined;
    const key = Object.keys(element).find((name) =>
      name.startsWith("__reactEventHandlers$") || name.startsWith("__reactProps$")
    );
    return key ? element[key] : undefined;
  };

  const isMokaManagedDateInput = (element) =>
    element instanceof HTMLInputElement &&
    element.readOnly &&
    Boolean(element.closest?.("label[class*='sd-picker-input-'],[class*='day_info-'],.day_info"));

  const readMokaManagedDate = (element) => {
    if (!isMokaManagedDateInput(element)) return "";
    const value = reactEventProps(element)?._get_?.();
    return typeof value === "string" ? clean(value) : "";
  };

  const controlType = (element) => {
    const compoundDate = compoundDateInfo(element);
    if (compoundDate) return compoundDate.mode;
    if (element.getAttribute("contenteditable") === "true") return "contenteditable";
    if (element.matches?.(radioGroupSelector)) return "radio-group";
    if (element.matches?.(".cascader-plugins-wrap")) return "cascader";
    if (element.matches?.(cascaderSelector)) return "cascader";
    if (element.closest?.(".phoenix-select")) return "custom-select";
    if (element.closest?.(".el-select")) return "custom-select";
    if (element.closest?.(".atsx-select")) return "custom-select";
    if (element.closest?.(".ant-select")) return "custom-select";
    const driven = formControlDrivers?.identify?.(element);
    if (driven) return driven.type;
    if (element.matches?.(checkboxSelector)) return "checkbox";
    return element.getAttribute("role") || (element.tagName || "field").toLowerCase();
  };

  const readControlValue = (element) => {
    const compoundDate = compoundDateInfo(element);
    if (compoundDate?.engine === "atsx") return readAtsxDateRange(element);
    if (compoundDate?.engine === "universe") return readUniverseDateRange(element);
    if (compoundDate?.engine === "moka") return readMokaDate(element);
    const mokaManagedDate = readMokaManagedDate(element);
    if (mokaManagedDate) return mokaManagedDate;
    if (element.matches?.(".cascader-plugins-wrap")) {
      return Array.from(element.querySelectorAll(".ant-select"))
        .map((root) => readAntSelectValue(root.querySelector("[role='combobox']") || root))
        .filter(Boolean)
        .join(" ");
    }
    if (element.closest?.(".atsx-select")) return readAtsxSelectValue(element);
    if (element.closest?.(".ant-select")) return readAntSelectValue(element);
    const drivenValue = formControlDrivers?.selectedText?.(element);
    if (drivenValue) return clean(drivenValue);
    if (element instanceof HTMLSelectElement) return clean(element.selectedOptions[0]?.text || element.value || "");
    if (element instanceof HTMLInputElement && element.type === "radio") {
      const container = element.closest(".ant-radio-group,fieldset,[role='radiogroup'],[class~='radio-group'],[class$='-radio-group']");
      const radios = container
        ? Array.from(container.querySelectorAll("input[type='radio']"))
        : element.name
          ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`))
          : [element];
      const checked = radios.find((item) => item.checked);
      return clean(
        checked?.closest?.("label,.ant-radio-wrapper")?.innerText ||
        checked?.value ||
        checked?.getAttribute("aria-label") ||
        ""
      );
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
      const selected = Array.from(element.querySelectorAll(".phoenix-radio-group__radioItem,.ant-radio-wrapper,[role='radio'],label.el-radio")).find((item) => {
        if (item.querySelector?.("input[type='radio']:checked")) return true;
        const radio = item.querySelector(".phoenix-radio,.ant-radio,[class*='radio--withLabel']");
        const state = String(item.className || "") + " " + String(radio?.className || "") + " " +
          String(item.getAttribute("aria-checked") || "") + " " + String(radio?.getAttribute("aria-checked") || "");
        return /checked|selected|active|true/.test(state.toLowerCase());
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
      const tags = Array.from(root.querySelectorAll(".el-tag,.el-select__tags-text"))
        .map((tag) => clean(tag.innerText || tag.textContent || "").replace(/[×✕]\s*$/g, ""))
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index);
      if (tags.length) return tags.join("，");
      const selected = root.querySelector(".el-input__inner");
      return clean(selected?.value || element.value || "");
    }
    if (element.matches?.(cascaderSelector)) {
      return clean(element.querySelector(".city-cascader-value,[class*='cascader-value']")?.innerText || element.innerText || "");
    }
    if (element.matches?.(checkboxSelector)) {
      const input = element.querySelector("input[type='checkbox']");
      if (input) return input.checked ? "是" : "否";
      const state = `${element.className || ""} ${element.getAttribute("aria-checked") || ""} ${
        Array.from(element.children || []).map((child) => child.className || "").join(" ")
      }`.toLowerCase();
      return /checked|selected|active|true/.test(state) ? "是" : "否";
    }
    if (element.matches?.(".education-select > .select")) {
      const value = clean(element.innerText || element.textContent || "");
      return /^(请)?选择/.test(value) ? "" : value;
    }
    if (element.matches?.(".test-border")) {
      const year = clean(element.querySelector(".select-left")?.innerText || "");
      const month = clean(element.querySelector(".select-right")?.innerText || "");
      return /^\d{4}$/.test(year) && /^\d{1,2}$/.test(month)
        ? `${year}-${month.padStart(2, "0")}`
        : "";
    }
    if (element.getAttribute("contenteditable") === "true") return clean(element.innerText || element.textContent || "");
    return clean(element.value || "");
  };

  const isLikelyFormField = (element, label, key) => {
    const inputType = element instanceof HTMLInputElement ? (element.type || "text").toLowerCase() : "";
    if (["hidden", "submit", "button", "reset", "image", "file"].includes(inputType)) return false;
    const searchEvidence = `${label} ${element.getAttribute?.("placeholder") || ""} ${element.getAttribute?.("aria-label") || ""}`;
    if (!key && (inputType === "search" || /搜索职位|搜索关键词|搜职位|keyword|search/i.test(searchEvidence))) return false;
    if (!label || /^(搜索|搜职位|关键字|keyword|search)$/i.test(label)) return false;
    if (key) return true;
    if (element.getAttribute("required") !== null || element.getAttribute("aria-required") === "true") return true;
    if (element.closest("nav,header,footer,[role='navigation']")) return false;
    return label.length >= 2;
  };

  const resolveTargetDocument = () => {
    const directInputs = document.querySelectorAll(
      "input:not([type='hidden']), select, textarea, [contenteditable='true'], [role='combobox']"
    );
    if (directInputs.length >= 3 || document.querySelector(".form1Class, [way-repeat], #jbxxform")) {
      return document;
    }
    const iframes = Array.from(document.querySelectorAll("iframe, frame"));
    for (const iframe of iframes) {
      try {
        const subDoc = iframe.contentDocument;
        if (!subDoc) continue;
        const subInputs = subDoc.querySelectorAll(
          "input:not([type='hidden']), select, textarea, [contenteditable='true'], [role='combobox'], .form1Class, [way-repeat], #jbxxform"
        );
        if (subInputs.length >= 2) {
          return subDoc;
        }
      } catch {
        // Cross-origin iframe, ignore
      }
    }
    return document;
  };

  const scanApplicationForm = () => {
    const targetDoc = resolveTargetDocument();
    const targetLocation = targetDoc.defaultView?.location || location;
    const adapter = window.OfferFlowFormAdapters?.resolve?.(targetLocation) || {
      id: "generic",
      name: "通用表单",
      version: "builtin",
      compiled: []
    };
    targetDoc.querySelectorAll("[data-offerflow-field-id]").forEach((element) => {
      delete element.dataset.offerflowFieldId;
    });
    const selector = [
      "input", "textarea", "select", "[contenteditable='true']",
      "[role='textbox']", "[role='combobox']", "[role='radio']", "[role='checkbox']",
      radioGroupSelector, checkboxSelector, cascaderSelector,
      ".ivu-select", ".ivu-cascader", ".next-select", ".next-cascader",
      ".semi-select", ".semi-cascader", ".arco-select", ".arco-cascader",
      ".t-select", ".t-cascader",
      ".ihr_dict_picker", ".ihr_base_picker", ".ihr_school_picker",
      ".month-range-select.date_info",
      // Tencent uses div-based controls without native roles for degree and
      // combined year/month selectors.
      ".education-select > .select", ".test-border"
    ].join(",");
    const transientPopupSelector = [
      ".el-select-dropdown", ".el-popper", ".country-select-popper",
      ".phoenix-selectList", ".phoenix-date-picker", ".area-selector-container",
      ".school-wrap", ".ant-calendar-picker-container", ".ant-select-dropdown",
      ".ivu-select-dropdown", ".next-menu-popup", ".next-overlay-wrapper",
      ".semi-portal", ".arco-select-popup", ".t-popup", ".t-select__dropdown",
      ".ihr_base_picker-panel", ".ihr_dict_picker-panel", ".ihr_school_picker-panel",
      ".bootstrap-select .dropdown-menu", ".dropdown-menu.inner",
      "[class*='sd-Dropdown-dropdown-']",
      "[role='listbox']"
    ].join(",");
    const canonicalElement = (element) => {
      const compoundDate = compoundDateInfo(element);
      if (compoundDate?.root) return compoundDate.root;
      const hotjobCascader = element.closest?.(".cascader-plugins-wrap");
      if (hotjobCascader) return hotjobCascader;
      const atsxControl = atsxSelectControl(element);
      if (atsxControl) return atsxControl;
      const antControl = antSelectControl(element);
      if (antControl) return antControl;
      const bsSelect = element.closest?.(".bootstrap-select");
      if (bsSelect) {
        const nativeSelect = bsSelect.querySelector("select") || bsSelect.parentElement?.querySelector("select");
        if (nativeSelect) return nativeSelect;
      }
      const driven = formControlDrivers?.identify?.(element);
      if (driven) {
        return driven.root.querySelector?.("[role='combobox'],input:not([type='hidden'])") || driven.root;
      }
      const elementSelect = element.closest?.(".el-select");
      if (elementSelect) {
        return elementSelect.querySelector(".el-select__input:not([readonly]),.el-input__inner,input") || element;
      }
      return element;
    };
    const elements = Array.from(targetDoc.querySelectorAll(selector))
      .filter((element) => !element.closest?.(transientPopupSelector))
      .map(canonicalElement)
      .filter((element, index, all) => {
        if (all.indexOf(element) !== index) return false;
        if (element.disabled) return false;
        if (adapter.id === "tencent" && element.matches?.(".telephone-region")) return false;
        if (element.matches("input,textarea") && element.closest(checkboxSelector)) return false;
        if (element instanceof HTMLInputElement && element.type === "radio" && element.closest(radioGroupSelector)) return false;
        if (element.getClientRects().length > 0) return true;
        if (element instanceof HTMLSelectElement) {
          const bsContainer = element.closest?.(".bootstrap-select") || element.parentElement?.querySelector?.(".bootstrap-select");
          if (bsContainer && bsContainer.getClientRects().length > 0) return true;
        }
        return false;
      });
    const seenRadioGroups = new Set();
    const anonymousRadioGroups = new WeakMap();
    let anonymousRadioGroupSequence = 0;
    const seenSiteFieldIds = new Set();
    const repeatCounters = new Map();
    const matches = [];
    let ruleMatched = 0;

    elements.forEach((element, index) => {
      const label = fieldLabel(element);
      const section = fieldSection(element);
      const dateInfo = compoundDateInfo(element);
      const ruleMatch = dateInfo
        ? {
            key: dateInfo.key,
            confidence: 0.99,
            source: "rules",
            evidence: [dateInfo.engine === "moka"
              ? "Moka Sugar Design 年月组合控件"
              : dateInfo.engine === "universe"
                ? "飞书招聘 Universe 受控日期区间"
                : "小米 ATSX 成对日期控件"]
          }
        : matchedProfileField(label, element, adapter, section);
      const key = ruleMatch?.key;
      if (!isLikelyFormField(element, label, key)) return;
      const siteFieldId = ancestorAttributeText(element, "data-nc-id");
      if (siteFieldId) {
        if (seenSiteFieldIds.has(siteFieldId)) return;
        seenSiteFieldIds.add(siteFieldId);
      }
      if ((element instanceof HTMLInputElement && element.type === "radio") || element.getAttribute("role") === "radio") {
        const container = element.closest("fieldset,[role='radiogroup'],[class~='radio-group'],[class$='-radio-group']") || element.parentElement;
        let groupIdentity = element.getAttribute("name") || container?.id || "";
        if (!groupIdentity && container) {
          if (!anonymousRadioGroups.has(container)) {
            anonymousRadioGroupSequence += 1;
            anonymousRadioGroups.set(container, `anonymous-${anonymousRadioGroupSequence}`);
          }
          groupIdentity = anonymousRadioGroups.get(container);
        }
        const group = `${groupIdentity || `radio-${index}`}-${key || "unknown"}`;
        if (seenRadioGroups.has(group)) return;
        seenRadioGroups.add(group);
      }
      const type = dateInfo?.mode || controlType(element);
      const semanticRepeatGroup = repeatableGroupForKey(key);
      const indexedEntry = indexedRepeatEntryContext(element);
      const contextualRepeatGroup = indexedEntry?.group || contextualRepeatGroupForSection(section);
      const singleValueSection = explicitlySingleSection(section);
      const repeatGroup = indexedEntry?.group || dateInfo?.group || (
        contextualRepeatGroup
          ? (semanticRepeatGroup === contextualRepeatGroup ? semanticRepeatGroup : undefined)
          : singleValueSection
            ? undefined
            : semanticRepeatGroup
      );
      const repeatCounterKey = repeatGroup ? `${repeatGroup}:${key}` : "";
      const entryContext = repeatGroup ? repeatEntryContext(element, repeatGroup) : undefined;
      const structuralRepeatIndex = indexedEntry?.index ?? entryContext?.index ?? dateInfo?.index ?? (repeatGroup ? repeatEntryIndex(element, repeatGroup) : undefined);
      const repeatIndex = structuralRepeatIndex ?? (repeatCounterKey ? (repeatCounters.get(repeatCounterKey) || 0) : undefined);
      if (repeatCounterKey) {
        repeatCounters.set(
          repeatCounterKey,
          Math.max(repeatCounters.get(repeatCounterKey) || 0, (repeatIndex || 0) + 1)
        );
      }
      const requiredEvidence = [
        fieldLabel(element),
        ...nearbyFieldTexts(element),
        element.closest("[class*='form-item'],[class*='formItem'],[class*='field'],[class*='question']")?.innerText || ""
      ].join(" ");
      const required = element.required === true ||
        element.getAttribute("aria-required") === "true" ||
        /[＊*]|必填|必选/.test(requiredEvidence) ||
        Boolean(element.closest("[class*='form-item'],[class*='formItem']")?.querySelector(".required,[class*='required']"));
      const repeatIndexSource = indexedEntry
        ? "attribute"
        : entryContext
          ? entryContext.source || "structural"
        : Number.isInteger(dateInfo?.index)
          ? "attribute"
          : repeatCounterKey
            ? "occurrence"
            : undefined;
      const repeatEntryFingerprint = repeatGroup
        ? indexedEntry?.fingerprint || entryContext?.fingerprint || `${repeatGroup}:${repeatIndexSource || "occurrence"}:${repeatIndex ?? 0}`
        : undefined;
      const identity = formRuntime?.describeField?.({
        element,
        label: displayFieldLabel(element),
        section,
        type,
        repeatGroup,
        repeatIndex,
        repeatEntryFingerprint
      });
      const id = identity?.id || `offerflow-field-${index}`;
      const fingerprint = identity?.fingerprint || id;
      element.dataset.offerflowFieldId = id;
      element.dataset.offerflowFingerprint = fingerprint;
      matches.push({
        id,
        fingerprint,
        domPath: identity?.domPath,
        label: displayFieldLabel(element),
        key,
        repeatGroup,
        repeatIndex,
        repeatIndexSource,
        repeatEntryKind: indexedEntry?.kind || entryContext?.kind,
        repeatLocalIndex: indexedEntry?.index ?? (entryContext?.kind ? entryContext.index : undefined),
        repeatEntryFingerprint,
        domOrder: index,
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
    const identityCounts = matches.reduce((counts, field) => {
      counts.set(field.id, (counts.get(field.id) || 0) + 1);
      return counts;
    }, new Map());
    const identityCollisions = new Set(
      Array.from(identityCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([id]) => id)
    );
    matches.forEach((field) => {
      field.identityCollision = identityCollisions.has(field.id);
    });
    return {
      fields: matches,
      platform: {
        id: adapter.id,
        name: adapter.name,
        version: window.OfferFlowFormAdapters?.version || "builtin",
        total: matches.length,
        ruleMatched,
        unknown: matches.length - ruleMatched,
        layer: adapter.route?.layer || (adapter.id === "generic" ? "generic" : "platform"),
        platformId: adapter.route?.platformId || adapter.id,
        companyId: adapter.route?.companyId,
        chain: adapter.route?.chain || [adapter.id],
        identityCollisions: identityCollisions.size
      }
    };
  };

  // 直调 React 受控组件的 onChange handler（兜底）：构造精简版 synthetic event，
  // 绕过事件冒泡时机的不确定性，确保 React 100% 收到值变化
  // （参考竞品 fillField 的 _valueTracker + 直调 handler 写法）
  const triggerReactChange = (element, nativeEvent) => {
    const reactKey = Object.keys(element).find(
      (key) => key.startsWith("__reactEventHandlers$") || key.startsWith("__reactProps$")
    );
    const handlers = reactKey ? element[reactKey] : null;
    if (typeof handlers?.onChange !== "function") return;
    handlers.onChange({
      target: element,
      currentTarget: element,
      type: "change",
      nativeEvent,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      isDefaultPrevented: () => false,
      isPropagationStopped: () => false,
      persist: () => {}
    });
  };

  const dispatchInputEvents = (element) => {
    const inputEvent = new Event("input", { bubbles: true, cancelable: true });
    element.dispatchEvent(inputEvent);
    triggerReactChange(element, inputEvent); // 直调 React onChange 兜底
    element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true, cancelable: true }));
    // 补齐键盘事件：部分自建组件（搜索型 combobox 等）依赖 keydown/keyup 刷新下拉
    element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true }));
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
      if (document.visibilityState === "hidden") {
        queueMicrotask(resolve);
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallback);
        resolve();
      };
      // requestAnimationFrame can be suspended indefinitely when a recruitment
      // tab loses focus. Never let that pause the entire fill queue.
      const fallback = setTimeout(finish, 90);
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(finish);
      else setTimeout(finish, 0);
    });

  const sleep = (milliseconds) =>
    new Promise((resolve) => {
      // Background tabs can clamp timers to tens of seconds. Vue/React state
      // updates still flush through microtasks, so do not hold the fill queue.
      if (document.visibilityState === "hidden") queueMicrotask(resolve);
      else setTimeout(resolve, Math.max(0, milliseconds));
    });

  // Option lists can be populated by a remote search even when Chrome marks
  // the recruitment tab as background. A microtask-only delay outruns that
  // request and reports "option-not-found", so component drivers always use
  // a real timer while waiting for an owned popup to update.
  const controlInteractionWait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));

  const repeatAddPatterns = {
    education: /(?:添加|新增|增加|继续添加|再添加)\s*(?:新的?)?\s*(?:教育经历|教育背景|学历经历|学历)|(?:教育经历|教育背景|学历经历|学历)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+education/i,
    experience: /(?:添加|新增|增加|继续添加|再添加)\s*(?:新的?)?\s*(?:工作经历|工作经验|实习经历|实习经验|实践经历|工作背景)|(?:工作经历|工作经验|实习经历|实习经验|实践经历|工作背景)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+(?:work|experience)/i,
    project: /(?:添加|新增|增加|继续添加|再添加)\s*(?:新的?)?\s*(?:项目经历|项目经验|项目)|(?:项目经历|项目经验|项目)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+project/i,
    campus: /(?:添加|新增|增加|继续添加|再添加)\s*(?:新的?)?\s*(?:在校经历|校园经历)|(?:在校经历|校园经历)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+campus/i,
    award: /(?:添加|新增|增加|继续添加|再添加)\s*(?:新的?)?\s*(?:获奖情况|获奖经历|奖励情况|奖励)|(?:获奖情况|获奖经历|奖励情况|奖励)\s*(?:添加|新增|增加)|add(?:\s+another)?\s+award/i
  };

  const ancestorDistance = (left, right) => {
    if (!(left instanceof Element) || !(right instanceof Element)) {
      return { distance: Number.POSITIVE_INFINITY, common: undefined };
    }
    const leftAncestors = new Map();
    let current = left;
    for (let depth = 0; current && depth < 18; depth += 1, current = current.parentElement) {
      leftAncestors.set(current, depth);
    }
    current = right;
    for (let depth = 0; current && depth < 18; depth += 1, current = current.parentElement) {
      if (leftAncestors.has(current)) {
        return { distance: leftAncestors.get(current) + depth, common: current };
      }
    }
    return { distance: Number.POSITIVE_INFINITY, common: undefined };
  };

  const repeatGroupElements = (group, scan) => (scan?.fields || [])
    .filter((field) => field.repeatGroup === group)
    .map((field) => formRuntime?.resolveElement?.(field) || document.querySelector(`[data-offerflow-field-id="${field.id}"]`))
    .filter((element, index, all) => element && all.indexOf(element) === index);

  const repeatAddButton = (group, scan) => {
    const pattern = repeatAddPatterns[group];
    if (!pattern) return undefined;
    const fieldElements = repeatGroupElements(group, scan);
    const entrySelector = repeatEntrySelectors[group];
    const selector = [
      "button", "a", "[role='button']", "[onclick]",
      "[id*='addButton']", "[id*='AddButton']",
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
      const score = (candidate) => {
        const nearest = fieldElements
          .map((fieldElement) => ancestorDistance(candidate, fieldElement))
          .sort((first, second) => first.distance - second.distance)[0];
        let value = nearest?.distance ?? 1000;
        if (!nearest?.common || nearest.common === document.body || nearest.common === document.documentElement) {
          value += 80;
        } else if (nearest.common.matches?.("section,fieldset,[class*='section'],[class*='module'],[class*='block']")) {
          value -= 20;
        }
        if (entrySelector && candidate.closest?.(entrySelector)) value += 120;
        return value;
      };
      const scoreDifference = score(left) - score(right);
      if (scoreDifference) return scoreDifference;
      // Some Vue pages (including Tencent Careers) attach the click handler to
      // the inner text node instead of the surrounding visual container.
      if (left.contains(right)) return 1;
      if (right.contains(left)) return -1;
      const leftInteractive = left.matches("button,a,[role='button']") ? 0 : 1;
      const rightInteractive = right.matches("button,a,[role='button']") ? 0 : 1;
      return leftInteractive - rightInteractive ||
        clean(left.innerText || left.textContent || "").length - clean(right.innerText || right.textContent || "").length;
    })[0];
  };

  const mokaBlockEntryCount = (blockId) => {
    const block = document.querySelector(`[data-nav-id="${blockId}"]`);
    if (!block) return 0;
    return Array.from(block.children).filter((child) =>
      child.matches?.("[class*='apply-fields-'][class*='multi-']") && isActuallyVisible(child)
    ).length;
  };

  const mokaBlockAddButton = (blockId) => {
    const block = document.querySelector(`[data-nav-id="${blockId}"]`);
    if (!block) return undefined;
    return Array.from(block.querySelectorAll("button,[role='button']"))
      .filter((button) => isActuallyVisible(button) && !button.disabled && button.getAttribute("aria-disabled") !== "true")
      .filter((button) => !button.closest("[class*='apply-fields-']"))
      .find((button) => clean(button.innerText || button.textContent || "") === "添加");
  };

  const ensureMokaRepeatableEntries = async (repeatCounts, repeatPlan) => {
    const experiencePlan = repeatPlan?.experience || {};
    const targets = [
      ["block-educationInfo", repeatCounts?.education],
      ["block-experienceInfo", experiencePlan.work],
      ["block-practiceInfo", experiencePlan.internship ?? repeatCounts?.experience],
      ["block-projectInfo", repeatCounts?.project],
      ["block-awardInfo", repeatCounts?.award]
    ];
    let changed = false;
    for (const [blockId, rawDesired] of targets) {
      const desired = Math.max(0, Math.floor(Number(rawDesired) || 0));
      if (desired <= 0) continue;
      let current = mokaBlockEntryCount(blockId);
      let attempts = 0;
      while (current < desired && attempts < desired + 2) {
        const button = mokaBlockAddButton(blockId);
        if (!button) break;
        clickControl(button);
        attempts += 1;
        let next = current;
        for (let waitAttempt = 0; waitAttempt < 12 && next <= current; waitAttempt += 1) {
          await nextFrame();
          await sleep(60);
          next = mokaBlockEntryCount(blockId);
        }
        if (next <= current) break;
        changed = true;
        current = next;
      }
    }
    return changed;
  };

  const beisenRepeatTarget = (button) => {
    const text = clean(button?.innerText || button?.textContent || "");
    if (/教育|学历|education/i.test(text)) return { group: "education" };
    if (/实习|实践|intern/i.test(text)) return { group: "experience", kind: "internship" };
    if (/工作|任职|work|employment/i.test(text)) return { group: "experience", kind: "work" };
    if (/项目|project/i.test(text)) return { group: "project" };
    if (/在校|校园|campus/i.test(text)) return { group: "campus" };
    if (/获奖|奖项|奖励|award/i.test(text)) return { group: "award" };
    return undefined;
  };

  const beisenRepeatEntryCount = (button) => {
    const formId = String(button?.id || "").replace(/_addButton$/i, "");
    if (!formId) return 0;
    try {
      return Array.from(document.querySelectorAll(`[id="${CSS.escape(formId)}"]`))
        .filter((candidate) => candidate.matches?.(".form"))
        .filter(isActuallyVisible)
        .length;
    } catch {
      return 0;
    }
  };

  const ensureBeisenRepeatableEntries = async (repeatCounts, repeatPlan) => {
    const experiencePlan = repeatPlan?.experience || {};
    const buttons = Array.from(document.querySelectorAll("[id$='_addButton'],[id$='_addbutton']"))
      .filter((button) => isActuallyVisible(button) && button.getAttribute("aria-disabled") !== "true")
      .map((button) => ({ button, target: beisenRepeatTarget(button) }))
      .filter(({ target }) => Boolean(target));
    let changed = false;
    for (const { button, target } of buttons) {
      const rawDesired = target.group === "experience"
        ? experiencePlan[target.kind]
        : repeatCounts?.[target.group];
      const desired = Math.max(0, Math.floor(Number(rawDesired) || 0));
      if (desired <= 0) continue;
      let current = beisenRepeatEntryCount(button);
      let attempts = 0;
      while (current < desired && attempts < desired + 2) {
        clickControl(button);
        attempts += 1;
        let next = current;
        for (let waitAttempt = 0; waitAttempt < 12 && next <= current; waitAttempt += 1) {
          await nextFrame();
          await sleep(60);
          next = beisenRepeatEntryCount(button);
        }
        if (next <= current) break;
        current = next;
        changed = true;
      }
    }
    return changed;
  };

  const hotjobSection = (group) => {
    const pattern = group === "education"
      ? /教育|学历|education/i
      : group === "experience"
        ? /工作|实习|实践|任职|experience|work/i
        : group === "project"
          ? /项目|project/i
          : group === "campus"
            ? /在校|校园|campus/i
            : group === "award"
              ? /获奖|奖项|奖励|award/i
              : undefined;
    if (!pattern) return undefined;
    return Array.from(document.querySelectorAll(".form-cell")).find((section) => {
      const title = clean(
        section.querySelector(":scope > .tit-wrap .tit > p[title],:scope > .tit-wrap .tit > p")?.getAttribute?.("title") ||
        section.querySelector(":scope > .tit-wrap .tit > p[title],:scope > .tit-wrap .tit > p")?.innerText ||
        ""
      );
      return pattern.test(title);
    });
  };

  const hotjobSectionEntryCount = (section) => Array.from(
    section?.querySelectorAll?.(":scope > .form-cell-right > .form-cell-inner") || []
  ).filter(isActuallyVisible).length;

  const hotjobSectionAddButton = (section) => Array.from(
    section?.querySelectorAll?.(":scope > .form-cell-right .add-more-btn") || []
  ).find((button) =>
    isActuallyVisible(button) &&
    !button.disabled &&
    button.getAttribute("aria-disabled") !== "true" &&
    /添加|新增|增加|add/i.test(clean(button.innerText || button.textContent || ""))
  );

  const ensureHotjobRepeatableEntries = async (repeatCounts) => {
    let changed = false;
    for (const group of Object.keys(repeatableFieldKeys)) {
      const desired = Math.max(0, Math.floor(Number(repeatCounts?.[group]) || 0));
      if (desired <= 0) continue;
      let section = hotjobSection(group);
      if (!section) continue;
      let current = hotjobSectionEntryCount(section);
      let attempts = 0;
      while (current < desired && attempts < desired + 2) {
        section = hotjobSection(group);
        const button = hotjobSectionAddButton(section);
        if (!button) break;
        clickControl(button);
        attempts += 1;
        let next = current;
        for (let waitAttempt = 0; waitAttempt < 12 && next <= current; waitAttempt += 1) {
          await nextFrame();
          await sleep(60);
          next = hotjobSectionEntryCount(hotjobSection(group) || section);
        }
        if (next <= current) break;
        changed = true;
        current = next;
      }
    }
    return changed;
  };

  const isPupumallApplication = () =>
    /^jobs\.pupumall\.net$/i.test(location.hostname) ||
    window.OfferFlowFormAdapters?.resolve?.(location)?.id === "pupumall";

  const pupumallSection = (titlePattern) => Array.from(document.querySelectorAll("[class*='FormItem__']"))
    .find((section) => titlePattern.test(clean(
      section.querySelector(":scope > [class*='FormLabel__']")?.innerText || ""
    )));

  const pupumallSectionEntryCount = (section) => Array.from(
    section?.querySelectorAll?.(":scope > [class*='NewFormBtn__'] > [class*='FormContainer__'] > [class*='FormItemBox__']") || []
  ).filter((entry) => !entry.closest("template,[data-template],[data-prototype]")).length;

  const pupumallSectionAddButton = (section, labelPattern) => Array.from(
    section?.querySelectorAll?.("[class*='addBtn__'],[class*='addBtn']") || []
  ).find((button) =>
    isActuallyVisible(button) &&
    labelPattern.test(clean(button.innerText || button.textContent || ""))
  );

  const preparePupumallFormForScan = async () => {
    if (!isPupumallApplication()) return false;
    let changed = false;
    const basic = pupumallSection(/^基本信息$/);
    if (basic && !isActuallyVisible(basic.querySelector("#name"))) {
      const edit = Array.from(basic.querySelectorAll("button")).find((button) =>
        /^编辑$/.test(clean(button.innerText || button.textContent || "").replace(/\s+/g, ""))
      );
      if (edit) {
        clickControlInUserOrder(edit);
        changed = true;
      }
    }
    for (const [title, action] of [
      [/^求职意向$/, /^添加求职意向$/],
      [/^其他资料$/, /^添加其他资料$/]
    ]) {
      const section = pupumallSection(title);
      const hasEditor = Array.from(section?.querySelectorAll?.("form") || []).some(isActuallyVisible);
      if (section && !hasEditor && pupumallSectionEntryCount(section) === 0) {
        const add = pupumallSectionAddButton(section, action);
        if (add) {
          clickControlInUserOrder(add);
          changed = true;
        }
      }
    }
    if (changed) {
      await nextFrame();
      await sleep(100);
    }
    return changed;
  };

  const ensurePupumallRepeatableEntries = async (repeatCounts, repeatPlan) => {
    const targets = [
      { group: "education", section: /^教育经历$/, action: /^添加教育经历$/, desired: repeatCounts?.education },
      {
        group: "experience",
        section: /^实习经历$/,
        action: /^添加实习经历$/,
        desired: repeatPlan?.experience?.internship ?? repeatCounts?.experience
      },
      { group: "campus", section: /^校园经历$/, action: /^添加校园经历$/, desired: repeatCounts?.campus }
    ];
    let changed = false;
    for (const target of targets) {
      const desired = Math.max(0, Math.floor(Number(target.desired) || 0));
      if (desired <= 0) continue;
      let section = pupumallSection(target.section);
      let current = pupumallSectionEntryCount(section);
      while (section && current < desired) {
        const add = pupumallSectionAddButton(section, target.action);
        if (!add) break;
        clickControlInUserOrder(add);
        let next = current;
        for (let attempt = 0; attempt < 14 && next <= current; attempt += 1) {
          await nextFrame();
          await sleep(55);
          section = pupumallSection(target.section) || section;
          next = pupumallSectionEntryCount(section);
        }
        if (next <= current) break;
        changed = true;
        current = next;
      }
    }
    return changed;
  };

  const feishuModule = (titlePattern) => {
    const title = Array.from(document.querySelectorAll(
      ".applyFormModuleWrapper-text,[class*='applyFormModuleWrapper-text'],.createFormSection-text,[class*='createFormSection-text']"
    )).find((candidate) => titlePattern.test(clean(candidate.innerText || candidate.textContent || "")));
    if (!title) return undefined;
    let current = title;
    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      const children = Array.from(current.children || []);
      if (
        children.some((child) => /applyFormModuleWrapper-left|createFormSection-left/.test(String(child.className || ""))) &&
        children.some((child) => /applyFormModuleWrapper-right|createFormSection-right/.test(String(child.className || "")))
      ) {
        return current;
      }
    }
    return undefined;
  };

  const feishuFormilyEntryCards = (module) => {
    const candidates = Array.from(module?.querySelectorAll?.(
      "[class*='apply-form-array-card__'],[class*='applyFormArray-card']"
    ) || []).filter(isActuallyVisible);
    return candidates.filter((candidate) => !candidates.some((parent) =>
      parent !== candidate && parent.contains(candidate)
    ));
  };

  const feishuSectionEntryCount = (scan, module, group, key, sectionPattern) => {
    const modernModule = module?.matches?.("[class*='createFormSection']") ||
      module?.querySelector?.("[class*='createFormSection-formList']");
    if (modernModule) {
      const selector = repeatEntrySelectors[group];
      return Array.from(module?.querySelectorAll?.(selector) || [])
        .filter((entry) => isActuallyVisible(entry))
        .filter((entry) => !entry.querySelector(selector))
        .length;
    }
    // Legacy Formily tenants reuse field ids and may temporarily omit a
    // recognized school/company anchor while a card is rerendering. Count the
    // actual cards first so a failed field scan can never trigger another add.
    const formilyCards = feishuFormilyEntryCards(module);
    if (formilyCards.length) return formilyCards.length;
    return (scan?.fields || []).filter((field) =>
      field.repeatGroup === group && field.key === key && sectionPattern.test(field.section || "")
    ).length;
  };

  const feishuModuleAddButton = (module) => Array.from(module?.querySelectorAll(
    "button,[role='button'],.createFormSection-addBtn,.formOperate-addBtn"
  ) || [])
    .filter((button) => isActuallyVisible(button) && !button.disabled && button.getAttribute("aria-disabled") !== "true")
    .filter((button) => clean(button.innerText || button.textContent || "") === "添加")
    .pop();

  const ensureFeishuRepeatableEntries = async (repeatCounts, initialScan, repeatPlan) => {
    const experiencePlan = repeatPlan?.experience || {};
    const targets = [
      { group: "education", key: "school", section: /教育/, title: /^教育经历$/, desired: repeatCounts?.education },
      { group: "experience", key: "experienceOrganization", section: /工作/, title: /^工作经历$/, desired: experiencePlan.work },
      { group: "experience", key: "experienceOrganization", section: /实习/, title: /^实习经历$/, desired: experiencePlan.internship ?? repeatCounts?.experience },
      { group: "project", key: "projectName", section: /项目/, title: /^项目经历$/, desired: repeatCounts?.project },
      { group: "campus", key: "campusExperienceRole", section: /在校|校园/, title: /^(?:在校|校园)经历$/, desired: repeatCounts?.campus },
      { group: "award", key: "awardName", section: /获奖|奖励/, title: /^获奖|奖励/, desired: repeatCounts?.award }
    ];
    let scan = initialScan;
    let changed = false;
    for (const target of targets) {
      const desired = Math.max(0, Math.floor(Number(target.desired) || 0));
      if (desired <= 0) continue;
      let module = feishuModule(target.title);
      if (!module) continue;
      if (target.title.test("工作经历")) {
        const noExperience = Array.from(module.querySelectorAll("label")).find((label) =>
          /没有工作经历/.test(clean(label.innerText || label.textContent || ""))
        );
        const checkbox = noExperience?.querySelector("input[type='checkbox']");
        if (checkbox?.checked) {
          clickControl(checkbox);
          await nextFrame();
          await sleep(80);
          scan = scanApplicationForm();
          changed = true;
        }
      }
      let current = feishuSectionEntryCount(scan, module, target.group, target.key, target.section);
      let attempts = 0;
      while (current < desired && attempts < desired + 2) {
        module = feishuModule(target.title);
        if (!module) break;
        const button = feishuModuleAddButton(module);
        if (!button) break;
        clickControl(button);
        attempts += 1;
        let next = current;
        for (let waitAttempt = 0; waitAttempt < 16 && next <= current; waitAttempt += 1) {
          await nextFrame();
          await sleep(60);
          scan = scanApplicationForm();
          const liveModule = feishuModule(target.title) || module;
          next = feishuSectionEntryCount(scan, liveModule, target.group, target.key, target.section);
        }
        if (next <= current) break;
        changed = true;
        current = next;
      }
    }
    return { scan, changed };
  };

  const ensureRepeatableEntries = async (repeatCounts, initialScan, repeatPlan) => {
    let scan = initialScan;
    let changed = false;
    if (scan?.platform?.id === "pupumall") {
      const pupumallChanged = await ensurePupumallRepeatableEntries(repeatCounts, repeatPlan);
      if (pupumallChanged) {
        scan = scanApplicationForm();
        changed = true;
      }
    }
    if (scan?.platform?.id === "hotjob") {
      const hotjobChanged = await ensureHotjobRepeatableEntries(repeatCounts);
      if (hotjobChanged) {
        scan = scanApplicationForm();
        changed = true;
      }
    }
    if (scan?.platform?.id === "moka") {
      const mokaChanged = await ensureMokaRepeatableEntries(repeatCounts, repeatPlan);
      if (mokaChanged) {
        scan = scanApplicationForm();
        changed = true;
      }
    }
    if (scan?.platform?.id === "beisen") {
      const beisenChanged = await ensureBeisenRepeatableEntries(repeatCounts, repeatPlan);
      if (beisenChanged) {
        scan = scanApplicationForm();
        changed = true;
      }
    }
    if (scan?.platform?.id === "feishu-career") {
      const result = await ensureFeishuRepeatableEntries(repeatCounts, scan, repeatPlan);
      scan = result.scan;
      changed = changed || result.changed;
    }
    for (const group of Object.keys(repeatableFieldKeys)) {
      if (scan?.platform?.id === "pupumall") continue;
      if (
        group === "experience" &&
        ["beisen", "moka", "feishu-career"].includes(scan?.platform?.id)
      ) continue;
      const desired = Math.max(0, Math.floor(Number(repeatCounts?.[group]) || 0));
      if (desired <= 0) continue;
      let current = repeatableFieldCount(scan.fields, group);
      let attempts = 0;
      while (current < desired && attempts < desired + 2) {
        const button = repeatAddButton(group, scan);
        if (!button) break;
        const domCountBefore = repeatEntryDomCount(group);
        try {
          button.scrollIntoView?.({ behavior: "auto", block: "center", inline: "nearest" });
        } catch {
          // Ignore pages with a custom scroll container.
        }
        clickControl(button);
        attempts += 1;
        let domCountAfter = domCountBefore;
        for (let waitAttempt = 0; waitAttempt < 10 && domCountAfter <= domCountBefore; waitAttempt += 1) {
          await nextFrame();
          await sleep(60);
          domCountAfter = repeatEntryDomCount(group);
        }
        scan = scanApplicationForm();
        const nextCount = repeatableFieldCount(scan.fields, group);
        if (nextCount <= current) break;
        changed = true;
        current = nextCount;
      }
    }
    return { scan, changed };
  };

  // Expansion mutates framework state. Serialize requests and always begin
  // from a fresh scan so a delayed or duplicate message cannot act on an old
  // card count and append the same education record again.
  let repeatExpansionQueue = Promise.resolve();
  const ensureRepeatableEntriesSerialized = (repeatCounts, repeatPlan) => {
    const task = repeatExpansionQueue.then(
      () => ensureRepeatableEntries(repeatCounts, scanApplicationForm(), repeatPlan),
      () => ensureRepeatableEntries(repeatCounts, scanApplicationForm(), repeatPlan)
    );
    repeatExpansionQueue = task.then(() => undefined, () => undefined);
    return task;
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
      await sleep(35);
    }
    return undefined;
  };

  const dismissOpenSelect = async (element) => {
    const target = element?.closest?.(".el-select")?.querySelector(".el-select__input,.el-input__inner") || element;
    if (target) {
      for (const type of ["keydown", "keyup"]) {
        target.dispatchEvent(new KeyboardEvent(type, {
          key: "Escape",
          code: "Escape",
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true
        }));
      }
      target.blur?.();
    }
    await nextFrame();
  };

  const splitMultiValue = (value) => String(value || "")
    .split(/[,，、;；|/]+/)
    .map((item) => clean(item))
    .filter(Boolean);

  const fillElementSelect = async (element, value) => {
    const root = element.closest?.(".el-select");
    if (!root) return false;
    const multiple = root.hasAttribute("multiple") || root.classList.contains("is-multiple") ||
      Boolean(root.querySelector(".el-select__tags"));
    const requested = multiple ? splitMultiValue(value) : [clean(value)];
    if (!requested.length) return false;
    const opener = root.querySelector(".el-input__inner,.el-select__input") || root;
    clickControl(opener);
    await nextFrame();
    await sleep(80);

    let allFound = true;
    for (const requestedValue of requested) {
      const normalized = requestedValue.toLowerCase();
      const option = await findRenderedOption(
        ".el-select-dropdown__item:not(.is-disabled),.country-select-popper .el-select-dropdown__item,[role='option']",
        requestedValue,
        12
      );
      if (!option) {
        allFound = false;
        continue;
      }
      const text = clean(option.innerText || option.textContent || "").toLowerCase();
      if (!(text === normalized || text.includes(normalized) || normalized.includes(text))) {
        allFound = false;
        continue;
      }
      const checkbox = option.querySelector("input[type='checkbox']");
      const selected = option.classList.contains("selected") || option.classList.contains("is-selected") ||
        option.getAttribute("aria-selected") === "true" || Boolean(checkbox?.checked);
      if (!selected) {
        clickControl(option);
        await nextFrame();
        await sleep(70);
      }
      if (!multiple) break;
    }
    await dismissOpenSelect(root);
    return allFound;
  };

  const fillTencentListControl = async (element, value) => {
    const root = element.closest?.(".education-select,.country-select,.school-select") || element.parentElement;
    if (!root) return false;
    clickControl(element);
    await nextFrame();
    await sleep(60);
    const normalized = clean(value).toLowerCase();
    const options = Array.from(root.querySelectorAll(".select-li,.input-select-li"));
    const option = options.find((candidate) => {
      const text = clean(candidate.innerText || candidate.textContent || "").toLowerCase();
      return text === normalized || text.includes(normalized) || normalized.includes(text);
    });
    if (!option) {
      // Tencent allows a school name to remain as typed even when its remote
      // autocomplete has not returned yet. Preserve that valid text value.
      if (element.matches?.("input") && element.closest?.(".school-select")) {
        return clean(element.value).toLowerCase() === normalized;
      }
      return false;
    }
    clickControl(option);
    await nextFrame();
    return true;
  };

  const fillTencentCompoundDate = async (element, value) => {
    const match = String(value || "").match(/(\d{4})[年./-](\d{1,2})/);
    if (!match) return false;
    const year = match[1];
    const month = match[2].padStart(2, "0");
    const yearControl = element.querySelector(".select-left");
    const monthControl = element.querySelector(".select-right");
    if (!yearControl || !monthControl) return false;

    clickControl(yearControl);
    await nextFrame();
    const yearOption = Array.from(element.querySelectorAll(".small-select-li")).find(
      (candidate) => clean(candidate.innerText || candidate.textContent || "") === year
    );
    if (!yearOption) return false;
    clickControl(yearOption);
    await nextFrame();

    clickControl(monthControl);
    await nextFrame();
    const monthOption = Array.from(element.querySelectorAll(".splicing-select-li")).find(
      (candidate) => clean(candidate.innerText || candidate.textContent || "").padStart(2, "0") === month
    );
    if (!monthOption) return false;
    clickControl(monthOption);
    await nextFrame();
    return true;
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
    const monthOnly = Boolean(picker.querySelector(".phoenix-calendar-month-calendar"));

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

    let chosenMonth = false;
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
      chosenMonth = true;
    }

    // Beisen's education start/end controls are month-only calendars. Selecting
    // the month commits and closes the portal; looking for a day cell afterwards
    // incorrectly turns a successful selection into a failure.
    if (monthOnly && chosenMonth) {
      await nextFrame();
      const actual = clean(root.querySelector(".phoenix-select__input")?.value || "");
      return actual === `${date.year}-${String(date.month).padStart(2, "0")}`;
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

  // 字节/飞书系自建下拉 .ud__select 的专用填充（参考竞品 fillCustomSelectField）
  // 这类组件值藏在虚拟 DOM / 自定义属性里，标准 select 写入无效，需模拟交互 + 直调 React onClick
  const fillUdSelect = async (element, value) => {
    const selector = element.closest?.(".ud__select__selector") || element.closest?.(".ud__select");
    if (!selector) return false;
    selector.scrollIntoView?.({ block: "center", inline: "nearest" });
    await sleep(100);
    clickControl(selector);
    await sleep(500); // 等下拉渲染
    const dropdowns = Array.from(document.querySelectorAll(".ud__select__dropdown"));
    const dropdown = dropdowns
      .filter((candidate) => {
        const style = window.getComputedStyle(candidate);
        return (
          !candidate.classList.contains("ud__select__dropdown-hidden") &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      })
      .pop();
    const options = Array.from(
      dropdown?.querySelectorAll(".ud__select__list__item, .ud__select__option") || []
    );
    const normalizedValue = clean(value).toLowerCase();
    const target = options.find((option) => {
      const text = clean(option.textContent || "").toLowerCase();
      return (
        text === normalizedValue ||
        text.includes(normalizedValue) ||
        normalizedValue.includes(text)
      );
    });
    if (!target) {
      document.body.click?.();
      return false;
    }
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    target.click?.();
    // 直调 React onClick 兜底
    const reactKey = Object.keys(target).find(
      (key) => key.startsWith("__reactEventHandlers$") || key.startsWith("__reactProps$")
    );
    const handlers = reactKey ? target[reactKey] : null;
    if (typeof handlers?.onClick === "function") {
      handlers.onClick({
        target,
        currentTarget: target,
        type: "click",
        nativeEvent: new MouseEvent("click"),
        bubbles: true,
        cancelable: true,
        preventDefault: () => {},
        stopPropagation: () => {},
        isDefaultPrevented: () => false,
        isPropagationStopped: () => false,
        persist: () => {}
      });
    }
    await sleep(150);
    return true;
  };

  const setCurrentDateToggle = async (toggle, checked) => {
    if (!toggle) return !checked;
    if (dateToggleChecked(toggle) === checked) return true;
    clickControlInUserOrder(toggle);
    await nextFrame();
    await sleep(40);
    if (dateToggleChecked(toggle) === checked) return true;

    // A few Formily themes render a visually custom checkbox and swallow the
    // DOM click. Update the native checked state and emit the same events as a
    // real user interaction, then require the state to be observable again.
    if (toggle instanceof HTMLInputElement) {
      const previous = toggle.checked;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
      if (setter) setter.call(toggle, checked);
      else toggle.checked = checked;
      toggle._valueTracker?.setValue?.(previous);
      toggle.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      toggle.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      await nextFrame();
      await sleep(40);
    }
    return dateToggleChecked(toggle) === checked;
  };

  const rangeReactHandlers = (info) => {
    const candidates = [info.root, ...info.inputs, info.root.parentElement].filter(Boolean);
    const acceptsRange = (props) => {
      if (typeof props?.onChange !== "function") return false;
      const fieldName = String(
        props["data-form-field-name"] || props["data-form-field-id"] || props.id || props.name || ""
      );
      return Array.isArray(props.value) ||
        /start.*end.*time|time[_\s-]*period|periodInput/i.test(fieldName) ||
        (props.value == null && fieldName === info.fieldName);
    };
    for (const candidate of candidates) {
      const direct = reactEventProps(candidate);
      if (acceptsRange(direct)) return direct;
      const fiberKey = Object.keys(candidate).find((key) =>
        key.startsWith("__reactInternalInstance$") || key.startsWith("__reactFiber$")
      );
      let fiber = fiberKey ? candidate[fiberKey] : undefined;
      for (let depth = 0; fiber && depth < 40; depth += 1, fiber = fiber.return) {
        const props = fiber.memoizedProps || {};
        if (acceptsRange(props)) return props;
      }
    }
    return undefined;
  };

  const setDateInputValue = (input, value) => {
    const previous = input.value;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input._valueTracker?.setValue?.(previous);
    input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true, cancelable: true }));
  };

  const fillUniverseDateRange = async (element, value) => {
    const info = universeDateRangeInfo(element);
    if (!info) return false;
    const [startValue, endValue] = String(value || "").split(ATSX_DATE_RANGE_SEPARATOR);
    const monthValue = (raw) => {
      const match = clean(raw).match(/^(\d{4})[-/.年](\d{1,2})/);
      return match ? `${match[1]}-${match[2].padStart(2, "0")}` : "";
    };
    const start = monthValue(startValue);
    const endIsCurrent = /至今|present|current/i.test(clean(endValue));
    const end = monthValue(endValue);
    if (!start || (!end && !endIsCurrent)) return false;
    if (endIsCurrent && !info.currentToggle && info.inputs.some((input) => input.type === "month")) {
      // Never write "至今" into input[type=month]. Without a separately
      // addressable current-state control there is no safe way to commit it.
      return false;
    }

    if (!endIsCurrent && !(await setCurrentDateToggle(info.currentToggle, false))) return false;
    const handlers = rangeReactHandlers(info);
    if (handlers) {
      const objectRange = Array.isArray(handlers.value) && handlers.value.some((part) =>
        part && typeof part === "object" && ("year" in part || "month" in part)
      );
      const payloadMonth = (month) => objectRange
        ? { year: month.slice(0, 4), month: month.slice(5, 7) }
        : month;
      const endPayload = endIsCurrent
        ? (info.currentToggle ? undefined : "至今")
        : payloadMonth(end);
      handlers.onChange([payloadMonth(start), endPayload]);
      await nextFrame();
      await sleep(50);
    } else {
      setDateInputValue(info.inputs[0], start);
      setDateInputValue(info.inputs[1], endIsCurrent ? "" : end);
    }

    if (endIsCurrent && !(await setCurrentDateToggle(info.currentToggle, true))) return false;
    await nextFrame();
    await sleep(50);
    const expectedEnd = endIsCurrent ? "至今" : end;
    return readUniverseDateRange(element) === `${start}${ATSX_DATE_RANGE_SEPARATOR}${expectedEnd}`;
  };

  const atsxDataCyElement = (scope, value) => Array.from(scope?.querySelectorAll?.("[data-cy]") || [])
    .find((candidate) => candidate.getAttribute("data-cy") === value);

  const visibleAtsxMonthPanel = (rootDataCy, part) => Array.from(
    document.querySelectorAll(".atsx-date-picker-period-month-panel[data-cy]")
  ).find((panel) =>
    panel.getAttribute("data-cy") === `${rootDataCy}${part}Dropdown` && isActuallyVisible(panel)
  );

  const waitForAtsxMonthPanel = async (rootDataCy, part) => {
    const immediate = visibleAtsxMonthPanel(rootDataCy, part);
    if (immediate) return immediate;
    return new Promise((resolve) => {
      let settled = false;
      let timeout;
      const finish = (panel) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timeout);
        resolve(panel);
      };
      // Newly added repeat rows can exist in the form before ATSX has mounted
      // their portal. Resolve from the actual portal mutation instead of
      // outrunning it with a fixed number of microtask-only yields.
      const observer = new MutationObserver(() => {
        const panel = visibleAtsxMonthPanel(rootDataCy, part);
        if (panel) finish(panel);
      });
      observer.observe(document.body, { subtree: true, childList: true, attributes: true });
      timeout = setTimeout(() => finish(visibleAtsxMonthPanel(rootDataCy, part)), 1200);
      queueMicrotask(() => {
        const panel = visibleAtsxMonthPanel(rootDataCy, part);
        if (panel) finish(panel);
      });
    });
  };

  const clickAtsxDateOption = (option) => {
    if (typeof option?.click === "function") option.click();
    else option?.dispatchEvent?.(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  };

  const waitForAtsxCommit = (root, predicate, timeoutMs = 1600) => new Promise((resolve) => {
    if (predicate()) {
      resolve(true);
      return;
    }
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timeout);
      resolve(value);
    };
    const observer = new MutationObserver(() => {
      if (predicate()) finish(true);
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
    // This timer is only a failure bound. Successful ATSX updates resolve from
    // their DOM mutation, so background-tab timer throttling does not slow the
    // normal path.
    const timeout = setTimeout(() => finish(predicate()), timeoutMs);
    queueMicrotask(() => {
      if (predicate()) finish(true);
    });
  });

  /**
   * ATSX renders a hidden input and two independent year/month popovers. The
   * React Fiber expandos live in the page's main world and are not visible to
   * an MV3 content script's isolated world, so real DOM interaction is the
   * authoritative path on Feishu-hosted career pages.
   */
  const chooseAtsxMonthPart = async (root, part, requested) => {
    const rootDataCy = root?.getAttribute?.("data-cy") || "";
    if (!rootDataCy) return false;
    const label = atsxDataCyElement(root, `${rootDataCy}${part}`);
    if (!label) return false;
    clickControl(label);
    let panel = await waitForAtsxMonthPanel(rootDataCy, part);
    if (!panel) return false;

    const lists = panel.querySelectorAll(".atsx-date-picker-period-month-panel-list");
    const yearList = lists[0];
    const yearValue = requested.current ? "-" : requested.year;
    const yearOption = Array.from(yearList?.querySelectorAll(
      ".atsx-date-picker-period-month-panel-list-item"
    ) || []).find((option) =>
      option.getAttribute("data-cy") === yearValue ||
      (requested.current && /至今|present|current/i.test(clean(option.innerText || option.textContent || "")))
    );
    if (!yearOption) return false;
    clickAtsxDateOption(yearOption);
    await nextFrame();
    if (requested.current) {
      const currentLabel = () => atsxDataCyElement(root, `${rootDataCy}${part}`);
      const currentCommitted = () => /至今|present|current/i.test(clean(currentLabel()?.textContent || ""));
      if (!currentCommitted()) {
        // On an initially empty ATSX end date, choosing “至今” can update the
        // popover's selected row without repainting the range label. Toggling
        // the owning label once flushes that pending state; close it again if
        // the toggle opened a fresh portal.
        clickControl(currentLabel());
        await nextFrame();
        if (visibleAtsxMonthPanel(rootDataCy, part)) {
          clickControl(currentLabel());
          await nextFrame();
        }
      }
      return waitForAtsxCommit(root, currentCommitted);
    }

    // Selecting the year can replace the portal subtree. Always reacquire it
    // before choosing the month instead of retaining a stale option node.
    panel = visibleAtsxMonthPanel(rootDataCy, part) || await waitForAtsxMonthPanel(rootDataCy, part);
    const liveLists = panel?.querySelectorAll(".atsx-date-picker-period-month-panel-list") || [];
    const monthOption = Array.from(liveLists[1]?.querySelectorAll(
      ".atsx-date-picker-period-month-panel-list-item"
    ) || []).find((option) => option.getAttribute("data-cy") === requested.month);
    if (!monthOption) return false;
    clickAtsxDateOption(monthOption);
    await nextFrame();
    return true;
  };

  const fillAtsxDateRange = async (element, value) => {
    const info = atsxDateRangeInfo(element);
    if (!info) return false;
    const [startValue, endValue] = String(value || "").split(ATSX_DATE_RANGE_SEPARATOR);
    const monthPart = (raw) => {
      const match = clean(raw).match(/^(\d{4})[-/.年](\d{1,2})/);
      return match ? { year: match[1], month: match[2].padStart(2, "0") } : undefined;
    };
    const start = monthPart(startValue);
    const endIsCurrent = /至今|present|current/i.test(clean(endValue));
    const end = monthPart(endValue);
    if (!start || (!end && !endIsCurrent)) return false;

    const expected = `${start.year}-${start.month}${ATSX_DATE_RANGE_SEPARATOR}${
      endIsCurrent ? "至今" : `${end.year}-${end.month}`
    }`;
    if (readAtsxDateRange(element) === expected) return true;
    const startSelected = await chooseAtsxMonthPart(info.root, "Begin", start);
    const endSelected = startSelected && await chooseAtsxMonthPart(
      info.root,
      "End",
      endIsCurrent ? { current: true } : end
    );
    if (startSelected && endSelected) {
      await nextFrame();
      if (await waitForAtsxCommit(info.root, () => readAtsxDateRange(element) === expected)) return true;
    }

    // Page-world fixtures and older ATSX tenants may expose React internals to
    // the caller. Keep this as a compatibility fallback, never as the primary
    // browser-extension path.
    let handlers;
    const candidates = [element, info.root, ...Array.from(info.root.querySelectorAll("input"))]
      .filter((candidate, index, all) => candidate && all.indexOf(candidate) === index);
    for (const candidate of candidates) {
      const direct = reactEventProps(candidate);
      if (typeof direct?.onChange === "function" && /\.period$/.test(String(direct.id || direct["data-__field"]?.name || ""))) {
        handlers = direct;
        break;
      }
      const fiberKey = Object.keys(candidate).find((key) =>
        key.startsWith("__reactInternalInstance$") || key.startsWith("__reactFiber$")
      );
      let fiber = fiberKey ? candidate[fiberKey] : undefined;
      for (let depth = 0; fiber && depth < 20; depth += 1, fiber = fiber.return) {
        const props = fiber.memoizedProps;
        if (typeof props?.onChange === "function" && /\.period$/.test(String(props.id || props["data-__field"]?.name || ""))) {
          handlers = props;
          break;
        }
      }
      if (handlers) break;
    }
    if (!handlers) return false;

    const currentToggle = currentDateToggle(info.root);
    if (!endIsCurrent && !(await setCurrentDateToggle(currentToggle, false))) return false;
    handlers.onChange([start, end || (currentToggle ? undefined : "至今")]);
    if (endIsCurrent && !(await setCurrentDateToggle(currentToggle, true))) return false;
    await nextFrame();
    await sleep(40);
    return readAtsxDateRange(element) === expected;
  };

  const fillMokaDate = async (element, value) => {
    const info = mokaDateInfo(element);
    if (!info) return false;
    const [startValue, endValue] = String(value || "").split(ATSX_DATE_RANGE_SEPARATOR);
    const monthPart = (raw) => {
      const match = clean(raw).match(/^(\d{4})[-/.年](\d{1,2})/);
      return match ? { year: match[1], month: match[2].padStart(2, "0") } : undefined;
    };
    const start = monthPart(startValue);
    const endIsCurrent = /至今|present|current/i.test(clean(endValue));
    const end = monthPart(endValue);
    if (!start || (info.mode === "date-range" && !end && !endIsCurrent)) return false;

    const selectPart = async (index, requested) => {
      const currentInfo = mokaDateInfo(info.root);
      const select = currentInfo?.selects?.[index];
      const input = select?.querySelector("input[class*='sd-Input-input-']");
      if (!input) return false;
      const selected = clean(
        select.querySelector("[class*='sd-Input-display-value-']")?.innerText ||
        select.querySelector("[class*='sd-Input-display-value-']")?.textContent || ""
      );
      if (/^\d+$/.test(selected) && /^\d+$/.test(requested) && Number(selected) === Number(requested)) {
        return true;
      }
      const result = await formControlDrivers?.fill?.(input, requested, {
        click: clickControlInUserOrder,
        wait: sleep,
        remoteWait: controlInteractionWait
      });
      return result?.handled === true && result.success === true;
    };

    if (!await selectPart(0, start.year) || !await selectPart(1, start.month)) return false;
    if (info.mode === "month") return readMokaDate(info.root) === `${start.year}-${start.month}`;

    const checkbox = info.root.querySelector("input[type='checkbox']");
    if (endIsCurrent) {
      if (checkbox && !checkbox.checked) clickControlInUserOrder(checkbox);
    } else {
      if (checkbox?.checked) clickControlInUserOrder(checkbox);
      if (!await selectPart(2, end.year) || !await selectPart(3, end.month)) return false;
    }
    await nextFrame();
    await sleep(45);
    return controlValueMatches(readMokaDate(info.root), value);
  };

  const fillMokaManagedDate = async (element, value) => {
    if (!isMokaManagedDateInput(element)) return false;
    const props = reactEventProps(element);
    if (typeof props?._set_ !== "function") return false;
    const matched = clean(value).match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    const normalized = matched
      ? `${matched[1]}-${matched[2].padStart(2, "0")}-${matched[3].padStart(2, "0")}`
      : clean(value);
    props._set_(normalized);
    await nextFrame();
    await sleep(80);
    return controlValueMatches(readMokaManagedDate(element), normalized);
  };

  const clickControlInUserOrder = (element) => {
    if (!element) return;
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  };

  const sameSelectValue = (left, right) => {
    const normalizedLeft = clean(left).toLowerCase();
    const normalizedRight = clean(right).toLowerCase();
    return Boolean(normalizedLeft && normalizedRight) && (
      normalizedLeft === normalizedRight ||
      normalizedLeft.includes(normalizedRight) ||
      normalizedRight.includes(normalizedLeft)
    );
  };

  const educationFormCategory = (value) => {
    const normalized = clean(value).toLowerCase().replace(/\s+/g, "");
    if (!normalized) return "";
    if (/海外|境外|港澳台|留学|overseas|abroad/.test(normalized)) return "overseas";
    if (/非全日制|非脱产|part.?time/.test(normalized)) return "parttime";
    if (/统招全日制|普通高等(?:院校|学校)全日制|普通高校全日制|全日制|full.?time/.test(normalized)) return "fulltime";
    if (/自考|自学考试|self.?study/.test(normalized)) return "selfstudy";
    if (/成人|函授|夜大|adult/.test(normalized)) return "adult";
    if (/网络教育|远程教育|online|distance/.test(normalized)) return "online";
    if (/开放教育|开放大学|open.?education/.test(normalized)) return "open";
    if (/其他|其它|other/.test(normalized)) return "other";
    return "";
  };

  const isEducationFormControl = (element) => {
    const evidence = clean([
      fieldLabel(element),
      element?.getAttribute?.("data-cy"),
      ancestorAttributeText(element, "data-cy"),
      ancestorAttributeText(element, "data-form-field-id"),
      ancestorAttributeText(element, "data-form-field-name")
    ].filter(Boolean).join(" "));
    return /学历类型|学习形式|培养方式|教育形式|招生类型|入学类型|education.*(?:form|type)|study.*form/i.test(evidence);
  };

  const educationFormValuesEquivalent = (actual, expected) => {
    const actualCategory = educationFormCategory(actual);
    const expectedCategory = educationFormCategory(expected);
    if (!actualCategory || !expectedCategory) return sameSelectValue(actual, expected);
    if (actualCategory === expectedCategory) return true;
    return actualCategory === "other" && ["adult", "online", "open"].includes(expectedCategory);
  };

  const semanticSelectValueMatches = (element, actual, expected) =>
    isEducationFormControl(element)
      ? educationFormValuesEquivalent(actual, expected)
      : sameSelectValue(actual, expected);

  const semanticEducationFormOption = (options, requested, element) => {
    if (!isEducationFormControl(element)) return undefined;
    const requestedCategory = educationFormCategory(requested);
    if (!requestedCategory) return undefined;
    const exactCategory = options.find(({ text }) => educationFormCategory(text) === requestedCategory);
    if (exactCategory) return exactCategory.option;
    if (["adult", "online", "open"].includes(requestedCategory)) {
      return options.find(({ text }) => educationFormCategory(text) === "other")?.option;
    }
    return undefined;
  };

  const dismissAtsxSelect = async (element) => {
    const control = atsxSelectControl(element) || element;
    const root = control?.closest?.(".atsx-select");
    if (!root) return;
    root.querySelector(".atsx-select-search__field,input")?.blur?.();
    control.blur?.();
    if (
      control.getAttribute("aria-expanded") === "true" ||
      root.classList.contains("atsx-select-open") ||
      Boolean(atsxSelectDropdown(control))
    ) {
      clickControlInUserOrder(document.body);
      await nextFrame();
      await sleep(35);
    }
  };

  const dismissAllAtsxSelects = async () => {
    const open = Array.from(document.querySelectorAll(".atsx-select-open,[role='combobox'][aria-expanded='true']"))
      .some((element) => Boolean(element.closest?.(".atsx-select")));
    if (!open) return;
    clickControlInUserOrder(document.body);
    await nextFrame();
    await sleep(35);
  };

  const findAtsxSelectOption = async (control, value, attempts = 16) => {
    const normalized = clean(value).toLowerCase();
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const dropdown = atsxSelectDropdown(control);
      if (dropdown) {
        const options = Array.from(dropdown.content.querySelectorAll("[role='option']"))
          .filter((option) => isActuallyVisible(option))
          .map((option) => ({
            option,
            text: clean(
              option.querySelector("[data-cy-value]")?.getAttribute("data-cy-value") ||
              option.getAttribute("data-cy-value") ||
              option.innerText || option.textContent || ""
            ).toLowerCase()
          }));
        const exact = options.find(({ text }) => text === normalized);
        if (exact) return exact.option;
        const semantic = semanticEducationFormOption(options, value, control);
        if (semantic) return semantic;
        const fuzzy = options.find(({ text }) => text && (text.includes(normalized) || normalized.includes(text)));
        if (fuzzy) return fuzzy.option;
      }
      await nextFrame();
      await sleep(55);
    }
    return undefined;
  };

  const fillAtsxSelect = async (element, value) => {
    const control = atsxSelectControl(element) || element;
    const root = control?.closest?.(".atsx-select");
    if (!root) return false;
    const requested = clean(value);
    if (!requested) return false;

    const renderedSelection = clean(
      root.querySelector("[data-cy='selectedValue'],.atsx-select-selection-selected-value")?.textContent || ""
    );
    const formControl = root.closest(".atsx-form-item-control");
    const input = root.querySelector(".atsx-select-search__field,input");
    const confirmedCurrent = renderedSelection || (
      formControl?.classList.contains("has-success") ? clean(input?.value || "") : ""
    );
    if (semanticSelectValueMatches(control, confirmedCurrent, requested)) {
      await dismissAtsxSelect(control);
      return semanticSelectValueMatches(control, readAtsxSelectValue(control), requested);
    }

    control.scrollIntoView?.({ behavior: "auto", block: "center", inline: "nearest" });
    clickControlInUserOrder(control);
    await nextFrame();
    await sleep(80);

    if (input && root.classList.contains("atsx-select-combobox")) {
      const oldValue = input.value;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(input, requested);
      else input.value = requested;
      input._valueTracker?.setValue?.(oldValue);
      const inputEvent = new Event("input", { bubbles: true, cancelable: true });
      input.dispatchEvent(inputEvent);
      triggerReactChange(input, inputEvent);
      input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", {
        key: requested.slice(-1),
        bubbles: true,
        cancelable: true
      }));
      await nextFrame();
      await sleep(120);
    }

    const option = await findAtsxSelectOption(control, requested);
    if (!option) {
      await dismissAtsxSelect(control);
      return false;
    }
    clickControlInUserOrder(option);
    await nextFrame();
    await sleep(80);
    await dismissAtsxSelect(control);

    const actual = readAtsxSelectValue(control);
    return semanticSelectValueMatches(control, actual, requested);
  };

  const dismissAntSelect = async (element) => {
    const control = antSelectControl(element) || element;
    const root = control?.closest?.(".ant-select");
    if (!root) return;
    control.blur?.();
    if (
      control.getAttribute("aria-expanded") === "true" ||
      root.classList.contains("ant-select-open") ||
      Boolean(antSelectDropdown(control))
    ) {
      clickControlInUserOrder(document.body);
      await nextFrame();
      await sleep(35);
    }
  };

  const dismissAllAntSelects = async () => {
    const open = Array.from(document.querySelectorAll(".ant-select-open,.ant-select input[role='combobox'][aria-expanded='true']"))
      .some((element) => Boolean(element.closest?.(".ant-select")));
    if (!open && !Array.from(document.querySelectorAll(".ant-select-dropdown")).some(isActuallyVisible)) return;
    clickControlInUserOrder(document.body);
    await nextFrame();
    await sleep(35);
  };

  const findAntSelectOption = async (control, value, attempts = 18) => {
    const normalized = clean(value).toLowerCase();
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const dropdown = antSelectDropdown(control);
      if (dropdown) {
        const options = Array.from(dropdown.content.querySelectorAll(
          ".ant-select-item-option:not(.ant-select-item-option-disabled)," +
          ".ant-select-dropdown-menu-item:not(.ant-select-dropdown-menu-item-disabled)"
        )).filter((option) => isActuallyVisible(option)).map((option) => ({
          option,
          text: clean(
            option.getAttribute("title") ||
            option.querySelector(".ant-select-item-option-content")?.textContent ||
            option.textContent || ""
          ).toLowerCase()
        }));
        const exact = options.find(({ text }) => text === normalized);
        if (exact) return exact.option;
        const semantic = semanticEducationFormOption(options, value, control);
        if (semantic) return semantic;
        const fuzzy = options.find(({ text }) => text && (text.includes(normalized) || normalized.includes(text)));
        if (fuzzy) return fuzzy.option;
      }
      await nextFrame();
      await sleep(65);
    }
    return undefined;
  };

  const fillAntSelect = async (element, value) => {
    const control = antSelectControl(element) || element;
    const root = control?.closest?.(".ant-select");
    if (!root) return false;
    const requested = clean(value);
    if (!requested) return false;

    const current = readAntSelectValue(control);
    if (semanticSelectValueMatches(control, current, requested)) {
      await dismissAntSelect(control);
      return semanticSelectValueMatches(control, readAntSelectValue(control), requested);
    }

    const selector = root.querySelector(".ant-select-selector,.ant-select-selection") || control;
    selector.scrollIntoView?.({ behavior: "auto", block: "center", inline: "nearest" });
    clickControlInUserOrder(selector);
    await nextFrame();
    await sleep(90);

    if (root.classList.contains("ant-select-show-search")) {
      const oldValue = control.value || "";
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(control, requested);
      else control.value = requested;
      control._valueTracker?.setValue?.(oldValue);
      const inputEvent = new Event("input", { bubbles: true, cancelable: true });
      control.dispatchEvent(inputEvent);
      triggerReactChange(control, inputEvent);
      control.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      control.dispatchEvent(new KeyboardEvent("keyup", {
        key: requested.slice(-1),
        bubbles: true,
        cancelable: true
      }));
      await nextFrame();
      await sleep(140);
    }

    const option = await findAntSelectOption(control, requested);
    if (!option) {
      await dismissAntSelect(control);
      return false;
    }
    clickControlInUserOrder(option);
    await nextFrame();
    await sleep(90);
    await dismissAntSelect(control);
    return semanticSelectValueMatches(control, readAntSelectValue(control), requested);
  };

  const isHotjobSchoolInput = (element) =>
    element instanceof HTMLInputElement &&
    /请选择(?:毕业)?院校|请选择学校/.test(element.placeholder || "") &&
    Boolean(element.closest?.(".resume-content-wrap .form-cell"));

  const setReactTextInput = (input, value) => {
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
    const previous = input.value || "";
    const prototype = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input._valueTracker?.setValue?.(previous);
    const inputEvent = new Event("input", { bubbles: true, cancelable: true });
    input.dispatchEvent(inputEvent);
    triggerReactChange(input, inputEvent);
    input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  };

  const visibleHotjobSchoolModal = () => Array.from(document.querySelectorAll(".school-wrap"))
    .filter(isActuallyVisible)
    .pop();

  const dismissHotjobSchoolModal = async (modal) => {
    const cancel = Array.from(modal?.querySelectorAll?.("button") || [])
      .find((button) => /^取消$/.test(clean(button.innerText || button.textContent || "")));
    clickControlInUserOrder(cancel || modal?.querySelector?.(".ant-modal-close") || document.body);
    await nextFrame();
  };

  const fillHotjobSchool = async (element, value) => {
    const requested = clean(value);
    if (!requested) return false;
    if (sameSelectValue(element.value || "", requested)) return true;
    const fieldWrapperId = element.closest?.("[id]")?.id || "";
    clickControlInUserOrder(element);
    let modal;
    for (let attempt = 0; attempt < 16 && !modal; attempt += 1) {
      await nextFrame();
      await sleep(45);
      modal = visibleHotjobSchoolModal();
    }
    if (!modal) return false;
    const search = modal.querySelector("input[placeholder*='学校名称'],.search-bar input");
    if (!(search instanceof HTMLInputElement)) {
      await dismissHotjobSchoolModal(modal);
      return false;
    }
    setReactTextInput(search, requested);
    let option;
    for (let attempt = 0; attempt < 32 && !option; attempt += 1) {
      const schools = Array.from(modal.querySelectorAll(".school-item"))
        .filter(isActuallyVisible)
        .map((candidate) => ({ candidate, text: clean(candidate.innerText || candidate.textContent || "") }));
      option = schools.find(({ text }) => text === requested)?.candidate ||
        schools.find(({ text }) => text && (text.includes(requested) || requested.includes(text)))?.candidate;
      if (!option) await controlInteractionWait(75);
    }
    if (!option) {
      await dismissHotjobSchoolModal(modal);
      return false;
    }
    clickControlInUserOrder(option);
    await nextFrame();
    const confirm = Array.from(modal.querySelectorAll("button"))
      .find((button) => /^选择$/.test(clean(button.innerText || button.textContent || "")));
    if (!confirm) {
      await dismissHotjobSchoolModal(modal);
      return false;
    }
    clickControlInUserOrder(confirm);
    await nextFrame();
    await sleep(60);
    const liveElement = fieldWrapperId
      ? document.getElementById(fieldWrapperId)?.querySelector("input[placeholder*='学校']")
      : undefined;
    return sameSelectValue(liveElement?.value || element.value || "", requested);
  };

  const hotjobProvinceCities = {
    "北京": "北京", "上海": "上海", "天津": "天津", "重庆": "重庆",
    "河北省": "石家庄|唐山|秦皇岛|邯郸|邢台|保定|张家口|承德|沧州|廊坊|衡水",
    "山西省": "太原|大同|阳泉|长治|晋城|朔州|晋中|运城|忻州|临汾|吕梁",
    "内蒙古自治区": "呼和浩特|包头|乌海|赤峰|通辽|鄂尔多斯|呼伦贝尔|巴彦淖尔|乌兰察布",
    "辽宁省": "沈阳|大连|鞍山|抚顺|本溪|丹东|锦州|营口|阜新|辽阳|盘锦|铁岭|朝阳|葫芦岛",
    "吉林省": "长春|吉林|四平|辽源|通化|白山|松原|白城|延边",
    "黑龙江省": "哈尔滨|齐齐哈尔|鸡西|鹤岗|双鸭山|大庆|伊春|佳木斯|七台河|牡丹江|黑河|绥化|大兴安岭",
    "江苏省": "南京|无锡|徐州|常州|苏州|南通|连云港|淮安|盐城|扬州|镇江|泰州|宿迁",
    "浙江省": "杭州|宁波|温州|嘉兴|湖州|绍兴|金华|衢州|舟山|台州|丽水",
    "安徽省": "合肥|芜湖|蚌埠|淮南|马鞍山|淮北|铜陵|安庆|黄山|滁州|阜阳|宿州|六安|亳州|池州|宣城",
    "福建省": "福州|厦门|莆田|三明|泉州|漳州|南平|龙岩|宁德",
    "江西省": "南昌|景德镇|萍乡|九江|新余|鹰潭|赣州|吉安|宜春|抚州|上饶",
    "山东省": "济南|青岛|淄博|枣庄|东营|烟台|潍坊|济宁|泰安|威海|日照|临沂|德州|聊城|滨州|菏泽",
    "河南省": "郑州|开封|洛阳|平顶山|安阳|鹤壁|新乡|焦作|濮阳|许昌|漯河|三门峡|南阳|商丘|信阳|周口|驻马店|济源",
    "湖北省": "武汉|黄石|十堰|宜昌|襄阳|鄂州|荆门|孝感|荆州|黄冈|咸宁|随州|恩施",
    "湖南省": "长沙|株洲|湘潭|衡阳|邵阳|岳阳|常德|张家界|益阳|郴州|永州|怀化|娄底|湘西",
    "广东省": "广州|深圳|珠海|汕头|佛山|韶关|湛江|肇庆|江门|茂名|惠州|梅州|汕尾|河源|阳江|清远|东莞|中山|潮州|揭阳|云浮",
    "广西壮族自治区": "南宁|柳州|桂林|梧州|北海|防城港|钦州|贵港|玉林|百色|贺州|河池|来宾|崇左",
    "海南省": "海口|三亚|三沙|儋州",
    "四川省": "成都|自贡|攀枝花|泸州|德阳|绵阳|广元|遂宁|内江|乐山|南充|眉山|宜宾|广安|达州|雅安|巴中|资阳|阿坝|甘孜|凉山",
    "贵州省": "贵阳|六盘水|遵义|安顺|毕节|铜仁|黔西南|黔东南|黔南",
    "云南省": "昆明|曲靖|玉溪|保山|昭通|丽江|普洱|临沧|楚雄|红河|文山|西双版纳|大理|德宏|怒江|迪庆",
    "西藏自治区": "拉萨|日喀则|昌都|林芝|山南|那曲|阿里",
    "陕西省": "西安|铜川|宝鸡|咸阳|渭南|延安|汉中|榆林|安康|商洛",
    "甘肃省": "兰州|嘉峪关|金昌|白银|天水|武威|张掖|平凉|酒泉|庆阳|定西|陇南|临夏|甘南",
    "青海省": "西宁|海东|海北|黄南|海南|果洛|玉树|海西",
    "宁夏回族自治区": "银川|石嘴山|吴忠|固原|中卫",
    "新疆维吾尔自治区": "乌鲁木齐|克拉玛依|吐鲁番|哈密|昌吉|博尔塔拉|巴音郭楞|阿克苏|克孜勒苏|喀什|和田|伊犁|塔城|阿勒泰",
    "香港": "香港", "澳门": "澳门", "台湾省": "台北|新北|桃园|台中|台南|高雄|台湾"
  };

  const hotjobProvinceForLocation = (value) => {
    const normalized = clean(value).replace(/[省市]/g, "");
    for (const [province, cities] of Object.entries(hotjobProvinceCities)) {
      const provinceToken = province.replace(/省|市|自治区|壮族|回族|维吾尔/g, "");
      if (normalized.includes(provinceToken) || cities.split("|").some((city) => normalized.includes(city))) {
        return province;
      }
    }
    return "";
  };

  const hotjobCityForLocation = (value) => {
    const normalized = clean(value).replace(/[省市区县\s]/g, "");
    for (const cities of Object.values(hotjobProvinceCities)) {
      const city = cities.split("|").find((candidate) => normalized.includes(candidate.replace(/[市\s]/g, "")));
      if (city) return city;
    }
    return clean(value).split(/\s*(?:>|\/|\\|→|—>|，|,|、)\s*/).filter(Boolean).at(-1) || clean(value);
  };

  const isAntCascaderInput = (element) =>
    element instanceof HTMLInputElement && element.classList.contains("ant-cascader-input");

  const fillAntCascader = async (element, value) => {
    const requested = clean(value);
    if (!requested) return false;
    const city = hotjobCityForLocation(requested);
    const province = hotjobProvinceForLocation(requested);
    const hierarchy = [province, city].filter((item, index, all) => item && all.indexOf(item) === index);
    if (!hierarchy.length) return false;
    clickControlInUserOrder(element);
    for (let level = 0; level < hierarchy.length; level += 1) {
      let option;
      for (let attempt = 0; attempt < 18 && !option; attempt += 1) {
        const menus = Array.from(document.querySelectorAll(".ant-cascader-menus .ant-cascader-menu"))
          .filter(isActuallyVisible);
        const menu = menus[level] || menus.at(-1);
        const choices = Array.from(menu?.querySelectorAll?.(".ant-cascader-menu-item") || [])
          .filter((candidate) => !/disabled/.test(String(candidate.className || "")))
          .map((candidate) => ({ candidate, text: clean(candidate.innerText || candidate.textContent || "") }));
        const wanted = clean(hierarchy[level]).replace(/[省市\s]/g, "");
        option = choices.find(({ text }) => text.replace(/[省市\s]/g, "") === wanted)?.candidate ||
          choices.find(({ text }) => {
            const normalized = text.replace(/[省市\s]/g, "");
            return normalized.includes(wanted) || wanted.includes(normalized);
          })?.candidate;
        if (!option) {
          await nextFrame();
          await sleep(55);
        }
      }
      if (!option) return false;
      clickControlInUserOrder(option);
      await nextFrame();
      await sleep(60);
    }
    const actual = clean(element.value).replace(/[省市区县\s/]/g, "");
    return Boolean(actual) && actual.includes(clean(city).replace(/[省市区县\s]/g, ""));
  };

  const fillHotjobCascader = async (element, value) => {
    const requested = clean(value).split(/[，,、;；|]/).map(clean).filter(Boolean)[0] || "";
    if (!requested) return false;
    const roots = Array.from(element.querySelectorAll(":scope > .ant-select,.ant-select"))
      .filter((root, index, all) => all.indexOf(root) === index)
      .slice(0, 2);
    if (roots.length < 2) return false;
    const hierarchy = requested.split(/\s*(?:>|\/|\\|→|—>)\s*/).map(clean).filter(Boolean);
    const city = hierarchy.at(-1) || requested;
    const province = hierarchy.length > 1 ? hierarchy[0] : hotjobProvinceForLocation(requested);
    if (!province) return false;
    const firstControl = roots[0].querySelector("[role='combobox']") || roots[0];
    const secondControl = roots[1].querySelector("[role='combobox']") || roots[1];
    if (!await fillAntSelect(firstControl, province)) return false;
    await nextFrame();
    if (!await fillAntSelect(secondControl, city)) return false;
    const actual = readControlValue(element);
    const normalizedActual = clean(actual).replace(/[省市\s]/g, "");
    const normalizedCity = clean(city).replace(/[省市\s]/g, "");
    return normalizedActual.includes(normalizedCity);
  };

  const isAntV3DateInput = (element) =>
    element instanceof HTMLInputElement &&
    element.readOnly &&
    element.classList.contains("ant-calendar-picker-input");

  const parseHotjobDate = (element, value) => {
    if (/至今|现在|目前|present|current/i.test(String(value || ""))) {
      const today = new Date();
      return { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };
    }
    const match = String(value || "").match(/((?:19|20)\d{2})[年./-](\d{1,2})(?:[月./-](\d{1,2}))?/);
    if (!match) return undefined;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const explicitDay = match[3] ? Number(match[3]) : undefined;
    const isEnd = /结束|毕业|离校|截止|end/i.test(fieldLabel(element));
    const day = explicitDay || (isEnd ? new Date(year, month, 0).getDate() : 1);
    return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { year, month, day } : undefined;
  };

  const isAntV4DateInput = (element) =>
    element instanceof HTMLInputElement &&
    element.readOnly &&
    Boolean(element.closest?.(".ant-picker")) &&
    !element.classList.contains("ant-calendar-picker-input");

  const visibleAntV4Picker = () => Array.from(document.querySelectorAll(".ant-picker-dropdown"))
    .filter(isActuallyVisible)
    .at(-1);

  const fillAntV4Date = async (element, value) => {
    const date = parseHotjobDate(element, value);
    if (!date) return false;
    element.focus?.({ preventScroll: true });
    clickControlInUserOrder(element);
    let popup;
    for (let attempt = 0; attempt < 18 && !popup; attempt += 1) {
      await nextFrame();
      await sleep(45);
      popup = visibleAntV4Picker();
    }
    if (!popup) return false;
    const monthPanel = popup.querySelector(".ant-picker-month-panel");
    const currentYear = Number(clean(popup.querySelector(".ant-picker-year-btn")?.innerText || "").match(/\d{4}/)?.[0]);
    if (!currentYear || Math.abs(date.year - currentYear) > 120) return false;
    const yearButtonSelector = date.year < currentYear
      ? ".ant-picker-header-super-prev-btn"
      : ".ant-picker-header-super-next-btn";
    for (let step = 0; step < Math.abs(date.year - currentYear); step += 1) {
      const button = popup.querySelector(yearButtonSelector);
      if (!button) return false;
      clickControlInUserOrder(button);
      await nextFrame();
    }
    if (monthPanel) {
      const cell = popup.querySelector(`td.ant-picker-cell[title="${date.year}-${String(date.month).padStart(2, "0")}"]:not(.ant-picker-cell-disabled)`);
      if (!cell) return false;
      clickControlInUserOrder(cell.querySelector(".ant-picker-cell-inner") || cell);
    } else {
      const currentMonth = Number(clean(popup.querySelector(".ant-picker-month-btn")?.innerText || "").match(/\d{1,2}/)?.[0]);
      if (!currentMonth) return false;
      const monthButtonSelector = date.month < currentMonth
        ? ".ant-picker-header-prev-btn"
        : ".ant-picker-header-next-btn";
      for (let step = 0; step < Math.abs(date.month - currentMonth); step += 1) {
        const button = popup.querySelector(monthButtonSelector);
        if (!button) return false;
        clickControlInUserOrder(button);
        await nextFrame();
      }
      const title = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
      const cell = popup.querySelector(`td.ant-picker-cell[title="${title}"]:not(.ant-picker-cell-disabled)`);
      if (!cell) return false;
      clickControlInUserOrder(cell.querySelector(".ant-picker-cell-inner") || cell);
    }
    await nextFrame();
    await sleep(55);
    const actual = String(element.value || "").match(/((?:19|20)\d{2})\D+(\d{1,2})(?:\D+(\d{1,2}))?/);
    return Boolean(actual) && Number(actual[1]) === date.year && Number(actual[2]) === date.month &&
      (monthPanel || Number(actual[3]) === date.day);
  };

  const visibleAntV3Calendar = (element) => {
    const placeholder = clean(element.getAttribute("placeholder") || "");
    const candidates = Array.from(document.querySelectorAll(".ant-calendar-picker-container"))
      .filter(isActuallyVisible);
    return candidates.find((popup) => clean(popup.querySelector(".ant-calendar-input")?.placeholder || "") === placeholder) ||
      candidates.at(-1);
  };

  const fillAntV3Date = async (element, value) => {
    const date = parseHotjobDate(element, value);
    if (!date) return false;
    clickControlInUserOrder(element);
    let popup;
    for (let attempt = 0; attempt < 16 && !popup; attempt += 1) {
      await nextFrame();
      await sleep(40);
      popup = visibleAntV3Calendar(element);
    }
    if (!popup) return false;
    const yearText = clean(popup.querySelector(".ant-calendar-year-select")?.innerText || "");
    const monthText = clean(popup.querySelector(".ant-calendar-month-select")?.innerText || "");
    const currentYear = Number(yearText.match(/\d{4}/)?.[0]);
    const currentMonth = Number(monthText.match(/\d{1,2}/)?.[0]);
    if (!currentYear || !currentMonth || Math.abs(date.year - currentYear) > 120) return false;
    const yearButtonSelector = date.year < currentYear
      ? ".ant-calendar-prev-year-btn"
      : ".ant-calendar-next-year-btn";
    for (let step = 0; step < Math.abs(date.year - currentYear); step += 1) {
      const button = popup.querySelector(yearButtonSelector);
      if (!button) return false;
      clickControlInUserOrder(button);
      await nextFrame();
    }
    const monthButtonSelector = date.month < currentMonth
      ? ".ant-calendar-prev-month-btn"
      : ".ant-calendar-next-month-btn";
    for (let step = 0; step < Math.abs(date.month - currentMonth); step += 1) {
      const button = popup.querySelector(monthButtonSelector);
      if (!button) return false;
      clickControlInUserOrder(button);
      await nextFrame();
    }
    const title = `${date.year}年${date.month}月${date.day}日`;
    const cell = Array.from(popup.querySelectorAll("td.ant-calendar-cell[title]"))
      .find((candidate) => candidate.getAttribute("title") === title && !/disabled/.test(String(candidate.className || "")));
    if (!cell) return false;
    clickControlInUserOrder(cell.querySelector(".ant-calendar-date") || cell);
    await nextFrame();
    await sleep(50);
    const actual = String(element.value || "").match(/((?:19|20)\d{2})\D+(\d{1,2})\D+(\d{1,2})/);
    return Boolean(actual) && Number(actual[1]) === date.year && Number(actual[2]) === date.month && Number(actual[3]) === date.day;
  };

  const setNativeValue = async (element, value) => {
    prepareControlInteraction(element);
    if (isHotjobSchoolInput(element)) return fillHotjobSchool(element, value);
    if (element.matches?.(".cascader-plugins-wrap")) return fillHotjobCascader(element, value);
    if (isAntCascaderInput(element)) return fillAntCascader(element, value);
    if (isAntV4DateInput(element)) return fillAntV4Date(element, value);
    if (isAntV3DateInput(element)) return fillAntV3Date(element, value);
    const compoundDate = compoundDateInfo(element);
    if (compoundDate?.engine === "atsx") return fillAtsxDateRange(element, value);
    if (compoundDate?.engine === "universe") return fillUniverseDateRange(element, value);
    if (compoundDate?.engine === "moka") return fillMokaDate(element, value);
    if (isMokaManagedDateInput(element)) return fillMokaManagedDate(element, value);
    const sharedDriver = formControlDrivers?.identify?.(element);
    const sharedDriverIds = new Set(["moka", "feishu", "element", "iview", "fusion", "semi", "arco", "tdesign", "mdesign", "bootstrap", "generic"]);
    if (sharedDriver && sharedDriverIds.has(sharedDriver.id)) {
      const driven = await formControlDrivers.fill(element, value, {
        click: clickControlInUserOrder,
        wait: sleep,
        remoteWait: controlInteractionWait
      });
      if (driven.handled) return driven.success;
    }
    if (element instanceof HTMLSelectElement) {
      const normalized = clean(value).toLowerCase();
      const options = Array.from(element.options).map((option) => ({
        option,
        text: clean(`${option.text} ${option.value}`).toLowerCase()
      }));
      const option = options.find(({ text }) => text === normalized)?.option ||
        semanticEducationFormOption(options, value, element) ||
        options.find(({ text }) => text.includes(normalized) || normalized.includes(text))?.option;
      if (!option) return false;
      const oldValue = element.value;
      element.value = option.value;
      // React 受控 <select> 同样用 _valueTracker 判断变化，设回旧值确保 onChange 触发
      element._valueTracker?.setValue?.(oldValue);
      const win = element.ownerDocument?.defaultView || window;
      const bsContainer = element.closest?.(".bootstrap-select") || element.parentElement?.querySelector?.(".bootstrap-select");
      if (bsContainer || element.classList?.contains("selectpicker")) {
        try {
          if (typeof win.$ === "function") {
            win.$(element).val(option.value).selectpicker?.("refresh");
          }
        } catch {}
      }
      const wayKey = element.getAttribute?.("way-data");
      if (wayKey && typeof win.way?.set === "function") {
        try { win.way.set(wayKey, option.value); } catch {}
      }
      const form = element.form || element.closest?.("form");
      if (form && typeof win.$ === "function") {
        try { win.$(form).bootstrapValidator?.("revalidateField", element.name || element.id); } catch {}
      }
    } else if (element instanceof HTMLInputElement && element.type === "radio") {
      const container = element.closest(".ant-radio-group,fieldset,[role='radiogroup'],[class~='radio-group'],[class$='-radio-group']");
      const radios = container
        ? Array.from(container.querySelectorAll("input[type='radio']"))
        : element.name
          ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`))
          : [element];
      const normalized = clean(value).toLowerCase();
      const target = radios.find((radio) => clean(
        `${radio.value} ${radio.closest?.("label,.ant-radio-wrapper")?.innerText || ""} ${fieldLabel(radio)}`
      ).toLowerCase().includes(normalized));
      if (!target) return false;
      clickControlInUserOrder(target.closest?.("label,.ant-radio-wrapper") || target);
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
      const options = Array.from(element.querySelectorAll(
        ".phoenix-radio-group__radioItem,.ant-radio-wrapper,[class*='radio--withLabel'],[role='radio'],label.el-radio"
      ));
      const target = options.find((option) => clean(option.innerText || option.textContent || "").toLowerCase().includes(normalized));
      if (!target) return false;
      // Phoenix attaches React's onClick to the inner .phoenix-radio node,
      // while the outer radioItem is only a layout wrapper.
      const clickable = target.matches?.(".phoenix-radio,.ant-radio-wrapper,[class*='radio--withLabel']")
        ? target
        : target.querySelector(".phoenix-radio,.ant-radio-wrapper,[class*='radio--withLabel']") || target;
      clickControl(clickable);
    } else if (element.matches?.(checkboxSelector)) {
      const input = element.querySelector("input[type='checkbox']");
      const normalized = clean(value).toLowerCase();
      const shouldCheck = /^(1|true|yes|y|是|接受|愿意|同意|有)$/.test(normalized);
      const checked = input ? input.checked : readControlValue(element) === "是";
      if (checked !== shouldCheck) clickControl(element);
    } else if (element.matches?.(cascaderSelector)) {
      clickControl(element);
      const target = await findRenderedOption(
        "[role='option'],.el-cascader-node,.el-cascader-menu__item,[class*='cascader'] li",
        value
      );
      if (!target) return false;
      clickControl(target);
    } else if (element.closest?.(".ud__select")) {
      const ok = await fillUdSelect(element, value);
      if (!ok) return false;
    } else if (element.closest?.(".atsx-select")) {
      return fillAtsxSelect(element, value);
    } else if (element.closest?.(".ant-select")) {
      return fillAntSelect(element, value);
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
      const selected = await fillElementSelect(element, value);
      if (!selected) return false;
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
    } else if (element.matches?.(".education-select > .select")) {
      const selected = await fillTencentListControl(element, value);
      if (!selected) return false;
    } else if (element.matches?.(".test-border")) {
      const selected = await fillTencentCompoundDate(element, value);
      if (!selected) return false;
    } else if (element.getAttribute("contenteditable") === "true") {
      element.textContent = value;
    } else {
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const oldValue = element.value;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(element, value);
      else element.value = value;
      // React 受控组件加固：把 _valueTracker 设回旧值，确保 React 在后续事件里
      // 检测到"实际值 ≠ 跟踪值"而触发 onChange（防止赋值被 React 回滚/忽略）
      element._valueTracker?.setValue?.(oldValue);
      dispatchInputEvents(element);
      const win = element.ownerDocument?.defaultView || window;
      const wayKey = element.getAttribute?.("way-data");
      if (wayKey && typeof win.way?.set === "function") {
        try { win.way.set(wayKey, value); } catch {}
      }
      const form = element.form || element.closest?.("form");
      if (form && typeof win.$ === "function") {
        try { win.$(form).bootstrapValidator?.("revalidateField", element.name || element.id); } catch {}
      }
      if (element.closest?.(".school-select")) {
        const selected = await fillTencentListControl(element, value);
        if (!selected) return false;
      }
      return true;
    }
    dispatchInputEvents(element);
    return true;
  };

  const profileDateRangeEndKeys = {
    educationStartDate: "educationEndDate",
    experienceStartDate: "experienceEndDate",
    projectStartDate: "projectEndDate"
  };

  const normalizedControlValue = (value) => clean(String(value || ""))
    .replaceAll(ATSX_DATE_RANGE_SEPARATOR, "—")
    .replace(/\s+/g, "")
    .toLowerCase();

  const controlValueMatches = (actual, expected) => {
    const normalizedActual = normalizedControlValue(actual);
    const normalizedExpected = normalizedControlValue(expected);
    return Boolean(normalizedActual && normalizedExpected) && (
      normalizedActual === normalizedExpected ||
      normalizedActual.includes(normalizedExpected) ||
      normalizedExpected.includes(normalizedActual)
    );
  };

  const controlValueMatchesForField = (field, actual, expected) =>
    field?.key === "educationForm"
      ? educationFormValuesEquivalent(actual, expected)
      : controlValueMatches(actual, expected);

  const fieldTrackingKey = (field) => field.fingerprint || field.id;

  const fieldSemanticKey = (field) => [
    field.key || "unknown",
    effectiveRepeatGroupForField(field) || "single",
    field.repeatEntryKind || "",
    Number.isInteger(field.repeatLocalIndex) ? field.repeatLocalIndex : "",
    Number.isInteger(field.repeatIndex) ? field.repeatIndex : 0,
    field.type || "field"
  ].join("|");

  const fieldValueFromSnapshots = (field, snapshots) => {
    if (!field.key || !Array.isArray(snapshots) || !snapshots.length) return undefined;
    if (Number.isInteger(field.profileRepeatIndex) && field.profileRepeatIndex < 0) return undefined;
    const preferredIndex = Number.isInteger(field.profileRepeatIndex) ? field.profileRepeatIndex : field.repeatIndex;
    const index = Number.isInteger(preferredIndex) && preferredIndex >= 0 ? preferredIndex : 0;
    const snapshot = snapshots[index] || snapshots[0] || {};
    const value = snapshot[field.key];
    const endKey = field.type === "date-range" ? profileDateRangeEndKeys[field.key] : undefined;
    return endKey ? `${value || ""}${ATSX_DATE_RANGE_SEPARATOR}${snapshot[endKey] || ""}` : value;
  };

  const resolveFieldElement = (field) => {
    const runtimeElement = formRuntime?.resolveElement?.(field);
    if (runtimeElement) return runtimeElement;
    const targetDoc = resolveTargetDocument();
    try {
      return targetDoc.querySelector(`[data-offerflow-field-id="${CSS.escape(field.id)}"]`) ||
        document.querySelector(`[data-offerflow-field-id="${CSS.escape(field.id)}"]`) ||
        undefined;
    } catch {
      return undefined;
    }
  };

  const commitPupumallRepeatEditors = async (items, valueForField) => {
    if (!isPupumallApplication()) return false;
    const anchorKeys = {
      education: "school",
      experience: "experienceOrganization",
      campus: "campusExperienceRole"
    };
    let committed = false;
    const forms = Array.from(document.querySelectorAll(
      "[class*='NewFormBtn__'] > [class*='FormContainer__'] > [class*='FormItemBox__'] form"
    )).filter(isActuallyVisible);
    for (const form of forms) {
      const formFields = items.filter((field) => {
        const element = resolveFieldElement(field);
        return element && form.contains(element) && Boolean(effectiveRepeatGroupForField(field));
      });
      const group = effectiveRepeatGroupForField(formFields[0]);
      const anchorKey = anchorKeys[group];
      const anchor = formFields.find((field) => field.key === anchorKey);
      if (!anchor) continue;
      const expectedFields = formFields.filter((field) => Boolean(valueForField(field)));
      if (!expectedFields.length || !expectedFields.every((field) => {
        const element = resolveFieldElement(field);
        return element && controlValueMatchesForField(field, readControlValue(element), valueForField(field));
      })) continue;
      const save = Array.from(form.querySelectorAll("button")).find((button) =>
        /^保存$/.test(clean(button.innerText || button.textContent || "").replace(/\s+/g, "")) &&
        !button.disabled && button.getAttribute("aria-disabled") !== "true"
      );
      if (!save) continue;
      clickControlInUserOrder(save);
      for (let attempt = 0; attempt < 16 && form.isConnected && isActuallyVisible(form); attempt += 1) {
        await nextFrame();
        await sleep(65);
      }
      if (!form.isConnected || !isActuallyVisible(form)) committed = true;
    }
    return committed;
  };

  const fieldBlueprintFallbackKey = (field) => [
    normalizeFieldText(field.section || ""),
    normalizeFieldText(field.label || ""),
    field.type || "",
    field.repeatEntryKind || "",
    Number.isInteger(field.repeatLocalIndex) ? field.repeatLocalIndex : "",
    field.repeatEntryFingerprint || "",
    Number.isInteger(field.repeatIndex) ? field.repeatIndex : ""
  ].join("|");

  const fillApplicationForm = async (fields, values, options = {}) => {
    const initialItems = Array.isArray(fields) ? fields : [];
    const profileValues = values || {};
    const fieldValues = options.fieldValues && typeof options.fieldValues === "object"
      ? options.fieldValues
      : {};
    const profileSnapshots = Array.isArray(options.profileSnapshots) ? options.profileSnapshots : [];
    const fillDynamicFields = options.fillDynamicFields === true;
    const maxRounds = Math.max(1, Math.min(7, Math.floor(Number(options.maxRounds) || 1)));
    const requestedDelay = Number(options.delayMs);
    const delayMs = Number.isFinite(requestedDelay)
      ? Math.max(0, Math.min(180, requestedDelay))
      : 55;
    const resultsByField = new Map();
    const attemptsByField = new Map();
    const filledFields = new Set();
    const initialSemanticKeys = new Set(initialItems.filter((field) => field.key).map(fieldSemanticKey));
    const blueprintsByFingerprint = new Map(
      initialItems.filter((field) => field.fingerprint).map((field) => [field.fingerprint, field])
    );
    const blueprintsByFallback = new Map(initialItems.map((field) => [fieldBlueprintFallbackKey(field), field]));
    const repeatAnchorKeys = {
      education: "school",
      experience: "experienceOrganization",
      project: "projectName",
      campus: "campusExperienceRole",
      award: "awardName",
      language: "languageName",
      qualification: "qualificationName",
      family: "familyName"
    };
    const inferredExperienceKind = (field) => field.repeatEntryKind === "combined" ? "" : field.repeatEntryKind || (
      /实习|practice|intern/i.test(field.section || "")
        ? "internship"
        : /工作|work|employment/i.test(field.section || "")
          ? "work"
          : ""
    );
    const entryBindingKey = (field) => {
      const group = effectiveRepeatGroupForField(field);
      if (!group) return "";
      const kind = group === "experience" ? inferredExperienceKind(field) : field.repeatEntryKind || group;
      const localIndex = Number.isInteger(field.repeatLocalIndex)
        ? field.repeatLocalIndex
        : Number.isInteger(field.repeatIndex)
          ? field.repeatIndex
          : "";
      const entryIdentity = field.repeatEntryFingerprint || `index:${localIndex}`;
      return [group, kind, entryIdentity].join("|");
    };
    const plannedProfileIndex = (field) => {
      if (effectiveRepeatGroupForField(field) !== "experience") return undefined;
      const kind = inferredExperienceKind(field);
      if (!kind) return undefined;
      const indexes = options.repeatPlan?.experience?.[`${kind}Indexes`];
      const localIndex = Number.isInteger(field.repeatLocalIndex)
        ? field.repeatLocalIndex
        : field.repeatIndex;
      return Array.isArray(indexes) && Number.isInteger(localIndex)
        ? indexes[localIndex] ?? -1
        : undefined;
    };
    const profileIndexByEntry = new Map();
    const bindingSeeds = [...initialItems].sort((left, right) => {
      const leftAnchor = repeatAnchorKeys[left.repeatGroup] === left.key ? 0 : 1;
      const rightAnchor = repeatAnchorKeys[right.repeatGroup] === right.key ? 0 : 1;
      return leftAnchor - rightAnchor || (left.domOrder ?? 0) - (right.domOrder ?? 0);
    });
    for (const field of bindingSeeds) {
      const bindingKey = entryBindingKey(field);
      if (!bindingKey || profileIndexByEntry.has(bindingKey)) continue;
      const profileIndex = Number.isInteger(field.profileRepeatIndex)
        ? field.profileRepeatIndex
        : plannedProfileIndex(field) ?? field.repeatIndex;
      if (Number.isInteger(profileIndex)) profileIndexByEntry.set(bindingKey, profileIndex);
    }
    const bindProfileRecord = (field) => {
      const bindingKey = entryBindingKey(field);
      const boundIndex = bindingKey ? profileIndexByEntry.get(bindingKey) : undefined;
      const plannedIndex = plannedProfileIndex(field);
      const profileRepeatIndex = Number.isInteger(boundIndex)
        ? boundIndex
        : Number.isInteger(plannedIndex)
          ? plannedIndex
          : Number.isInteger(field.profileRepeatIndex)
            ? field.profileRepeatIndex
            : field.repeatIndex;
      if (bindingKey && Number.isInteger(profileRepeatIndex) && !profileIndexByEntry.has(bindingKey)) {
        profileIndexByEntry.set(bindingKey, profileRepeatIndex);
      }
      return Number.isInteger(profileRepeatIndex) ? { ...field, profileRepeatIndex } : field;
    };
    let processed = 0;
    let rounds = 0;
    let rescanned = false;
    let finalFields = initialItems;

    const valueForField = (field) => {
      if (Object.prototype.hasOwnProperty.call(fieldValues, field.id)) return fieldValues[field.id];
      const blueprint = field.fingerprint ? blueprintsByFingerprint.get(field.fingerprint) : undefined;
      if (blueprint && Object.prototype.hasOwnProperty.call(fieldValues, blueprint.id)) return fieldValues[blueprint.id];
      const snapshotValue = fieldValueFromSnapshots(field, profileSnapshots);
      return snapshotValue !== undefined ? snapshotValue : field.key ? profileValues[field.key] : undefined;
    };

    const hydrateField = (field) => {
      const blueprint = (field.fingerprint ? blueprintsByFingerprint.get(field.fingerprint) : undefined) ||
        blueprintsByFallback.get(fieldBlueprintFallbackKey(field));
      if (!blueprint) return bindProfileRecord(field);
      return bindProfileRecord({
        ...field,
        key: field.key || blueprint.key,
        repeatGroup: field.repeatGroup || blueprint.repeatGroup,
        repeatIndex: Number.isInteger(field.repeatIndex) ? field.repeatIndex : blueprint.repeatIndex,
        repeatEntryKind: field.repeatEntryKind || blueprint.repeatEntryKind,
        repeatLocalIndex: Number.isInteger(field.repeatLocalIndex)
          ? field.repeatLocalIndex
          : blueprint.repeatLocalIndex,
        repeatEntryFingerprint: field.repeatEntryFingerprint || blueprint.repeatEntryFingerprint,
        profileRepeatIndex: Number.isInteger(field.profileRepeatIndex)
          ? field.profileRepeatIndex
          : blueprint.profileRepeatIndex,
        source: field.source || blueprint.source,
        confidence: Math.max(field.confidence || 0, blueprint.confidence || 0)
      });
    };

    const verifyEntryAnchor = (field, items) => {
      const group = effectiveRepeatGroupForField(field);
      const anchorKey = repeatAnchorKeys[group];
      if (!anchorKey || field.key === anchorKey) return { ok: true };
      const bindingKey = entryBindingKey(field);
      if (!bindingKey) return { ok: true };
      const candidates = [...items, ...finalFields.map(hydrateField)];
      const anchorField = candidates.find((candidate) =>
        candidate.key === anchorKey && entryBindingKey(candidate) === bindingKey
      );
      if (!anchorField) return { ok: true };
      const expectedAnchor = valueForField(anchorField);
      if (!expectedAnchor) return { ok: true };
      const anchorElement = resolveFieldElement(anchorField);
      const actualAnchor = anchorElement ? readControlValue(anchorElement) : "";
      return controlValueMatches(actualAnchor, expectedAnchor)
        ? { ok: true }
        : {
            ok: false,
            reason: `重复经历主字段尚未确认（期望：${clean(String(expectedAnchor)).slice(0, 40)}）`
          };
    };

    const publishField = async (field, result, totalHint) => {
      processed += 1;
      resultsByField.set(fieldTrackingKey(field), result);
      sendFillProgress({
        stage: "field",
        current: processed,
        total: Math.max(initialItems.length, totalHint, processed),
        label: field.label,
        field: { id: field.id, label: field.label, key: field.key },
        result
      });
      if (delayMs > 0) await sleep(delayMs);
    };

    const isEligibleDynamicField = (field) => {
      if (!field.key) return false;
      if (fillDynamicFields) return true;
      return initialSemanticKeys.has(fieldSemanticKey(field)) ||
        blueprintsByFallback.has(fieldBlueprintFallbackKey(field)) ||
        Boolean(field.fingerprint && blueprintsByFingerprint.has(field.fingerprint));
    };

    if (options.repeatCounts && Object.values(options.repeatCounts).some((count) => Number(count) > 0)) {
      const ensured = await ensureRepeatableEntriesSerialized(options.repeatCounts, options.repeatPlan);
      finalFields = ensured.scan.fields.map(hydrateField);
    }

    sendFillProgress({ stage: "started", current: 0, total: initialItems.length });
    let roundItems = initialItems;
    let previousSignature = roundItems.map(fieldTrackingKey).join("|");

    for (let round = 0; round < maxRounds; round += 1) {
      rounds = round + 1;
      let attemptedThisRound = 0;
      let filledThisRound = 0;
      const items = roundItems.map(hydrateField).sort((left, right) => {
        const leftAnchor = repeatAnchorKeys[left.repeatGroup] === left.key ? 0 : 1;
        const rightAnchor = repeatAnchorKeys[right.repeatGroup] === right.key ? 0 : 1;
        const leftGroup = effectiveRepeatGroupForField(left);
        const rightGroup = effectiveRepeatGroupForField(right);
        const leftEntryIndex = Number.isInteger(left.profileRepeatIndex) ? left.profileRepeatIndex : left.repeatIndex;
        const rightEntryIndex = Number.isInteger(right.profileRepeatIndex) ? right.profileRepeatIndex : right.repeatIndex;
        if (leftGroup && leftGroup === rightGroup && Number.isInteger(leftEntryIndex) && Number.isInteger(rightEntryIndex)) {
          return leftEntryIndex - rightEntryIndex || leftAnchor - rightAnchor || (left.domOrder ?? 0) - (right.domOrder ?? 0);
        }
        return leftAnchor - rightAnchor || (left.domOrder ?? 0) - (right.domOrder ?? 0);
      });
      for (const field of items) {
        const trackingKey = fieldTrackingKey(field);
        const value = valueForField(field);
        const attempts = attemptsByField.get(trackingKey) || 0;
        const base = {
          id: field.id,
          fingerprint: field.fingerprint,
          label: field.label,
          key: field.key,
          expectedValue: value ? String(value) : undefined,
          attempts
        };
        if (field.identityCollision) {
          if (round === 0) {
            await publishField(field, {
              ...base,
              status: "failed",
              reason: "重复经历字段身份冲突，已停止写入以避免覆盖其他经历"
            }, items.length);
          }
          continue;
        }
        if (!field.key || !value) {
          if (round === 0) {
            await publishField(field, {
              ...base,
              status: field.key ? "missing" : "skipped",
              reason: field.key ? "个人资料未填写" : "未匹配到资料字段"
            }, items.length);
          }
          continue;
        }
        if (attempts >= 2) continue;
        const element = resolveFieldElement(field);
        if (filledFields.has(trackingKey) && element && controlValueMatchesForField(field, readControlValue(element), value)) continue;
        if (filledFields.has(trackingKey)) filledFields.delete(trackingKey);
        if (!element) {
          attemptsByField.set(trackingKey, attempts + 1);
          await publishField(field, { ...base, attempts: attempts + 1, status: "failed", reason: "页面控件已变化，等待重新识别" }, items.length);
          attemptedThisRound += 1;
          continue;
        }
        const anchorVerification = verifyEntryAnchor(field, items);
        if (!anchorVerification.ok) {
          attemptsByField.set(trackingKey, attempts + 1);
          await publishField(field, {
            ...base,
            attempts: attempts + 1,
            status: "failed",
            reason: anchorVerification.reason
          }, items.length);
          attemptedThisRound += 1;
          continue;
        }
        try {
          attemptedThisRound += 1;
          attemptsByField.set(trackingKey, attempts + 1);
          const written = await setNativeValue(element, String(value));
          const driverResult = formControlDrivers?.lastResult?.(element);
          await nextFrame();
          const shouldCommit = field.type === "custom-select" || field.type === "combobox" || field.type === "cascader" ||
            element.getAttribute?.("role") === "combobox" || Boolean(element.closest?.("[class*='picker'],[class*='cascader']"));
          let commitResult;
          if (written && shouldCommit && formRuntime?.commitOpenControl) {
            commitResult = await formRuntime.commitOpenControl(element, { click: clickControlInUserOrder, wait: controlInteractionWait });
            await nextFrame();
          }
          const liveElement = resolveFieldElement(field) || element;
          const actualValue = readControlValue(liveElement);
          const verified = written && controlValueMatchesForField(field, actualValue, value);
          if (verified) {
            filledFields.add(trackingKey);
            filledThisRound += 1;
          }
          await publishField(field, {
            ...base,
            attempts: attempts + 1,
            status: verified ? "filled" : "failed",
            actualValue,
            controlDriver: driverResult?.driver,
            commitMethod: commitResult?.method && commitResult.method !== "none"
              ? commitResult.method
              : driverResult?.commitMethod,
            reason: verified ? undefined : "写入或确认后回读值不一致"
          }, items.length);
        } catch (error) {
          await publishField(field, {
            ...base,
            attempts: attempts + 1,
            status: "failed",
            reason: error instanceof Error ? error.message : "控件不支持写入"
          }, items.length);
        }
      }

      await dismissAllAtsxSelects();
      await dismissAllAntSelects();
      if (round + 1 < maxRounds && isPupumallApplication()) {
        const committed = await commitPupumallRepeatEditors(items, valueForField);
        if (committed && options.repeatCounts) {
          const ensured = await ensureRepeatableEntriesSerialized(options.repeatCounts, options.repeatPlan);
          finalFields = ensured.scan.fields.map(hydrateField);
        }
      }
      if (round + 1 >= maxRounds) break;
      if (formRuntime?.waitForDomSettled) await formRuntime.waitForDomSettled({ quietMs: 140, maxMs: 850 });
      else await sleep(140);
      const nextScan = scanApplicationForm();
      finalFields = nextScan.fields.map(hydrateField);
      rescanned = true;
      const nextSignature = finalFields.map(fieldTrackingKey).join("|");
      roundItems = finalFields.filter((field) => {
        if (!isEligibleDynamicField(field)) return false;
        const value = valueForField(field);
        if (!value) return false;
        const trackingKey = fieldTrackingKey(field);
        if ((attemptsByField.get(trackingKey) || 0) >= 2) return false;
        const element = resolveFieldElement(field);
        if (element && controlValueMatchesForField(field, readControlValue(element), value)) {
          filledFields.add(trackingKey);
          return false;
        }
        return true;
      });
      if (!roundItems.length) break;
      if (nextSignature === previousSignature && attemptedThisRound === 0) break;
      if (nextSignature === previousSignature && filledThisRound === 0 && round > 0) break;
      previousSignature = nextSignature;
    }

    const results = Array.from(resultsByField.values());
    const filled = results.filter((result) => result.status === "filled").length;
    sendFillProgress({ stage: "done", current: processed, total: Math.max(initialItems.length, processed), filled });
    return {
      filled,
      results,
      rounds,
      rescanned,
      finalFields
    };
  };

  const prefersReducedMotion = () =>
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  const animateOverlayEntrance = (host) => {
    if (prefersReducedMotion()) return;
    host.style.opacity = "0";
    host.style.transform = "translateY(-8px) scale(0.985)";
    host.style.transformOrigin = "top right";
    host.style.transition = "none";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        host.style.transition =
          "opacity 200ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        host.style.opacity = "1";
        host.style.transform = "none";
      });
    });
  };

  const animateOverlayExit = (host) => {
    if (!host) return;
    if (host.dataset.offerflowExiting === "1" || prefersReducedMotion()) {
      host.remove();
      return;
    }
    host.dataset.offerflowExiting = "1";
    host.style.pointerEvents = "none";
    host.style.transition =
      "opacity 180ms cubic-bezier(0.4, 0, 1, 1), transform 180ms cubic-bezier(0.4, 0, 1, 1)";
    host.style.opacity = "0";
    host.style.transform = "translateY(-6px) scale(0.99)";
    const removeWhenStillExiting = () => {
      if (host.dataset.offerflowExiting === "1") host.remove();
    };
    setTimeout(removeWhenStillExiting, 240);
    host.addEventListener("transitionend", (event) => {
      if (event.target === host && event.propertyName === "opacity") removeWhenStillExiting();
    }, { once: true });
  };

  const cancelOverlayExit = (host) => {
    delete host.dataset.offerflowExiting;
    host.style.pointerEvents = "";
    host.style.transition =
      "opacity 160ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1)";
    host.style.opacity = "1";
    host.style.transform = "none";
  };

  const handleRuntimeMessage = (message, _sender, sendResponse) => {
    if (!message) return;
    if (message.type === "OFFERFLOW_TOGGLE_OVERLAY") {
      const existing = document.getElementById("offerflow-overlay-host");
      if (existing) {
        if (existing.dataset.offerflowExiting === "1") {
          cancelOverlayExit(existing);
          sendResponse({ ok: true, open: true });
          return;
        }
        animateOverlayExit(existing);
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
      frame.title = "JobKoI";
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
      animateOverlayEntrance(host);
      sendResponse({ ok: true, open: true });
      return;
    }

    if (
      message.type === "OFFERFLOW_SCAN_APPLICATION_FORM" ||
      message.type === "OFFERFLOW_SCAN_APPLICATION_FORM_V2"
    ) {
      Promise.resolve(window.OfferFlowFormAdapters?.ready)
        .then(async () => {
          try {
            await preparePupumallFormForScan();
            const initialScan = scanApplicationForm();
            // The product UI explicitly requests a read-only scan. Expansion
            // then happens exactly once at the start of the fill transaction.
            const ensured = message.expandRepeaters === true
              ? await ensureRepeatableEntriesSerialized(message.repeatCounts || {}, message.repeatPlan || {})
              : { scan: initialScan, changed: false };
            sendResponse({
              ok: true,
              ...ensured.scan,
              repeatersExpanded: ensured.changed,
              runtimeVersion: OFFERFLOW_CONTENT_RUNTIME_VERSION
            });
          } catch (error) {
            sendResponse({ ok: false, error: error instanceof Error ? error.message : "表单识别失败" });
          }
        })
        .catch((error) => {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "表单识别失败" });
        });
      return true;
    }

    if (
      message.type === "OFFERFLOW_FILL_APPLICATION_FORM" ||
      message.type === "OFFERFLOW_FILL_APPLICATION_FORM_V2"
    ) {
      fillApplicationForm(message.fields || [], message.values || {}, {
        delayMs: message.delayMs,
        fieldValues: message.fieldValues || {},
        profileSnapshots: message.profileSnapshots || [],
        repeatCounts: message.repeatCounts || {},
        repeatPlan: message.repeatPlan || {},
        maxRounds: message.maxRounds,
        fillDynamicFields: message.fillDynamicFields === true
      })
        .then((report) => sendResponse({ ok: true, ...report, runtimeVersion: OFFERFLOW_CONTENT_RUNTIME_VERSION }))
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
  };
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  const handleWindowMessage = (event) => {
    if (event.data?.type === "OFFERFLOW_CLOSE_OVERLAY") {
      animateOverlayExit(document.getElementById("offerflow-overlay-host"));
    }
  };
  window.addEventListener("message", handleWindowMessage);

  globalThis.__offerflowContentCleanup = () => {
    window.removeEventListener("message", handleWindowMessage);
    try {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
    } catch {
      // Expected when an unpacked extension was reloaded on an existing tab.
    }
    if (globalThis.__offerflowContentRuntimeSession === contentSession) {
      delete globalThis.__offerflowContentRuntimeSession;
    }
  };
})();
