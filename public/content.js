(() => {
  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();

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

  const stageLabelPattern = /^(?:(?:投递简历|提交简历|已投递|简历初筛|简历筛选|简历复筛|初筛|筛选|笔试|在线测评|测评|面试|一面|二面|三面|HR面|Offer|OFFER评估|录用|待入职|入职)(?:中)?|未通过|不合适|淘汰|流程终止|已结束|拒绝|未录用|已撤回)$/i;
  const terminalPattern = /不通过|未通过|不合适|淘汰|流程终止|流程结束|已结束|拒绝|未录用|已撤回/i;
  const statusPrefixPattern = /^(?:(?:应聘|申请|投递|招聘|流程|当前)状态)\s*[：:]?\s*/i;
  const semanticStagePattern = /^(?:(?:等待|待).{0,10}(?:筛选|评估|审核|面试|笔试|测评|结果)|(?:简历|资格)?(?:筛选|评估|审核)(?:中|通过|不通过|结果)?|(?:笔试|测评|面试|一面|二面|三面|HR面|Offer|录用|入职)(?:中|通过|不通过|结果)?)$/i;

  const stageTextValue = (value) => clean(value).replace(statusPrefixPattern, "");
  const isStageText = (value) => {
    const original = clean(value);
    const stage = stageTextValue(original);
    if (!stage || stage.length > 40) return false;
    return statusPrefixPattern.test(original) || stageLabelPattern.test(stage) || semanticStagePattern.test(stage);
  };

  const ownText = (element) =>
    clean(
      Array.from(element.childNodes || [])
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

  const progressCardPosition = (card, jobId) => {
    const rejectPattern = /^(?:实习|校招|社招|工作地点|投递方式|投递时间|简历|状态|详情)$/i;
    const rolePattern = /产品|运营|经理|工程|开发|设计|算法|数据|市场|销售|职能|实习|管培|顾问|研究|测试/i;
    const progressWordPattern = /等待筛选|筛选通过|简历评估|简历审核|资格审核|笔试|测评|面试|Offer|录用|入职/gi;
    const structuredCandidates = Array.from(
      card.querySelectorAll('h1,h2,h3,h4,h5,h6,[class*="title"],[class*="name"],[class*="position"],[class*="job"]')
    )
      .map((element) => {
        const className = String(element.className || "");
        const structuralScore = /^H[1-6]$/.test(element.tagName)
          ? 30
          : /title|position|name/i.test(className)
            ? 20
            : 8;
        return { value: clean(element.innerText || ownText(element)), structuralScore };
      });
    const candidates = structuredCandidates
      .concat(
        (card.innerText || "")
          .split(/\n+/)
          .map(clean)
          .map((value) => ({ value, structuralScore: 0 }))
      )
      .map(({ value, structuralScore }) => ({
        value: clean(
          value
            .replace(terminalPattern, "")
            .replace(jobId ? new RegExp(`[（(]?${jobId}[）)]?`, "i") : /$^/, "")
        ),
        structuralScore
      }))
      .filter(
        ({ value }) =>
          value.length >= 3 &&
          value.length <= 60 &&
          !isStageText(value) &&
          !rejectPattern.test(value) &&
          (value.match(progressWordPattern) || []).length < 2 &&
          !/工作地|投递方式|投递时间|申请时间|\d{4}[./-]\d{1,2}/.test(value)
      );
    return candidates
      .map(({ value, structuralScore }, index) => ({
        value,
        score:
          structuralScore +
          (rolePattern.test(value) ? 10 : 0) -
          value.length * 0.02 -
          index * 0.0001
      }))
      .sort((left, right) => right.score - left.score)[0]?.value;
  };

  const normalizeProgressPosition = (value) =>
    clean(value)
      .replace(/\s+(?:实习|全职|兼职|校招|社招|应届)$/i, "")
      .replace(/(实习生)实习$/i, "$1")
      .replace(/[\s\-—_｜|（）()【】\[\]]/g, "")
      .toLowerCase();

  const evidenceFromCard = (card, jobId, explicitStage) => {
    const cardText = clean(card.innerText || "");
    const terminalStatus = cardText.match(terminalPattern)?.[0];
    const stepElements = Array.from(card.querySelectorAll("*")).filter((element) =>
      isStageText(ownText(element))
    );
    const uniqueSteps = [];
    const seenLabels = new Set();
    for (const element of stepElements) {
      const label = stageTextValue(ownText(element));
      if (terminalPattern.test(label)) continue;
      const key = label.toLowerCase();
      if (seenLabels.has(key)) continue;
      seenLabels.add(key);
      uniqueSteps.push({
        label,
        state: explicitStage === label ? "current" : stageVisualState(element, card)
      });
    }
    if (explicitStage && !uniqueSteps.some((step) => step.label === explicitStage)) {
      uniqueSteps.push({ label: explicitStage, state: "current" });
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
    const currentStage = explicitStage || (currentIndex >= 0 ? uniqueSteps[currentIndex].label : undefined);
    const explicitCurrent = Boolean(explicitStage) || uniqueSteps.some((step) => step.state === "current");

    return {
      jobId,
      position: progressCardPosition(card, jobId),
      currentStage,
      terminalStatus,
      context: cardText.slice(0, 900),
      steps: uniqueSteps.map((step, index) => ({
        ...step,
        state: terminalStatus && index === currentIndex ? "failed" : step.state
      })),
      confidence: terminalStatus ? 0.99 : explicitCurrent ? 0.97 : currentStage ? 0.82 : 0.35
    };
  };

  const extractProgressEvidence = () => {
    const bodyText = document.body.innerText || "";
    const jobIds = Array.from(new Set(bodyText.match(/\b[A-Z]\d{5,}\b/gi) || []));
    const allElements = Array.from(document.body.querySelectorAll("*")).slice(0, 12000);
    const evidence = jobIds.flatMap((jobId) => {
      const idPattern = new RegExp(`\\b${jobId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      const card = allElements
        .filter((element) => {
          const value = clean(element.innerText || "");
          if (!value || value.length > 2400 || !idPattern.test(value)) return false;
          const ids = value.match(/\b[A-Z]\d{5,}\b/gi) || [];
          if (new Set(ids.map((id) => id.toLowerCase())).size !== 1) return false;
          return Array.from(element.querySelectorAll("*")).some((child) =>
            isStageText(ownText(child)) && !terminalPattern.test(ownText(child))
          );
        })
        .sort((left, right) => clean(left.innerText).length - clean(right.innerText).length)[0];
      if (!card) return [];
      const item = evidenceFromCard(card, jobId);
      return item ? [item] : [];
    });

    const explicitStatuses = allElements.filter((element) => {
      const value = ownText(element);
      const stage = stageTextValue(value);
      return (
        isStageText(value) &&
        (statusPrefixPattern.test(value) || terminalPattern.test(stage) || /中$|^等待|^待/i.test(stage))
      );
    });
    for (const statusElement of explicitStatuses) {
      const explicitStage = stageTextValue(ownText(statusElement));
      let card = statusElement.parentElement;
      while (card && card !== document.body) {
        const value = clean(card.innerText || "");
        if (value.length > 2400) break;
        if (value.length >= 12 && progressCardPosition(card)) break;
        card = card.parentElement;
      }
      if (!card || card === document.body) continue;
      const cardJobId = clean(card.innerText || "").match(/\b[A-Z]\d{5,}\b/i)?.[0];
      const item = evidenceFromCard(
        card,
        cardJobId,
        terminalPattern.test(explicitStage) ? undefined : explicitStage
      );
      if (!item?.position) continue;
      if (terminalPattern.test(explicitStage)) item.terminalStatus = explicitStage;
      const duplicate = evidence.some(
        (entry) =>
          Boolean(
            entry.jobId &&
            item.jobId &&
            entry.jobId.toLowerCase() === item.jobId.toLowerCase()
          ) ||
          normalizeProgressPosition(entry.position) === normalizeProgressPosition(item.position)
      );
      if (!duplicate) evidence.push(item);
    }

    return evidence
      .sort((left, right) => Number(Boolean(right.jobId)) - Number(Boolean(left.jobId)))
      .filter((item, index, items) => {
        return items.findIndex((candidate) => {
          const sameJobId = Boolean(
            item.jobId &&
            candidate.jobId &&
            item.jobId.toLowerCase() === candidate.jobId.toLowerCase()
          );
          return (
            sameJobId ||
            normalizeProgressPosition(candidate.position) ===
              normalizeProgressPosition(item.position)
          );
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
    ["phone", /手机|联系电话|电话号码|手机号|mobile|phone/i],
    ["email", /邮箱|电子邮件|e-?mail/i],
    ["gender", /性别|gender|sex/i],
    ["birthDate", /出生日期|出生年月|生日|birth/i],
    ["currentCity", /现居|当前城市|所在城市|居住地|current\s*(city|location)/i],
    ["address", /详细地址|联系地址|通讯地址|address/i],
    ["targetRole", /意向岗位|期望职位|目标岗位|应聘职位|target\s*(role|position)/i],
    ["targetCities", /意向城市|期望城市|工作地点偏好|preferred\s*(city|location)/i],
    ["earliestStartDate", /到岗时间|可入职时间|最早到岗|start\s*date|available\s*date/i],
    ["portfolioUrl", /作品集|个人作品|portfolio/i],
    ["githubUrl", /github|代码仓库/i],
    ["school", /毕业院校|学校名称|就读学校|院校|university|school/i],
    ["major", /专业名称|所学专业|专业|major/i],
    ["degree", /学历|学位|degree|education\s*level/i],
    ["gpa", /绩点|gpa|平均成绩/i],
    ["selfIntroduction", /自我介绍|个人简介|个人总结|self.?intro|about\s*you/i],
    ["strengths", /个人优势|优势与不足|核心优势|strength/i],
    ["careerPlan", /职业规划|未来规划|career\s*plan/i]
  ];

  const labelText = (label) => {
    if (!label) return "";
    const clone = label.cloneNode(true);
    clone.querySelectorAll("input,select,textarea,button").forEach((control) => control.remove());
    return clean(clone.innerText || clone.textContent || "");
  };

  const fieldLabel = (element) => {
    const labels = element.labels ? Array.from(element.labels) : [];
    const explicit = labels.map(labelText).join(" ");
    const wrapping = element.closest("label");
    const fieldContainer = element.closest(
      '[class*="form-item"],[class*="formItem"],[class*="field"],[class*="control"],[class*="question"]'
    );
    const nearbyText = clean(
      (fieldContainer || element.parentElement)?.innerText || ""
    );
    const nearby = nearbyText.length <= 120 ? nearbyText : "";
    return clean([
      explicit,
      wrapping && wrapping.innerText,
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder"),
      element.getAttribute("name"),
      element.id,
      nearby
    ].filter(Boolean).join(" ")).slice(0, 160);
  };

  const displayFieldLabel = (element) => {
    const explicit = element.labels
      ? Array.from(element.labels).map(labelText).find(Boolean)
      : "";
    return clean(
      explicit ||
        element.getAttribute("aria-label") ||
        element.getAttribute("placeholder") ||
        element.getAttribute("name") ||
        element.id ||
        "未命名字段"
    ).slice(0, 60);
  };

  const matchedProfileKey = (label) => {
    for (const [key, pattern] of formFieldPatterns) {
      if (pattern.test(label)) return key;
    }
    return undefined;
  };

  const scanApplicationForm = () => {
    const allowedInputTypes = new Set([
      "text", "tel", "email", "date", "month", "url", "number", "radio"
    ]);
    const elements = Array.from(document.querySelectorAll("input, textarea, select"))
      .filter((element) => {
        if (element.disabled || element.readOnly) return false;
        if (element instanceof HTMLInputElement && !allowedInputTypes.has(element.type || "text")) return false;
        return element.getClientRects().length > 0;
      });
    const seenRadioGroups = new Set();
    const matches = [];

    elements.forEach((element, index) => {
      const label = fieldLabel(element);
      const key = matchedProfileKey(label);
      if (!key) return;
      if (element instanceof HTMLInputElement && element.type === "radio") {
        const group = `${element.name}-${key}`;
        if (seenRadioGroups.has(group)) return;
        seenRadioGroups.add(group);
      }
      const id = `offerflow-field-${Date.now().toString(36)}-${index}`;
      element.dataset.offerflowFieldId = id;
      matches.push({
        id,
        label: displayFieldLabel(element),
        key,
        type: element instanceof HTMLInputElement ? element.type : element.tagName.toLowerCase()
      });
    });
    return matches;
  };

  const setNativeValue = (element, value) => {
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
    } else {
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(element, value);
      else element.value = value;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const fillApplicationForm = (fields, values) => {
    let filled = 0;
    fields.forEach((field) => {
      const value = values[field.key];
      if (!value) return;
      const element = document.querySelector(`[data-offerflow-field-id="${CSS.escape(field.id)}"]`);
      if (element && setNativeValue(element, String(value))) filled += 1;
    });
    return filled;
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
      try {
        sendResponse({ ok: true, fields: scanApplicationForm() });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "表单识别失败" });
      }
      return;
    }

    if (message.type === "OFFERFLOW_FILL_APPLICATION_FORM") {
      try {
        const filled = fillApplicationForm(message.fields || [], message.values || {});
        sendResponse({ ok: true, filled });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "表单填写失败" });
      }
      return;
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
        position: normalizeProgressPosition(item.position),
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

