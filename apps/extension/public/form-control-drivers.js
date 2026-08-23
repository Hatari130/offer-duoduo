(() => {
  const DRIVER_VERSION = "2026-08-21.autofill-v8";
  const driverSession = `${DRIVER_VERSION}:${globalThis.__offerflowDesiredContentSession || "manifest"}`;
  if (globalThis.__offerflowControlDriverVersion === driverSession) return;
  globalThis.__offerflowControlDriverVersion = driverSession;

  const runtime = globalThis.OfferFlowFormRuntime;
  if (!runtime) return;
  const clean = runtime.clean;
  const isVisible = runtime.isVisible;
  const interactionResults = new WeakMap();

  // These are behavior descriptions, not site-specific field mappings. A
  // field is still matched by OfferFlow; a driver only knows how a component
  // family opens, renders options, searches, cascades and confirms.
  const drivers = [
    {
      id: "moka",
      roots: "label[class*='sd-Select-container-']",
      opener: "input[class*='sd-Input-input-'],[class*='sd-Select-addon-']",
      popups: ["[class*='sd-Dropdown-dropdown-']"],
      options: ["[class*='sd-Menu-container-']"],
      selected: ["[class*='sd-Input-display-value-']"],
      search: ["input[class*='sd-Input-input-']"]
    },
    {
      id: "atsx",
      roots: ".atsx-select,.atsx-cascader",
      opener: ".atsx-select-selection,[role='combobox']",
      popups: [".atsx-select-dropdown:not(.atsx-select-dropdown-hidden)", ".atsx-cascader-dropdown"],
      options: ["[role='option']", ".atsx-cascader-menu-item"],
      selected: ["[data-cy='selectedValue']", ".atsx-select-selection-selected-value"],
      search: [".atsx-select-search__field", "input[role='combobox']"]
    },
    {
      id: "ant",
      roots: ".ant-select,.ant-cascader,.ant-auto-complete",
      opener: ".ant-select-selector,input[role='combobox']",
      popups: [".ant-select-dropdown:not(.ant-select-dropdown-hidden)", ".ant-cascader-dropdown"],
      options: [".ant-select-item-option:not(.ant-select-item-option-disabled)", ".ant-cascader-menu-item:not(.ant-cascader-menu-item-disabled)", "[role='option']"],
      selected: [".ant-select-selection-item", ".ant-cascader-picker-label"],
      search: ["input[role='combobox']", ".ant-select-selection-search-input"]
    },
    {
      id: "element",
      roots: ".el-select,.el-cascader",
      opener: ".el-input__inner,.el-select__input,.el-cascader__search-input",
      popups: [".el-select-dropdown", ".el-cascader__dropdown", ".el-cascader-menus"],
      options: [".el-select-dropdown__item:not(.is-disabled)", ".el-cascader-node:not(.is-disabled)", ".el-cascader__suggestion-item", "[role='option']"],
      selected: [".el-input__inner", ".el-tag", ".el-cascader__tags-text"],
      search: [".el-select__input", ".el-cascader__search-input", ".el-input__inner:not([readonly])"]
    },
    {
      id: "feishu",
      roots: ".ud__select,.ud__cascader",
      opener: ".ud__select__selector,[role='combobox']",
      popups: [".ud__select__dropdown:not(.ud__select__dropdown-hidden)", ".ud__cascader__dropdown"],
      options: [".ud__select__list__item", ".ud__select__option", ".ud__tree__node", "[role='option']"],
      selected: [
        ".ud__select__selector__selectItem", ".ud__select__selector__selected-item",
        ".ud__select__selected", ".ud__select__value", ".ud__tag"
      ],
      search: ["input[role='combobox']", ".ud__select__input"]
    },
    {
      id: "phoenix",
      roots: ".phoenix-select",
      opener: ".phoenix-select__input,[role='combobox']",
      popups: [".common-unmodeled-layer:not(.common-unmodeled-layer-hidden)", ".phoenix-selectList", ".area-selector-container"],
      options: [".phoenix-selectList__listItem", ".list-item-container", ".area-text-label", "[role='option']"],
      selected: ["[class*='selected']", "[class*='value']", "[class*='choice']"],
      search: [".area-search-input input", ".phoenix-select__input"]
    },
    {
      id: "iview",
      roots: ".ivu-select,.ivu-cascader",
      opener: ".ivu-select-selection,.ivu-select-input,[role='combobox']",
      popups: [".ivu-select-dropdown:not([style*='display: none'])"],
      options: [".ivu-select-item:not(.ivu-select-item-disabled)", ".ivu-cascader-menu-item:not(.ivu-cascader-menu-item-disabled)", "[role='option']"],
      selected: [".ivu-select-selected-value", ".ivu-cascader-rel input"],
      search: [".ivu-select-input", "input[role='combobox']"]
    },
    {
      id: "fusion",
      roots: ".next-select,.next-cascader",
      opener: ".next-select-inner,.next-input,[role='combobox']",
      popups: [".next-menu-popup", ".next-overlay-wrapper", ".next-cascader-menu-wrapper"],
      options: [".next-menu-item:not(.disabled)", ".next-cascader-menu-item:not(.disabled)", "[role='option']"],
      selected: [".next-select-values", ".next-select-tag", ".next-cascader-value"],
      search: ["input[role='combobox']", ".next-select-search input"]
    },
    {
      id: "semi",
      roots: ".semi-select,.semi-cascader",
      opener: ".semi-select-selection,.semi-cascader-selection,[role='combobox']",
      popups: [".semi-portal", ".semi-select-option-list", ".semi-cascader"],
      options: [".semi-select-option:not(.semi-select-option-disabled)", ".semi-cascader-option:not(.semi-cascader-option-disabled)", "[role='option']"],
      selected: [".semi-select-selection-text", ".semi-tag-content", ".semi-cascader-selection-text"],
      search: ["input[role='combobox']", ".semi-select-search input"]
    },
    {
      id: "arco",
      roots: ".arco-select,.arco-cascader",
      opener: ".arco-select-view,.arco-cascader-view,[role='combobox']",
      popups: [".arco-select-popup", ".arco-cascader-popup"],
      options: [".arco-select-option:not(.arco-select-option-disabled)", ".arco-cascader-option:not(.arco-cascader-option-disabled)", "[role='option']"],
      selected: [".arco-select-view-value", ".arco-tag-content", ".arco-cascader-view-value"],
      search: ["input[role='combobox']", ".arco-select-view-input"]
    },
    {
      id: "tdesign",
      roots: ".t-select,.t-cascader",
      opener: ".t-input,.t-fake-arrow,[role='combobox']",
      popups: [".t-select__dropdown", ".t-cascader__panel", ".t-popup"],
      options: [".t-select-option:not(.t-is-disabled)", ".t-cascader__item:not(.t-is-disabled)", "[role='option']"],
      selected: [".t-input__inner", ".t-tag", ".t-cascader__value"],
      search: ["input[role='combobox']", ".t-select-input"]
    }
  ];

  const genericDriver = {
    id: "generic",
    roots: "[role='combobox'],[aria-haspopup='listbox'],[class*='cascader']",
    opener: "[role='combobox'],[aria-haspopup='listbox']",
    popups: ["[role='listbox']", "[role='dialog']", "[role='menu']"],
    options: ["[role='option']", "[role='menuitem']", "li[class*='option']", "div[class*='option']"],
    selected: ["[aria-valuetext]", "[class*='selected']", "[class*='value']"],
    search: ["input[role='combobox']", "input[aria-autocomplete]"]
  };

  const identify = (element) => {
    if (!(element instanceof Element) || element instanceof HTMLSelectElement) return undefined;
    for (const driver of drivers) {
      const root = element.matches?.(driver.roots) ? element : element.closest?.(driver.roots);
      if (root) return { id: driver.id, driver, root, type: /cascader/i.test(root.className) ? "cascader" : "custom-select" };
    }
    const genericRoot = element.matches?.(genericDriver.roots)
      ? element
      : element.closest?.(genericDriver.roots);
    if (!genericRoot) return undefined;
    return {
      id: genericDriver.id,
      driver: genericDriver,
      root: genericRoot,
      type: /cascader/i.test(genericRoot.className) ? "cascader" : "combobox"
    };
  };

  const supports = (element) => Boolean(identify(element));
  const normalize = (value) => clean(value)
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, "")
    .replace(/[：:，,、;；|]/g, "");

  const sameNormalizedValue = (left, right) => {
    const normalizedLeft = normalize(left);
    const normalizedRight = normalize(right);
    return normalizedLeft === normalizedRight || (
      /^\d+$/.test(normalizedLeft) && /^\d+$/.test(normalizedRight) &&
      Number(normalizedLeft) === Number(normalizedRight)
    );
  };

  const optionText = (option) => clean(
    option.innerText || option.textContent ||
    option.getAttribute("aria-label") ||
    option.getAttribute("title") ||
    option.getAttribute("data-cy-value") ||
    option.getAttribute("data-value") || ""
  );

  const optionCandidates = (popup, driver) => {
    if (!popup) return [];
    const selector = driver.options.join(",");
    const seen = new Set();
    return Array.from(popup.querySelectorAll(selector))
      .filter((option) => isVisible(option))
      .filter((option) => !option.disabled && option.getAttribute("aria-disabled") !== "true")
      .map((option) => ({ option, text: optionText(option) }))
      .filter(({ option, text }) => {
        if (!text || /^(?:暂无数据|暂无|未找到|无数据|no\s*data)$/i.test(text) || seen.has(option)) return false;
        seen.add(option);
        return true;
      });
  };

  const bestOption = (options, requested) => {
    const target = normalize(requested);
    if (!target) return undefined;
    const exact = options.find(({ text }) => sameNormalizedValue(text, requested));
    if (exact) return exact;
    return options.find(({ text }) => {
      const candidate = normalize(text);
      return candidate.length >= 2 && (candidate.includes(target) || target.includes(candidate));
    });
  };

  const nativeInputValue = (input, value) => {
    if (!(input instanceof HTMLInputElement)) return;
    const previous = input.value;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input._valueTracker?.setValue?.(previous);
    input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", {
      key: String(value).slice(-1),
      bubbles: true,
      cancelable: true
    }));
  };

  const selectedText = (element, identified) => {
    const { root, driver } = identified || identify(element) || {};
    if (!root || !driver) return "";
    const ariaValue = clean(
      element.getAttribute?.("aria-valuetext") ||
      root.getAttribute?.("aria-valuetext") || ""
    );
    if (ariaValue) return ariaValue;
    const values = [];
    for (const selector of driver.selected) {
      for (const candidate of root.querySelectorAll(selector)) {
        const value = candidate instanceof HTMLInputElement
          ? clean(candidate.value)
          : clean(candidate.innerText || candidate.textContent || candidate.getAttribute?.("aria-valuetext") || "");
        if (value && !/^(?:请选择|选择|please\s*select)$/i.test(value) && !values.includes(value)) values.push(value);
      }
    }
    if (values.length) return values.join("，");
    if (element instanceof HTMLInputElement && !element.getAttribute("aria-autocomplete")) return clean(element.value);
    return "";
  };

  const popupFor = async (element, driver, tracker, wait) => {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const popup = runtime.resolvePopup(element, {
        selectors: driver.popups,
        optionSelectors: driver.options,
        tracker: attempt === 0 ? tracker : undefined
      });
      if (popup) return popup;
      await wait(45);
    }
    return undefined;
  };

  const findOption = async (element, driver, popup, requested, wait) => {
    let activePopup = popup;
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const match = bestOption(optionCandidates(activePopup, driver), requested);
      if (match) return { ...match, popup: activePopup };
      await wait(55);
      activePopup = runtime.resolvePopup(element, {
        selectors: driver.popups,
        optionSelectors: driver.options
      }) || activePopup;
    }
    return undefined;
  };

  const hierarchyParts = (value) => String(value || "")
    .split(/\s*(?:>|\/|\\|→|—>)\s*/)
    .map(clean)
    .filter(Boolean);

  const multiParts = (value) => String(value || "")
    .split(/[,，、;；|]+/)
    .map(clean)
    .filter(Boolean);

  const isMultiple = (root) => root.hasAttribute("multiple") ||
    /multiple|tags/.test(String(root.className || "").toLowerCase()) ||
    root.getAttribute("aria-multiselectable") === "true";

  const fill = async (element, value, helpers = {}) => {
    const identified = identify(element);
    if (!identified) return { handled: false, success: false, driver: "none" };
    const { driver, root, id, type } = identified;
    const finish = (result) => {
      interactionResults.set(element, result);
      interactionResults.set(root, result);
      return result;
    };
    const wait = typeof helpers.wait === "function"
      ? helpers.wait
      : (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const remoteWait = typeof helpers.remoteWait === "function" ? helpers.remoteWait : wait;
    const click = typeof helpers.click === "function"
      ? helpers.click
      : (target) => target.click?.();
    const requested = clean(value);
    if (!requested) return finish({ handled: true, success: false, driver: id, reason: "empty-value" });

    const currentValue = selectedText(element, identified);
    if (currentValue && sameNormalizedValue(currentValue, requested)) {
      return finish({
        handled: true,
        success: true,
        driver: id,
        selected: [currentValue],
        committed: false,
        commitMethod: "none",
        actualValue: currentValue
      });
    }

    const opener = root.querySelector(driver.opener) || element;
    const tracker = runtime.beginPopupTracking();
    try {
      opener.scrollIntoView?.({ behavior: "auto", block: "center", inline: "nearest" });
      click(opener);
      await wait(70);
      let popup = await popupFor(element, driver, tracker, wait);
      if (!popup) {
        return finish({
          handled: id !== "generic",
          success: false,
          driver: id,
          reason: "popup-not-found"
        });
      }

      const parts = type === "cascader"
        ? hierarchyParts(requested)
        : isMultiple(root) ? multiParts(requested) : [requested];
      const selected = [];
      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        let match = await findOption(element, driver, popup, part, wait);
        if (!match && index === 0) {
          const search = root.querySelector(driver.search.join(","));
          if (search instanceof HTMLInputElement && !search.readOnly && search.type !== "hidden") {
            const beforeSignature = optionCandidates(popup, driver).map(({ text }) => text).join("|");
            nativeInputValue(search, part);
            // Remote school/major lookups on Moka and ATSX commonly spend
            // 1.5-2.5s in the loading state. Keep generic controls snappy,
            // but let the site-specific drivers wait for the result menu.
            const isRemoteRecruitingSelect = ["moka", "atsx", "feishu"].includes(id);
            const searchAttempts = isRemoteRecruitingSelect ? 44 : 20;
            const searchDelay = isRemoteRecruitingSelect ? 80 : 70;
            for (let attempt = 0; attempt < searchAttempts; attempt += 1) {
              await remoteWait(searchDelay);
              popup = runtime.resolvePopup(element, {
                selectors: driver.popups,
                optionSelectors: driver.options
              }) || popup;
              const signature = optionCandidates(popup, driver).map(({ text }) => text).join("|");
              if (signature && signature !== beforeSignature) break;
            }
            match = await findOption(element, driver, popup, part, wait);
          }
        }
        if (!match) {
          return finish({ handled: true, success: false, driver: id, selected, reason: "option-not-found" });
        }
        const alreadySelected = /selected|checked|active/.test(String(match.option.className || "").toLowerCase()) ||
          match.option.getAttribute("aria-selected") === "true" ||
          match.option.getAttribute("aria-checked") === "true";
        if (!alreadySelected) click(match.option);
        selected.push(match.text);
        await wait(75);
        if (type === "cascader" && index + 1 < parts.length) {
          popup = runtime.resolvePopup(element, {
            selectors: driver.popups,
            optionSelectors: driver.options
          }) || popup;
        }
      }

      const commit = await runtime.commitOpenControl(element, { click, wait, popup });
      if (!commit.committed && isVisible(popup) && type !== "cascader" && !isMultiple(root)) {
        for (const eventType of ["keydown", "keyup"]) {
          opener.dispatchEvent(new KeyboardEvent(eventType, {
            key: "Escape",
            code: "Escape",
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true
          }));
        }
        opener.blur?.();
      }
      await wait(45);
      return finish({
        handled: true,
        success: selected.length === parts.length,
        driver: id,
        selected,
        committed: commit.committed,
        commitMethod: commit.method,
        actualValue: selectedText(element, identified)
      });
    } catch (error) {
      tracker.stop?.();
      return finish({
        handled: true,
        success: false,
        driver: id,
        reason: error instanceof Error ? error.message : "driver-failed"
      });
    }
  };

  globalThis.OfferFlowControlDrivers = {
    version: DRIVER_VERSION,
    drivers: drivers.map(({ id, roots }) => ({ id, roots })),
    fill,
    identify,
    lastResult: (element) => {
      const root = identify(element)?.root;
      return interactionResults.get(element) || (root ? interactionResults.get(root) : undefined);
    },
    selectedText,
    supports
  };
})();
