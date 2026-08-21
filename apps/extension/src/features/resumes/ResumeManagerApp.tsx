import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  CloudUpload,
  FileCheck2,
  FileText,
  Folder,
  GraduationCap,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  ShieldCheck,
  Star,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import {
  extractResumePdfAssets,
  normalizeEducationEntries,
  parseResumeFile
} from "@/features/profile/resumeParser";
import { arrayBufferToBase64 } from "@/shared/binary";
import ResumeEditor from "@/features/resumes/ResumeEditor";
import {
  ACTIVE_RESUME_KEY,
  BASE_PROFILE_KEY,
  EMPTY_PROFILE,
  RESUMES_KEY,
  loadActiveResumeId,
  loadBaseProfile,
  loadProfile,
  loadResumeLibrary,
  extractResumeBasics,
  applyResumeFixedProfile,
  extractResumeFixedProfile,
  hasResumeBasics,
  saveBaseProfile,
  saveProfile,
  saveResumeLibrary,
  loadResumeLibraryUi,
  saveResumeLibraryUi,
  setActiveResumeId,
  dropTailoredResumesForSourceResumeIds,
  pruneOrphanedTailoredResumes,
  type ResumeFixedProfile,
  type StoredResume,
  type StoredResumeKind,
  type StoredResumeParseMetadata,
  type StoredResumeSourceMetadata
} from "@/infrastructure/storage/storage";
import {
  calculateResumeCoverage,
  collectResumeRemovalIds,
  countResumeFields,
  resolveActiveResumeId
} from "@/features/resumes/resumeLifecycle";

const createId = () => `resume_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const MAX_SOURCE_PDF_BYTES = 8 * 1024 * 1024;

function extensionUrl(file: string) {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) return chrome.runtime.getURL(file);
  return new URL(file, window.location.href).href;
}

function openPlugin() {
  const url = extensionUrl("resume.html");
  if (typeof chrome !== "undefined" && chrome.tabs?.create) {
    void chrome.tabs.create({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function resumeName(resume: StoredResume) {
  const archiveName = [resume.company?.trim(), resume.position?.trim()].filter(Boolean).join(" · ");
  return resume.archiveNameSource === "manual"
    ? archiveName || resume.name || fileStem(resume.sourceFileName) || "未命名简历"
    : resume.name || fileStem(resume.sourceFileName) || archiveName || "未命名简历";
}

function fileStem(fileName?: string) {
  return fileName?.replace(/\.[^.]+$/, "").trim() || "";
}

function inferArchiveMetadata(name: string, profile: StoredResume["profile"]): { company: string; position: string } {
  const parts = name
    .replace(/^\s*\d+[.)、\-_\s]*/, "")
    .split(/[+＋—–－\-_|｜/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length !== 2) return { company: "", position: "" };

  const [first, second] = parts;
  const rolePattern = /产品|运营|开发|工程|设计|数据|算法|市场|销售|财务|人力|行政|采购|研究|测试|客服|编辑|助理|专员|经理|实习|教师|老师/i;
  const companyPattern = /公司|集团|科技|银行|大学|学院|企业|研究院|医院|京东|阿里|腾讯|字节|华为/i;
  const targetRole = profile.targetRole?.trim() || "";
  if (targetRole && targetRole.includes(first) && !targetRole.includes(second)) return { company: second, position: first };
  if (targetRole && targetRole.includes(second) && !targetRole.includes(first)) return { company: first, position: second };
  if (rolePattern.test(first) && !rolePattern.test(second)) return { company: second, position: first };
  if (rolePattern.test(second) && !rolePattern.test(first)) return { company: first, position: second };
  if (companyPattern.test(first) && !companyPattern.test(second)) return { company: first, position: second };
  if (companyPattern.test(second) && !companyPattern.test(first)) return { company: second, position: first };
  return { company: first, position: second };
}

function migrateLegacyResumeName(resume: StoredResume): StoredResume {
  if (resume.archiveNameSource) return resume;
  const archiveName = [resume.company?.trim(), resume.position?.trim()].filter(Boolean).join(" · ");
  const originalName = fileStem(resume.sourceFileName);
  // Older imports used the first parsed work experience as the archive name.
  // Restore the uploaded filename so the user can decide the archive name.
  if (archiveName && originalName && resume.name === archiveName && originalName !== archiveName) {
    return { ...resume, name: originalName, company: "", position: "", archiveNameSource: "filename" };
  }
  return resume;
}

function fieldCount(resume: StoredResume) {
  return countResumeFields(resume);
}

const RESUME_GROUPS: Array<{
  key: StoredResumeKind;
  label: string;
  description: string;
}> = [
  { key: "master", label: "原始母版", description: "保留原文件与来源信息" },
  { key: "base", label: "通用版本", description: "日常维护和网申复用" },
  { key: "job", label: "岗位定制", description: "按公司与岗位沉淀" }
];

function meaningfulParseWarnings(warnings: string[]): string[] {
  return warnings.filter((warning) => !warning.includes("PDF 已使用结构化文本提取"));
}

function buildParseMetadata(
  result: Awaited<ReturnType<typeof parseResumeFile>>,
  parsedAt: string
): StoredResumeParseMetadata {
  const warnings = meaningfulParseWarnings(result.warnings);
  const status = result.extractedCount <= 0 || result.textLength <= 0
    ? "failed"
    : warnings.length
      ? "needs-review"
      : "ready";
  return {
    schemaVersion: 1,
    status,
    coverage: calculateResumeCoverage({ profile: result.profile }),
    extractedFieldCount: result.extractedCount,
    textLength: result.textLength,
    warnings,
    parsedAt,
    parserVersion: "resume-parser-v2-semantic",
    sourceText: result.diagnostics?.normalizedText,
    unclassifiedText: result.diagnostics?.unclassifiedText
  };
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  try {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer.slice(0));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
}

function estimatePdfPageCount(buffer: ArrayBuffer): number | undefined {
  try {
    const source = new TextDecoder("latin1").decode(buffer);
    const count = source.match(/\/Type\s*\/Page\b/g)?.length || 0;
    return count > 0 ? count : undefined;
  } catch {
    return undefined;
  }
}

function resumeKindLabel(kind?: StoredResumeKind) {
  return RESUME_GROUPS.find((group) => group.key === kind)?.label || "通用版本";
}

function parseHealth(resume: StoredResume) {
  const parse = resume.parse;
  const warnings = parse?.warnings?.length || 0;
  switch (parse?.status) {
    case "ready":
      return { className: "is-ready", label: "解析完成", detail: "关键结构已识别" };
    case "needs-review":
      return { className: "needs-review", label: "待核对", detail: `${warnings} 项需要确认` };
    case "failed":
      return { className: "is-failed", label: "解析失败", detail: "原件已保留，可重新解析" };
    case "pending":
      return { className: "is-pending", label: "解析中", detail: "正在建立结构化资料" };
    default:
      return { className: "is-unknown", label: "待复核", detail: "旧记录没有解析报告" };
  }
}

function cloneProfile(profile: StoredResume["profile"]): StoredResume["profile"] {
  return {
    ...profile,
    education: profile.education.map((item) => ({ ...item })),
    experiences: profile.experiences.map((item) => ({ ...item })),
    projects: profile.projects.map((item) => ({ ...item })),
    campusExperiences: (profile.campusExperiences || []).map((item) => ({ ...item })),
    awards: (profile.awards || []).map((item) => ({ ...item })),
    extraFields: { ...(profile.extraFields || {}) }
  };
}

export default function ResumeManagerApp() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [resumes, setResumes] = useState<StoredResume[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [resumeFixedProfile, setResumeFixedProfile] = useState<ResumeFixedProfile>();
  const [dragging, setDragging] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [libraryPinned, setLibraryPinned] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [loadedLibrary, active, storedFixedProfile, globalProfile, libraryUi] = await Promise.all([
        loadResumeLibrary(),
        loadActiveResumeId(),
        loadBaseProfile(),
        loadProfile(),
        loadResumeLibraryUi()
      ]);
      const seedProfile = hasResumeBasics(extractResumeBasics(globalProfile))
        ? globalProfile
        : loadedLibrary[0]?.profile || globalProfile;
      const fixedProfile = storedFixedProfile?.fixedSectionsVersion === 1
        ? storedFixedProfile
        : extractResumeFixedProfile(seedProfile);
      const library = loadedLibrary
        .map(migrateLegacyResumeName)
        .map((resume) => {
          const inferred = inferArchiveMetadata(fileStem(resume.sourceFileName), resume.profile);
          const normalizedProfile = {
            ...resume.profile,
            education: normalizeEducationEntries(resume.profile.education)
          };
          return {
            ...resume,
            company: resume.archiveNameSource === "manual" ? resume.company : resume.company || inferred.company,
            position: resume.archiveNameSource === "manual" ? resume.position : resume.position || inferred.position,
            archiveNameSource: resume.archiveNameSource || "filename",
            profile: applyResumeFixedProfile(normalizedProfile, fixedProfile)
          };
        });
      if (cancelled) return;
      setResumeFixedProfile(fixedProfile);
      setLibraryCollapsed(libraryUi.collapsed);
      setLibraryPinned(libraryUi.pinned);
      if (storedFixedProfile?.fixedSectionsVersion !== 1) await saveBaseProfile(fixedProfile);
      if (library.some((resume, index) => resume !== loadedLibrary[index])) await saveResumeLibrary(library);
      const currentId = resolveActiveResumeId(library, active);
      const currentResume = library.find((resume) => resume.id === currentId);
      await Promise.all([
        currentId && active !== currentId ? setActiveResumeId(currentId) : Promise.resolve(),
        currentResume ? saveProfile(currentResume.profile) : Promise.resolve(),
        pruneOrphanedTailoredResumes(library.map((resume) => resume.id))
      ]);
      setResumes(library);
      setActiveId(currentId);
      setSelectedId(currentId);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local") return;
      if (!changes[RESUMES_KEY] && !changes[ACTIVE_RESUME_KEY] && !changes[BASE_PROFILE_KEY]) return;
      void (async () => {
        const [library, storedActiveId, fixedProfile] = await Promise.all([
          loadResumeLibrary(),
          loadActiveResumeId(),
          loadBaseProfile()
        ]);
        const currentId = resolveActiveResumeId(library, storedActiveId);
        setResumes(library);
        setActiveId(currentId);
        setSelectedId((current) => library.some((resume) => resume.id === current) ? current : currentId);
        if (fixedProfile) setResumeFixedProfile(fixedProfile);
        if (currentId && currentId !== storedActiveId) await setActiveResumeId(currentId);
      })();
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const selected = useMemo(
    () => resumes.find((resume) => resume.id === selectedId) || resumes[0],
    [resumes, selectedId]
  );

  const libraryGroups = useMemo(() => {
    return RESUME_GROUPS.map((group) => ({
      ...group,
      resumes: resumes
        .filter((resume) => (resume.kind || "base") === group.key)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    }));
  }, [resumes]);

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3000);
  };

  const reconcileActiveProfile = async (library: StoredResume[], expectedActiveId?: string) => {
    const storedActiveId = expectedActiveId ?? await loadActiveResumeId();
    const current = library.find((item) => item.id === storedActiveId);
    if (!current) return;
    await saveProfile(current.profile);
  };

  const saveLibraryUi = async (patch: Partial<{ collapsed: boolean; pinned: boolean }>) => {
    const next = {
      collapsed: patch.collapsed ?? libraryCollapsed,
      pinned: patch.pinned ?? libraryPinned
    };
    setLibraryCollapsed(next.collapsed);
    setLibraryPinned(next.pinned);
    await saveResumeLibraryUi(next);
  };

  const selectLibraryResume = (id: string) => {
    setSelectedId(id);
    if (!libraryPinned && !libraryCollapsed) void saveLibraryUi({ collapsed: true });
  };

  const activate = async (resume: StoredResume, library = resumes) => {
    const now = new Date().toISOString();
    const next = library.map((item) =>
      item.id === resume.id ? { ...item, lastUsedAt: now } : item
    );
    const selectedResume = next.find((item) => item.id === resume.id) || resume;
    setResumes(next);
    setSelectedId(resume.id);
    setActiveId(resume.id);
    if (!libraryPinned && !libraryCollapsed) void saveLibraryUi({ collapsed: true });
    await Promise.all([
      saveResumeLibrary(next),
      setActiveResumeId(resume.id)
    ]);
    await reconcileActiveProfile(next, resume.id);
    notify(`已切换为当前网申简历：${resumeName(selectedResume)}，插件已同步`);
  };

  const importResume = async (file: File) => {
    setUploading(true);
    try {
      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      if (isPdf && file.size > MAX_SOURCE_PDF_BYTES) {
        throw new Error("原始 PDF 不能超过 8MB；请压缩后重新导入，才能保证定制时沿用原版式");
      }
      const sourceBuffer = await file.arrayBuffer();
      let result: Awaited<ReturnType<typeof parseResumeFile>>;
      try {
        result = await parseResumeFile(file);
      } catch (parseError) {
        if (!isPdf) throw parseError;
        result = {
          profile: {
            ...EMPTY_PROFILE,
            extraFields: { resumeSourceName: file.name, parseMode: "source-pdf" }
          },
          extractedCount: 0,
          warnings: ["字段解析未完成；原 PDF 仍会作为 HTML 母版保留"],
          textLength: 0
        };
      }
      const extractedAssets = isPdf
        ? await extractResumePdfAssets(sourceBuffer.slice(0)).catch(() => ({
            assets: [],
            portraitAssetId: undefined,
            warnings: ["PDF 图片提取失败；原 PDF 仍已保留，可在简历工作台手动上传证件照"]
          }))
        : { assets: [], portraitAssetId: undefined, warnings: [] };
      result.warnings.push(...extractedAssets.warnings);
      const now = new Date().toISOString();
      const parsedName = fileStem(file.name) || "新简历";
      const archiveMetadata = inferArchiveMetadata(parsedName, result.profile);
      const [sha256] = await Promise.all([sha256Hex(sourceBuffer)]);
      const pageCount = isPdf ? estimatePdfPageCount(sourceBuffer) : undefined;
      const parse = buildParseMetadata(result, now);
      const sourceRevisionId = sha256 ? `source_${sha256.slice(0, 20)}` : `source_${createId()}`;
      const source: StoredResumeSourceMetadata = {
        revisionId: sourceRevisionId,
        fileName: file.name,
        mimeType: file.type || (isPdf ? "application/pdf" : "application/octet-stream"),
        size: file.size,
        importedAt: now,
        sha256,
        pageCount,
        characterCount: result.textLength,
        storageStatus: isPdf ? "stored" : "missing",
        layoutStatus: isPdf ? "pending" : "unknown"
      };
      let fixedProfile = resumeFixedProfile;
      if (!fixedProfile || fixedProfile.fixedSectionsVersion !== 1) {
        fixedProfile = extractResumeFixedProfile(result.profile);
        setResumeFixedProfile(fixedProfile);
        await saveBaseProfile(fixedProfile);
      }
      const parsedProfile = applyResumeFixedProfile(result.profile, fixedProfile);
      const masterId = isPdf ? createId() : undefined;
      const sourcePdf = isPdf
        ? {
            fileName: file.name,
            size: file.size,
            importedAt: now,
            base64: arrayBufferToBase64(sourceBuffer),
            sha256,
            pageCount,
            characterCount: result.textLength
          }
        : undefined;
      const master: StoredResume | undefined = masterId
        ? {
            id: masterId,
            name: parsedName,
            kind: "master",
            masterResumeId: masterId,
            versionNumber: 1,
            lifecycleStatus: "active",
            company: archiveMetadata.company,
            position: archiveMetadata.position,
            archiveNameSource: "filename",
            sourceFileName: file.name,
            sourcePdf,
            assets: structuredClone(extractedAssets.assets),
            portraitAssetId: extractedAssets.portraitAssetId,
            source,
            parse,
            profile: cloneProfile(parsedProfile),
            createdAt: now,
            updatedAt: now
          }
        : undefined;
      const created: StoredResume = {
        id: createId(),
        name: parsedName,
        kind: "base",
        masterResumeId: masterId,
        parentResumeId: masterId,
        versionNumber: 1,
        lifecycleStatus: "active",
        company: archiveMetadata.company,
        position: archiveMetadata.position,
        archiveNameSource: "filename",
        sourceFileName: file.name,
        sourcePdf,
        sourcePdfInherited: Boolean(master),
        assets: structuredClone(extractedAssets.assets),
        portraitAssetId: extractedAssets.portraitAssetId,
        sourceAssetsInherited: Boolean(master && extractedAssets.assets.length),
        source: { ...source, storageStatus: master ? "referenced" : source.storageStatus },
        parse: { ...parse, warnings: [...parse.warnings] },
        profile: cloneProfile(parsedProfile),
        createdAt: now,
        updatedAt: now
      };
      const next = [created, ...(master ? [master] : []), ...resumes];
      await activate(created, next);
      notify(
        `已导入并启用《${parsedName}》通用版 · 提取 ${result.extractedCount} 个字段${parse.warnings.length ? ` · ${parse.warnings.length} 项待核对` : ""}`
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "简历解析失败，请换一个文件重试");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) acceptResumeFile(file);
    event.target.value = "";
  };

  const acceptResumeFile = (file: File) => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["pdf", "docx", "txt", "md", "html", "htm"].includes(extension)) {
      notify("请上传 PDF、DOCX、TXT 或 HTML 格式的简历");
      return;
    }
    void importResume(file);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) acceptResumeFile(file);
  };

  const removeResume = async (resume: StoredResume) => {
    const removalIds = collectResumeRemovalIds(resumes, resume.id);
    const linkedCount = Math.max(0, removalIds.size - 1);
    const relationshipWarning = linkedCount
      ? `\n同时会删除 ${linkedCount} 个关联版本及其岗位定制记录，避免版本串档。`
      : "";
    if (!window.confirm(`确定删除《${resumeName(resume)}》吗？${relationshipWarning}\n删除后不能恢复。`)) return;
    const next = resumes.filter((item) => !removalIds.has(item.id));
    const nextActiveId = resolveActiveResumeId(next, removalIds.has(activeId) ? undefined : activeId);
    const nextActiveResume = next.find((item) => item.id === nextActiveId);
    setResumes(next);
    setActiveId(nextActiveId);
    setSelectedId(nextActiveId || next[0]?.id || "");
    const [, removedTailoredCount] = await Promise.all([
      saveResumeLibrary(next),
      dropTailoredResumesForSourceResumeIds(removalIds),
      setActiveResumeId(nextActiveId),
      nextActiveResume ? saveProfile(nextActiveResume.profile) : saveProfile({ ...EMPTY_PROFILE })
    ]);
    notify(
      linkedCount || removedTailoredCount
        ? `已删除 ${removalIds.size} 个关联版本，并清理 ${removedTailoredCount} 份岗位定制`
        : "简历已删除"
    );
  };

  const saveEditedResume = async (
    resume: StoredResume,
    profile: StoredResume["profile"],
    metadata: { company: string; position: string; manual: boolean }
  ) => {
    const now = new Date().toISOString();
    const nextFixedProfile = extractResumeFixedProfile(profile);
    const selectedProfile = applyResumeFixedProfile(profile, nextFixedProfile);
    const hasManualArchive = metadata.manual && Boolean(metadata.company || metadata.position);
    const archiveNameSource: StoredResume["archiveNameSource"] = hasManualArchive ? "manual" : "filename";
    const next = resumes.map((item) => {
      const syncedProfile = applyResumeFixedProfile(item.profile, nextFixedProfile);
      return item.id === resume.id
        ? {
            ...item,
            profile: selectedProfile,
            company: metadata.company,
            position: metadata.position,
            archiveNameSource,
            name: hasManualArchive
              ? [metadata.company, metadata.position].filter(Boolean).join(" · ") || item.name
              : item.archiveNameSource === "manual" ? fileStem(item.sourceFileName) || item.name : item.name,
            updatedAt: now
          }
        : { ...item, profile: syncedProfile, updatedAt: item.updatedAt };
    });
    setResumeFixedProfile(nextFixedProfile);
    setResumes(next);
    await Promise.all([saveResumeLibrary(next), saveBaseProfile(nextFixedProfile)]);
    await reconcileActiveProfile(next, activeId);
    const updated = next.find((item) => item.id === resume.id) || resume;
    notify(`《${resumeName(updated)}》已保存，插件已同步`);
  };

  if (loading) {
    return (
      <div className="resume-manager-loading">
        <RefreshCw className="spin" size={22} />
        <span>正在打开简历中心…</span>
      </div>
    );
  }

  return (
    <main
      className={`resume-manager-shell ${dragging ? "is-dragging" : ""}`}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files")) setDragging(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="resume-drop-overlay" aria-live="polite">
          <div>
            <CloudUpload size={42} strokeWidth={1.7} />
            <span>松开鼠标即可上传简历</span>
          </div>
        </div>
      )}
      <header className="resume-manager-header">
        <div className="resume-manager-brand">
          <span className="resume-manager-mark"><ArrowRight size={18} strokeWidth={3} /></span>
          <span>OFFER<strong>FLOW</strong></span>
          <i />
          <span className="resume-manager-title">简历中心</span>
        </div>
        <div className="resume-manager-actions">
          <button className="resume-header-link" onClick={openPlugin}><ArrowLeft size={15} />返回插件</button>
          <button className="resume-upload-button" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <RefreshCw className="spin" size={15} /> : <Plus size={16} />}
            {uploading ? "解析中" : "上传新简历"}
          </button>
          <input ref={inputRef} hidden type="file" accept=".pdf,.docx,.txt,.md,.html" onChange={handleFileChange} />
        </div>
      </header>

      <div className={`resume-manager-body ${libraryCollapsed ? "library-collapsed" : ""}`}>
        <aside className={`resume-library-sidebar ${libraryCollapsed ? "is-collapsed" : ""}`}>
          <div className="resume-library-collapsed-tools">
            <button
              onClick={() => void saveLibraryUi({ collapsed: false })}
              aria-label="展开简历库"
              title="展开简历库"
            >
              <PanelLeftOpen size={18} />
            </button>
            <span>{resumes.length}</span>
            <button
              className={libraryPinned ? "is-pinned" : ""}
              onClick={() => void saveLibraryUi({ pinned: !libraryPinned, collapsed: !libraryPinned ? false : true })}
              aria-label={libraryPinned ? "取消固定简历库" : "固定简历库并展开"}
              title={libraryPinned ? "取消固定简历库" : "固定简历库并展开"}
            >
              {libraryPinned ? <Pin size={16} /> : <PinOff size={16} />}
            </button>
          </div>
          <div className="resume-library-heading">
            <div><span className="resume-eyebrow">简历档案</span><h1>我的简历</h1></div>
            <div className="resume-library-tools">
              <span className="resume-total">{resumes.length}</span>
              <button onClick={() => void saveLibraryUi({ collapsed: true })} aria-label="收起简历库" title="收起简历库">
                <PanelLeftClose size={16} />
              </button>
              <button
                className={libraryPinned ? "is-pinned" : ""}
                onClick={() => void saveLibraryUi({ pinned: !libraryPinned })}
                aria-label={libraryPinned ? "取消固定简历库" : "固定简历库"}
                title={libraryPinned ? "取消固定简历库" : "固定简历库"}
              >
                {libraryPinned ? <Pin size={15} /> : <PinOff size={15} />}
              </button>
            </div>
          </div>
          <p className="resume-library-subtitle">原件、通用版和岗位版分开管理，来源和修改关系始终可追溯。</p>
          <button className="resume-new-card" onClick={() => inputRef.current?.click()}>
            <span><CloudUpload size={18} /></span>
            <div><strong>上传一份新简历</strong><small>点击或拖拽 PDF / DOCX / TXT</small></div>
            <ChevronRight size={15} />
          </button>
          <div className="resume-list">
            {libraryGroups.map((group) => {
              const collapsed = collapsedFolders.has(group.key);
              return (
                <section className={`resume-folder resume-library-group group-${group.key}`} key={group.key}>
                  <button
                    className="resume-folder-head"
                    onClick={() => setCollapsedFolders((current) => {
                      const next = new Set(current);
                      if (next.has(group.key)) next.delete(group.key);
                      else next.add(group.key);
                      return next;
                    })}
                    aria-expanded={!collapsed}
                  >
                    <span className="resume-folder-icon">
                      {group.key === "master" ? <FileCheck2 size={15} /> : group.key === "job" ? <BriefcaseBusiness size={15} /> : <Folder size={15} />}
                    </span>
                    <span className="resume-group-heading"><strong>{group.label}</strong><em>{group.description}</em></span>
                    <small>{group.resumes.length}</small>
                    <ChevronDown className={collapsed ? "is-collapsed" : ""} size={15} />
                  </button>
                  {!collapsed && <div className="resume-folder-items">
                    {group.resumes.map((resume) => (
                      <ResumeListItem
                        key={resume.id}
                        resume={resume}
                        active={resume.id === activeId}
                        selected={resume.id === selected?.id}
                        onSelect={() => selectLibraryResume(resume.id)}
                        onActivate={() => void activate(resume)}
                        onDelete={() => void removeResume(resume)}
                      />
                    ))}
                    {!group.resumes.length && (
                      <div className="resume-group-empty">
                        {group.key === "master"
                          ? "上传 PDF 后在这里保留不可丢失的原件"
                          : group.key === "base"
                            ? "上传简历后自动建立一个通用版本"
                            : "针对岗位生成的版本会归档在这里"}
                      </div>
                    )}
                  </div>}
                </section>
              );
            })}
            {!resumes.length && (
              <div className="resume-list-empty">
                <FileText size={20} />
                <strong>还没有简历</strong>
                <span>上传后会自动保存到这里</span>
              </div>
            )}
          </div>
          <div className="resume-local-note"><ShieldCheck size={15} /><span>简历保存在当前浏览器的 OfferDuoDuo 本地资料库。</span></div>
        </aside>

        <section className="resume-detail">
          {selected ? (
            <>
              <ResumeLifecycleSummary resume={selected} />
              <ResumeEditor
                resume={selected}
                active={selected.id === activeId}
                onBack={() => setSelectedId(resolveActiveResumeId(resumes, activeId) || resumes[0]?.id || "")}
                onActivate={() => void activate(selected)}
                onDelete={() => void removeResume(selected)}
                onSave={(profile, metadata) => saveEditedResume(selected, profile, metadata)}
                onOpenPlugin={openPlugin}
              />
            </>
          ) : (
            <EmptyResumeState onUpload={() => inputRef.current?.click()} />
          )}
        </section>
      </div>

      {notice && <button className="resume-manager-notice" onClick={() => setNotice("")}><Check size={15} />{notice}<X size={14} /></button>}
    </main>
  );
}

function ResumeLifecycleSummary({ resume }: { resume: StoredResume }) {
  const health = parseHealth(resume);
  const source = resume.source;
  const parse = resume.parse;
  const coverage = Math.round((parse?.coverage || 0) * 100);
  const sourceMessage = resume.lifecycleStatus === "invalid"
    ? resume.invalidReason || "版本关系已失效"
    : resume.kind === "master"
      ? source?.storageStatus === "stored"
        ? source.layoutStatus === "ready"
          ? "原始文件与版式母版均已验证"
          : "原始文件已保存，版式母版尚待验证"
        : "原始文件缺失，需要重新导入"
      : resume.masterResumeId
        ? "此版本引用原始母版，修改不会覆盖原文件"
        : "独立结构化版本，尚未关联原始母版";

  return (
    <section className={`resume-lifecycle-summary ${health.className}`} aria-label="简历版本与解析状态">
      <div className="resume-lifecycle-main">
        <span className="resume-lifecycle-kind">{resumeKindLabel(resume.kind)} · v{resume.versionNumber || 1}</span>
        <strong>{sourceMessage}</strong>
        <small>
          {source?.fileName || resume.sourceFileName || "无来源文件"}
          {source?.sha256 ? ` · SHA-256 ${source.sha256.slice(0, 10)}…` : " · 来源哈希待补全"}
        </small>
      </div>
      <div className="resume-lifecycle-stats">
        <span><strong>{source?.pageCount || "—"}</strong><small>页数</small></span>
        <span><strong>{parse?.textLength || source?.characterCount || "—"}</strong><small>字符</small></span>
        <span><strong>{coverage}%</strong><small>结构覆盖</small></span>
        <span className={`resume-health-stat ${health.className}`}><strong>{health.label}</strong><small>{health.detail}</small></span>
      </div>
      {parse?.warnings.length ? (
        <div className="resume-lifecycle-warning">
          <strong>待核对：</strong>{parse.warnings.slice(0, 2).join("；")}{parse.warnings.length > 2 ? ` 等 ${parse.warnings.length} 项` : ""}
        </div>
      ) : null}
    </section>
  );
}

function ResumeListItem({
  resume,
  active,
  selected,
  onSelect,
  onActivate,
  onDelete
}: {
  resume: StoredResume;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
  onActivate: () => void;
  onDelete: () => void;
}) {
  const health = parseHealth(resume);
  const pageCount = resume.source?.pageCount;
  const characterCount = resume.parse?.textLength || resume.source?.characterCount || 0;
  return (
    <div
      className={`resume-list-item ${selected ? "selected" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="resume-list-file"><FileText size={17} /></span>
      <span className="resume-list-copy">
        <span className="resume-list-title"><strong>{resumeName(resume)}</strong><i>{resumeKindLabel(resume.kind)} v{resume.versionNumber || 1}</i></span>
        <small>{resume.sourceFileName || "本地资料"}</small>
        <small>{fieldCount(resume)} 个字段 · {pageCount ? `${pageCount} 页` : "页数待确认"} · {characterCount ? `${characterCount} 字` : "字符待识别"}</small>
        <small className={`resume-parse-health ${health.className}`}>
          <i />{health.label}{resume.parse?.warnings.length ? ` · ${resume.parse.warnings.length} 项` : ""}
        </small>
      </span>
      <span className="resume-list-actions">
        {active ? (
          <span className="resume-active-dot" title="当前网申简历"><Check size={11} /></span>
        ) : (
          <button
            className="resume-list-star"
            onClick={(event) => {
              event.stopPropagation();
              onActivate();
            }}
            aria-label="设为当前简历"
          >
            <Star size={14} />
          </button>
        )}
        <button
          className="resume-list-delete"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          aria-label={`删除${resumeName(resume)}`}
          title="删除简历"
        >
          <Trash2 size={14} />
        </button>
      </span>
    </div>
  );
}

function ResumeDetail({
  resume,
  active,
  onActivate,
  onDelete
}: {
  resume: StoredResume;
  active: boolean;
  onActivate: () => void;
  onDelete: () => void;
}) {
  const profile = resume.profile;
  const education = profile.education[0];
  const experience = profile.experiences[0];
  const project = profile.projects[0];
  const portrait = resume.assets?.find((asset) => asset.id === resume.portraitAssetId);

  return (
    <div className="resume-detail-inner">
      <div className="resume-detail-heading">
        <div className="resume-detail-file">
          <span><FileText size={26} /></span>
          <div>
            <span className="resume-eyebrow">SAVED RESUME</span>
            <h2>{resumeName(resume)}</h2>
            <p>{resume.sourceFileName || "本地保存的结构化资料"} · 更新于 {new Date(resume.updatedAt).toLocaleString("zh-CN")}</p>
            <p className={resume.parse?.status === "ready" ? "resume-source-ready" : "resume-source-missing"}>
              {parseHealth(resume).label} · {resume.source?.storageStatus === "stored" ? "原件已保存" : resume.masterResumeId ? "引用关联母版" : "缺少原始母版"}
            </p>
          </div>
        </div>
        <div className="resume-detail-tools">
          <button className="resume-more" onClick={onDelete} aria-label="删除简历"><Trash2 size={16} /></button>
          {active ? (
            <span className="resume-current-badge"><Check size={13} />当前用于一键网申</span>
          ) : (
            <button className="resume-activate-button" onClick={onActivate}><Star size={14} />设为当前简历</button>
          )}
        </div>
      </div>

      <div className="resume-profile-banner">
        <div className={`resume-avatar ${portrait ? "has-photo" : ""}`}>
          {portrait ? <img src={portrait.dataUrl} alt={`${profile.fullName || "候选人"}的简历照片`} /> : profile.fullName?.slice(0, 1) || "简"}
        </div>
        <div><strong>{profile.fullName || "待识别姓名"}</strong><span>{profile.targetRole || "尚未填写目标岗位"}</span></div>
        <div className="resume-banner-stat"><strong>{fieldCount(resume)}</strong><span>已识别字段</span></div>
        <div className="resume-banner-stat"><strong>{profile.education.length + profile.experiences.length + profile.projects.length + (profile.campusExperiences || []).length + (profile.awards || []).length}</strong><span>经历与奖项</span></div>
      </div>

      <div className="resume-detail-grid">
        <ResumeInfoCard
          icon={<UserRound size={17} />}
          title="基本信息"
          items={[["手机号", profile.phone], ["邮箱", profile.email], ["现居城市", profile.currentCity], ["意向城市", profile.targetCities]]}
        />
        <ResumeInfoCard
          icon={<GraduationCap size={17} />}
          title="教育经历"
          items={[["学校", education?.school], ["专业", education?.major], ["学历", education?.degree], ["时间", education ? `${education.startDate || ""} — ${education.endDate || ""}` : ""]]}
        />
        <ResumeInfoCard
          icon={<BriefcaseBusiness size={17} />}
          title="最近经历"
          items={[["公司", experience?.organization], ["职位", experience?.title], ["时间", experience ? `${experience.startDate || ""} — ${experience.endDate || ""}` : ""], ["项目", project?.name]]}
        />
      </div>

      <div className="resume-detail-footer">
        <div><FileCheck2 size={15} /><span>这份简历会被插件用于匹配当前网申字段，不会自动点击提交。</span></div>
        <button className="resume-open-plugin" onClick={openPlugin}>去一键网申 <ArrowRight size={15} /></button>
      </div>
    </div>
  );
}

function ResumeInfoCard({ icon, title, items }: { icon: ReactNode; title: string; items: Array<[string, string | undefined]> }) {
  return (
    <section className="resume-info-card">
      <header><span>{icon}</span><strong>{title}</strong><MoreHorizontal size={15} /></header>
      <div>{items.map(([label, value]) => <p key={label}><small>{label}</small><strong>{value || "—"}</strong></p>)}</div>
    </section>
  );
}

function EmptyResumeState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="resume-empty-state">
      <div className="resume-empty-icon"><CloudUpload size={27} /></div>
      <span className="resume-eyebrow">简历档案</span>
      <h2>先上传一份简历</h2>
      <p>解析后保存多个版本，申请不同岗位时一键切换。</p>
      <button className="resume-upload-button" onClick={onUpload}><Plus size={16} />上传简历</button>
    </div>
  );
}
