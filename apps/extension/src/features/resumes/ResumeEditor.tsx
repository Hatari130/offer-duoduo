import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Calendar,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Eye,
  EyeOff,
  CircleUserRound,
  FileCheck2,
  GraduationCap,
  GripVertical,
  Link2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  UserRound,
  X
} from "lucide-react";
import { resolveProfileExperienceKind } from "@/shared/types";
import type {
  PersonalProfile,
  ProfileAward,
  ProfileCampusExperience,
  ProfileEducation,
  ProfileExperience,
  ProfileExperienceKind,
  ProfileProject
} from "@/shared/types";
import type { StoredResume } from "@/infrastructure/storage/storage";

type ResumeEditorProps = {
  resume: StoredResume;
  active: boolean;
  onBack: () => void;
  onActivate: () => void;
  onDelete: () => void;
  onSave: (profile: PersonalProfile, metadata: { company: string; position: string; manual: boolean }) => Promise<void>;
  onOpenPlugin: () => void;
};

type ExtraRow = { id: string; key: string; value: string };

type UndoToastState = {
  id: string;
  title: string;
  restore: () => void;
};

const monthInputValue = (value?: string) => {
  const match = String(value || "").match(/^(\d{4})[-/.](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}` : "";
};

const formatDateRange = (start?: string, end?: string): string => {
  const format = (v?: string) => {
    if (!v) return "";
    const m = String(v).match(/^(\d{4})[-/.](\d{1,2})/);
    return m ? `${m[1]}.${m[2].padStart(2, "0")}` : v;
  };
  const s = format(start);
  const e = format(end);
  if (s && e) return `${s} — ${e}`;
  if (s) return `${s} — 至今`;
  if (e) return `截至 ${e}`;
  return "";
};

const EDUCATION_FORM_OPTIONS = [
  "全国普通高等院校全日制",
  "全国普通高等院校非全日制",
  "成人高等教育",
  "高等教育自学考试",
  "网络教育",
  "开放教育",
  "境外院校",
  "其他"
] as const;

type EditorSectionKey =
  | "basic"
  | "preference"
  | "education"
  | "internships"
  | "work"
  | "projects"
  | "campus"
  | "skills"
  | "answers"
  | "background";

type ProfileRecordKey = "languages" | "qualifications" | "familyMembers";

const SECTION_INDEX: Array<{ key: EditorSectionKey; label: string }> = [
  { key: "basic", label: "基本与个人信息" },
  { key: "preference", label: "求职偏好" },
  { key: "education", label: "教育经历" },
  { key: "internships", label: "实习经历" },
  { key: "work", label: "工作经历" },
  { key: "projects", label: "项目经历" },
  { key: "campus", label: "在校经历" },
  { key: "skills", label: "技能、语言与荣誉" },
  { key: "answers", label: "常用回答" },
  { key: "background", label: "家庭与补充信息" }
];

const PHONE_COUNTRY_CODE_KEY = "phoneCountryCode";
const PHONE_COUNTRY_CODES = [
  { value: "+86", label: "+86 中国" },
  { value: "+852", label: "+852 中国香港" },
  { value: "+853", label: "+853 中国澳门" },
  { value: "+886", label: "+886 中国台湾" },
  { value: "+1", label: "+1 美国/加拿大" },
  { value: "+44", label: "+44 英国" },
  { value: "+61", label: "+61 澳大利亚" },
  { value: "+65", label: "+65 新加坡" },
  { value: "+81", label: "+81 日本" },
  { value: "+82", label: "+82 韩国" }
] as const;
const INTERNAL_EXTRA_KEYS = new Set(["resumeSourceName", "parseMode", PHONE_COUNTRY_CODE_KEY]);
const RETIRED_DIAGNOSTIC_EXTRA_KEYS = new Set(["parseCoverage", "resumeUnclassifiedText"]);
const EXTRA_FIELD_SUGGESTIONS = [
  "专业技能栈",
  "高考省份与成绩",
  "户口迁移意愿",
  "是否服从调剂",
  "直系亲属在司情况",
  "期望落户城市",
  "兴趣爱好与特长"
];

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function initialExtraRows(profile: PersonalProfile): ExtraRow[] {
  return Object.entries(profile.extraFields || {})
    .filter(([key, value]) => !INTERNAL_EXTRA_KEYS.has(key) && !RETIRED_DIAGNOSTIC_EXTRA_KEYS.has(key) && value.trim())
    .map(([key, value]) => ({ id: newId("extra"), key, value }));
}

function countProfileFields(profile: PersonalProfile) {
  const recordValues = (records?: Record<string, string>[]) => records?.flatMap((item) => Object.values(item)) || [];
  return [
    profile.fullName,
    profile.gender,
    profile.phone,
    profile.email,
    profile.birthDate,
    profile.graduationDate,
    profile.currentCity,
    profile.nativePlace,
    profile.address,
    profile.targetRole,
    profile.targetCities,
    profile.earliestStartDate,
    profile.portfolioUrl,
    profile.githubUrl,
    profile.currentResidence,
    profile.nationality,
    profile.idType,
    profile.idNumber,
    profile.studentSource,
    profile.wechat,
    profile.qq,
    profile.politicalStatus,
    profile.maritalStatus,
    profile.healthStatus,
    profile.specialty,
    profile.workYears,
    profile.emergencyContactName,
    profile.emergencyContactPhone,
    profile.countryRegion,
    profile.expectedSalary,
    profile.selfIntroduction,
    profile.strengths,
    profile.careerPlan,
    ...profile.education.flatMap((item) => Object.values(item)),
    ...profile.experiences.flatMap((item) => Object.values(item)),
    ...profile.projects.flatMap((item) => Object.values(item)),
    ...profile.campusExperiences.flatMap((item) => Object.values(item)),
    ...profile.awards.flatMap((item) => Object.values(item)),
    ...recordValues(profile.languages),
    ...recordValues(profile.qualifications),
    ...recordValues(profile.familyMembers),
    ...Object.entries(profile.extraFields || {})
      .filter(([key]) => !RETIRED_DIAGNOSTIC_EXTRA_KEYS.has(key))
      .map(([, value]) => value)
  ].filter((value) => typeof value === "string" && value.trim()).length;
}

export default function ResumeEditor({
  resume,
  active,
  onBack,
  onActivate,
  onDelete,
  onSave,
  onOpenPlugin
}: ResumeEditorProps) {
  const [draft, setDraft] = useState(resume.profile);
  const [company, setCompany] = useState(resume.company || "");
  const [position, setPosition] = useState(resume.position || "");
  const [phoneCountryCode, setPhoneCountryCode] = useState(resume.profile.extraFields?.[PHONE_COUNTRY_CODE_KEY] || "+86");
  const [extraRows, setExtraRows] = useState<ExtraRow[]>(() => initialExtraRows(resume.profile));
  const [openSections, setOpenSections] = useState<Set<EditorSectionKey>>(
    () => new Set(["basic", "preference", "education", "internships", "work", "projects", "campus", "skills", "answers"])
  );
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<EditorSectionKey>("basic");
  const [showIdNumber, setShowIdNumber] = useState(false);

  // Drag-and-drop state
  const [draggingEntryId, setDraggingEntryId] = useState<string | null>(null);
  const [dragOverEntryId, setDragOverEntryId] = useState<string | null>(null);

  // Undo Toast state
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null);
  const undoTimerRef = useRef<number | undefined>(undefined);
  const isDirtyRef = useRef(false);
  const autoSaveTimerRef = useRef<number | undefined>(undefined);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraft(resume.profile);
    setCompany(resume.company || "");
    setPosition(resume.position || "");
    setPhoneCountryCode(resume.profile.extraFields?.[PHONE_COUNTRY_CODE_KEY] || "+86");
    setExtraRows(initialExtraRows(resume.profile));
    setSaved(false);
    setAutoSaved(false);
    isDirtyRef.current = false;
  }, [resume.id, resume.profile]);

  const completion = useMemo(() => {
    const expected = 18 + draft.education.length * 8 + draft.experiences.length * 5 + draft.projects.length * 5;
    return Math.min(100, Math.round((countProfileFields(draft) / Math.max(expected, 1)) * 100));
  }, [draft]);

  const markDirty = () => {
    isDirtyRef.current = true;
    setSaved(false);
    setAutoSaved(false);
  };

  const set = <K extends keyof PersonalProfile>(key: K, value: PersonalProfile[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    markDirty();
  };

  const toggle = (key: EditorSectionKey) => {
    setActiveSection(key);
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleEntry = (id: string) => {
    setExpandedEntries((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllEntriesInSection = (ids: string[]) => {
    if (!ids.length) return;
    const allOpen = ids.every((id) => expandedEntries.has(id));
    setExpandedEntries((current) => {
      const next = new Set(current);
      if (allOpen) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const jumpToSection = (key: EditorSectionKey) => {
    setActiveSection(key);
    setOpenSections((current) => new Set(current).add(key));
    window.setTimeout(() => {
      document.getElementById(`resume-section-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  useEffect(() => {
    let frame = 0;
    const container = contentRef.current;
    const updateActiveSection = () => {
      frame = 0;
      const anchor = container
        ? container.getBoundingClientRect().top + 100
        : window.scrollY + (window.innerWidth <= 900 ? 135 : 110);
      let current: EditorSectionKey = SECTION_INDEX[0].key;
      SECTION_INDEX.forEach((item) => {
        const section = document.getElementById(`resume-section-${item.key}`);
        if (!section) return;
        const top = section.getBoundingClientRect().top;
        if (container) {
          if (top <= anchor) current = item.key;
        } else {
          if (top + window.scrollY <= anchor) current = item.key;
        }
      });
      setActiveSection((previous) => (previous === current ? previous : current));
    };
    const handleScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateActiveSection);
    };
    updateActiveSection();
    container?.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      container?.removeEventListener("scroll", handleScroll);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [resume.id]);

  const save = async (isAuto = false) => {
    if (saving) return;
    setSaving(true);
    try {
      const metadata = Object.fromEntries(
        Object.entries(draft.extraFields || {}).filter(([key]) => INTERNAL_EXTRA_KEYS.has(key))
      );
      const customFields = Object.fromEntries(
        extraRows
          .filter((row) => row.key.trim() && row.value.trim())
          .map((row) => [row.key.trim(), row.value.trim()])
      );
      await onSave(
        { ...draft, extraFields: { ...metadata, ...customFields, [PHONE_COUNTRY_CODE_KEY]: phoneCountryCode } },
        {
          company: company.trim(),
          position: position.trim(),
          manual: resume.archiveNameSource === "manual" ||
            company.trim() !== (resume.company || "").trim() ||
            position.trim() !== (resume.position || "").trim()
        }
      );
      setSaved(true);
      if (isAuto) {
        setAutoSaved(true);
        setTimeout(() => setAutoSaved(false), 2800);
      }
      isDirtyRef.current = false;
    } finally {
      setSaving(false);
    }
  };

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [draft, company, position, phoneCountryCode, extraRows]);

  // Debounced auto-save (2000ms idle)
  useEffect(() => {
    if (!isDirtyRef.current || saving) return;
    window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      if (isDirtyRef.current && !saving) {
        void save(true);
      }
    }, 2000);
    return () => window.clearTimeout(autoSaveTimerRef.current);
  }, [draft, company, position, phoneCountryCode, extraRows, saving]);

  // Undo removal helper
  const triggerRemovalWithUndo = (title: string, removeFn: () => void, restoreFn: () => void) => {
    removeFn();
    markDirty();
    window.clearTimeout(undoTimerRef.current);
    const toastId = newId("undo");
    setUndoToast({
      id: toastId,
      title,
      restore: () => {
        restoreFn();
        markDirty();
        setUndoToast(null);
        window.clearTimeout(undoTimerRef.current);
      }
    });
    undoTimerRef.current = window.setTimeout(() => {
      setUndoToast((curr) => (curr?.id === toastId ? null : curr));
    }, 5000);
  };

  // Drag and drop handlers
  const handleDragStart = (id: string) => (e: React.DragEvent) => {
    setDraggingEntryId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverEntryId !== id) {
      setDragOverEntryId(id);
    }
  };

  const handleDragEnd = () => {
    setDraggingEntryId(null);
    setDragOverEntryId(null);
  };

  const createDropHandler = <T extends { id?: string }>(
    list: T[],
    onReorder: (newList: T[]) => void
  ) => (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggingEntryId || draggingEntryId === targetId) {
      handleDragEnd();
      return;
    }
    const sourceIndex = list.findIndex((item, i) => (item.id || String(i)) === draggingEntryId);
    const targetIndex = list.findIndex((item, i) => (item.id || String(i)) === targetId);
    if (sourceIndex >= 0 && targetIndex >= 0) {
      const next = [...list];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      onReorder(next);
      markDirty();
    }
    handleDragEnd();
  };

  // Update handlers
  const updateEducation = (id: string, patch: Partial<ProfileEducation>) => {
    setDraft((current) => ({ ...current, education: current.education.map((item) => item.id === id ? { ...item, ...patch } : item) }));
    markDirty();
  };
  const updateExperience = (id: string, patch: Partial<ProfileExperience>) => {
    setDraft((current) => ({ ...current, experiences: current.experiences.map((item) => item.id === id ? { ...item, ...patch } : item) }));
    markDirty();
  };
  const updateProject = (id: string, patch: Partial<ProfileProject>) => {
    setDraft((current) => ({ ...current, projects: current.projects.map((item) => item.id === id ? { ...item, ...patch } : item) }));
    markDirty();
  };
  const updateCampus = (id: string, patch: Partial<ProfileCampusExperience>) => {
    setDraft((current) => ({ ...current, campusExperiences: current.campusExperiences.map((item) => item.id === id ? { ...item, ...patch } : item) }));
    markDirty();
  };
  const updateAward = (id: string, patch: Partial<ProfileAward>) => {
    setDraft((current) => ({ ...current, awards: current.awards.map((item) => item.id === id ? { ...item, ...patch } : item) }));
    markDirty();
  };
  const updateProfileRecord = (collection: ProfileRecordKey, index: number, field: string, value: string) => {
    setDraft((current) => {
      const records = [...(current[collection] || [])];
      records[index] = { ...records[index], [field]: value };
      return { ...current, [collection]: records };
    });
    markDirty();
  };
  const addProfileRecord = (collection: ProfileRecordKey, record: Record<string, string>) => {
    const recordId = record.id || newId(collection);
    setDraft((current) => ({ ...current, [collection]: [...(current[collection] || []), { ...record, id: recordId }] }));
    setExpandedEntries((curr) => new Set(curr).add(recordId));
    markDirty();
  };
  const removeProfileRecord = (collection: ProfileRecordKey, index: number) => {
    setDraft((current) => ({ ...current, [collection]: (current[collection] || []).filter((_, itemIndex) => itemIndex !== index) }));
    markDirty();
  };

  const removeProfileRecordWithUndo = (collection: ProfileRecordKey, index: number, title: string) => {
    const item = (draft[collection] || [])[index];
    if (!item) return;
    triggerRemovalWithUndo(
      title,
      () => removeProfileRecord(collection, index),
      () => {
        setDraft((curr) => {
          const next = [...(curr[collection] || [])];
          next.splice(index, 0, item);
          return { ...curr, [collection]: next };
        });
      }
    );
  };

  const removeEducation = (id: string) => {
    const item = draft.education.find((e) => e.id === id);
    if (!item) return;
    const index = draft.education.indexOf(item);
    triggerRemovalWithUndo(
      item.school || "教育经历",
      () => set("education", draft.education.filter((e) => e.id !== id)),
      () => {
        setDraft((curr) => {
          const next = [...curr.education];
          next.splice(index, 0, item);
          return { ...curr, education: next };
        });
      }
    );
  };

  const removeExperience = (id: string) => {
    const item = draft.experiences.find((e) => e.id === id);
    if (!item) return;
    const index = draft.experiences.indexOf(item);
    const kindName = resolveProfileExperienceKind(item) === "internship" ? "实习经历" : "工作经历";
    triggerRemovalWithUndo(
      item.organization || kindName,
      () => set("experiences", draft.experiences.filter((e) => e.id !== id)),
      () => {
        setDraft((curr) => {
          const next = [...curr.experiences];
          next.splice(index, 0, item);
          return { ...curr, experiences: next };
        });
      }
    );
  };

  const removeProject = (id: string) => {
    const item = draft.projects.find((p) => p.id === id);
    if (!item) return;
    const index = draft.projects.indexOf(item);
    triggerRemovalWithUndo(
      item.name || "项目经历",
      () => set("projects", draft.projects.filter((p) => p.id !== id)),
      () => {
        setDraft((curr) => {
          const next = [...curr.projects];
          next.splice(index, 0, item);
          return { ...curr, projects: next };
        });
      }
    );
  };

  const removeCampus = (id: string) => {
    const item = draft.campusExperiences.find((c) => c.id === id);
    if (!item) return;
    const index = draft.campusExperiences.indexOf(item);
    triggerRemovalWithUndo(
      item.type || "在校经历",
      () => set("campusExperiences", draft.campusExperiences.filter((c) => c.id !== id)),
      () => {
        setDraft((curr) => {
          const next = [...curr.campusExperiences];
          next.splice(index, 0, item);
          return { ...curr, campusExperiences: next };
        });
      }
    );
  };

  const removeAward = (id: string) => {
    const item = draft.awards.find((a) => a.id === id);
    if (!item) return;
    const index = draft.awards.indexOf(item);
    triggerRemovalWithUndo(
      item.name || "获奖记录",
      () => set("awards", draft.awards.filter((a) => a.id !== id)),
      () => {
        setDraft((curr) => {
          const next = [...curr.awards];
          next.splice(index, 0, item);
          return { ...curr, awards: next };
        });
      }
    );
  };

  const addExtra = (key = "") => setExtraRows((current) => {
    if (key && current.some((row) => row.key === key)) return current;
    markDirty();
    return [...current, { id: newId("extra"), key, value: "" }];
  });

  const internshipExperiences = draft.experiences.filter(
    (experience) => resolveProfileExperienceKind(experience) === "internship"
  );
  const workExperiences = draft.experiences.filter(
    (experience) => resolveProfileExperienceKind(experience) === "work"
  );

  const onReorderInternships = (newInternships: ProfileExperience[]) => {
    set("experiences", [...newInternships, ...workExperiences]);
  };
  const onReorderWork = (newWork: ProfileExperience[]) => {
    set("experiences", [...internshipExperiences, ...newWork]);
  };

  const addExperience = (kind: ProfileExperienceKind) => {
    const entryId = newId(kind === "internship" ? "internship" : "work");
    set("experiences", [
      ...draft.experiences,
      {
        id: entryId,
        kind,
        organization: "",
        title: "",
        startDate: "",
        endDate: "",
        description: ""
      }
    ]);
    setExpandedEntries((curr) => new Set(curr).add(entryId));
  };

  return (
    <div className="resume-editor">
      <div className="resume-editor-layout">
        <nav className="resume-editor-index" aria-label="网申资料库字段导航">
          <span className="resume-editor-index-title">网申资料库</span>
          <div className="resume-editor-index-list">
            {SECTION_INDEX.map((item) => (
              <button
                key={item.key}
                className={activeSection === item.key ? "active" : ""}
                onClick={() => jumpToSection(item.key)}
                aria-current={activeSection === item.key ? "location" : undefined}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>
        <div className="resume-editor-content" ref={contentRef}>
          <header className="resume-editor-header">
            <div className="resume-editor-heading">
              <button className="resume-editor-back" onClick={onBack}><ArrowLeft size={16} />简历库</button>
              <div className="resume-editor-title-row">
                <div>
                  <h1>{resume.name}</h1>
                  <div className="resume-editor-archive-fields">
                    <label><span>归档公司</span><input value={company} onChange={(event) => { setCompany(event.target.value); markDirty(); }} placeholder="例如：杭州新麦科技有限公司" /></label>
                    <label><span>归档岗位</span><input value={position} onChange={(event) => { setPosition(event.target.value); markDirty(); }} placeholder="例如：产品运营实习生" /></label>
                  </div>
                </div>
              </div>
            </div>
            <div className="resume-editor-actions">
              {active ? <span className="resume-current-badge"><Check size={13} />当前网申简历</span> : <button className="resume-editor-activate" onClick={onActivate}><Star size={14} />设为当前</button>}
              <button className="resume-more" onClick={onDelete} aria-label="删除简历"><Trash2 size={16} /></button>
            </div>
          </header>

          <div className="resume-editor-summary">
            <div><strong>{completion}%</strong><span>资料完整度</span></div>
            <i><b style={{ width: `${completion}%` }} /></i>
            <span className="resume-editor-summary-note">
              <ShieldCheck size={14} />
              信息仅保存在本地 · 支持 Ctrl+S 快捷保存与自动防抖存储
            </span>
          </div>

          <div className="resume-editor-section-list">
            <EditorSection
              keyName="basic"
              title="基本与个人信息"
              description="姓名、联系方式、个人背景与证件信息"
              icon={<UserRound size={17} />}
              open={openSections.has("basic")}
              onToggle={toggle}
            >
              <div className="resume-editor-subgroup">
                <div className="resume-editor-subgroup-title">基础联系</div>
                <div className="resume-editor-grid">
                  <EditorField label="姓名" required><input value={draft.fullName} onChange={(event) => set("fullName", event.target.value)} /></EditorField>
                  <EditorField label="性别"><select value={draft.gender} onChange={(event) => set("gender", event.target.value)}><option value="">请选择</option><option>男</option><option>女</option><option>不便透露</option></select></EditorField>
                  <EditorField label="手机号" required>
                    <div className="resume-editor-phone-field">
                      <select
                        aria-label="手机国家或地区区号"
                        value={phoneCountryCode}
                        onChange={(event) => { setPhoneCountryCode(event.target.value); markDirty(); }}
                      >
                        {PHONE_COUNTRY_CODES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <input
                        aria-label="手机号码"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel-national"
                        value={draft.phone}
                        onChange={(event) => set("phone", event.target.value)}
                      />
                    </div>
                  </EditorField>
                  <EditorField label="邮箱" required><input type="email" value={draft.email} onChange={(event) => set("email", event.target.value)} /></EditorField>
                  <EditorField label="出生日期"><input type="date" value={draft.birthDate} onChange={(event) => set("birthDate", event.target.value)} /></EditorField>
                  <EditorField label="毕业时间"><input type="month" value={monthInputValue(draft.graduationDate)} onChange={(event) => set("graduationDate", event.target.value)} /></EditorField>
                  <EditorField label="现居城市"><input value={draft.currentCity} onChange={(event) => set("currentCity", event.target.value)} /></EditorField>
                  <EditorField label="籍贯 / 户籍"><input value={draft.nativePlace} onChange={(event) => set("nativePlace", event.target.value)} /></EditorField>
                  <EditorField label="身高（厘米）"><input inputMode="numeric" value={draft.height} onChange={(event) => set("height", event.target.value)} /></EditorField>
                  <EditorField label="体重（公斤）"><input inputMode="decimal" value={draft.weight} onChange={(event) => set("weight", event.target.value)} /></EditorField>
                  <EditorField label="是否统招"><select value={draft.recruitmentType} onChange={(event) => set("recruitmentType", event.target.value)}><option value="">请选择</option><option>是</option><option>否</option></select></EditorField>
                  <EditorField label="应届 / 往届"><select value={draft.graduateStatus} onChange={(event) => set("graduateStatus", event.target.value)}><option value="">请选择</option><option>应届</option><option>往届</option></select></EditorField>
                  <EditorField label="联系地址" wide><input value={draft.address} onChange={(event) => set("address", event.target.value)} /></EditorField>
                </div>
              </div>

              <div className="resume-editor-subgroup">
                <div className="resume-editor-subgroup-title">个人背景</div>
                <div className="resume-editor-grid">
                  <EditorField label="微信号"><input value={draft.wechat || ""} onChange={(event) => set("wechat", event.target.value)} /></EditorField>
                  <EditorField label="QQ"><input value={draft.qq || ""} onChange={(event) => set("qq", event.target.value)} /></EditorField>
                  <EditorField label="民族"><input value={draft.nationality || ""} onChange={(event) => set("nationality", event.target.value)} /></EditorField>
                  <EditorField label="婚姻状况"><select value={draft.maritalStatus || ""} onChange={(event) => set("maritalStatus", event.target.value)}><option value="">请选择</option><option>未婚</option><option>已婚</option><option>其他</option></select></EditorField>
                  <EditorField label="生源地"><input value={draft.studentSource || ""} onChange={(event) => set("studentSource", event.target.value)} placeholder="例如：河北省秦皇岛市" /></EditorField>
                  <EditorField label="当前居住地"><input value={draft.currentResidence || ""} onChange={(event) => set("currentResidence", event.target.value)} /></EditorField>
                  <EditorField label="国家 / 地区"><input value={draft.countryRegion || ""} onChange={(event) => set("countryRegion", event.target.value)} placeholder="例如：中国大陆" /></EditorField>
                  <EditorField label="工作年限"><input value={draft.workYears || ""} onChange={(event) => set("workYears", event.target.value)} placeholder="例如：0 年" /></EditorField>
                  <EditorField label="健康状况"><input value={draft.healthStatus || ""} onChange={(event) => set("healthStatus", event.target.value)} /></EditorField>
                  <EditorField label="个人特长"><input value={draft.specialty || ""} onChange={(event) => set("specialty", event.target.value)} /></EditorField>
                </div>
              </div>

              <div className="resume-editor-subgroup">
                <div className="resume-editor-subgroup-title">证件与政治</div>
                <div className="resume-editor-grid">
                  <EditorField label="政治面貌"><select value={draft.politicalStatus || ""} onChange={(event) => set("politicalStatus", event.target.value)}><option value="">请选择</option><option>中共党员</option><option>中共预备党员</option><option>共青团员</option><option>群众</option><option>其他党派</option></select></EditorField>
                  <EditorField label="证件类型"><select value={draft.idType || ""} onChange={(event) => set("idType", event.target.value)}><option value="">请选择</option><option>居民身份证</option><option>护照</option><option>港澳居民来往内地通行证</option><option>台湾居民来往大陆通行证</option><option>其他</option></select></EditorField>
                  <EditorField label="证件号码" wide>
                    <div className="resume-editor-sensitive-field">
                      <input
                        type={showIdNumber ? "text" : "password"}
                        autoComplete="off"
                        value={draft.idNumber || ""}
                        onChange={(event) => set("idNumber", event.target.value)}
                        placeholder="仅本地保存，网申需要时才填写"
                      />
                      <button
                        type="button"
                        className="resume-editor-sensitive-toggle"
                        onClick={() => setShowIdNumber(!showIdNumber)}
                        title={showIdNumber ? "隐藏证件号码" : "显示证件号码"}
                        aria-label={showIdNumber ? "隐藏证件号码" : "显示证件号码"}
                      >
                        {showIdNumber ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </EditorField>
                </div>
              </div>
            </EditorSection>

            <EditorSection keyName="preference" title="求职偏好" description="目标岗位、城市、到岗时间与个人链接" icon={<CircleUserRound size={17} />} open={openSections.has("preference")} onToggle={toggle}>
              <div className="resume-editor-grid">
                <EditorField label="目标岗位"><input value={draft.targetRole} onChange={(event) => set("targetRole", event.target.value)} /></EditorField>
                <EditorField label="意向城市"><input value={draft.targetCities} onChange={(event) => set("targetCities", event.target.value)} placeholder="例如：北京、上海" /></EditorField>
                <EditorField label="最早到岗"><input type="date" value={draft.earliestStartDate} onChange={(event) => set("earliestStartDate", event.target.value)} /></EditorField>
                <EditorField label="期望薪资"><input value={draft.expectedSalary || ""} onChange={(event) => set("expectedSalary", event.target.value)} placeholder="例如：15k · 14 薪" /></EditorField>
                <EditorField label="作品集"><input type="url" value={draft.portfolioUrl} onChange={(event) => set("portfolioUrl", event.target.value)} /></EditorField>
                <EditorField label="GitHub" wide><div className="resume-editor-input-with-icon"><Link2 size={14} /><input type="url" value={draft.githubUrl} onChange={(event) => set("githubUrl", event.target.value)} /></div></EditorField>
              </div>
            </EditorSection>

            <EditorSection
              keyName="education"
              title="教育经历"
              description={`${draft.education.length} 段经历 · 支持拖拽排序与折叠`}
              icon={<GraduationCap size={17} />}
              open={openSections.has("education")}
              onToggle={toggle}
              action="添加教育经历"
              onAction={() => {
                const eduId = newId("edu");
                set("education", [...draft.education, { id: eduId, school: "", college: "", major: "", degree: "", educationForm: "", startDate: "", endDate: "", gpa: "" }]);
                setExpandedEntries((curr) => new Set(curr).add(eduId));
              }}
              toggleAllAction={draft.education.length > 0 ? (draft.education.every((e) => expandedEntries.has(e.id)) ? "全部收起" : "全部展开") : undefined}
              onToggleAll={() => toggleAllEntriesInSection(draft.education.map((e) => e.id))}
            >
              {draft.education.map((item) => {
                const isItemOpen = expandedEntries.has(item.id);
                return (
                  <EditorEntry
                    key={item.id}
                    id={item.id}
                    title={item.school || "新教育经历"}
                    subtitle={[item.degree, item.major].filter(Boolean).join(" · ")}
                    dateRange={formatDateRange(item.startDate, item.endDate)}
                    badge={item.educationForm || undefined}
                    open={isItemOpen}
                    onToggle={() => toggleEntry(item.id)}
                    onRemove={() => removeEducation(item.id)}
                    onDragStart={handleDragStart(item.id)}
                    onDragOver={handleDragOver(item.id)}
                    onDragEnd={handleDragEnd}
                    onDrop={createDropHandler(draft.education, (next) => set("education", next))(item.id)}
                    isDragging={draggingEntryId === item.id}
                    isDragOver={dragOverEntryId === item.id}
                  >
                    <div className="resume-editor-grid">
                      <EditorField label="学校"><input value={item.school} onChange={(event) => updateEducation(item.id, { school: event.target.value })} /></EditorField>
                      <EditorField label="学院"><input value={item.college || ""} onChange={(event) => updateEducation(item.id, { college: event.target.value })} placeholder="例如：计算机学院" /></EditorField>
                      <EditorField label="专业"><input value={item.major} onChange={(event) => updateEducation(item.id, { major: event.target.value })} /></EditorField>
                      <EditorField label="学历"><input value={item.degree} onChange={(event) => updateEducation(item.id, { degree: event.target.value })} /></EditorField>
                      <EditorField label="学习形式">
                        <select value={item.educationForm || ""} onChange={(event) => updateEducation(item.id, { educationForm: event.target.value })}>
                          <option value="">请选择</option>
                          {item.educationForm && !EDUCATION_FORM_OPTIONS.includes(item.educationForm as typeof EDUCATION_FORM_OPTIONS[number]) && <option value={item.educationForm}>{item.educationForm}</option>}
                          {EDUCATION_FORM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </EditorField>
                      <EditorField label="GPA / 排名"><input value={item.gpa} onChange={(event) => updateEducation(item.id, { gpa: event.target.value })} /></EditorField>
                      <EditorField label="开始时间"><input type="month" value={monthInputValue(item.startDate)} onChange={(event) => updateEducation(item.id, { startDate: event.target.value })} /></EditorField>
                      <EditorField label="结束时间"><input type="month" value={monthInputValue(item.endDate)} onChange={(event) => updateEducation(item.id, { endDate: event.target.value })} /></EditorField>
                    </div>
                  </EditorEntry>
                );
              })}
              {draft.education.length === 0 && <EmptyEditorEntry text="还没有教育经历，点击添加" onClick={() => {
                const eduId = newId("edu");
                set("education", [{ id: eduId, school: "", college: "", major: "", degree: "", educationForm: "", startDate: "", endDate: "", gpa: "" }]);
                setExpandedEntries((curr) => new Set(curr).add(eduId));
              }} />}
            </EditorSection>

            <EditorSection
              keyName="internships"
              title="实习经历"
              description={`${internshipExperiences.length} 段实习 · 独立维护与展示`}
              icon={<BriefcaseBusiness size={17} />}
              open={openSections.has("internships")}
              onToggle={toggle}
              action="添加实习经历"
              onAction={() => addExperience("internship")}
              toggleAllAction={internshipExperiences.length > 0 ? (internshipExperiences.every((e) => expandedEntries.has(e.id)) ? "全部收起" : "全部展开") : undefined}
              onToggleAll={() => toggleAllEntriesInSection(internshipExperiences.map((e) => e.id))}
            >
              {internshipExperiences.map((item) => {
                const isItemOpen = expandedEntries.has(item.id);
                return (
                  <EditorEntry
                    key={item.id}
                    id={item.id}
                    title={item.organization || "新实习经历"}
                    subtitle={item.title}
                    dateRange={formatDateRange(item.startDate, item.endDate)}
                    badge="实习"
                    open={isItemOpen}
                    onToggle={() => toggleEntry(item.id)}
                    onRemove={() => removeExperience(item.id)}
                    onDragStart={handleDragStart(item.id)}
                    onDragOver={handleDragOver(item.id)}
                    onDragEnd={handleDragEnd}
                    onDrop={createDropHandler(internshipExperiences, onReorderInternships)(item.id)}
                    isDragging={draggingEntryId === item.id}
                    isDragOver={dragOverEntryId === item.id}
                  >
                    <div className="resume-editor-grid">
                      <EditorField label="经历类别">
                        <select value={resolveProfileExperienceKind(item)} onChange={(event) => updateExperience(item.id, { kind: event.target.value as ProfileExperienceKind })}>
                          <option value="internship">实习经历</option>
                          <option value="work">工作经历</option>
                        </select>
                      </EditorField>
                      <EditorField label="实习单位 / 组织"><input value={item.organization} onChange={(event) => updateExperience(item.id, { organization: event.target.value })} /></EditorField>
                      <EditorField label="实习岗位"><input value={item.title} onChange={(event) => updateExperience(item.id, { title: event.target.value })} /></EditorField>
                      <EditorField label="开始时间"><input type="month" value={monthInputValue(item.startDate)} onChange={(event) => updateExperience(item.id, { startDate: event.target.value })} /></EditorField>
                      <EditorField label="结束时间"><input type="month" value={monthInputValue(item.endDate)} onChange={(event) => updateExperience(item.id, { endDate: event.target.value })} /></EditorField>
                      <EditorField label="实习内容" wide><textarea rows={5} value={item.description} onChange={(event) => updateExperience(item.id, { description: event.target.value })} placeholder="写清楚负责内容、方法和结果" /></EditorField>
                    </div>
                  </EditorEntry>
                );
              })}
              {internshipExperiences.length === 0 && <EmptyEditorEntry text="还没有实习经历，点击添加" onClick={() => addExperience("internship")} />}
            </EditorSection>

            <EditorSection
              keyName="work"
              title="工作经历"
              description={`${workExperiences.length} 段工作 · 独立维护与展示`}
              icon={<BriefcaseBusiness size={17} />}
              open={openSections.has("work")}
              onToggle={toggle}
              action="添加工作经历"
              onAction={() => addExperience("work")}
              toggleAllAction={workExperiences.length > 0 ? (workExperiences.every((e) => expandedEntries.has(e.id)) ? "全部收起" : "全部展开") : undefined}
              onToggleAll={() => toggleAllEntriesInSection(workExperiences.map((e) => e.id))}
            >
              {workExperiences.map((item) => {
                const isItemOpen = expandedEntries.has(item.id);
                return (
                  <EditorEntry
                    key={item.id}
                    id={item.id}
                    title={item.organization || "新工作经历"}
                    subtitle={item.title}
                    dateRange={formatDateRange(item.startDate, item.endDate)}
                    badge="全职"
                    open={isItemOpen}
                    onToggle={() => toggleEntry(item.id)}
                    onRemove={() => removeExperience(item.id)}
                    onDragStart={handleDragStart(item.id)}
                    onDragOver={handleDragOver(item.id)}
                    onDragEnd={handleDragEnd}
                    onDrop={createDropHandler(workExperiences, onReorderWork)(item.id)}
                    isDragging={draggingEntryId === item.id}
                    isDragOver={dragOverEntryId === item.id}
                  >
                    <div className="resume-editor-grid">
                      <EditorField label="经历类别">
                        <select value={resolveProfileExperienceKind(item)} onChange={(event) => updateExperience(item.id, { kind: event.target.value as ProfileExperienceKind })}>
                          <option value="work">工作经历</option>
                          <option value="internship">实习经历</option>
                        </select>
                      </EditorField>
                      <EditorField label="工作单位 / 公司"><input value={item.organization} onChange={(event) => updateExperience(item.id, { organization: event.target.value })} /></EditorField>
                      <EditorField label="工作职位"><input value={item.title} onChange={(event) => updateExperience(item.id, { title: event.target.value })} /></EditorField>
                      <EditorField label="开始时间"><input type="month" value={monthInputValue(item.startDate)} onChange={(event) => updateExperience(item.id, { startDate: event.target.value })} /></EditorField>
                      <EditorField label="结束时间"><input type="month" value={monthInputValue(item.endDate)} onChange={(event) => updateExperience(item.id, { endDate: event.target.value })} /></EditorField>
                      <EditorField label="工作内容" wide><textarea rows={5} value={item.description} onChange={(event) => updateExperience(item.id, { description: event.target.value })} placeholder="写清楚负责内容、方法和结果" /></EditorField>
                    </div>
                  </EditorEntry>
                );
              })}
              {workExperiences.length === 0 && <EmptyEditorEntry text="还没有工作经历，点击添加" onClick={() => addExperience("work")} />}
            </EditorSection>

            <EditorSection
              keyName="projects"
              title="项目经历"
              description={`${draft.projects.length} 个项目 · 产品、研究或比赛均可添加`}
              icon={<FileCheck2 size={17} />}
              open={openSections.has("projects")}
              onToggle={toggle}
              action="添加项目经历"
              onAction={() => {
                const projId = newId("project");
                set("projects", [...draft.projects, { id: projId, name: "", role: "", startDate: "", endDate: "", description: "" }]);
                setExpandedEntries((curr) => new Set(curr).add(projId));
              }}
              toggleAllAction={draft.projects.length > 0 ? (draft.projects.every((e) => expandedEntries.has(e.id)) ? "全部收起" : "全部展开") : undefined}
              onToggleAll={() => toggleAllEntriesInSection(draft.projects.map((e) => e.id))}
            >
              {draft.projects.map((item) => {
                const isItemOpen = expandedEntries.has(item.id);
                return (
                  <EditorEntry
                    key={item.id}
                    id={item.id}
                    title={item.name || "新项目经历"}
                    subtitle={item.role}
                    dateRange={formatDateRange(item.startDate, item.endDate)}
                    open={isItemOpen}
                    onToggle={() => toggleEntry(item.id)}
                    onRemove={() => removeProject(item.id)}
                    onDragStart={handleDragStart(item.id)}
                    onDragOver={handleDragOver(item.id)}
                    onDragEnd={handleDragEnd}
                    onDrop={createDropHandler(draft.projects, (next) => set("projects", next))(item.id)}
                    isDragging={draggingEntryId === item.id}
                    isDragOver={dragOverEntryId === item.id}
                  >
                    <div className="resume-editor-grid">
                      <EditorField label="项目名称"><input value={item.name} onChange={(event) => updateProject(item.id, { name: event.target.value })} /></EditorField>
                      <EditorField label="担任角色"><input value={item.role} onChange={(event) => updateProject(item.id, { role: event.target.value })} placeholder="例如：负责人、核心开发" /></EditorField>
                      <EditorField label="开始时间"><input type="month" value={monthInputValue(item.startDate)} onChange={(event) => updateProject(item.id, { startDate: event.target.value })} /></EditorField>
                      <EditorField label="结束时间"><input type="month" value={monthInputValue(item.endDate)} onChange={(event) => updateProject(item.id, { endDate: event.target.value })} /></EditorField>
                      <EditorField label="项目描述" wide><textarea rows={5} value={item.description} onChange={(event) => updateProject(item.id, { description: event.target.value })} placeholder="描述项目背景、目标、使用方法和最终产出" /></EditorField>
                    </div>
                  </EditorEntry>
                );
              })}
              {draft.projects.length === 0 && <EmptyEditorEntry text="还没有项目经历，点击添加" onClick={() => {
                const projId = newId("project");
                set("projects", [...draft.projects, { id: projId, name: "", role: "", startDate: "", endDate: "", description: "" }]);
                setExpandedEntries((curr) => new Set(curr).add(projId));
              }} />}
            </EditorSection>

            <EditorSection
              keyName="campus"
              title="在校经历"
              description={`${draft.campusExperiences.length} 段在校经历 · 学生会、社团或活动`}
              icon={<GraduationCap size={17} />}
              open={openSections.has("campus")}
              onToggle={toggle}
              action="添加在校经历"
              onAction={() => {
                const campusId = newId("campus");
                set("campusExperiences", [...draft.campusExperiences, { id: campusId, type: "", role: "", startDate: "", endDate: "", description: "" }]);
                setExpandedEntries((curr) => new Set(curr).add(campusId));
              }}
              toggleAllAction={draft.campusExperiences.length > 0 ? (draft.campusExperiences.every((e) => expandedEntries.has(e.id)) ? "全部收起" : "全部展开") : undefined}
              onToggleAll={() => toggleAllEntriesInSection(draft.campusExperiences.map((e) => e.id))}
            >
              {draft.campusExperiences.map((item) => {
                const isItemOpen = expandedEntries.has(item.id);
                return (
                  <EditorEntry
                    key={item.id}
                    id={item.id}
                    title={item.type || "新在校经历"}
                    subtitle={item.role}
                    dateRange={formatDateRange(item.startDate, item.endDate)}
                    open={isItemOpen}
                    onToggle={() => toggleEntry(item.id)}
                    onRemove={() => removeCampus(item.id)}
                    onDragStart={handleDragStart(item.id)}
                    onDragOver={handleDragOver(item.id)}
                    onDragEnd={handleDragEnd}
                    onDrop={createDropHandler(draft.campusExperiences, (next) => set("campusExperiences", next))(item.id)}
                    isDragging={draggingEntryId === item.id}
                    isDragOver={dragOverEntryId === item.id}
                  >
                    <div className="resume-editor-grid">
                      <EditorField label="经历类型"><input value={item.type} onChange={(event) => updateCampus(item.id, { type: event.target.value })} placeholder="例如：学生会、志愿服务" /></EditorField>
                      <EditorField label="担任角色"><input value={item.role} onChange={(event) => updateCampus(item.id, { role: event.target.value })} /></EditorField>
                      <EditorField label="开始时间"><input type="month" value={monthInputValue(item.startDate)} onChange={(event) => updateCampus(item.id, { startDate: event.target.value })} /></EditorField>
                      <EditorField label="结束时间"><input type="month" value={monthInputValue(item.endDate)} onChange={(event) => updateCampus(item.id, { endDate: event.target.value })} /></EditorField>
                      <EditorField label="经历描述" wide><textarea rows={4} value={item.description} onChange={(event) => updateCampus(item.id, { description: event.target.value })} /></EditorField>
                    </div>
                  </EditorEntry>
                );
              })}
              {draft.campusExperiences.length === 0 && <EmptyEditorEntry text="还没有在校经历，点击添加" onClick={() => {
                const campusId = newId("campus");
                set("campusExperiences", [{ id: campusId, type: "", role: "", startDate: "", endDate: "", description: "" }]);
                setExpandedEntries((curr) => new Set(curr).add(campusId));
              }} />}
            </EditorSection>

            <EditorSection
              keyName="skills"
              title="技能、语言与荣誉"
              description={`${(draft.languages?.length || 0) + (draft.qualifications?.length || 0) + draft.awards.length} 项外语、资格证书与获奖荣誉`}
              icon={<Trophy size={17} />}
              open={openSections.has("skills")}
              onToggle={toggle}
            >
              <div className="resume-editor-subgroup">
                <div className="resume-editor-subgroup-head">
                  <div className="resume-editor-subgroup-title">
                    <span>外语能力</span>
                    <span className="resume-editor-subgroup-count">{draft.languages?.length || 0}</span>
                  </div>
                  <div className="resume-editor-subgroup-actions">
                    {(draft.languages?.length || 0) > 0 && (
                      <button
                        type="button"
                        className="resume-editor-section-toggle-all"
                        onClick={() => toggleAllEntriesInSection((draft.languages || []).map((item, i) => item.id || `language-${i}`))}
                      >
                        <ChevronsUpDown size={13} />
                        <span>{(draft.languages || []).every((_, i) => expandedEntries.has((draft.languages || [])[i]?.id || `language-${i}`)) ? "全部收起" : "全部展开"}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="resume-editor-subgroup-action"
                      onClick={() => addProfileRecord("languages", { id: newId("language"), name: "", certificate: "", englishLevel: "", score: "", proficiency: "", listeningSpeaking: "", readingWriting: "" })}
                    >
                      <Plus size={13} />
                      <span>添加外语能力</span>
                    </button>
                  </div>
                </div>
                {(draft.languages || []).map((item, index) => {
                  const entryId = item.id || `language-${index}`;
                  const isItemOpen = expandedEntries.has(entryId);
                  return (
                    <EditorEntry
                      key={entryId}
                      id={entryId}
                      title={item.name || "新外语能力"}
                      subtitle={[item.certificate, item.englishLevel, item.score].filter(Boolean).join(" · ")}
                      badge={item.proficiency || undefined}
                      open={isItemOpen}
                      onToggle={() => toggleEntry(entryId)}
                      onRemove={() => removeProfileRecordWithUndo("languages", index, item.name || "外语能力")}
                      onDragStart={handleDragStart(entryId)}
                      onDragOver={handleDragOver(entryId)}
                      onDragEnd={handleDragEnd}
                      onDrop={createDropHandler(draft.languages || [], (next) => set("languages", next))(entryId)}
                      isDragging={draggingEntryId === entryId}
                      isDragOver={dragOverEntryId === entryId}
                    >
                      <div className="resume-editor-grid">
                        <EditorField label="外语语种"><input value={item.name || ""} onChange={(event) => updateProfileRecord("languages", index, "name", event.target.value)} /></EditorField>
                        <EditorField label="证书名称"><input value={item.certificate || ""} onChange={(event) => updateProfileRecord("languages", index, "certificate", event.target.value)} /></EditorField>
                        <EditorField label="语言等级"><input value={item.englishLevel || ""} onChange={(event) => updateProfileRecord("languages", index, "englishLevel", event.target.value)} placeholder="例如：CET-6" /></EditorField>
                        <EditorField label="成绩"><input value={item.score || ""} onChange={(event) => updateProfileRecord("languages", index, "score", event.target.value)} /></EditorField>
                        <EditorField label="掌握程度"><input value={item.proficiency || ""} onChange={(event) => updateProfileRecord("languages", index, "proficiency", event.target.value)} placeholder="例如：熟练" /></EditorField>
                        <EditorField label="听说能力"><input value={item.listeningSpeaking || ""} onChange={(event) => updateProfileRecord("languages", index, "listeningSpeaking", event.target.value)} /></EditorField>
                        <EditorField label="读写能力"><input value={item.readingWriting || ""} onChange={(event) => updateProfileRecord("languages", index, "readingWriting", event.target.value)} /></EditorField>
                      </div>
                    </EditorEntry>
                  );
                })}
                {!(draft.languages || []).length && (
                  <EmptyEditorEntry
                    text="还没有外语能力，点击添加"
                    onClick={() => addProfileRecord("languages", { id: newId("language"), name: "", certificate: "", englishLevel: "", score: "", proficiency: "", listeningSpeaking: "", readingWriting: "" })}
                  />
                )}
              </div>

              <div className="resume-editor-subgroup">
                <div className="resume-editor-subgroup-head">
                  <div className="resume-editor-subgroup-title">
                    <span>资格证书</span>
                    <span className="resume-editor-subgroup-count">{draft.qualifications?.length || 0}</span>
                  </div>
                  <div className="resume-editor-subgroup-actions">
                    {(draft.qualifications?.length || 0) > 0 && (
                      <button
                        type="button"
                        className="resume-editor-section-toggle-all"
                        onClick={() => toggleAllEntriesInSection((draft.qualifications || []).map((item, i) => item.id || `qualification-${i}`))}
                      >
                        <ChevronsUpDown size={13} />
                        <span>{(draft.qualifications || []).every((_, i) => expandedEntries.has((draft.qualifications || [])[i]?.id || `qualification-${i}`)) ? "全部收起" : "全部展开"}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="resume-editor-subgroup-action"
                      onClick={() => addProfileRecord("qualifications", { id: newId("qualification"), date: "", name: "", number: "", description: "" })}
                    >
                      <Plus size={13} />
                      <span>添加资格证书</span>
                    </button>
                  </div>
                </div>
                {(draft.qualifications || []).map((item, index) => {
                  const entryId = item.id || `qualification-${index}`;
                  const isItemOpen = expandedEntries.has(entryId);
                  return (
                    <EditorEntry
                      key={entryId}
                      id={entryId}
                      title={item.name || "新证书"}
                      subtitle={item.number ? `编号: ${item.number}` : undefined}
                      dateRange={formatDateRange(item.date)}
                      open={isItemOpen}
                      onToggle={() => toggleEntry(entryId)}
                      onRemove={() => removeProfileRecordWithUndo("qualifications", index, item.name || "证书资格")}
                      onDragStart={handleDragStart(entryId)}
                      onDragOver={handleDragOver(entryId)}
                      onDragEnd={handleDragEnd}
                      onDrop={createDropHandler(draft.qualifications || [], (next) => set("qualifications", next))(entryId)}
                      isDragging={draggingEntryId === entryId}
                      isDragOver={dragOverEntryId === entryId}
                    >
                      <div className="resume-editor-grid">
                        <EditorField label="获得时间"><input type="month" value={monthInputValue(item.date)} onChange={(event) => updateProfileRecord("qualifications", index, "date", event.target.value)} /></EditorField>
                        <EditorField label="证书名称"><input value={item.name || ""} onChange={(event) => updateProfileRecord("qualifications", index, "name", event.target.value)} /></EditorField>
                        <EditorField label="证书编号"><input value={item.number || ""} onChange={(event) => updateProfileRecord("qualifications", index, "number", event.target.value)} /></EditorField>
                        <EditorField label="证书说明" wide><textarea rows={3} value={item.description || ""} onChange={(event) => updateProfileRecord("qualifications", index, "description", event.target.value)} /></EditorField>
                      </div>
                    </EditorEntry>
                  );
                })}
                {!(draft.qualifications || []).length && (
                  <EmptyEditorEntry
                    text="还没有证书资格，点击添加"
                    onClick={() => addProfileRecord("qualifications", { id: newId("qualification"), date: "", name: "", number: "", description: "" })}
                  />
                )}
              </div>

              <div className="resume-editor-subgroup">
                <div className="resume-editor-subgroup-head">
                  <div className="resume-editor-subgroup-title">
                    <span>获奖荣誉</span>
                    <span className="resume-editor-subgroup-count">{draft.awards.length}</span>
                  </div>
                  <div className="resume-editor-subgroup-actions">
                    {draft.awards.length > 0 && (
                      <button
                        type="button"
                        className="resume-editor-section-toggle-all"
                        onClick={() => toggleAllEntriesInSection(draft.awards.map((e) => e.id))}
                      >
                        <ChevronsUpDown size={13} />
                        <span>{draft.awards.every((e) => expandedEntries.has(e.id)) ? "全部收起" : "全部展开"}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="resume-editor-subgroup-action"
                      onClick={() => {
                        const awardId = newId("award");
                        set("awards", [...draft.awards, { id: awardId, date: "", name: "", level: "", description: "" }]);
                        setExpandedEntries((curr) => new Set(curr).add(awardId));
                      }}
                    >
                      <Plus size={13} />
                      <span>添加获奖记录</span>
                    </button>
                  </div>
                </div>
                {draft.awards.map((item) => {
                  const isItemOpen = expandedEntries.has(item.id);
                  return (
                    <EditorEntry
                      key={item.id}
                      id={item.id}
                      title={item.name || "新获奖记录"}
                      subtitle={item.level}
                      dateRange={formatDateRange(item.date)}
                      open={isItemOpen}
                      onToggle={() => toggleEntry(item.id)}
                      onRemove={() => removeAward(item.id)}
                      onDragStart={handleDragStart(item.id)}
                      onDragOver={handleDragOver(item.id)}
                      onDragEnd={handleDragEnd}
                      onDrop={createDropHandler(draft.awards, (next) => set("awards", next))(item.id)}
                      isDragging={draggingEntryId === item.id}
                      isDragOver={dragOverEntryId === item.id}
                    >
                      <div className="resume-editor-grid">
                        <EditorField label="获奖时间"><input type="month" value={monthInputValue(item.date)} onChange={(event) => updateAward(item.id, { date: event.target.value })} /></EditorField>
                        <EditorField label="奖项名称"><input value={item.name} onChange={(event) => updateAward(item.id, { name: event.target.value })} /></EditorField>
                        <EditorField label="奖励等级"><input value={item.level} onChange={(event) => updateAward(item.id, { level: event.target.value })} placeholder="例如：国家级 / 一等奖" /></EditorField>
                        <EditorField label="奖励描述" wide><textarea rows={4} value={item.description} onChange={(event) => updateAward(item.id, { description: event.target.value })} /></EditorField>
                      </div>
                    </EditorEntry>
                  );
                })}
                {draft.awards.length === 0 && (
                  <EmptyEditorEntry
                    text="还没有获奖记录，点击添加"
                    onClick={() => {
                      const awardId = newId("award");
                      set("awards", [...draft.awards, { id: awardId, date: "", name: "", level: "", description: "" }]);
                      setExpandedEntries((curr) => new Set(curr).add(awardId));
                    }}
                  />
                )}
              </div>
            </EditorSection>

            <EditorSection keyName="answers" title="自我介绍与常用回答" description="可复用的自我介绍、个人优势与职业规划" icon={<CircleUserRound size={17} />} open={openSections.has("answers")} onToggle={toggle}>
              <div className="resume-editor-long-fields">
                <EditorField label="自我介绍"><textarea rows={6} value={draft.selfIntroduction} onChange={(event) => set("selfIntroduction", event.target.value)} /></EditorField>
                <EditorField label="个人优势"><textarea rows={5} value={draft.strengths} onChange={(event) => set("strengths", event.target.value)} /></EditorField>
                <EditorField label="职业规划"><textarea rows={5} value={draft.careerPlan} onChange={(event) => set("careerPlan", event.target.value)} /></EditorField>
              </div>
            </EditorSection>

            <EditorSection
              keyName="background"
              title="家庭与补充信息"
              description="紧急联系人、家庭成员及企业专属自定义字段"
              icon={<ShieldCheck size={17} />}
              open={openSections.has("background")}
              onToggle={toggle}
            >
              <div className="resume-editor-subgroup">
                <div className="resume-editor-subgroup-head">
                  <div className="resume-editor-subgroup-title">
                    <span>紧急联系人</span>
                    <span className="resume-editor-subgroup-note">仅在企业网申明确需要时填写</span>
                  </div>
                </div>
                <div className="resume-editor-grid">
                  <EditorField label="姓名"><input value={draft.emergencyContactName || ""} onChange={(event) => set("emergencyContactName", event.target.value)} /></EditorField>
                  <EditorField label="电话"><input type="tel" value={draft.emergencyContactPhone || ""} onChange={(event) => set("emergencyContactPhone", event.target.value)} /></EditorField>
                </div>
              </div>

              <div className="resume-editor-subgroup">
                <div className="resume-editor-subgroup-head">
                  <div className="resume-editor-subgroup-title">
                    <span>家庭成员</span>
                    <span className="resume-editor-subgroup-count">{draft.familyMembers?.length || 0}</span>
                  </div>
                  <div className="resume-editor-subgroup-actions">
                    {(draft.familyMembers?.length || 0) > 0 && (
                      <button
                        type="button"
                        className="resume-editor-section-toggle-all"
                        onClick={() => toggleAllEntriesInSection((draft.familyMembers || []).map((item, i) => item.id || `family-${i}`))}
                      >
                        <ChevronsUpDown size={13} />
                        <span>{(draft.familyMembers || []).every((_, i) => expandedEntries.has((draft.familyMembers || [])[i]?.id || `family-${i}`)) ? "全部收起" : "全部展开"}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="resume-editor-subgroup-action"
                      onClick={() => addProfileRecord("familyMembers", { id: newId("family"), name: "", relation: "", phone: "", company: "", position: "", politicalStatus: "" })}
                    >
                      <Plus size={13} />
                      <span>添加家庭成员</span>
                    </button>
                  </div>
                </div>
                {(draft.familyMembers || []).map((item, index) => {
                  const entryId = item.id || `family-${index}`;
                  const isItemOpen = expandedEntries.has(entryId);
                  return (
                    <EditorEntry
                      key={entryId}
                      id={entryId}
                      title={item.name || "新家庭成员"}
                      subtitle={[item.relation, item.company, item.position].filter(Boolean).join(" · ")}
                      open={isItemOpen}
                      onToggle={() => toggleEntry(entryId)}
                      onRemove={() => removeProfileRecordWithUndo("familyMembers", index, item.name || "家庭成员")}
                      onDragStart={handleDragStart(entryId)}
                      onDragOver={handleDragOver(entryId)}
                      onDragEnd={handleDragEnd}
                      onDrop={createDropHandler(draft.familyMembers || [], (next) => set("familyMembers", next))(entryId)}
                      isDragging={draggingEntryId === entryId}
                      isDragOver={dragOverEntryId === entryId}
                    >
                      <div className="resume-editor-grid">
                        <EditorField label="姓名"><input value={item.name || ""} onChange={(event) => updateProfileRecord("familyMembers", index, "name", event.target.value)} /></EditorField>
                        <EditorField label="关系"><input value={item.relation || ""} onChange={(event) => updateProfileRecord("familyMembers", index, "relation", event.target.value)} placeholder="例如：父亲" /></EditorField>
                        <EditorField label="电话"><input type="tel" value={item.phone || ""} onChange={(event) => updateProfileRecord("familyMembers", index, "phone", event.target.value)} /></EditorField>
                        <EditorField label="公司 / 单位"><input value={item.company || ""} onChange={(event) => updateProfileRecord("familyMembers", index, "company", event.target.value)} /></EditorField>
                        <EditorField label="职位"><input value={item.position || ""} onChange={(event) => updateProfileRecord("familyMembers", index, "position", event.target.value)} /></EditorField>
                        <EditorField label="政治面貌"><input value={item.politicalStatus || ""} onChange={(event) => updateProfileRecord("familyMembers", index, "politicalStatus", event.target.value)} /></EditorField>
                      </div>
                    </EditorEntry>
                  );
                })}
                {!(draft.familyMembers || []).length && (
                  <EmptyEditorEntry
                    text="还没有家庭成员资料，点击添加"
                    onClick={() => addProfileRecord("familyMembers", { id: newId("family"), name: "", relation: "", phone: "", company: "", position: "", politicalStatus: "" })}
                  />
                )}
              </div>

              <div className="resume-editor-subgroup">
                <div className="resume-editor-subgroup-head">
                  <div className="resume-editor-subgroup-title">
                    <span>其他自定义字段</span>
                    <span className="resume-editor-subgroup-note">补充企业专属或个性化字段</span>
                  </div>
                  <div className="resume-editor-subgroup-actions">
                    <button
                      type="button"
                      className="resume-editor-subgroup-action"
                      onClick={() => addExtra()}
                    >
                      <Plus size={13} />
                      <span>添加自定义字段</span>
                    </button>
                  </div>
                </div>
                <div className="resume-editor-extra-list">
                  {extraRows.map((row) => (
                    <div className="resume-editor-extra-row" key={row.id}>
                      <input value={row.key} placeholder="字段名称，例如：英语水平" onChange={(event) => setExtraRows((current) => { markDirty(); return current.map((item) => item.id === row.id ? { ...item, key: event.target.value } : item); })} />
                      <textarea rows={2} value={row.value} placeholder="填写字段内容" onChange={(event) => setExtraRows((current) => { markDirty(); return current.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item); })} />
                      <button onClick={() => setExtraRows((current) => { markDirty(); return current.filter((item) => item.id !== row.id); })} aria-label="删除字段"><X size={15} /></button>
                    </div>
                  ))}
                  {extraRows.length === 0 && (
                    <div className="resume-editor-extra-empty">
                      <strong>暂无其他字段</strong>
                      <span>选择常用字段，或自行添加一个字段。</span>
                    </div>
                  )}
                  <div className="resume-editor-extra-suggestions" aria-label="常用字段">
                    <span>常用字段</span>
                    <div>
                      {EXTRA_FIELD_SUGGESTIONS
                        .filter((key) => !extraRows.some((row) => row.key === key))
                        .map((key) => <button key={key} onClick={() => addExtra(key)}><Plus size={13} />{key}</button>)}
                    </div>
                  </div>
                </div>
              </div>
            </EditorSection>
          </div>

          <footer className="resume-editor-footer">
            <span className="resume-editor-save-status">
              {saving ? (
                <><RefreshCw className="spin" size={14} />保存中…</>
              ) : autoSaved ? (
                <><Sparkles size={14} />已自动保存 · {countProfileFields(draft)} 个字段</>
              ) : saved ? (
                <><Check size={14} />已保存 · {countProfileFields(draft)} 个字段</>
              ) : isDirtyRef.current ? (
                <><ShieldCheck size={14} />有未保存的修改 (Ctrl+S 快速保存)</>
              ) : (
                <><ShieldCheck size={14} />请检查解析结果并保存</>
              )}
            </span>
            <div>
              <button className="resume-editor-secondary" onClick={onOpenPlugin}><ArrowRight size={14} />去一键网申</button>
              <button className="resume-editor-save" onClick={() => void save(false)} disabled={saving}>{saving ? "保存中…" : <><Save size={15} />保存这份简历</>}</button>
            </div>
          </footer>
        </div>
      </div>

      {undoToast && (
        <aside className="resume-undo-toast" role="status" aria-live="polite">
          <div className="resume-undo-content">
            <span>已移除<strong>【{undoToast.title}】</strong></span>
            <button className="resume-undo-button" onClick={undoToast.restore}>
              <RotateCcw size={13} />
              <span>撤销 (Undo)</span>
            </button>
          </div>
          <div className="resume-undo-progress" key={undoToast.id} />
        </aside>
      )}
    </div>
  );
}

function EditorSection({
  keyName,
  title,
  description: _desc,
  icon: _icon,
  open,
  onToggle,
  action,
  onAction,
  toggleAllAction,
  onToggleAll,
  children
}: {
  keyName: EditorSectionKey;
  title: string;
  description: string;
  icon: ReactNode;
  open: boolean;
  onToggle: (key: EditorSectionKey) => void;
  action?: string;
  onAction?: () => void;
  toggleAllAction?: string;
  onToggleAll?: () => void;
  children: ReactNode;
}) {
  return (
    <section id={`resume-section-${keyName}`} className={`resume-editor-section ${open ? "open" : ""}`}>
      <div className="resume-editor-section-head">
        <button onClick={() => onToggle(keyName)} aria-expanded={open}>
          <strong>{title}</strong>
          <ChevronDown className="resume-editor-section-chevron" size={17} />
        </button>
        <div className="resume-editor-section-actions">
          {toggleAllAction && onToggleAll && (
            <button
              type="button"
              className="resume-editor-section-toggle-all"
              onClick={onToggleAll}
              title={toggleAllAction}
            >
              <ChevronsUpDown size={13} />
              <span>{toggleAllAction}</span>
            </button>
          )}
          {action && (
            <button className="resume-editor-section-action" onClick={onAction}>
              <Plus size={13} />
              <span>{action}</span>
            </button>
          )}
        </div>
      </div>
      <div className="resume-editor-section-reveal">
        <div className="resume-editor-section-body">{children}</div>
      </div>
    </section>
  );
}

function EditorField({ label, wide, required, children }: { label: string; wide?: boolean; required?: boolean; children: ReactNode }) {
  return <label className={`resume-editor-field ${wide ? "wide" : ""}`}><span>{required && <em aria-hidden="true">*</em>}{label}</span>{children}</label>;
}

function EditorEntry({
  id: _id,
  title,
  subtitle,
  dateRange,
  badge,
  open,
  onToggle,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragging,
  isDragOver,
  children
}: {
  id?: string;
  title: string;
  subtitle?: string;
  dateRange?: string;
  badge?: string;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isDragging?: boolean;
  isDragOver?: boolean;
  children: ReactNode;
}) {
  return (
    <article
      className={`resume-editor-entry ${open ? "is-open" : "is-collapsed"} ${isDragging ? "is-dragging" : ""} ${isDragOver ? "is-drag-over" : ""}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <header
        className="resume-editor-entry-header"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="resume-editor-entry-meta">
          {onDragStart && (
            <span
              className="resume-editor-entry-drag"
              draggable
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onClick={(e) => e.stopPropagation()}
              title="按住拖拽调整顺序"
              aria-label="拖拽调整顺序"
            >
              <GripVertical size={14} />
            </span>
          )}
          <span className="resume-editor-entry-dot" />
          {dateRange && (
            <span className="resume-editor-entry-date">
              <Calendar size={12} />
              <span>{dateRange}</span>
            </span>
          )}
          <strong className="resume-editor-entry-title">{title}</strong>
          {subtitle && <span className="resume-editor-entry-subtitle">{subtitle}</span>}
          {badge && <span className="resume-editor-entry-badge">{badge}</span>}
        </div>
        <div className="resume-editor-entry-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="resume-editor-entry-toggle"
            onClick={onToggle}
            aria-label={open ? "收起编辑" : "展开编辑"}
            title={open ? "收起编辑" : "展开编辑"}
          >
            <ChevronDown className={`resume-editor-entry-chevron ${open ? "is-open" : ""}`} size={16} />
          </button>
          <button
            type="button"
            className="resume-editor-entry-remove"
            onClick={onRemove}
            aria-label={`删除${title}`}
            title="删除此项"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </header>
      <div className="resume-editor-entry-reveal">
        <div className="resume-editor-entry-body">{children}</div>
      </div>
    </article>
  );
}

function EmptyEditorEntry({ text, onClick }: { text: string; onClick: () => void }) {
  return <button className="resume-editor-empty-entry" onClick={onClick}><Plus size={16} /><span>{text}</span></button>;
}
