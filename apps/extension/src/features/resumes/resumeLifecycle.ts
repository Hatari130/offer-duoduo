import type {
  StoredResume,
  StoredResumeKind,
  StoredResumeParseMetadata,
  StoredResumeSourceMetadata
} from "../../infrastructure/storage/storage";

const VALID_KINDS = new Set<StoredResumeKind>(["master", "base", "job"]);

const clampCoverage = (value: number) => Math.max(0, Math.min(1, value));

function hasValue(value: unknown): boolean {
  if (typeof value === "string") return Boolean(value.trim());
  return value !== undefined && value !== null && value !== false;
}

export function countResumeFields(resume: Pick<StoredResume, "profile">): number {
  const profile = resume.profile;
  return [
    profile.fullName,
    profile.gender,
    profile.phone,
    profile.email,
    profile.birthDate,
    profile.graduationDate,
    profile.currentCity,
    profile.nativePlace,
    profile.height,
    profile.weight,
    profile.recruitmentType,
    profile.graduateStatus,
    profile.address,
    profile.targetRole,
    profile.targetCities,
    profile.earliestStartDate,
    profile.portfolioUrl,
    profile.githubUrl,
    profile.selfIntroduction,
    profile.strengths,
    profile.careerPlan,
    ...profile.education.flatMap((item) => Object.values(item)),
    ...profile.experiences.flatMap((item) => Object.values(item)),
    ...profile.projects.flatMap((item) => Object.values(item)),
    ...(profile.campusExperiences || []).flatMap((item) => Object.values(item)),
    ...(profile.awards || []).flatMap((item) => Object.values(item)),
    ...Object.values(profile.extraFields || {})
  ].filter(hasValue).length;
}

/**
 * A conservative structure score. It deliberately counts campus and awards so
 * a resume cannot look complete merely because its contact details parsed.
 */
export function calculateResumeCoverage(resume: Pick<StoredResume, "profile">): number {
  const profile = resume.profile;
  const checks = [
    Boolean(profile.fullName?.trim()),
    Boolean(profile.phone?.trim() || profile.email?.trim()),
    profile.education.length > 0,
    profile.experiences.length > 0,
    profile.projects.length > 0,
    (profile.campusExperiences || []).length > 0,
    (profile.awards || []).length > 0
  ];
  return clampCoverage(checks.filter(Boolean).length / checks.length);
}

function inferKind(resume: StoredResume): StoredResumeKind {
  if (resume.kind && VALID_KINDS.has(resume.kind)) return resume.kind;
  if (resume.sourcePdf) return "master";
  if (resume.jobKey || resume.company?.trim() || resume.position?.trim()) return "job";
  return "base";
}

function legacyParseMetadata(resume: StoredResume): StoredResumeParseMetadata {
  const extractedFieldCount = countResumeFields(resume);
  const parseFailed = resume.profile.extraFields?.parseMode === "source-pdf" && extractedFieldCount === 0;
  return {
    schemaVersion: 1,
    status: parseFailed ? "failed" : "unknown",
    coverage: calculateResumeCoverage(resume),
    extractedFieldCount,
    textLength: resume.source?.characterCount || resume.sourcePdf?.characterCount || 0,
    warnings: parseFailed
      ? ["旧记录的结构化字段为空，需要重新解析原件"]
      : ["旧版本未保存解析报告，建议核对关键字段"],
    parserVersion: "legacy"
  };
}

function normalizeParseMetadata(resume: StoredResume): StoredResumeParseMetadata {
  if (!resume.parse) return legacyParseMetadata(resume);
  return {
    ...resume.parse,
    schemaVersion: 1,
    coverage: clampCoverage(Number.isFinite(resume.parse.coverage) ? resume.parse.coverage : calculateResumeCoverage(resume)),
    extractedFieldCount: Math.max(0, resume.parse.extractedFieldCount || countResumeFields(resume)),
    textLength: Math.max(0, resume.parse.textLength || resume.source?.characterCount || resume.sourcePdf?.characterCount || 0),
    warnings: Array.isArray(resume.parse.warnings) ? resume.parse.warnings.filter(Boolean) : []
  };
}

function normalizeSourceMetadata(
  resume: StoredResume,
  kind: StoredResumeKind
): StoredResumeSourceMetadata | undefined {
  const pdf = resume.sourcePdf;
  const source = resume.source;
  if (!source && !pdf && !resume.sourceFileName) return undefined;
  const fileName = source?.fileName || pdf?.fileName || resume.sourceFileName || "未命名原件";
  return {
    revisionId: source?.revisionId || `source_${resume.id}`,
    fileName,
    mimeType: source?.mimeType || (fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream"),
    size: Math.max(0, source?.size || pdf?.size || 0),
    importedAt: source?.importedAt || pdf?.importedAt || resume.createdAt,
    sha256: source?.sha256 || pdf?.sha256,
    pageCount: source?.pageCount || pdf?.pageCount,
    characterCount: source?.characterCount || pdf?.characterCount || resume.parse?.textLength,
    storageStatus: source?.storageStatus || (pdf ? (kind === "master" ? "stored" : "referenced") : "missing"),
    layoutStatus: source?.layoutStatus || "unknown"
  };
}

/** Migrates old flat records and hydrates a referenced master PDF in memory. */
export function migrateResumeLibrary(input: StoredResume[]): StoredResume[] {
  const normalized = input.map((resume) => {
    const kind = inferKind(resume);
    const masterResumeId = kind === "master" ? resume.id : resume.masterResumeId;
    return {
      ...resume,
      kind,
      masterResumeId,
      versionNumber: Math.max(1, resume.versionNumber || 1),
      lifecycleStatus: resume.lifecycleStatus || "active",
      parse: normalizeParseMetadata(resume),
      source: normalizeSourceMetadata(resume, kind)
    } satisfies StoredResume;
  });

  const masters = new Map(
    normalized.filter((resume) => resume.kind === "master").map((resume) => [resume.id, resume])
  );

  return normalized.map((resume) => {
    if (resume.kind === "master" || !resume.masterResumeId) return resume;
    const master = masters.get(resume.masterResumeId);
    if (!master) {
      return {
        ...resume,
        lifecycleStatus: "invalid",
        invalidReason: resume.invalidReason || "关联的原始母版已不存在",
        source: resume.source ? { ...resume.source, storageStatus: "missing" } : resume.source
      };
    }
    const inheritedPdf = resume.sourcePdf || master.sourcePdf;
    const inheritedAssets = resume.assets || master.assets;
    return {
      ...resume,
      sourcePdf: inheritedPdf,
      sourcePdfInherited: Boolean(!resume.sourcePdf && inheritedPdf),
      assets: inheritedAssets,
      portraitAssetId: resume.portraitAssetId || master.portraitAssetId,
      sourceAssetsInherited: Boolean(!resume.assets && inheritedAssets?.length),
      source: master.source
        ? { ...master.source, ...resume.source, storageStatus: inheritedPdf ? "referenced" : "missing" }
        : resume.source
    };
  });
}

/** Removes runtime-only inherited blobs before writing the library to storage. */
export function dehydrateResumeLibrary(input: StoredResume[]): StoredResume[] {
  return input.map((resume) => {
    const {
      sourcePdfInherited: _sourcePdfInherited,
      sourceAssetsInherited: _sourceAssetsInherited,
      ...persisted
    } = resume;
    if (resume.kind !== "master" && resume.masterResumeId && resume.masterResumeId !== resume.id) {
      delete persisted.sourcePdf;
      delete persisted.assets;
    }
    return persisted;
  });
}

export function resolveActiveResumeId(input: StoredResume[], preferredId?: string): string {
  const usable = input.filter((resume) => resume.lifecycleStatus !== "invalid" && resume.lifecycleStatus !== "archived");
  const usableVersions = usable.filter((resume) => resume.kind !== "master");
  if (preferredId && usableVersions.some((resume) => resume.id === preferredId)) return preferredId;
  if (usableVersions.length === 1) return usableVersions[0].id;
  return usableVersions.find((resume) => resume.kind === "base")?.id
    || usableVersions.find((resume) => resume.kind === "job")?.id
    || usable.find((resume) => resume.kind === "master")?.id
    || "";
}

/** Cascades a master/base deletion so no derived version can point at a missing source. */
export function collectResumeRemovalIds(input: StoredResume[], targetId: string): Set<string> {
  const target = input.find((resume) => resume.id === targetId);
  const removalIds = new Set<string>([targetId]);
  if (!target) return removalIds;

  let changed = true;
  while (changed) {
    changed = false;
    input.forEach((resume) => {
      const linkedToRemovedParent = Boolean(resume.parentResumeId && removalIds.has(resume.parentResumeId));
      const linkedToRemovedMaster = target.kind === "master" && resume.masterResumeId === target.id;
      if (!removalIds.has(resume.id) && (linkedToRemovedParent || linkedToRemovedMaster)) {
        removalIds.add(resume.id);
        changed = true;
      }
    });
  }
  return removalIds;
}
