(() => {
  const VERSION = "2026-08-24.registry-v1";
  const STORAGE_KEY = "offerflow.adapterRegistryOverrides";
  const LEGACY_FORM_STORAGE_KEY = "offerflow.formMappingOverrides";
  if (globalThis.OfferFlowAdapterRegistry?.version === VERSION) return;

  const platformRules = new Map();
  const companyRules = new Map();
  const platformOverrides = new Map();
  const companyOverrides = new Map();
  let genericRule = {
    id: "generic",
    name: "通用表单",
    formAdapterId: "generic",
    extractionAdapterId: "generic",
    mappings: []
  };
  let genericOverride;

  const canonicalPlatformId = (value) => {
    const id = String(value || "").trim().toLowerCase();
    return ({
      "feishu-career": "feishu",
      "feishu-jobs": "feishu",
      mokahr: "moka",
      zhiye: "beisen"
    })[id] || id || "generic";
  };

  const list = (value) => Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
  const mapping = (entry) => {
    if (Array.isArray(entry)) return entry[0] && entry[1]
      ? { key: String(entry[0]), pattern: String(entry[1]) }
      : undefined;
    if (!entry || typeof entry !== "object" || !entry.key || !entry.pattern) return undefined;
    return { key: String(entry.key), pattern: String(entry.pattern) };
  };
  const mappings = (value) => list(value).map(mapping).filter(Boolean);
  const mergeList = (left, right) => {
    const output = [];
    const seen = new Set();
    for (const item of [...list(left), ...list(right)]) {
      const key = item instanceof RegExp ? item.toString() : JSON.stringify(item);
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(item);
    }
    return output;
  };
  const mergeMappings = (left, right) => {
    const output = [];
    const seen = new Set();
    for (const item of [...mappings(left), ...mappings(right)]) {
      const key = `${item.key}:${item.pattern}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(item);
    }
    return output;
  };
  const mergeRule = (base, patch) => {
    if (!base && !patch) return undefined;
    const left = base || {};
    const right = patch || {};
    return {
      ...left,
      ...right,
      id: String(right.id || left.id || ""),
      hosts: mergeList(left.hosts, right.hosts),
      paths: mergeList(left.paths, right.paths),
      markers: mergeList(left.markers, right.markers),
      mappings: mergeMappings(left.mappings, right.mappings),
      priority: Number(right.priority ?? left.priority ?? 0)
    };
  };
  const normalizeRule = (definition, kind) => {
    if (!definition || typeof definition !== "object" || !definition.id) return undefined;
    const id = kind === "platform" ? canonicalPlatformId(definition.id) : String(definition.id).trim();
    if (!id) return undefined;
    return mergeRule(undefined, {
      ...definition,
      id,
      basePlatformId: definition.basePlatformId
        ? canonicalPlatformId(definition.basePlatformId)
        : definition.basePlatformId
    });
  };

  const registerGeneric = (definition = {}) => {
    genericRule = mergeRule(genericRule, { ...definition, id: "generic" });
    return genericRule;
  };
  const registerPlatform = (definition) => {
    const normalized = normalizeRule(definition, "platform");
    if (!normalized) return undefined;
    const next = mergeRule(platformRules.get(normalized.id), normalized);
    platformRules.set(normalized.id, next);
    return next;
  };
  const registerCompany = (definition) => {
    const normalized = normalizeRule(definition, "company");
    if (!normalized) return undefined;
    const next = mergeRule(companyRules.get(normalized.id), normalized);
    companyRules.set(normalized.id, next);
    return next;
  };

  const compilePattern = (value) => {
    if (value instanceof RegExp) return value;
    try {
      return new RegExp(String(value), "i");
    } catch {
      return undefined;
    }
  };
  const matches = (patterns, value) => list(patterns).some((candidate) => {
    const pattern = compilePattern(candidate);
    if (!pattern) return false;
    pattern.lastIndex = 0;
    return pattern.test(String(value || ""));
  });
  const markerMatchCount = (markers, documentLike) => list(markers).reduce((count, marker) => {
    try {
      return count + (documentLike?.querySelector?.(String(marker)) ? 1 : 0);
    } catch {
      return count;
    }
  }, 0);
  const detectionScore = (rule, context, company = false) => {
    if (!rule) return Number.NEGATIVE_INFINITY;
    const locationLike = context.location || {};
    const documentLike = context.document;
    const hostname = String(locationLike.hostname || "").toLowerCase();
    const pathname = String(locationLike.pathname || "");
    let score = Number(rule.priority || 0);
    let matched = false;
    if (matches(rule.hosts, hostname)) {
      score += company ? 10000 : 1000;
      matched = true;
    }
    if (matches(rule.paths, pathname)) {
      score += company ? 900 : 120;
      matched = true;
    }
    const markerCount = markerMatchCount(rule.markers, documentLike);
    const minimumMarkers = Math.max(1, Number(rule.minMarkerMatches || 1));
    if (markerCount >= minimumMarkers) {
      score += (company ? 1200 : 400) + markerCount * 20;
      matched = true;
    }
    if (typeof rule.detect === "function") {
      try {
        const detected = rule.detect(context);
        if (detected === true) {
          score += company ? 1500 : 500;
          matched = true;
        } else if (Number.isFinite(detected) && Number(detected) > 0) {
          score += Number(detected);
          matched = true;
        }
      } catch {
        // A broken optional detector must not disable the remaining registry.
      }
    }
    return matched ? score : Number.NEGATIVE_INFINITY;
  };

  const layerOverride = (base, override) => {
    const merged = mergeRule(base, override);
    if (merged) merged.mappings = mergeMappings(override?.mappings, base?.mappings);
    return merged;
  };
  const effectivePlatform = (id) => {
    const canonicalId = canonicalPlatformId(id);
    if (canonicalId === "generic") return layerOverride(genericRule, genericOverride);
    return layerOverride(platformRules.get(canonicalId), platformOverrides.get(canonicalId));
  };
  const effectiveCompany = (id) => layerOverride(companyRules.get(id), companyOverrides.get(id));
  const allCompanyIds = () => new Set([...companyRules.keys(), ...companyOverrides.keys()]);
  const allPlatformIds = () => new Set([...platformRules.keys(), ...platformOverrides.keys()]);

  const bestMatch = (rules, context, company) => rules
    .map((rule) => ({ rule, score: detectionScore(rule, context, company) }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score || String(left.rule.id).localeCompare(String(right.rule.id)))[0]?.rule;

  const resolve = (input = {}) => {
    const context = input.location || input.document
      ? input
      : { location: input, document: globalThis.document };
    context.location ||= globalThis.location || {};
    context.document ||= globalThis.document;

    const company = bestMatch(Array.from(allCompanyIds(), effectiveCompany).filter(Boolean), context, true);
    const detectedPlatform = bestMatch(Array.from(allPlatformIds(), effectivePlatform).filter(Boolean), context, false);
    const platformId = canonicalPlatformId(company?.basePlatformId || detectedPlatform?.id || "generic");
    const platform = effectivePlatform(platformId) || effectivePlatform("generic");
    const generic = effectivePlatform("generic");
    const layer = company ? "company" : platformId === "generic" ? "generic" : "platform";
    const mappingLayers = [
      company && { layer: "company", id: company.id, confidence: 0.99, mappings: mappings(company.mappings) },
      platformId !== "generic" && { layer: "platform", id: platformId, confidence: 0.96, mappings: mappings(platform?.mappings) },
      { layer: "generic", id: "generic", confidence: 0.86, mappings: mappings(generic?.mappings) }
    ].filter((entry) => entry && entry.mappings.length > 0);

    return {
      layer,
      companyId: company?.id,
      platformId,
      company,
      platform,
      generic,
      formAdapterId: company?.formAdapterId || platform?.formAdapterId || generic?.formAdapterId || "generic",
      extractionAdapterId: company?.extractionAdapterId || platform?.extractionAdapterId || generic?.extractionAdapterId || "generic",
      chain: [company?.id, platformId !== "generic" ? platformId : undefined, "generic"].filter(Boolean),
      mappingLayers
    };
  };

  const setRuleOverrides = (target, payload, kind) => {
    if (!payload || typeof payload !== "object") return;
    Object.entries(payload).forEach(([id, definition]) => {
      const source = Array.isArray(definition) ? { mappings: definition } : definition;
      const normalized = normalizeRule({ ...source, id }, kind);
      if (!normalized) return;
      target.set(normalized.id, mergeRule(target.get(normalized.id), normalized));
    });
  };
  const applyOverrides = (payload) => {
    if (!payload || typeof payload !== "object") return;
    const structured = payload.platforms || payload.companies || payload.generic;
    if (structured) {
      setRuleOverrides(platformOverrides, payload.platforms, "platform");
      setRuleOverrides(companyOverrides, payload.companies, "company");
      if (payload.generic) genericOverride = mergeRule(genericOverride, { ...payload.generic, id: "generic" });
      return;
    }
    // Backward compatibility: the previous storage shape was
    // { [formAdapterId]: [{ key, pattern }] }.
    Object.entries(payload).forEach(([adapterId, entries]) => {
      if (!Array.isArray(entries)) return;
      const id = canonicalPlatformId(adapterId);
      platformOverrides.set(id, mergeRule(platformOverrides.get(id), { id, mappings: entries }));
    });
  };
  const serializableRule = (rule) => {
    if (!rule) return rule;
    const { detect: _runtimeOnlyDetector, ...rest } = rule;
    const serializePattern = (value) => value instanceof RegExp ? value.source : value;
    return {
      ...rest,
      hosts: list(rest.hosts).map(serializePattern),
      paths: list(rest.paths).map(serializePattern),
      markers: list(rest.markers).map(String),
      mappings: mappings(rest.mappings)
    };
  };
  const exportOverrides = () => ({
    schemaVersion: 1,
    ...(genericOverride ? { generic: serializableRule(genericOverride) } : {}),
    platforms: Object.fromEntries(Array.from(platformOverrides, ([id, rule]) => [id, serializableRule(rule)])),
    companies: Object.fromEntries(Array.from(companyOverrides, ([id, rule]) => [id, serializableRule(rule)]))
  });
  const saveOverrides = async (payload) => {
    applyOverrides(payload);
    if (globalThis.chrome?.storage?.local) {
      await globalThis.chrome.storage.local.set({ [STORAGE_KEY]: exportOverrides() });
    }
  };
  const loadStoredOverrides = async () => {
    try {
      if (!globalThis.chrome?.storage?.local) return;
      const stored = await globalThis.chrome.storage.local.get([STORAGE_KEY, LEGACY_FORM_STORAGE_KEY]);
      applyOverrides(stored?.[STORAGE_KEY]);
      applyOverrides(stored?.[LEGACY_FORM_STORAGE_KEY]);
    } catch {
      // Built-in rules remain usable when storage is unavailable.
    }
  };

  const api = {
    version: VERSION,
    storageKey: STORAGE_KEY,
    legacyFormStorageKey: LEGACY_FORM_STORAGE_KEY,
    ready: undefined,
    canonicalPlatformId,
    registerGeneric,
    registerPlatform,
    registerCompany,
    resolve,
    applyOverrides,
    saveOverrides,
    loadStoredOverrides,
    exportOverrides,
    snapshot: () => ({
      generic: effectivePlatform("generic"),
      platforms: Object.fromEntries(Array.from(allPlatformIds(), (id) => [id, effectivePlatform(id)])),
      companies: Object.fromEntries(Array.from(allCompanyIds(), (id) => [id, effectiveCompany(id)]))
    })
  };
  globalThis.OfferFlowAdapterRegistry = api;
  api.ready = loadStoredOverrides();
})();
