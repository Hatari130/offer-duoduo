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
  | "personal"
  | "identity"
  | "languages"
  | "qualifications"
  | "emergency"
  | "family"
  | "extra";

type ProfileRecordKey = "languages" | "qualifications" | "familyMembers";

const CORE_SECTION_INDEX: Array<{ key: EditorSectionKey; label: string }> = [
  { key: "basic", label: "基本信息" },
  { key: "preference", label: "求职偏好" },
  { key: "education", label: "教育经历" },
  { key: "internships", label: "实习经历" },
  { key: "work", label: "工作经历" },
  { key: "projects", label: "项目经历" },
  { key: "campus", label: "在校经历" },
  { key: "awards", label: "获奖证书" },
  { key: "answers", label: "常用回答" }
];

const APPLICATION_SECTION_INDEX: Array<{ key: EditorSectionKey; label: string }> = [
  { key: "personal", label: "个人与联系" },
  { key: "identity", label: "证件与政治" },
  { key: "languages", label: "外语能力" },
  { key: "qualifications", label: "证书资格" },
  { key: "emergency", label: "紧急联系人" },
  { key: "family", label: "家庭情况" },
  { key: "extra", label: "其他字段" }
];

const SECTION_INDEX = [...CORE_SECTION_INDEX, ...APPLICATION_SECTION_INDEX];

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
    () => new Set(["basic", "preference", "education", "internships", "work", "projects", "campus", "awards", "answers"])
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<EditorSectionKey>("basic");

  useEffect(() => {
    setDraft(resume.profile);
    setCompany(resume.company || "");
    setPosition(resume.position || "");
    setPhoneCountryCode(resume.profile.extraFields?.[PHONE_COUNTRY_CODE_KEY] || "+86");
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
  const updateProfileRecord = (collection: ProfileRecordKey, index: number, field: string, value: string) =>
    setDraft((current) => {
      const records = [...(current[collection] || [])];
      records[index] = { ...records[index], [field]: value };
      return { ...current, [collection]: records };
    });
  const addProfileRecord = (collection: ProfileRecordKey, record: Record<string, string>) =>
    setDraft((current) => ({ ...current, [collection]: [...(current[collection] || []), record] }));
  const removeProfileRecord = (collection: ProfileRecordKey, index: number) =>
    setDraft((current) => ({ ...current, [collection]: (current[collection] || []).filter((_, itemIndex) => itemIndex !== index) }));

  const save = async () => {
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
    } finally {
      setSaving(false);
    }
  };

  const addExtra = (key = "") => setExtraRows((current) => {
    if (key && current.some((row) => row.key === key)) return current;
    return [...current, { id: newId("extra"), key, value: "" }];
  });
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
          {[
            { label: "核心简历", items: CORE_SECTION_INDEX },
            { label: "网申资料库", items: APPLICATION_SECTION_INDEX }
          ].map((group) => (
            <div className="resume-editor-index-group" key={group.label}>
              <span>{group.label}</span>
              <div>
                {group.items.map((item) => (
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
            </div>
          ))}
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
            <EditorField label="手机号" required>
              <div className="resume-editor-phone-field">
                <select
                  aria-label="手机国家或地区区号"
                  value={phoneCountryCode}
                  onChange={(event) => { setPhoneCountryCode(event.target.value); setSaved(false); }}
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

        <EditorSection keyName="personal" title="个人与联系" description="网申常见的个人资料与补充联系方式" icon={<UserRound size={17} />} open={openSections.has("personal")} onToggle={toggle}>
          <div className="resume-editor-grid">
            <EditorField label="民族"><input value={draft.nationality || ""} onChange={(event) => set("nationality", event.target.value)} /></EditorField>
            <EditorField label="婚姻状况"><select value={draft.maritalStatus || ""} onChange={(event) => set("maritalStatus", event.target.value)}><option value="">请选择</option><option>未婚</option><option>已婚</option><option>其他</option></select></EditorField>
            <EditorField label="生源地"><input value={draft.studentSource || ""} onChange={(event) => set("studentSource", event.target.value)} placeholder="例如：河北省秦皇岛市" /></EditorField>
            <EditorField label="当前居住地"><input value={draft.currentResidence || ""} onChange={(event) => set("currentResidence", event.target.value)} /></EditorField>
            <EditorField label="国家 / 地区"><input value={draft.countryRegion || ""} onChange={(event) => set("countryRegion", event.target.value)} placeholder="例如：中国大陆" /></EditorField>
            <EditorField label="工作年限"><input value={draft.workYears || ""} onChange={(event) => set("workYears", event.target.value)} placeholder="例如：0 年" /></EditorField>
            <EditorField label="健康状况"><input value={draft.healthStatus || ""} onChange={(event) => set("healthStatus", event.target.value)} /></EditorField>
            <EditorField label="个人特长"><input value={draft.specialty || ""} onChange={(event) => set("specialty", event.target.value)} /></EditorField>
            <EditorField label="微信号"><input value={draft.wechat || ""} onChange={(event) => set("wechat", event.target.value)} /></EditorField>
            <EditorField label="QQ"><input value={draft.qq || ""} onChange={(event) => set("qq", event.target.value)} /></EditorField>
          </div>
        </EditorSection>

        <EditorSection keyName="identity" title="证件与政治信息" description="仅在企业网申明确需要时自动填写" icon={<ShieldCheck size={17} />} open={openSections.has("identity")} onToggle={toggle}>
          <div className="resume-editor-grid">
            <EditorField label="政治面貌"><select value={draft.politicalStatus || ""} onChange={(event) => set("politicalStatus", event.target.value)}><option value="">请选择</option><option>中共党员</option><option>中共预备党员</option><option>共青团员</option><option>群众</option><option>其他党派</option></select></EditorField>
            <EditorField label="证件类型"><select value={draft.idType || ""} onChange={(event) => set("idType", event.target.value)}><option value="">请选择</option><option>居民身份证</option><option>护照</option><option>港澳居民来往内地通行证</option><option>台湾居民来往大陆通行证</option><option>其他</option></select></EditorField>
            <EditorField label="证件号码" wide><div className="resume-editor-sensitive-field"><input type="password" autoComplete="off" value={draft.idNumber || ""} onChange={(event) => set("idNumber", event.target.value)} placeholder="仅本地保存，网申需要时才填写" /><small>已加密显示；不会被用于简历优化。</small></div></EditorField>
          </div>
        </EditorSection>

        <EditorSection keyName="languages" title="外语能力" description={`${draft.languages?.length || 0} 项语言资料 · 支持网申逐项填写`} icon={<CircleUserRound size={17} />} open={openSections.has("languages")} onToggle={toggle} action="添加外语能力" onAction={() => addProfileRecord("languages", { id: newId("language"), name: "", certificate: "", englishLevel: "", score: "", proficiency: "", listeningSpeaking: "", readingWriting: "" })}>
          {(draft.languages || []).map((item, index) => <EditorEntry key={item.id || `language-${index}`} title={item.name || "新外语能力"} onRemove={() => removeProfileRecord("languages", index)}>
            <div className="resume-editor-grid">
              <EditorField label="外语语种"><input value={item.name || ""} onChange={(event) => updateProfileRecord("languages", index, "name", event.target.value)} /></EditorField>
              <EditorField label="证书名称"><input value={item.certificate || ""} onChange={(event) => updateProfileRecord("languages", index, "certificate", event.target.value)} /></EditorField>
              <EditorField label="语言等级"><input value={item.englishLevel || ""} onChange={(event) => updateProfileRecord("languages", index, "englishLevel", event.target.value)} placeholder="例如：CET-6" /></EditorField>
              <EditorField label="成绩"><input value={item.score || ""} onChange={(event) => updateProfileRecord("languages", index, "score", event.target.value)} /></EditorField>
              <EditorField label="掌握程度"><input value={item.proficiency || ""} onChange={(event) => updateProfileRecord("languages", index, "proficiency", event.target.value)} placeholder="例如：熟练" /></EditorField>
              <EditorField label="听说能力"><input value={item.listeningSpeaking || ""} onChange={(event) => updateProfileRecord("languages", index, "listeningSpeaking", event.target.value)} /></EditorField>
              <EditorField label="读写能力"><input value={item.readingWriting || ""} onChange={(event) => updateProfileRecord("languages", index, "readingWriting", event.target.value)} /></EditorField>
            </div>
          </EditorEntry>)}
          {!(draft.languages || []).length && <EmptyEditorEntry text="还没有外语能力，点击添加" onClick={() => addProfileRecord("languages", { id: newId("language"), name: "", certificate: "", englishLevel: "", score: "", proficiency: "", listeningSpeaking: "", readingWriting: "" })} />}
        </EditorSection>

        <EditorSection keyName="qualifications" title="证书资格" description={`${draft.qualifications?.length || 0} 项证书 · 与奖项分开维护`} icon={<Trophy size={17} />} open={openSections.has("qualifications")} onToggle={toggle} action="添加证书" onAction={() => addProfileRecord("qualifications", { id: newId("qualification"), date: "", name: "", number: "", description: "" })}>
          {(draft.qualifications || []).map((item, index) => <EditorEntry key={item.id || `qualification-${index}`} title={item.name || "新证书"} onRemove={() => removeProfileRecord("qualifications", index)}>
            <div className="resume-editor-grid">
              <EditorField label="获得时间"><input type="month" value={monthInputValue(item.date)} onChange={(event) => updateProfileRecord("qualifications", index, "date", event.target.value)} /></EditorField>
              <EditorField label="证书名称"><input value={item.name || ""} onChange={(event) => updateProfileRecord("qualifications", index, "name", event.target.value)} /></EditorField>
              <EditorField label="证书编号"><input value={item.number || ""} onChange={(event) => updateProfileRecord("qualifications", index, "number", event.target.value)} /></EditorField>
              <EditorField label="证书说明" wide><textarea rows={3} value={item.description || ""} onChange={(event) => updateProfileRecord("qualifications", index, "description", event.target.value)} /></EditorField>
            </div>
          </EditorEntry>)}
          {!(draft.qualifications || []).length && <EmptyEditorEntry text="还没有证书资格，点击添加" onClick={() => addProfileRecord("qualifications", { id: newId("qualification"), date: "", name: "", number: "", description: "" })} />}
        </EditorSection>

        <EditorSection keyName="emergency" title="紧急联系人" description="仅在企业网申明确需要时自动填写" icon={<ShieldCheck size={17} />} open={openSections.has("emergency")} onToggle={toggle}>
          <div className="resume-editor-grid">
            <EditorField label="姓名"><input value={draft.emergencyContactName || ""} onChange={(event) => set("emergencyContactName", event.target.value)} /></EditorField>
            <EditorField label="电话"><input type="tel" value={draft.emergencyContactPhone || ""} onChange={(event) => set("emergencyContactPhone", event.target.value)} /></EditorField>
          </div>
        </EditorSection>

        <EditorSection keyName="family" title="家庭情况" description={`${draft.familyMembers?.length || 0} 位家庭成员 · 仅用于要求该信息的网申`} icon={<CircleUserRound size={17} />} open={openSections.has("family")} onToggle={toggle} action="添加家庭成员" onAction={() => addProfileRecord("familyMembers", { id: newId("family"), name: "", relation: "", phone: "", company: "", position: "", politicalStatus: "" })}>
          {(draft.familyMembers || []).map((item, index) => <EditorEntry key={item.id || `family-${index}`} title={item.name || "新家庭成员"} onRemove={() => removeProfileRecord("familyMembers", index)}>
            <div className="resume-editor-grid">
              <EditorField label="姓名"><input value={item.name || ""} onChange={(event) => updateProfileRecord("familyMembers", index, "name", event.target.value)} /></EditorField>
              <EditorField label="关系"><input value={item.relation || ""} onChange={(event) => updateProfileRecord("familyMembers", index, "relation", event.target.value)} placeholder="例如：父亲" /></EditorField>
              <EditorField label="电话"><input type="tel" value={item.phone || ""} onChange={(event) => updateProfileRecord("familyMembers", index, "phone", event.target.value)} /></EditorField>
              <EditorField label="公司 / 单位"><input value={item.company || ""} onChange={(event) => updateProfileRecord("familyMembers", index, "company", event.target.value)} /></EditorField>
              <EditorField label="职位"><input value={item.position || ""} onChange={(event) => updateProfileRecord("familyMembers", index, "position", event.target.value)} /></EditorField>
              <EditorField label="政治面貌"><input value={item.politicalStatus || ""} onChange={(event) => updateProfileRecord("familyMembers", index, "politicalStatus", event.target.value)} /></EditorField>
            </div>
          </EditorEntry>)}
          {!(draft.familyMembers || []).length && <EmptyEditorEntry text="还没有家庭成员资料，点击添加" onClick={() => addProfileRecord("familyMembers", { id: newId("family"), name: "", relation: "", phone: "", company: "", position: "", politicalStatus: "" })} />}
        </EditorSection>

        <EditorSection keyName="extra" title="其他自定义字段" description="补充少见或企业专属的网申信息" icon={<ShieldCheck size={17} />} open={openSections.has("extra")} onToggle={toggle} action="添加字段" onAction={() => addExtra()}>
          <div className="resume-editor-extra-list">
            {extraRows.map((row) => <div className="resume-editor-extra-row" key={row.id}>
              <input value={row.key} placeholder="字段名称，例如：英语水平" onChange={(event) => setExtraRows((current) => current.map((item) => item.id === row.id ? { ...item, key: event.target.value } : item))} />
              <textarea rows={2} value={row.value} placeholder="填写字段内容" onChange={(event) => setExtraRows((current) => current.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))} />
              <button onClick={() => setExtraRows((current) => current.filter((item) => item.id !== row.id))} aria-label="删除字段"><X size={15} /></button>
            </div>)}
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
            <button className="resume-editor-add-row" onClick={() => addExtra()}><Plus size={14} />添加自定义字段</button>
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
    <div className="resume-editor-section-reveal">
      <div className="resume-editor-section-body">{children}</div>
    </div>
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
