(() => {
  const RUNTIME_VERSION = "2026-08-20.autofill-v6";
  const runtimeSession = `${RUNTIME_VERSION}:${globalThis.__offerflowDesiredContentSession || "manifest"}`;
  if (globalThis.__offerflowFormRuntimeVersion === runtimeSession) return;
  globalThis.__offerflowFormRuntimeVersion = runtimeSession;

  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const escapeSelector = (value) => {
    if (globalThis.CSS?.escape) return globalThis.CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  };

  const isVisible = (element) => {
    if (!(element instanceof Element) || !element.isConnected) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    if (element.getAttribute("aria-hidden") === "true" || element.hasAttribute("hidden")) return false;
    return element.getClientRects().length > 0;
  };

  const stableClassTokens = (element) => Array.from(element.classList || [])
    .filter((token) => token.length >= 2 && token.length <= 42)
    .filter((token) => !/^(active|open|focus|focused|selected|checked|disabled|error|success|hover|show|hide|visible)$/i.test(token))
    .filter((token) => !/[a-f0-9]{7,}/i.test(token))
    .filter((token) => !/\d{4,}/.test(token))
    .slice(0, 2);

  const uniqueAttributeSelector = (element) => {
    const attributes = [
      "data-cy", "data-field", "data-question", "data-testid", "name", "aria-label",
      "data-form-field-id", "data-form-field-name"
    ];
    for (const attribute of attributes) {
      const value = clean(element.getAttribute(attribute));
      if (!value || value.length > 100) continue;
      const selector = `${element.tagName.toLowerCase()}[${attribute}="${escapeSelector(value)}"]`;
      try {
        if (document.querySelectorAll(selector).length === 1) return selector;
      } catch {
        // Ignore malformed third-party attribute values and keep building a path.
      }
    }
    const id = clean(element.id);
    if (id && id.length <= 80 && !/\d{6,}/.test(id)) {
      const selector = `#${escapeSelector(id)}`;
      try {
        if (document.querySelectorAll(selector).length === 1) return selector;
      } catch {
        // Continue with a structural path.
      }
    }
    return "";
  };

  const pathSegment = (element) => {
    const tag = element.tagName.toLowerCase();
    const stableAttribute = ["data-cy", "data-field", "data-question", "name", "data-form-field-id", "data-form-field-name"]
      .map((attribute) => [attribute, clean(element.getAttribute(attribute))])
      .find(([, value]) => value && value.length <= 100);
    if (stableAttribute) {
      return `${tag}[${stableAttribute[0]}="${escapeSelector(stableAttribute[1])}"]`;
    }
    const classes = stableClassTokens(element);
    let segment = `${tag}${classes.map((token) => `.${escapeSelector(token)}`).join("")}`;
    const parent = element.parentElement;
    if (!parent) return segment;
    const siblings = Array.from(parent.children).filter((candidate) => candidate.tagName === element.tagName);
    if (siblings.length > 1) segment += `:nth-of-type(${siblings.indexOf(element) + 1})`;
    return segment;
  };

  const buildDomPath = (element, boundary) => {
    if (!(element instanceof Element)) return "";
    const unique = uniqueAttributeSelector(element);
    if (unique) return unique;
    const segments = [];
    let current = element;
    for (let depth = 0; current && current !== boundary && current !== document.body && depth < 10; depth += 1) {
      const currentUnique = uniqueAttributeSelector(current);
      if (currentUnique) {
        segments.unshift(currentUnique);
        break;
      }
      segments.unshift(pathSegment(current));
      current = current.parentElement;
    }
    return segments.join(" > ");
  };

  const deterministicHash = (value) => {
    let hash = 0x811c9dc5;
    const input = String(value || "");
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  };

  const visibleEntryHosts = (container, selector) => Array.from(container.children)
    .filter((candidate) => candidate.matches?.(selector) || candidate.querySelector?.(selector))
    .filter((candidate) => isVisible(candidate))
    .filter((candidate) => !candidate.matches?.("template,[data-template],[data-prototype]") && !candidate.closest?.("template"));

  const repeatEntryContext = (element, group, selector) => {
    if (!group || !selector || !(element instanceof Element)) return undefined;
    const entry = element.closest(selector);
    if (!entry) return undefined;
    let container = entry.parentElement;
    let hosts = [];
    let host;
    for (let depth = 0; container && depth < 8; depth += 1, container = container.parentElement) {
      hosts = visibleEntryHosts(container, selector);
      host = hosts.find((candidate) => candidate === entry || candidate.contains(entry));
      if (host && hosts.length >= 2) break;
      if (container.matches?.("form,body")) break;
    }
    if (!container || !host) return undefined;
    const index = hosts.indexOf(host);
    if (index < 0) return undefined;
    const containerPath = buildDomPath(container);
    return {
      index,
      source: "structural",
      entry,
      host,
      container,
      fingerprint: `${group}:${deterministicHash(`${containerPath}|${index}`)}`
    };
  };

  const describeField = ({
    element,
    label,
    section,
    type,
    repeatGroup,
    repeatIndex,
    repeatEntryFingerprint
  }) => {
    const domPath = buildDomPath(element);
    const identity = [
      location.hostname,
      location.pathname,
      clean(section).toLowerCase(),
      clean(label).toLowerCase(),
      clean(type).toLowerCase(),
      repeatGroup || "single",
      Number.isInteger(repeatIndex) ? repeatIndex : "none",
      repeatEntryFingerprint || "",
      domPath
    ].join("|");
    const fingerprint = `field-${deterministicHash(identity)}`;
    return {
      id: `offerflow-${fingerprint}`,
      fingerprint,
      domPath
    };
  };

  const resolveElement = (field) => {
    if (!field) return undefined;
    const byId = field.id
      ? document.querySelector(`[data-offerflow-field-id="${escapeSelector(field.id)}"]`)
      : undefined;
    if (byId) return byId;
    const byFingerprint = field.fingerprint
      ? document.querySelector(`[data-offerflow-fingerprint="${escapeSelector(field.fingerprint)}"]`)
      : undefined;
    if (byFingerprint) return byFingerprint;
    if (field.domPath) {
      try {
        return document.querySelector(field.domPath) || undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  };

  const waitForDomSettled = ({ quietMs = 120, maxMs = 900 } = {}) => new Promise((resolve) => {
    let quietTimer;
    let maxTimer;
    let settled = false;
    const finish = (mutated) => {
      if (settled) return;
      settled = true;
      clearTimeout(quietTimer);
      clearTimeout(maxTimer);
      observer.disconnect();
      resolve(mutated);
    };
    let didMutate = false;
    const schedule = () => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => finish(didMutate), quietMs);
    };
    const observer = new MutationObserver(() => {
      didMutate = true;
      schedule();
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-expanded", "aria-hidden", "aria-selected"]
    });
    schedule();
    maxTimer = setTimeout(() => finish(didMutate), maxMs);
  });

  const popupSelector = [
    "[role='dialog']",
    "[role='listbox']",
    "[role='menu']",
    ".ant-select-dropdown",
    ".ant-picker-dropdown",
    ".ant-cascader-dropdown",
    ".el-select-dropdown",
    ".el-picker-panel",
    ".el-cascader__dropdown",
    ".atsx-select-dropdown",
    ".atsx-date-picker-dropdown",
    ".phoenix-selectList__list",
    ".area-selector-container",
    ".ivu-select-dropdown",
    ".next-menu-popup",
    ".next-overlay-wrapper",
    ".next-cascader-menu-wrapper",
    ".semi-portal",
    ".semi-select-option-list",
    ".semi-cascader",
    ".arco-select-popup",
    ".arco-cascader-popup",
    ".t-popup",
    ".t-select__dropdown",
    ".t-cascader__panel",
    "[class*='sd-Dropdown-dropdown-']",
    "[class*='dropdown']",
    "[class*='Dropdown']",
    "[class*='popover']",
    "[class*='Popper']",
    "[class*='picker-panel']",
    "[class*='cascader-menu']"
  ].join(",");

  const popupElements = (selectors = popupSelector) => {
    try {
      return Array.from(document.querySelectorAll(selectors));
    } catch {
      return [];
    }
  };

  const popupAncestor = (element) => {
    if (!(element instanceof Element)) return undefined;
    if (element.matches?.(popupSelector)) return element;
    return element.closest?.(popupSelector) || undefined;
  };

  // Start this immediately before opening a custom control. Many Vue/React
  // libraries portal their popup to <body>, reuse an existing hidden panel,
  // or only toggle class/style. Tracking both child and attribute mutations
  // lets us associate the field with the panel that actually changed.
  const beginPopupTracking = () => {
    const before = new Set(popupElements().filter(isVisible));
    const changed = new Set();
    let stopped = false;
    const remember = (node) => {
      if (!(node instanceof Element)) return;
      const ownPopup = popupAncestor(node);
      if (ownPopup) changed.add(ownPopup);
      for (const popup of Array.from(node.querySelectorAll?.(popupSelector) || [])) changed.add(popup);
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        remember(record.target);
        for (const node of record.addedNodes || []) remember(node);
      }
    });
    observer.observe(document.body || document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden", "aria-expanded"]
    });
    const collect = () => {
      if (!stopped) {
        for (const record of observer.takeRecords()) {
          remember(record.target);
          for (const node of record.addedNodes || []) remember(node);
        }
        observer.disconnect();
        stopped = true;
      }
      return { before, changed: new Set(Array.from(changed).filter(isVisible)) };
    };
    return { before, changed, collect, stop: collect };
  };

  const rectDistance = (element, popup) => {
    const source = element.getBoundingClientRect();
    const target = popup.getBoundingClientRect();
    const horizontal = Math.max(0, source.left - target.right, target.left - source.right);
    const vertical = Math.max(0, source.top - target.bottom, target.top - source.bottom);
    return Math.hypot(horizontal, vertical);
  };

  const controlIds = (element) => {
    const ids = new Set();
    const candidates = [
      element,
      element?.closest?.("[aria-controls],[aria-owns]"),
      element?.querySelector?.("[aria-controls],[aria-owns]")
    ].filter(Boolean);
    for (const candidate of candidates) {
      for (const attribute of ["aria-controls", "aria-owns"]) {
        for (const id of clean(candidate.getAttribute?.(attribute)).split(/\s+/).filter(Boolean)) ids.add(id);
      }
    }
    return ids;
  };

  const resolvePopup = (element, {
    selectors = [],
    optionSelectors = [],
    tracker,
    includeGeneric = true
  } = {}) => {
    if (!(element instanceof Element)) return undefined;
    const tracked = tracker?.collect?.() || { before: new Set(), changed: new Set() };
    const controlledIds = controlIds(element);
    const candidates = new Set();
    for (const id of controlledIds) {
      const controlled = document.getElementById(id);
      if (controlled) candidates.add(controlled);
    }
    const selectorList = Array.isArray(selectors) ? selectors.filter(Boolean) : [selectors].filter(Boolean);
    for (const selector of selectorList) {
      for (const popup of popupElements(selector)) candidates.add(popup);
    }
    if (includeGeneric) for (const popup of popupElements()) candidates.add(popup);
    for (const popup of tracked.changed || []) candidates.add(popup);

    const optionSelector = (Array.isArray(optionSelectors) ? optionSelectors : [optionSelectors])
      .filter(Boolean)
      .join(",");
    return Array.from(candidates)
      .filter((popup) => popup instanceof Element && popup !== element && isVisible(popup))
      .map((popup) => {
        const rect = popup.getBoundingClientRect();
        let score = 0;
        if (controlledIds.has(popup.id)) score += 1200;
        if (tracked.changed?.has(popup)) score += 520;
        if (!tracked.before?.has(popup)) score += 160;
        if (selectorList.some((selector) => {
          try { return popup.matches(selector); } catch { return false; }
        })) score += 120;
        const optionCount = optionSelector ? popup.querySelectorAll(optionSelector).length : 0;
        score += Math.min(140, optionCount * 14);
        const zIndex = Number.parseInt(window.getComputedStyle(popup).zIndex || "0", 10) || 0;
        score += Math.min(90, Math.max(0, zIndex / 100));
        score -= Math.min(300, rectDistance(element, popup) / 4);
        if (rect.width > window.innerWidth * 0.96 && rect.height > window.innerHeight * 0.96) score -= 500;
        if (/tooltip|toast|notification|message|loading|spinner/i.test(`${popup.id} ${popup.className}`)) score -= 800;
        return { popup, score };
      })
      .sort((left, right) => right.score - left.score)[0]?.popup;
  };

  const popupScopes = (element, preferredPopup) => {
    const scopes = [];
    const seen = new Set();
    const candidates = preferredPopup ? [preferredPopup] : document.querySelectorAll(popupSelector);
    for (const popup of candidates) {
      if (!isVisible(popup) || popup === element || popup.contains(element)) continue;
      const ownedScopes = [popup];
      let scope = popup;
      for (let depth = 0; depth < 2 && scope.parentElement; depth += 1) {
        const parent = scope.parentElement;
        if (parent.matches("html,body,form,main")) break;
        const isOverlayBoundary = parent.matches(
          "[role='dialog'],[role='listbox'],[class*='overlay'],[class*='popup'],[class*='dropdown'],[class*='portal'],[class*='panel'],[class*='modal']"
        );
        if (!isOverlayBoundary || !isVisible(parent)) break;
        const rect = parent.getBoundingClientRect();
        if (rect.width > window.innerWidth * 0.92 && rect.height > window.innerHeight * 0.92) break;
        const siblingPopups = Array.from(parent.querySelectorAll(popupSelector))
          .filter(isVisible)
          .filter((candidate) => candidate !== scope && !candidate.contains(scope) && !scope.contains(candidate));
        // A shared portal root can host several unrelated components. Crossing
        // that boundary would make a field eligible to confirm its neighbour.
        if (siblingPopups.length > 0) break;
        ownedScopes.push(parent);
        scope = parent;
      }
      for (const ownedScope of ownedScopes) {
        if (seen.has(ownedScope)) continue;
        seen.add(ownedScope);
        scopes.push(ownedScope);
      }
    }
    return scopes.sort((left, right) => {
      const leftZ = Number.parseInt(window.getComputedStyle(left).zIndex || "0", 10) || 0;
      const rightZ = Number.parseInt(window.getComputedStyle(right).zIndex || "0", 10) || 0;
      return rightZ - leftZ;
    });
  };

  const findCommitButton = (element, preferredPopup) => {
    const commitText = /^(?:\u786e\u5b9a|\u786e\u8ba4|\u5b8c\u6210|\u5e94\u7528|\u4fdd\u5b58\u9009\u62e9|\u9009\u62e9)$/;
    for (const scope of popupScopes(element, preferredPopup)) {
      const button = Array.from(scope.querySelectorAll("button,[role='button'],a"))
        .filter(isVisible)
        .filter((candidate) => !candidate.disabled && candidate.getAttribute("aria-disabled") !== "true")
        // A component confirmation is not permission to submit the whole
        // application. Exclude explicit and implicit submit controls even
        // when their label happens to be "确认".
        .filter((candidate) => !(candidate instanceof HTMLButtonElement && candidate.type === "submit"))
        .filter((candidate) => candidate.getAttribute("type")?.toLowerCase() !== "submit")
        .find((candidate) => commitText.test(clean(candidate.innerText || candidate.textContent || "").replace(/\s+/g, "")));
      if (button) return button;
    }
    return undefined;
  };

  const commitOpenControl = async (element, { click, wait, popup } = {}) => {
    const clickElement = typeof click === "function" ? click : (target) => target.click?.();
    const pause = typeof wait === "function" ? wait : () => Promise.resolve();
    const expanded = element?.getAttribute?.("aria-expanded") === "true" ||
      Boolean(element?.closest?.("[aria-expanded='true']"));
    // Never perform an unowned global confirmation sweep. If the component
    // has already closed and its driver did not pass the popup it owns, there
    // is no safe confirmation action left to take.
    if (!popup && !expanded) {
      return { committed: false, method: "none", popupClosed: true };
    }
    const ownedPopup = popup || resolvePopup(element);
    const button = findCommitButton(element, ownedPopup);
    if (button) {
      clickElement(button);
      await pause(45);
      return { committed: true, method: "button", popupClosed: !isVisible(ownedPopup || button) };
    }
    if (expanded && popupScopes(element, ownedPopup).length > 0) {
      const keyboardTarget = element.matches?.("input,[role='combobox']")
        ? element
        : element.querySelector?.("input,[role='combobox']") || element;
      keyboardTarget.focus?.({ preventScroll: true });
      const enterInit = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
      keyboardTarget.dispatchEvent(new KeyboardEvent("keydown", enterInit));
      keyboardTarget.dispatchEvent(new KeyboardEvent("keypress", enterInit));
      keyboardTarget.dispatchEvent(new KeyboardEvent("keyup", enterInit));
      await pause(35);
      return { committed: true, method: "enter", popupClosed: !isVisible(ownedPopup) };
    }
    return { committed: false, method: "none", popupClosed: !isVisible(ownedPopup) };
  };

  globalThis.OfferFlowFormRuntime = {
    version: RUNTIME_VERSION,
    buildDomPath,
    clean,
    beginPopupTracking,
    describeField,
    deterministicHash,
    findCommitButton,
    isVisible,
    popupSelector,
    repeatEntryContext,
    resolvePopup,
    resolveElement,
    waitForDomSettled,
    commitOpenControl
  };
})();
