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
import { normalizeEducationEntries, parseResumeFile } from "@/features/profile/resumeParser";
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
  type ResumeFixedProfile,
  type StoredResume
} from "@/infrastructure/storage/storage";

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

function resumeFolderName(resume: StoredResume) {
  return resume.position?.trim() || resume.profile.targetRole?.trim() || "未指定岗位";
}

function resumeFolderKey(resume: StoredResume) {
  return resumeFolderName(resume).toLocaleLowerCase().replace(/[\s·•\-_/]+/g, "");
}

function fieldCount(resume: StoredResume) {
  const profile = resume.profile;
  return [
    profile.fullName,
    profile.phone,
    profile.email,
    profile.currentCity,
    profile.targetRole,
    profile.graduationDate,
    profile.portfolioUrl,
    ...profile.education.flatMap((item) => [item.school, item.major, item.degree, item.startDate, item.endDate]),
    ...profile.experiences.flatMap((item) => [item.organization, item.title, item.startDate, item.endDate, item.description]),
    ...profile.projects.flatMap((item) => [item.name, item.role, item.startDate, item.endDate, item.description])
  ].filter(Boolean).length;
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
      const currentId = active && library.some((resume) => resume.id === active) ? active : library[0]?.id || "";
      const currentResume = library.find((resume) => resume.id === currentId);
      await Promise.all([
        currentId && active !== currentId ? setActiveResumeId(currentId) : Promise.resolve(),
        currentResume ? saveProfile(currentResume.profile) : Promise.resolve()
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
        const currentId = storedActiveId && library.some((resume) => resume.id === storedActiveId)
          ? storedActiveId
          : library[0]?.id || "";
        setResumes(library);
        setActiveId(currentId);
        setSelectedId((current) => library.some((resume) => resume.id === current) ? current : currentId);
        if (fixedProfile) setResumeFixedProfile(fixedProfile);
      })();
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const selected = useMemo(
    () => resumes.find((resume) => resume.id === selectedId) || resumes[0],
    [resumes, selectedId]
  );

  const folders = useMemo(() => {
    const grouped = new Map<string, { label: string; resumes: StoredResume[] }>();
    resumes.forEach((resume) => {
      const key = resumeFolderKey(resume);
      const current = grouped.get(key);
      if (current) current.resumes.push(resume);
      else grouped.set(key, { label: resumeFolderName(resume), resumes: [resume] });
    });
    return [...grouped.entries()].map(([key, value]) => ({ key, ...value }));
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
      let result;
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
      const now = new Date().toISOString();
      const parsedName = fileStem(file.name) || "新简历";
      const archiveMetadata = inferArchiveMetadata(parsedName, result.profile);
      let fixedProfile = resumeFixedProfile;
      if (!fixedProfile || fixedProfile.fixedSectionsVersion !== 1) {
        fixedProfile = extractResumeFixedProfile(result.profile);
        setResumeFixedProfile(fixedProfile);
        await saveBaseProfile(fixedProfile);
      }
      const created: StoredResume = {
        id: createId(),
        name: parsedName,
        company: archiveMetadata.company,
        position: archiveMetadata.position,
        archiveNameSource: "filename",
        sourceFileName: file.name,
        sourcePdf: isPdf
          ? {
              fileName: file.name,
              size: file.size,
              importedAt: now,
              base64: arrayBufferToBase64(await file.arrayBuffer())
            }
          : undefined,
        profile: applyResumeFixedProfile(result.profile, fixedProfile),
        createdAt: now,
        updatedAt: now
      };
      const next = [created, ...resumes];
      setResumes(next);
      setSelectedId(created.id);
      await saveResumeLibrary(next);
      if (!resumes.length) await activate(created, next);
      notify(
        `已导入《${parsedName}》· 提取 ${result.extractedCount} 个字段${result.warnings.length ? ` · ${result.warnings.length} 项待核对` : ""}`
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
    if (!window.confirm(`确定删除《${resumeName(resume)}》吗？删除后不能恢复。`)) return;
    const next = resumes.filter((item) => item.id !== resume.id);
    setResumes(next);
    await saveResumeLibrary(next);
    if (resume.id === activeId) {
      if (next[0]) {
        await activate(next[0], next);
      } else {
        setActiveId("");
        await setActiveResumeId("");
        await saveProfile(await loadProfile());
      }
    }
    setSelectedId(next[0]?.id || "");
    notify("简历已删除");
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
            <div><span className="resume-eyebrow">RESUME LIBRARY</span><h1>我的简历</h1></div>
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
          <p className="resume-library-subtitle">为不同岗位准备不同版本，申请时随时切换。</p>
          <button className="resume-new-card" onClick={() => inputRef.current?.click()}>
            <span><CloudUpload size={18} /></span>
            <div><strong>上传一份新简历</strong><small>点击或拖拽 PDF / DOCX / TXT</small></div>
            <ChevronRight size={15} />
          </button>
          <div className="resume-list">
            {folders.map((folder) => {
              const collapsed = collapsedFolders.has(folder.key);
              return (
                <section className="resume-folder" key={folder.key}>
                  <button
                    className="resume-folder-head"
                    onClick={() => setCollapsedFolders((current) => {
                      const next = new Set(current);
                      if (next.has(folder.key)) next.delete(folder.key);
                      else next.add(folder.key);
                      return next;
                    })}
                    aria-expanded={!collapsed}
                  >
                    <span className="resume-folder-icon"><Folder size={15} /></span>
                    <strong>{folder.label}</strong>
                    <small>{folder.resumes.length}</small>
                    <ChevronDown className={collapsed ? "is-collapsed" : ""} size={15} />
                  </button>
                  {!collapsed && <div className="resume-folder-items">
                    {folder.resumes.map((resume) => (
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
            <ResumeEditor
              resume={selected}
              active={selected.id === activeId}
              onBack={() => setSelectedId(resumes[0]?.id || "")}
              onActivate={() => void activate(selected)}
              onDelete={() => void removeResume(selected)}
              onSave={(profile, metadata) => saveEditedResume(selected, profile, metadata)}
              onOpenPlugin={openPlugin}
            />
          ) : (
            <EmptyResumeState onUpload={() => inputRef.current?.click()} />
          )}
        </section>
      </div>

      {notice && <button className="resume-manager-notice" onClick={() => setNotice("")}><Check size={15} />{notice}<X size={14} /></button>}
    </main>
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
        <strong>{resumeName(resume)}</strong>
        <small>{resume.sourceFileName || "本地资料"}</small>
        <small>{fieldCount(resume)} 个字段 · {new Date(resume.updatedAt).toLocaleDateString("zh-CN")}</small>
        <small className={resume.sourcePdf ? "resume-source-ready" : "resume-source-missing"}>
          {resume.sourcePdf ? "原 PDF 母版已保存" : "缺少原 PDF 母版 · 重新导入可保持版式"}
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

  return (
    <div className="resume-detail-inner">
      <div className="resume-detail-heading">
        <div className="resume-detail-file">
          <span><FileText size={26} /></span>
          <div>
            <span className="resume-eyebrow">SAVED RESUME</span>
            <h2>{resumeName(resume)}</h2>
            <p>{resume.sourceFileName || "本地保存的结构化资料"} · 更新于 {new Date(resume.updatedAt).toLocaleString("zh-CN")}</p>
            <p className={resume.sourcePdf ? "resume-source-ready" : "resume-source-missing"}>
              {resume.sourcePdf ? "原 PDF 母版已保存，一键改简历会沿用原排版" : "缺少原 PDF 母版，请重新导入 PDF 后再使用一键改简历"}
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
        <div className="resume-avatar">{profile.fullName?.slice(0, 1) || "简"}</div>
        <div><strong>{profile.fullName || "待识别姓名"}</strong><span>{profile.targetRole || "尚未填写目标岗位"}</span></div>
        <div className="resume-banner-stat"><strong>{fieldCount(resume)}</strong><span>已识别字段</span></div>
        <div className="resume-banner-stat"><strong>{profile.education.length + profile.experiences.length + profile.projects.length}</strong><span>经历条目</span></div>
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
      <span className="resume-eyebrow">YOUR RESUME LIBRARY</span>
      <h2>先上传一份简历</h2>
      <p>解析后保存多个版本，申请不同岗位时一键切换。</p>
      <button className="resume-upload-button" onClick={onUpload}><Plus size={16} />上传简历</button>
    </div>
  );
}
