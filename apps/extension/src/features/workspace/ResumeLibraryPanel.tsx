import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronDown, FileText, Folder, FolderOpen, RefreshCw, ShieldCheck, Star, Trash2 } from "lucide-react";
import {
  ACTIVE_RESUME_KEY,
  RESUMES_KEY,
  loadActiveResumeId,
  loadProfile,
  loadResumeLibrary,
  saveResumeLibrary,
  setActiveResumeId,
  type StoredResume
} from "@/infrastructure/storage/storage";
import type { PersonalProfile } from "@/shared/types";

type ResumeLibraryPanelProps = {
  onOpenManager: () => void;
  onSaveProfile: (profile: PersonalProfile) => Promise<void>;
};

function fieldCount(resume: StoredResume) {
  const profile = resume.profile;
  return [
    profile.fullName,
    profile.phone,
    profile.email,
    profile.currentCity,
    profile.targetRole,
    ...profile.education.flatMap((item) => Object.values(item)),
    ...profile.experiences.flatMap((item) => Object.values(item)),
    ...profile.projects.flatMap((item) => Object.values(item)),
    ...profile.campusExperiences.flatMap((item) => Object.values(item)),
    ...profile.awards.flatMap((item) => Object.values(item)),
    ...Object.values(profile.extraFields || {})
  ].filter((value) => typeof value === "string" && value.trim()).length;
}

function resumeDisplayName(resume: StoredResume) {
  return resume.name || resume.sourceFileName?.replace(/\.[^.]+$/, "") || "未命名简历";
}

function folderName(resume: StoredResume) {
  return resume.position?.trim() || resume.profile.targetRole?.trim() || "未指定岗位";
}

function folderKey(resume: StoredResume) {
  return folderName(resume).toLocaleLowerCase().replace(/[\s·•\-_/]+/g, "");
}

export default function ResumeLibraryPanel({ onOpenManager, onSaveProfile }: ResumeLibraryPanelProps) {
  const [resumes, setResumes] = useState<StoredResume[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState("");
  const [notice, setNotice] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    const [library, active] = await Promise.all([loadResumeLibrary(), loadActiveResumeId()]);
    setResumes(library);
    setActiveId(active && library.some((resume) => resume.id === active) ? active : library[0]?.id || "");
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;
    const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "local" || (!changes[RESUMES_KEY] && !changes[ACTIVE_RESUME_KEY])) return;
      void load();
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const activeResume = useMemo(() => resumes.find((resume) => resume.id === activeId), [resumes, activeId]);

  const folders = useMemo(() => {
    const grouped = new Map<string, { label: string; resumes: StoredResume[] }>();
    resumes.forEach((resume) => {
      const key = folderKey(resume);
      const current = grouped.get(key);
      if (current) current.resumes.push(resume);
      else grouped.set(key, { label: folderName(resume), resumes: [resume] });
    });
    return [...grouped.entries()].map(([key, value]) => ({ key, ...value }));
  }, [resumes]);

  const selectResume = async (resume: StoredResume) => {
    setSwitching(resume.id);
    try {
      await Promise.all([setActiveResumeId(resume.id), onSaveProfile(resume.profile)]);
      setActiveId(resume.id);
      setNotice(`已切换为${resumeDisplayName(resume)}`);
      window.setTimeout(() => setNotice(""), 2400);
    } finally {
      setSwitching("");
    }
  };

  const removeResume = async (resume: StoredResume) => {
    if (!window.confirm(`确定删除《${resumeDisplayName(resume)}》吗？删除后不能恢复。`)) return;
    const next = resumes.filter((item) => item.id !== resume.id);
    setResumes(next);
    await saveResumeLibrary(next);
    if (resume.id === activeId) {
      const replacement = next[0];
      if (replacement) {
        await Promise.all([setActiveResumeId(replacement.id), onSaveProfile(replacement.profile)]);
        setActiveId(replacement.id);
      } else {
        await Promise.all([setActiveResumeId(""), onSaveProfile(await loadProfile())]);
        setActiveId("");
      }
    }
    setNotice(`已删除${resumeDisplayName(resume)}`);
    window.setTimeout(() => setNotice(""), 2400);
  };

  if (loading) {
    return <div className="overlay-resume-state"><RefreshCw className="spin" size={20} /><span>正在读取简历库…</span></div>;
  }

  return (
    <section className="overlay-resume-library">
      <div className="overlay-resume-intro">
        <div><span className="overlay-resume-kicker">简历档案</span><h2>简历库</h2><p>按岗位自动收纳，支持折叠文件夹、切换和删除投递版本。</p></div>
        <button className="overlay-resume-open" onClick={onOpenManager}><FolderOpen size={15} />打开简历中心</button>
      </div>

      {activeResume && <div className="overlay-resume-current"><span className="overlay-resume-current-icon"><Check size={16} /></span><div><small>当前用于一键网申</small><strong>{resumeDisplayName(activeResume)}</strong><span>{fieldCount(activeResume)} 个可用字段 · {activeResume.sourceFileName || "本地资料"}</span></div></div>}

      {resumes.length ? <div className="overlay-resume-folders">{folders.map((folder) => {
        const collapsed = collapsedFolders.has(folder.key);
        return <section className="overlay-resume-folder" key={folder.key}>
          <button
            className="overlay-resume-folder-head"
            onClick={() => setCollapsedFolders((current) => {
              const next = new Set(current);
              if (next.has(folder.key)) next.delete(folder.key);
              else next.add(folder.key);
              return next;
            })}
            aria-expanded={!collapsed}
          >
            <Folder size={15} />
            <strong>{folder.label}</strong>
            <small>{folder.resumes.length}</small>
            <ChevronDown className={collapsed ? "is-collapsed" : ""} size={14} />
          </button>
          {!collapsed && <div className="overlay-resume-folder-items">
            {folder.resumes.map((resume) => {
              const active = resume.id === activeId;
              const busy = switching === resume.id;
              return <article className={`overlay-resume-card ${active ? "active" : ""}`} key={resume.id}>
                <span className="overlay-resume-file"><FileText size={17} /></span>
                <div><strong>{resumeDisplayName(resume)}</strong><small>{fieldCount(resume)} 个字段 · {resume.sourceFileName || "本地资料"}</small></div>
                <span className="overlay-resume-card-actions">
                  {active ? <span className="overlay-resume-selected"><Check size={12} />当前</span> : <button className="overlay-resume-select" onClick={() => void selectResume(resume)} disabled={Boolean(switching)}>{busy ? <RefreshCw className="spin" size={13} /> : <Star size={13} />}使用这份</button>}
                  <button className="overlay-resume-delete" onClick={() => void removeResume(resume)} aria-label={`删除${resumeDisplayName(resume)}`} title="删除简历"><Trash2 size={14} /></button>
                </span>
              </article>;
            })}
          </div>}
        </section>;
      })}</div> : <div className="overlay-resume-empty"><FileText size={24} /><strong>还没有上传简历</strong><span>去简历中心上传后，这里会显示所有可投递版本。</span><button onClick={onOpenManager}>去上传简历 <ArrowRight size={14} /></button></div>}

      <div className="overlay-resume-footer"><ShieldCheck size={14} /><span>{notice || "切换后，下一次一键填写会使用所选简历。"}</span><button onClick={() => void load()} aria-label="刷新简历库"><RefreshCw size={14} /></button></div>
    </section>
  );
}
