import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleUserRound,
  FileCheck2,
  GraduationCap,
  Link2,
  Plus,
  Save,
  ShieldCheck,
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

const monthInputValue = (value?: string) => {
  const match = String(value || "").match(/^(\d{4})[-/.](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}` : "";
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
  | "awards"
  | "answers"
  | "extra";

const SECTION_INDEX: Array<{ key: EditorSectionKey; label: string }> = [
  { key: "basic", label: "基本信息" },
  { key: "preference", label: "求职偏好" },
  { key: "education", label: "教育经历" },
  { key: "internships", label: "实习经历" },
  { key: "work", label: "工作经历" },
  { key: "projects", label: "项目经历" },
  { key: "campus", label: "在校经历" },
  { key: "awards", label: "获奖证书" },
  { key: "answers", label: "自我介绍" },
  { key: "extra", label: "其他字段" }
];

const INTERNAL_EXTRA_KEYS = new Set(["resumeSourceName", "parseMode"]);
const DEFAULT_EXTRA_FIELDS = [
  "专业技能",
  "语言能力",
  "证书资格",
  "政治面貌",
  "身份证号",
  "紧急联系人",
  "紧急联系电话",
  "期望薪资"
];

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function initialExtraRows(profile: PersonalProfile): ExtraRow[] {
  const stored = Object.entries(profile.extraFields || {})
    .filter(([key]) => !INTERNAL_EXTRA_KEYS.has(key))
    .map(([key, value]) => ({ id: newId("extra"), key, value }));
  const existingKeys = new Set(stored.map((row) => row.key));
  return [
    ...stored,
    ...DEFAULT_EXTRA_FIELDS.filter((key) => !existingKeys.has(key)).map((key) => ({
      id: newId("extra"),
      key,
      value: ""
    }))
  ];
}

function countProfileFields(profile: PersonalProfile) {
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
    profile.selfIntroduction,
    profile.strengths,
    profile.careerPlan,
    ...profile.education.flatMap((item) => Object.values(item)),
    ...profile.experiences.flatMap((item) => Object.values(item)),
    ...profile.projects.flatMap((item) => Object.values(item)),
    ...profile.campusExperiences.flatMap((item) => Object.values(item)),
    ...profile.awards.flatMap((item) => Object.values(item)),
    ...Object.values(profile.extraFields || {})
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
  const [extraRows, setExtraRows] = useState<ExtraRow[]>(() => initialExtraRows(resume.profile));
  const [openSections, setOpenSections] = useState<Set<EditorSectionKey>>(
    () => new Set(["basic", "preference", "education", "internships", "work", "projects", "campus", "awards", "answers", "extra"])
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<EditorSectionKey>("basic");

  useEffect(() => {
    setDraft(resume.profile);
    setCompany(resume.company || "");
    setPosition(resume.position || "");
    setExtraRows(initialExtraRows(resume.profile));
    setSaved(false);
  }, [resume.id, resume.profile]);

  const completion = useMemo(() => {
    const expected = 18 + draft.education.length * 8 + draft.experiences.length * 5 + draft.projects.length * 5;
    return Math.min(100, Math.round((countProfileFields(draft) / Math.max(expected, 1)) * 100));
  }, [draft]);

  const set = <K extends keyof PersonalProfile>(key: K, value: PersonalProfile[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
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

  const jumpToSection = (key: EditorSectionKey) => {
    setActiveSection(key);
    setOpenSections((current) => new Set(current).add(key));
    window.setTimeout(() => {
      document.getElementById(`resume-section-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  useEffect(() => {
    let frame = 0;
    const updateActiveSection = () => {
      frame = 0;
      const anchor = window.scrollY + (window.innerWidth <= 900 ? 135 : 110);
      let current: EditorSectionKey = SECTION_INDEX[0].key;
      SECTION_INDEX.forEach((item) => {
        const section = document.getElementById(`resume-section-${item.key}`);
        if (section && section.getBoundingClientRect().top + window.scrollY <= anchor) current = item.key;
      });
      setActiveSection((previous) => previous === current ? previous : current);
    };
    const handleScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateActiveSection);
    };
    updateActiveSection();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [resume.id]);

  const updateEducation = (id: string, patch: Partial<ProfileEducation>) =>
    setDraft((current) => ({ ...current, education: current.education.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const updateExperience = (id: string, patch: Partial<ProfileExperience>) =>
    setDraft((current) => ({ ...current, experiences: current.experiences.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const updateProject = (id: string, patch: Partial<ProfileProject>) =>
    setDraft((current) => ({ ...current, projects: current.projects.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const updateCampus = (id: string, patch: Partial<ProfileCampusExperience>) =>
    setDraft((current) => ({ ...current, campusExperiences: current.campusExperiences.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const updateAward = (id: string, patch: Partial<ProfileAward>) =>
    setDraft((current) => ({ ...current, awards: current.awards.map((item) => item.id === id ? { ...item, ...patch } : item) }));

  const save = async () => {
    setSaving(true);
    try {
      const metadata = Object.fromEntries(
        Object.entries(draft.extraFields || {}).filter(([key]) => INTERNAL_EXTRA_KEYS.has(key))
      );
      const customFields = Object.fromEntries(
        extraRows
          .filter((row) => row.key.trim())
          .map((row) => [row.key.trim(), row.value])
      );
      await onSave(
        { ...draft, extraFields: { ...metadata, ...customFields } },
        {
          company: company.trim(),
          position: position.trim(),
          manual: resume.archiveNameSource === "manual" ||
            company.trim() !== (resume.company || "").trim() ||
            position.trim() !== (resume.position || "").trim()
        }
      );
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const addExtra = () => setExtraRows((current) => [...current, { id: newId("extra"), key: "", value: "" }]);
  const internshipExperiences = draft.experiences.filter(
    (experience) => resolveProfileExperienceKind(experience) === "internship"
  );
  const workExperiences = draft.experiences.filter(
    (experience) => resolveProfileExperienceKind(experience) === "work"
  );
  const addExperience = (kind: ProfileExperienceKind) => set("experiences", [
    ...draft.experiences,
    {
      id: newId(kind === "internship" ? "internship" : "work"),
      kind,
      organization: "",
      title: "",
      startDate: "",
      endDate: "",
      description: ""
    }
  ]);
  const experienceEntries = (items: ProfileExperience[], kind: ProfileExperienceKind) => items.map((item) => (
    <EditorEntry
      key={item.id}
      title={item.organization || (kind === "internship" ? "新实习经历" : "新工作经历")}
      onRemove={() => set("experiences", draft.experiences.filter((entry) => entry.id !== item.id))}
    >
      <div className="resume-editor-grid">
        <EditorField label="经历类别">
          <select value={resolveProfileExperienceKind(item)} onChange={(event) => updateExperience(item.id, { kind: event.target.value as ProfileExperienceKind })}>
            <option value="internship">实习经历</option>
            <option value="work">工作经历</option>
          </select>
        </EditorField>
        <EditorField label={kind === "internship" ? "实习单位 / 组织" : "公司 / 组织"}><input value={item.organization} onChange={(event) => updateExperience(item.id, { organization: event.target.value })} /></EditorField>
        <EditorField label={kind === "internship" ? "实习岗位" : "工作岗位"}><input value={item.title} onChange={(event) => updateExperience(item.id, { title: event.target.value })} /></EditorField>
        <EditorField label="开始时间"><input type="month" value={monthInputValue(item.startDate)} onChange={(event) => updateExperience(item.id, { startDate: event.target.value })} /></EditorField>
        <EditorField label="结束时间"><input type="month" value={monthInputValue(item.endDate)} onChange={(event) => updateExperience(item.id, { endDate: event.target.value })} /></EditorField>
        <EditorField label={kind === "internship" ? "实习内容" : "工作职责"} wide><textarea rows={5} value={item.description} onChange={(event) => updateExperience(item.id, { description: event.target.value })} placeholder="写清楚负责内容、方法和结果" /></EditorField>
      </div>
    </EditorEntry>
  ));

  return (
    <div className="resume-editor">
      <div className="resume-editor-layout">
        <nav className="resume-editor-index" aria-label="简历内容索引">
          <span className="resume-editor-index-title">内容索引</span>
          <div>
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
        <div className="resume-editor-content">
      <header className="resume-editor-header">
        <div className="resume-editor-heading">
          <button className="resume-editor-back" onClick={onBack}><ArrowLeft size={16} />简历库</button>
          <div className="resume-editor-title-row">
            <div>
              <h1>{resume.name}</h1>
              <div className="resume-editor-archive-fields">
                <label><span>归档公司</span><input value={company} onChange={(event) => { setCompany(event.target.value); setSaved(false); }} placeholder="例如：杭州新麦科技有限公司" /></label>
                <label><span>归档岗位</span><input value={position} onChange={(event) => { setPosition(event.target.value); setSaved(false); }} placeholder="例如：产品运营实习生" /></label>
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
        <span className="resume-editor-summary-note"><ShieldCheck size={14} />信息仅保存在本地，保存后插件会同步当前版本</span>
      </div>

      <div className="resume-editor-section-list">
        <EditorSection keyName="basic" title="基本信息" description="姓名、联系方式、个人基础资料" icon={<UserRound size={17} />} open={openSections.has("basic")} onToggle={toggle}>
          <div className="resume-editor-grid">
            <EditorField label="姓名" required><input value={draft.fullName} onChange={(event) => set("fullName", event.target.value)} /></EditorField>
            <EditorField label="性别"><select value={draft.gender} onChange={(event) => set("gender", event.target.value)}><option value="">请选择</option><option>男</option><option>女</option><option>不便透露</option></select></EditorField>
            <EditorField label="手机号" required><input type="tel" value={draft.phone} onChange={(event) => set("phone", event.target.value)} /></EditorField>
            <EditorField label="邮箱" required><input type="email" value={draft.email} onChange={(event) => set("email", event.target.value)} /></EditorField>
            <EditorField label="出生日期"><input type="date" value={draft.birthDate} onChange={(event) => set("birthDate", event.target.value)} /></EditorField>
            <EditorField label="毕业时间"><input type="month" value={monthInputValue(draft.graduationDate)} onChange={(event) => set("graduationDate", event.target.value)} /></EditorField>
            <EditorField label="现居城市"><input value={draft.currentCity} onChange={(event) => set("currentCity", event.target.value)} /></EditorField>
            <EditorField label="籍贯"><input value={draft.nativePlace} onChange={(event) => set("nativePlace", event.target.value)} /></EditorField>
            <EditorField label="身高（厘米）"><input inputMode="numeric" value={draft.height} onChange={(event) => set("height", event.target.value)} /></EditorField>
            <EditorField label="体重（公斤）"><input inputMode="decimal" value={draft.weight} onChange={(event) => set("weight", event.target.value)} /></EditorField>
            <EditorField label="是否统招"><select value={draft.recruitmentType} onChange={(event) => set("recruitmentType", event.target.value)}><option value="">请选择</option><option>是</option><option>否</option></select></EditorField>
            <EditorField label="应届 / 往届"><select value={draft.graduateStatus} onChange={(event) => set("graduateStatus", event.target.value)}><option value="">请选择</option><option>应届</option><option>往届</option></select></EditorField>
            <EditorField label="联系地址" wide><input value={draft.address} onChange={(event) => set("address", event.target.value)} /></EditorField>
          </div>
        </EditorSection>

        <EditorSection keyName="preference" title="求职偏好" description="目标岗位、城市、到岗时间与个人链接" icon={<CircleUserRound size={17} />} open={openSections.has("preference")} onToggle={toggle}>
          <div className="resume-editor-grid">
            <EditorField label="目标岗位"><input value={draft.targetRole} onChange={(event) => set("targetRole", event.target.value)} /></EditorField>
            <EditorField label="意向城市"><input value={draft.targetCities} onChange={(event) => set("targetCities", event.target.value)} placeholder="例如：北京、上海" /></EditorField>
            <EditorField label="最早到岗"><input type="date" value={draft.earliestStartDate} onChange={(event) => set("earliestStartDate", event.target.value)} /></EditorField>
            <EditorField label="作品集"><input type="url" value={draft.portfolioUrl} onChange={(event) => set("portfolioUrl", event.target.value)} /></EditorField>
            <EditorField label="GitHub" wide><div className="resume-editor-input-with-icon"><Link2 size={14} /><input type="url" value={draft.githubUrl} onChange={(event) => set("githubUrl", event.target.value)} /></div></EditorField>
          </div>
        </EditorSection>

        <EditorSection keyName="education" title="教育经历" description={`${draft.education.length} 段经历 · 支持手动添加多段`} icon={<GraduationCap size={17} />} open={openSections.has("education")} onToggle={toggle} action="添加教育经历" onAction={() => set("education", [...draft.education, { id: newId("edu"), school: "", college: "", major: "", degree: "", educationForm: "", startDate: "", endDate: "", gpa: "" }])}>
          {draft.education.map((item) => <EditorEntry key={item.id} title={item.school || "新教育经历"} onRemove={() => set("education", draft.education.filter((entry) => entry.id !== item.id))}>
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
          </EditorEntry>)}
          {draft.education.length === 0 && <EmptyEditorEntry text="还没有教育经历，点击添加" onClick={() => set("education", [{ id: newId("edu"), school: "", college: "", major: "", degree: "", educationForm: "", startDate: "", endDate: "", gpa: "" }])} />}
        </EditorSection>

        <EditorSection keyName="internships" title="实习经历" description={`${internshipExperiences.length} 段实习 · 自动匹配网申的实习经历区块`} icon={<BriefcaseBusiness size={17} />} open={openSections.has("internships")} onToggle={toggle} action="添加实习经历" onAction={() => addExperience("internship")}>
          {experienceEntries(internshipExperiences, "internship")}
          {internshipExperiences.length === 0 && <EmptyEditorEntry text="还没有实习经历，点击添加" onClick={() => addExperience("internship")} />}
        </EditorSection>

        <EditorSection keyName="work" title="工作经历" description={`${workExperiences.length} 段工作 · 自动匹配网申的工作经历区块`} icon={<BriefcaseBusiness size={17} />} open={openSections.has("work")} onToggle={toggle} action="添加工作经历" onAction={() => addExperience("work")}>
          {experienceEntries(workExperiences, "work")}
          {workExperiences.length === 0 && <EmptyEditorEntry text="还没有工作经历，点击添加" onClick={() => addExperience("work")} />}
        </EditorSection>

        <EditorSection keyName="projects" title="项目经历" description={`${draft.projects.length} 个项目 · 产品、研究或比赛均可添加`} icon={<FileCheck2 size={17} />} open={openSections.has("projects")} onToggle={toggle} action="添加项目经历" onAction={() => set("projects", [...draft.projects, { id: newId("project"), name: "", role: "", startDate: "", endDate: "", description: "" }])}>
          {draft.projects.map((item) => <EditorEntry key={item.id} title={item.name || "新项目经历"} onRemove={() => set("projects", draft.projects.filter((entry) => entry.id !== item.id))}>
            <div className="resume-editor-grid">
              <EditorField label="项目名称"><input value={item.name} onChange={(event) => updateProject(item.id, { name: event.target.value })} /></EditorField>
              <EditorField label="担任角色"><input value={item.role} onChange={(event) => updateProject(item.id, { role: event.target.value })} /></EditorField>
              <EditorField label="开始时间"><input type="month" value={monthInputValue(item.startDate)} onChange={(event) => updateProject(item.id, { startDate: event.target.value })} /></EditorField>
              <EditorField label="结束时间"><input type="month" value={monthInputValue(item.endDate)} onChange={(event) => updateProject(item.id, { endDate: event.target.value })} /></EditorField>
              <EditorField label="项目描述" wide><textarea rows={5} value={item.description} onChange={(event) => updateProject(item.id, { description: event.target.value })} placeholder="写清楚项目背景、你的动作和可量化结果" /></EditorField>
            </div>
          </EditorEntry>)}
          {draft.projects.length === 0 && <EmptyEditorEntry text="还没有项目经历，点击添加" onClick={() => set("projects", [{ id: newId("project"), name: "", role: "", startDate: "", endDate: "", description: "" }])} />}
        </EditorSection>

        <EditorSection keyName="campus" title="在校经历" description={`${draft.campusExperiences.length} 段经历 · 社团、学生组织或志愿服务`} icon={<CircleUserRound size={17} />} open={openSections.has("campus")} onToggle={toggle} action="添加在校经历" onAction={() => set("campusExperiences", [...draft.campusExperiences, { id: newId("campus"), type: "", role: "", startDate: "", endDate: "", description: "" }])}>
          {draft.campusExperiences.map((item) => <EditorEntry key={item.id} title={item.type || "新在校经历"} onRemove={() => set("campusExperiences", draft.campusExperiences.filter((entry) => entry.id !== item.id))}>
            <div className="resume-editor-grid">
              <EditorField label="经历类型"><input value={item.type} onChange={(event) => updateCampus(item.id, { type: event.target.value })} placeholder="例如：学生会、志愿服务" /></EditorField>
              <EditorField label="担任角色"><input value={item.role} onChange={(event) => updateCampus(item.id, { role: event.target.value })} /></EditorField>
              <EditorField label="开始时间"><input type="month" value={monthInputValue(item.startDate)} onChange={(event) => updateCampus(item.id, { startDate: event.target.value })} /></EditorField>
              <EditorField label="结束时间"><input type="month" value={monthInputValue(item.endDate)} onChange={(event) => updateCampus(item.id, { endDate: event.target.value })} /></EditorField>
              <EditorField label="经历描述" wide><textarea rows={4} value={item.description} onChange={(event) => updateCampus(item.id, { description: event.target.value })} /></EditorField>
            </div>
          </EditorEntry>)}
          {draft.campusExperiences.length === 0 && <EmptyEditorEntry text="还没有在校经历，点击添加" onClick={() => set("campusExperiences", [{ id: newId("campus"), type: "", role: "", startDate: "", endDate: "", description: "" }])} />}
        </EditorSection>

        <EditorSection keyName="awards" title="获奖与证书" description={`${draft.awards.length} 项奖励 · 可补充名称、等级与详情`} icon={<Trophy size={17} />} open={openSections.has("awards")} onToggle={toggle} action="添加获奖情况" onAction={() => set("awards", [...draft.awards, { id: newId("award"), date: "", name: "", level: "", description: "" }])}>
          {draft.awards.map((item) => <EditorEntry key={item.id} title={item.name || "新获奖记录"} onRemove={() => set("awards", draft.awards.filter((entry) => entry.id !== item.id))}>
            <div className="resume-editor-grid">
              <EditorField label="获奖时间"><input type="month" value={monthInputValue(item.date)} onChange={(event) => updateAward(item.id, { date: event.target.value })} /></EditorField>
              <EditorField label="奖项名称"><input value={item.name} onChange={(event) => updateAward(item.id, { name: event.target.value })} /></EditorField>
              <EditorField label="奖励等级"><input value={item.level} onChange={(event) => updateAward(item.id, { level: event.target.value })} placeholder="例如：国家级 / 一等奖" /></EditorField>
              <EditorField label="奖励描述" wide><textarea rows={4} value={item.description} onChange={(event) => updateAward(item.id, { description: event.target.value })} /></EditorField>
            </div>
          </EditorEntry>)}
          {draft.awards.length === 0 && <EmptyEditorEntry text="还没有获奖记录，点击添加" onClick={() => set("awards", [{ id: newId("award"), date: "", name: "", level: "", description: "" }])} />}
        </EditorSection>

        <EditorSection keyName="answers" title="自我介绍与常用回答" description="可复用的自我介绍、个人优势与职业规划" icon={<CircleUserRound size={17} />} open={openSections.has("answers")} onToggle={toggle}>
          <div className="resume-editor-long-fields">
            <EditorField label="自我介绍"><textarea rows={6} value={draft.selfIntroduction} onChange={(event) => set("selfIntroduction", event.target.value)} /></EditorField>
            <EditorField label="个人优势"><textarea rows={5} value={draft.strengths} onChange={(event) => set("strengths", event.target.value)} /></EditorField>
            <EditorField label="职业规划"><textarea rows={5} value={draft.careerPlan} onChange={(event) => set("careerPlan", event.target.value)} /></EditorField>
          </div>
        </EditorSection>

        <EditorSection keyName="extra" title="技能、证书与其他网申字段" description="解析不到的信息可在这里手动添加，例如政治面貌、身份证号、紧急联系人、专业技能等" icon={<ShieldCheck size={17} />} open={openSections.has("extra")} onToggle={toggle} action="添加字段" onAction={addExtra}>
          <div className="resume-editor-extra-list">
            {extraRows.map((row) => <div className="resume-editor-extra-row" key={row.id}>
              <input value={row.key} placeholder="字段名称，例如：英语水平" onChange={(event) => setExtraRows((current) => current.map((item) => item.id === row.id ? { ...item, key: event.target.value } : item))} />
              <textarea rows={2} value={row.value} placeholder="填写字段内容" onChange={(event) => setExtraRows((current) => current.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))} />
              <button onClick={() => setExtraRows((current) => current.filter((item) => item.id !== row.id))} aria-label="删除字段"><X size={15} /></button>
            </div>)}
            <button className="resume-editor-add-row" onClick={addExtra}><Plus size={14} />添加一个未识别字段</button>
          </div>
        </EditorSection>
      </div>

      <footer className="resume-editor-footer">
        <span>{saved ? <><Check size={14} />已保存 · {countProfileFields(draft)} 个字段</> : <><ShieldCheck size={14} />请检查解析结果并保存</>}</span>
        <div>
          <button className="resume-editor-secondary" onClick={onOpenPlugin}><ArrowRight size={14} />去一键网申</button>
          <button className="resume-editor-save" onClick={() => void save()} disabled={saving}>{saving ? "保存中…" : <><Save size={15} />保存这份简历</>}</button>
        </div>
      </footer>
        </div>
      </div>
    </div>
  );
}

function EditorSection({ keyName, title, description, icon: _icon, open, onToggle, action, onAction, children }: { keyName: EditorSectionKey; title: string; description: string; icon: ReactNode; open: boolean; onToggle: (key: EditorSectionKey) => void; action?: string; onAction?: () => void; children: ReactNode }) {
  return <section id={`resume-section-${keyName}`} className={`resume-editor-section ${open ? "open" : ""}`}>
    <div className="resume-editor-section-head">
      <button onClick={() => onToggle(keyName)} aria-expanded={open}>
        <strong>{title}</strong>
        <ChevronDown className="resume-editor-section-chevron" size={17} />
      </button>
      {action && <button className="resume-editor-section-action" onClick={onAction}><Plus size={13} />{action}</button>}
    </div>
    {open && <div className="resume-editor-section-body">{children}</div>}
  </section>;
}

function EditorField({ label, wide, required, children }: { label: string; wide?: boolean; required?: boolean; children: ReactNode }) {
  return <label className={`resume-editor-field ${wide ? "wide" : ""}`}><span>{required && <em aria-hidden="true">*</em>}{label}</span>{children}</label>;
}

function EditorEntry({ title, onRemove, children }: { title: string; onRemove: () => void; children: ReactNode }) {
  return <article className="resume-editor-entry"><header><strong>{title}</strong><button onClick={onRemove} aria-label="删除这条经历"><Trash2 size={14} /></button></header>{children}</article>;
}

function EmptyEditorEntry({ text, onClick }: { text: string; onClick: () => void }) {
  return <button className="resume-editor-empty-entry" onClick={onClick}><Plus size={16} /><span>{text}</span></button>;
}
