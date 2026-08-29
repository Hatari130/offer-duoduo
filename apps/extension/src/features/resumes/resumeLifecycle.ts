import type {
  StoredResume,
  StoredResumeKind,
  StoredResumeParseMetadata,
  StoredResumeSourceMetadata
} from "../../infrastructure/storage/storage";

const VALID_KINDS = new Set<StoredResumeKind>(["base", "job"]);

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
    storageStatus: source?.storageStatus || (pdf ? (kind === "base" ? "stored" : "referenced") : "missing"),
    layoutStatus: source?.layoutStatus || "unknown"
  };
}

/** Collapses the retired master/base pair into one general resume, then
 * hydrates job versions from that general resume without duplicating blobs. */
export function migrateResumeLibrary(input: StoredResume[]): StoredResume[] {
  const legacyKind = (resume: StoredResume) => String(resume.kind || "");
  const masters = new Map(input.filter((resume) => legacyKind(resume) === "master").map((resume) => [resume.id, resume]));
  const basesByMaster = new Map(
    input
      .filter((resume) => legacyKind(resume) !== "master" && inferKind(resume) === "base" && resume.masterResumeId)
      .map((resume) => [resume.masterResumeId as string, resume.id])
  );

  const normalized = input
    .filter((resume) => legacyKind(resume) !== "master" || !basesByMaster.has(resume.id))
    .map((resume) => {
      const wasMaster = legacyKind(resume) === "master";
      const kind: StoredResumeKind = wasMaster ? "base" : inferKind(resume);
      const legacyMaster = !wasMaster && resume.masterResumeId ? masters.get(resume.masterResumeId) : undefined;
      const sourceOwner = legacyMaster || resume;
      const sourcePdf = resume.sourcePdf || legacyMaster?.sourcePdf;
      const assets = resume.assets || legacyMaster?.assets;
      const parentResumeId = kind === "job"
        ? (resume.parentResumeId && masters.has(resume.parentResumeId)
            ? basesByMaster.get(resume.parentResumeId)
            : resume.parentResumeId) || (resume.masterResumeId ? basesByMaster.get(resume.masterResumeId) : undefined)
        : undefined;
      const source = normalizeSourceMetadata(sourceOwner, kind);
      return {
        ...resume,
        kind,
        masterResumeId: undefined,
        parentResumeId,
        versionNumber: Math.max(1, resume.versionNumber || 1),
        lifecycleStatus: resume.lifecycleStatus === "invalid" ? "active" : resume.lifecycleStatus || "active",
        invalidReason: undefined,
        sourcePdf,
        sourcePdfInherited: kind === "job" && Boolean(!resume.sourcePdf && sourcePdf),
        assets,
        portraitAssetId: resume.portraitAssetId || legacyMaster?.portraitAssetId,
        sourceAssetsInherited: kind === "job" && Boolean(!resume.assets && assets?.length),
        parse: normalizeParseMetadata(resume),
        source: source ? { ...source, storageStatus: sourcePdf ? (kind === "base" ? "stored" : "referenced") : "missing" } : source
      } satisfies StoredResume;
    });

  const bases = new Map(normalized.filter((resume) => resume.kind === "base").map((resume) => [resume.id, resume]));
  return normalized.map((resume) => {
    if (resume.kind !== "job" || !resume.parentResumeId) return resume;
    const base = bases.get(resume.parentResumeId);
    if (!base) return resume;
    const inheritedPdf = resume.sourcePdf || base.sourcePdf;
    const inheritedAssets = resume.assets || base.assets;
    return {
      ...resume,
      sourcePdf: inheritedPdf,
      sourcePdfInherited: Boolean(resume.sourcePdfInherited || (!resume.sourcePdf && inheritedPdf)),
      assets: inheritedAssets,
      portraitAssetId: resume.portraitAssetId || base.portraitAssetId,
      sourceAssetsInherited: Boolean(resume.sourceAssetsInherited || (!resume.assets && inheritedAssets?.length)),
      source: base.source
        ? { ...base.source, ...resume.source, storageStatus: inheritedPdf ? "referenced" : "missing" }
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
    if (resume.kind === "job" && resume.parentResumeId) {
      delete persisted.sourcePdf;
      delete persisted.assets;
    }
    return persisted;
  });
}

export function resolveActiveResumeId(input: StoredResume[], preferredId?: string): string {
  const usable = input.filter((resume) => resume.lifecycleStatus !== "invalid" && resume.lifecycleStatus !== "archived");
  if (preferredId && usable.some((resume) => resume.id === preferredId)) return preferredId;
  if (usable.length === 1) return usable[0].id;
  return usable.find((resume) => resume.kind === "base")?.id
    || usable.find((resume) => resume.kind === "job")?.id
    || "";
}

/** Cascades a general-resume deletion so derived job versions cannot become orphaned. */
export function collectResumeRemovalIds(input: StoredResume[], targetId: string): Set<string> {
  const target = input.find((resume) => resume.id === targetId);
  const removalIds = new Set<string>([targetId]);
  if (!target) return removalIds;

  let changed = true;
  while (changed) {
    changed = false;
    input.forEach((resume) => {
      const linkedToRemovedParent = Boolean(resume.parentResumeId && removalIds.has(resume.parentResumeId));
      if (!removalIds.has(resume.id) && linkedToRemovedParent) {
        removalIds.add(resume.id);
        changed = true;
      }
    });
  }
  return removalIds;
}
