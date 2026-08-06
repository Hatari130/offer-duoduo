import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Plus,
  ScanLine,
  ShieldCheck,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import { matchFormFields } from "@/integrations/deepseek/deepseek";
import { getProfileFieldValues } from "@/shared/types";
import type {
  FormFieldMatch,
  FormFillResponse,
  FormScanResponse,
  OfferFlowSettings,
  PersonalProfile,
  ProfileAward,
  ProfileCampusExperience,
  ProfileCompetition,
  ProfileComputerSkill,
  ProfileEducation,
  ProfileExperience,
  ProfileFamilyMember,
  ProfileLanguage,
  ProfilePatent,
  ProfileProject,
  ProfilePublication,
  ProfileQualification,
  ProfileWork
} from "@/shared/types";

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const FIELD_NAMES: Record<string, string> = {
  fullName: "姓名",
  gender: "性别",
  phone: "手机号",
  email: "邮箱",
  birthDate: "出生日期",
  graduationDate: "毕业时间",
  currentCity: "现居城市",
  nativePlace: "籍贯",
  studentSource: "生源地",
  currentResidence: "现居住地",
  height: "身高",
  weight: "体重",
  recruitmentType: "是否统招",
  graduateStatus: "应届/往届",
  address: "联系地址",
  targetRole: "目标岗位",
  targetCities: "意向城市",
  earliestStartDate: "最早到岗",
  portfolioUrl: "作品集",
  githubUrl: "GitHub",
  school: "毕业院校",
  major: "专业",
  degree: "学历",
  gpa: "GPA",
  educationStartDate: "教育开始时间",
  educationEndDate: "教育结束时间",
  experienceOrganization: "工作公司",
  experienceTitle: "工作职位",
  experienceStartDate: "工作开始时间",
  experienceEndDate: "工作结束时间",
  experienceDescription: "工作职责",
  selfIntroduction: "自我介绍",
  strengths: "个人优势",
  careerPlan: "职业规划",
  nationality: "民族",
  idType: "证件类型",
  idNumber: "证件号码",
  wechat: "微信号",
  qq: "QQ",
  politicalStatus: "政治面貌",
  maritalStatus: "婚姻状况",
  healthStatus: "健康状况",
  specialty: "特长",
  workYears: "工作年限",
  emergencyContactName: "紧急联系人姓名",
  emergencyContactPhone: "紧急联系人电话",
  countryRegion: "国家或地区",
  expectedSalary: "期望薪资",
  educationCollege: "学院或院系",
  educationDegree: "学位",
  educationForm: "学习形式",
  educationCourses: "专业课程",
  educationResearchDirection: "研究方向",
  educationThesis: "毕业论文",
  educationRank: "专业排名",
  overseasEducation: "海外教育经历",
  minorMajor: "辅修或双学位专业",
  advisorName: "导师姓名",
  experienceType: "工作类型",
  experienceDepartment: "工作部门",
  experienceSalary: "工作薪资",
  experienceAchievements: "工作成果",
  refereeName: "证明人姓名",
  refereeTitle: "证明人职位",
  refereeContact: "证明人联系方式",
  leavingReason: "离职原因",
  subordinateCount: "下属人数",
  projectName: "项目名称",
  projectRole: "项目职位或角色",
  projectStartDate: "项目开始时间",
  projectEndDate: "项目结束时间",
  projectDescription: "项目内容",
  projectAchievement: "项目成果",
  projectLink: "项目链接",
  campusExperienceType: "在校经历类型",
  campusExperienceRole: "在校经历职位",
  campusExperienceStartDate: "在校经历开始时间",
  campusExperienceEndDate: "在校经历结束时间",
  campusExperienceDescription: "在校经历内容",
  awardDate: "获奖时间",
  awardName: "奖励名称",
  awardLevel: "奖励等级",
  awardDescription: "奖励描述",
  languageName: "外语语种",
  languageCertificate: "语言证书名称",
  englishLevel: "英语水平",
  languageScore: "语言成绩",
  languageProficiency: "语言掌握程度",
  listeningSpeaking: "听说能力",
  readingWriting: "读写能力",
  computerSkillType: "计算机技能类型",
  computerSkillProficiency: "计算机掌握程度",
  qualificationDate: "资格证书获得时间",
  qualificationName: "资格证书名称",
  qualificationNumber: "资格证书编号",
  qualificationDescription: "资格证书说明",
  familyName: "家庭成员姓名",
  familyRelation: "家庭成员关系",
  familyPhone: "家庭成员电话",
  familyCompany: "家庭成员公司",
  familyPosition: "家庭成员职位",
  familyPoliticalStatus: "家庭成员政治面貌",
  publicationDate: "论文发表时间",
  publicationJournal: "刊物名称",
  publicationLevel: "刊物层级",
  publicationTitle: "论文名称",
  publicationDescription: "论文描述",
  publicationAuthors: "论文作者",
  publicationImpactFactor: "期刊影响因子",
  publicationLink: "论文链接",
  patentDate: "专利发表时间",
  patentName: "专利名称",
  patentNumber: "专利编号",
  patentType: "专利类型",
  patentAchievement: "专利成果",
  hobbies: "兴趣爱好",
  workName: "作品名称",
  workLink: "作品链接",
  workDescription: "作品描述",
  competitionName: "竞赛名称",
  competitionDate: "竞赛参与时间",
  competitionDescription: "竞赛详情内容",
  referralCode: "推荐码",
  experienceCurrent: "是否在职 / 至今"
};

type FillProgress = {
  stage: "started" | "field" | "done";
  current: number;
  total: number;
  label?: string;
  filled?: number;
  result?: FormFillResponse["results"][number];
};

type ProfileSectionId =
  | "basic"
  | "preference"
  | "education"
  | "experience"
  | "projects"
  | "campus"
  | "awards"
  | "languages"
  | "computer"
  | "qualifications"
  | "family"
  | "publications"
  | "patents"
  | "portfolio"
  | "competitions"
  | "answers";

type ProfileSectionState = Record<ProfileSectionId, boolean>;

const DEFAULT_OPEN_SECTIONS: ProfileSectionState = {
  basic: true,
  preference: true,
  education: true,
  experience: true,
  projects: true,
  campus: true,
  awards: true,
  languages: false,
  computer: false,
  qualifications: false,
  family: false,
  publications: false,
  patents: false,
  portfolio: false,
  competitions: false,
  answers: true
};

const COLLAPSED_SECTIONS: ProfileSectionState = {
  basic: false,
  preference: false,
  education: false,
  experience: false,
  projects: false,
  campus: false,
  awards: false,
  languages: false,
  computer: false,
  qualifications: false,
  family: false,
  publications: false,
  patents: false,
  portfolio: false,
  competitions: false,
  answers: false
};

const profileValues = (profile: PersonalProfile, repeatIndex = 0): Record<string, string> =>
  getProfileFieldValues(profile, repeatIndex);

function profileFieldValue(
  profile: PersonalProfile,
  field: Pick<FormFieldMatch, "key" | "repeatIndex">
): string {
  return field.key ? profileValues(profile, field.repeatIndex ?? 0)[field.key] || "" : "";
}

async function activeTabMessage(message: unknown) {
  try {
    if (typeof chrome === "undefined" || !chrome.tabs) {
      throw new Error("请在已加载扩展的招聘网页中使用");
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("http")) throw new Error("当前页面不支持表单填写");
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      if (String(error).includes("Extension context invalidated")) {
        throw error;
      }
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["extraction-rules.js", "form-adapters.js", "content.js"]
      });
      return chrome.tabs.sendMessage(tab.id, message);
    }
  } catch (error) {
    if (String(error).includes("Extension context invalidated")) {
      throw new Error("扩展刚刚更新，请关闭当前侧边栏后重新打开；必要时刷新招聘页面");
    }
    throw error;
  }
}

export default function ProfileView({
  profile,
  settings,
  onSave,
  onBack
}: {
  profile: PersonalProfile;
  settings: OfferFlowSettings;
  onSave: (profile: PersonalProfile) => Promise<void>;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [status, setStatus] = useState("");
  const [fields, setFields] = useState<FormFieldMatch[]>([]);
  const [platform, setPlatform] = useState<FormScanResponse["platform"]>();
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [resultMap, setResultMap] = useState<Record<string, FormFillResponse["results"][number]>>({});
  const [busy, setBusy] = useState(false);
  const [fillProgress, setFillProgress] = useState<FillProgress>();
  const [openSections, setOpenSections] = useState<ProfileSectionState>(DEFAULT_OPEN_SECTIONS);
  const [pendingEntryId, setPendingEntryId] = useState<string>();

  useEffect(() => setDraft(profile), [profile]);

  useEffect(() => {
    if (!pendingEntryId) return;
    const entry = document.querySelector(`[data-profile-entry-id="${pendingEntryId}"]`);
    if (!(entry instanceof HTMLElement)) return;
    entry.scrollIntoView({ behavior: "smooth", block: "center" });
    const firstField = entry.querySelector("input, textarea, select");
    if (firstField instanceof HTMLElement) firstField.focus();
    setPendingEntryId(undefined);
  }, [
    pendingEntryId,
    draft.education.length,
    draft.experiences.length,
    draft.projects.length,
    draft.campusExperiences.length,
    draft.awards.length,
    draft.languages.length,
    draft.computerSkills.length,
    draft.qualifications.length,
    draft.familyMembers.length,
    draft.publications.length,
    draft.patents.length,
    draft.works.length,
    draft.competitions.length
  ]);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    const listener = (message: any) => {
      if (message?.type !== "OFFERFLOW_FILL_PROGRESS") return;
      const progress: FillProgress = {
        stage: message.stage === "done" ? "done" : message.stage === "field" ? "field" : "started",
        current: Number(message.current) || 0,
        total: Number(message.total) || 0,
        label: message.label,
        filled: Number.isFinite(Number(message.filled)) ? Number(message.filled) : undefined,
        result: message.result
      };
      setFillProgress(progress);
      if (progress.stage === "field" && progress.result?.id) {
        setResultMap((current) => ({ ...current, [progress.result!.id]: progress.result! }));
      }
      if (progress.stage === "started") {
        setStatus("正在逐项填写 0/" + progress.total + "…");
      } else if (progress.stage === "field") {
        setStatus("正在填写 " + progress.current + "/" + progress.total + "：" + (progress.label || "当前字段") + "…");
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const values = useMemo(() => profileValues(draft), [draft]);
  const essentials = [draft.fullName, draft.phone, draft.email, draft.currentCity, draft.targetRole];
  const completion = Math.round(
    ((essentials.filter(Boolean).length + Math.min(draft.education.length, 1)) / 6) * 100
  );

  const set = <K extends keyof PersonalProfile>(key: K, value: PersonalProfile[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setBusy(true);
    try {
      await onSave(draft);
      setOpenSections(COLLAPSED_SECTIONS);
      setStatus("个人资料已保存在本地 · 已收起各资料分组");
    } finally {
      setBusy(false);
    }
  };

  const scan = async () => {
    setBusy(true);
    setStatus("");
    setFillProgress(undefined);
    try {
      await onSave(draft);
      const response = (await activeTabMessage({
        type: "OFFERFLOW_SCAN_APPLICATION_FORM",
        repeatCounts: {
          education: draft.education.length,
          experience: draft.experiences.length,
          project: draft.projects.length,
          campus: draft.campusExperiences.length,
          award: draft.awards.length,
          language: draft.languages.length,
          computer: draft.computerSkills.length,
          qualification: draft.qualifications.length,
          family: draft.familyMembers.length,
          publication: draft.publications.length,
          patent: draft.patents.length,
          portfolio: draft.works.length,
          competition: draft.competitions.length
        }
      })) as FormScanResponse;
      if (!response?.ok) throw new Error(response?.error || "表单识别失败");
      let matches = (response.fields || []) as FormFieldMatch[];
      setPlatform(response.platform);
      const adapterName = response.platform?.name || "通用表单";
      const repeaterNotice = response.repeatersExpanded ? " · 已展开重复经历" : "";
      const ruleMatched = response.platform?.ruleMatched ?? matches.filter((field) => Boolean(field.key)).length;
      const unknownBeforeAi = matches.filter((field) => !field.key).length;
      if (settings.deepseekApiKey && unknownBeforeAi) {
        setStatus(`${adapterName}：规则命中 ${ruleMatched} 个，${unknownBeforeAi} 个未知字段交给 DeepSeek…`);
        try {
          matches = await matchFormFields(matches, draft, settings);
        } catch (error) {
          setStatus(`${adapterName}：规则命中 ${ruleMatched} 个，DeepSeek 暂不可用：${error instanceof Error ? error.message : "请求失败"}`);
        }
      }
      setFields(matches);
      setResultMap({});
      const fillable = matches.filter(
        (field) => field.key && profileFieldValue(draft, field) && (field.confidence || 0) >= 0.65
      );
      setSelectedFields(new Set(fillable.map((field) => field.id)));
      if (!matches.length) {
        setStatus("当前页面没有识别到可填写字段");
      } else {
        const matchedCount = matches.filter((field) => field.key).length;
        const unmatchedCount = matches.length - matchedCount;
        const sourceLabel = unmatchedCount ? `${unmatchedCount} 个待补充映射` : "规则/AI 已全部匹配";
        const skippedMissing = matches.filter((field) => field.key && !profileFieldValue(draft, field)).length;
        const skippedUnknown = matches.filter((field) => !field.key).length;
        if (fillable.length) {
          setStatus(`${adapterName}${repeaterNotice} · 识别 ${matches.length} 个字段，正在直接填写 ${fillable.length} 个…`);
          setFillProgress({ stage: "started", current: 0, total: fillable.length });
          try {
            const fillResponse = await activeTabMessage({
              type: "OFFERFLOW_FILL_APPLICATION_FORM",
              fields: fillable,
              values,
              fieldValues: Object.fromEntries(fillable.map((field) => [field.id, profileFieldValue(draft, field)])),
              delayMs: 55
            });
            if (!fillResponse?.ok) throw new Error(fillResponse?.error || "填写失败");
            const report = fillResponse as FormFillResponse;
            setResultMap(Object.fromEntries((report.results || []).map((result) => [result.id, result])));
            const failed = (report.results || []).filter((result) => result.status === "failed").length;
            setStatus(
              `${adapterName}${repeaterNotice} · 已直接填写 ${report.filled || 0} 个` +
              `${skippedMissing ? `，资料缺失跳过 ${skippedMissing} 个` : ""}` +
              `${skippedUnknown ? `，未匹配跳过 ${skippedUnknown} 个` : ""}` +
              `${failed ? `，失败 ${failed} 个` : ""}；请在网页中检查`
            );
          } catch (error) {
            setStatus(`${adapterName}${repeaterNotice} · 识别完成，但自动填写失败：${error instanceof Error ? error.message : "填写失败"}`);
          }
        } else {
          setStatus(
            `${adapterName}${repeaterNotice} · 识别 ${matches.length} 个字段，规则命中 ${ruleMatched} 个，${sourceLabel}` +
            `${skippedMissing ? `，资料缺失跳过 ${skippedMissing} 个` : ""}` +
            `${skippedUnknown ? `，未知字段跳过 ${skippedUnknown} 个` : ""}`
          );
        }
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "表单识别失败");
    } finally {
      setBusy(false);
    }
  };

  const fill = async () => {
    setBusy(true);
    setFillProgress(undefined);
    try {
      const chosen = fields.filter(
        (field) => selectedFields.has(field.id) && resultMap[field.id]?.status !== "filled"
      );
      setFillProgress({ stage: "started", current: 0, total: chosen.length });
      const response = await activeTabMessage({
        type: "OFFERFLOW_FILL_APPLICATION_FORM",
        fields: chosen,
        values,
        fieldValues: Object.fromEntries(chosen.map((field) => [field.id, profileFieldValue(draft, field)])),
        delayMs: 55
      });
      if (!response?.ok) throw new Error(response?.error || "填写失败");
      const report = response as FormFillResponse;
      setResultMap(Object.fromEntries((report.results || []).map((result) => [result.id, result])));
      const missing = (report.results || []).filter((result) => result.status === "missing").length;
      const failed = (report.results || []).filter((result) => result.status === "failed").length;
      setStatus(`已填写 ${report.filled || 0} 个字段${missing ? `，缺少资料 ${missing} 个` : ""}${failed ? `，失败 ${failed} 个` : ""}；请检查后再提交`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "填写失败");
    } finally {
      setBusy(false);
    }
  };

  const toggleField = (id: string) => {
    setSelectedFields((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const revealSection = (id: ProfileSectionId) =>
    setOpenSections((current) => ({ ...current, [id]: true }));
  const addEducation = () => {
    const id = newId("edu");
    set("education", [...draft.education, {
      id,
      school: "",
      college: "",
      major: "",
      degree: "",
      educationDegree: "",
      educationForm: "",
      courses: "",
      researchDirection: "",
      thesis: "",
      rank: "",
      overseasEducation: "",
      minorMajor: "",
      advisorName: "",
      startDate: "",
      endDate: "",
      gpa: ""
    }]);
    revealSection("education");
    setPendingEntryId(id);
  };
  const updateEducation = (id: string, patch: Partial<ProfileEducation>) =>
    set("education", draft.education.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addExperience = () => {
    const id = newId("exp");
    set("experiences", [...draft.experiences, {
      id,
      organization: "",
      title: "",
      type: "",
      department: "",
      salary: "",
      startDate: "",
      endDate: "",
      description: "",
      achievements: "",
      refereeName: "",
      refereeTitle: "",
      refereeContact: "",
      leavingReason: "",
      subordinateCount: "",
      isCurrent: false
    }]);
    revealSection("experience");
    setPendingEntryId(id);
  };
  const updateExperience = (id: string, patch: Partial<ProfileExperience>) =>
    set("experiences", draft.experiences.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addProject = () => {
    const id = newId("project");
    set("projects", [...draft.projects, { id, name: "", role: "", startDate: "", endDate: "", description: "", achievement: "", link: "" }]);
    revealSection("projects");
    setPendingEntryId(id);
  };
  const updateProject = (id: string, patch: Partial<ProfileProject>) =>
    set("projects", draft.projects.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addCampusExperience = () => {
    const id = newId("campus");
    set("campusExperiences", [
      ...draft.campusExperiences,
      { id, type: "", role: "", startDate: "", endDate: "", description: "" }
    ]);
    revealSection("campus");
    setPendingEntryId(id);
  };
  const updateCampusExperience = (id: string, patch: Partial<ProfileCampusExperience>) =>
    set(
      "campusExperiences",
      draft.campusExperiences.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  const addAward = () => {
    const id = newId("award");
    set("awards", [
      ...draft.awards,
      { id, date: "", name: "", level: "", description: "" }
    ]);
    revealSection("awards");
    setPendingEntryId(id);
  };
  const updateAward = (id: string, patch: Partial<ProfileAward>) =>
    set("awards", draft.awards.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addLanguage = () => {
    const id = newId("language");
    set("languages", [
      ...draft.languages,
      { id, name: "", certificate: "", englishLevel: "", score: "", proficiency: "", listeningSpeaking: "", readingWriting: "" }
    ]);
    revealSection("languages");
    setPendingEntryId(id);
  };
  const updateLanguage = (id: string, patch: Partial<ProfileLanguage>) =>
    set("languages", draft.languages.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addComputerSkill = () => {
    const id = newId("computer");
    set("computerSkills", [...draft.computerSkills, { id, type: "", proficiency: "" }]);
    revealSection("computer");
    setPendingEntryId(id);
  };
  const updateComputerSkill = (id: string, patch: Partial<ProfileComputerSkill>) =>
    set("computerSkills", draft.computerSkills.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addQualification = () => {
    const id = newId("qualification");
    set("qualifications", [...draft.qualifications, { id, date: "", name: "", number: "", description: "" }]);
    revealSection("qualifications");
    setPendingEntryId(id);
  };
  const updateQualification = (id: string, patch: Partial<ProfileQualification>) =>
    set("qualifications", draft.qualifications.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addFamilyMember = () => {
    const id = newId("family");
    set("familyMembers", [...draft.familyMembers, { id, name: "", relation: "", phone: "", company: "", position: "", politicalStatus: "" }]);
    revealSection("family");
    setPendingEntryId(id);
  };
  const updateFamilyMember = (id: string, patch: Partial<ProfileFamilyMember>) =>
    set("familyMembers", draft.familyMembers.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addPublication = () => {
    const id = newId("publication");
    set("publications", [...draft.publications, { id, date: "", journal: "", level: "", title: "", description: "", authors: "", impactFactor: "", link: "" }]);
    revealSection("publications");
    setPendingEntryId(id);
  };
  const updatePublication = (id: string, patch: Partial<ProfilePublication>) =>
    set("publications", draft.publications.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addPatent = () => {
    const id = newId("patent");
    set("patents", [...draft.patents, { id, date: "", name: "", number: "", type: "", achievement: "" }]);
    revealSection("patents");
    setPendingEntryId(id);
  };
  const updatePatent = (id: string, patch: Partial<ProfilePatent>) =>
    set("patents", draft.patents.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addWork = () => {
    const id = newId("work");
    set("works", [...draft.works, { id, name: "", link: "", description: "" }]);
    revealSection("portfolio");
    setPendingEntryId(id);
  };
  const updateWork = (id: string, patch: Partial<ProfileWork>) =>
    set("works", draft.works.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addCompetition = () => {
    const id = newId("competition");
    set("competitions", [...draft.competitions, { id, name: "", date: "", description: "" }]);
    revealSection("competitions");
    setPendingEntryId(id);
  };
  const updateCompetition = (id: string, patch: Partial<ProfileCompetition>) =>
    set("competitions", draft.competitions.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const retryCount = fields.filter(
    (field) => selectedFields.has(field.id) && resultMap[field.id]?.status !== "filled"
  ).length;

  const toggleSection = (id: ProfileSectionId) =>
    setOpenSections((current) => ({ ...current, [id]: !current[id] }));

  return (
    <section className="profile-view">
      <div className="profile-title-row">
        <button onClick={onBack}><ChevronLeft size={17} />秋招工作区</button>
        <span><ShieldCheck size={14} />仅保存在本地</span>
      </div>

      <div className="profile-heading">
        <span><UserRound size={20} /></span>
        <div><h1>个人资料库</h1><p>维护一次，重复用于不同公司的网申表单。</p></div>
      </div>

      <div className="profile-progress">
        <div><strong>{completion}%</strong><span>基础档案完整度</span></div>
        <i><b style={{ width: `${completion}%` }} /></i>
      </div>

      <div className="profile-autofill-card">
        <span><ScanLine size={20} /></span>
        <div><strong>填写当前网申</strong><small>识别后直接填写，缺少资料自动跳过</small></div>
        <button onClick={scan} disabled={busy}>识别表单</button>
      </div>

      {status && <button className="profile-status" onClick={() => setStatus("")}><span>{status}</span><X size={13} /></button>}

      {fields.length > 0 && (
        <div className="profile-match-panel">
          <div className="profile-section-title"><span><strong>填写结果</strong><small>{platform ? `${platform.name} · 映射库 ${platform.version}` : "通用表单"} · {selectedFields.size} / {fields.length} 个字段</small></span></div>
          {fillProgress && fillProgress.total > 0 && (
            <div className={"profile-fill-progress " + (fillProgress.stage === "done" ? "done" : "")}>
              <div><span>{fillProgress.stage === "done" ? "填写完成" : "正在逐项填写"}</span><strong>{Math.min(fillProgress.current, fillProgress.total)} / {fillProgress.total}</strong></div>
              <i><b style={{ width: (Math.min(100, Math.round((fillProgress.current / fillProgress.total) * 100)) + "%") }} /></i>
              {fillProgress.label && fillProgress.stage !== "done" && <small>当前：{fillProgress.label}</small>}
            </div>
          )}
          <div className="profile-match-list">
            {fields.map((field) => {
              const value = profileFieldValue(draft, field);
              const available = Boolean(value);
              const result = resultMap[field.id];
              const resultLabel = result?.status === "filled"
                ? "已核验"
                : result?.status === "missing"
                  ? "资料缺失"
                  : result?.status === "failed"
                  ? "填写失败"
                  : field.key
                      ? `${field.source === "rules" ? "规则" : field.source === "deepseek" ? "AI" : "手动"} · ${Math.round((field.confidence || 0) * 100)}% 匹配`
                      : "待匹配";
              return (
                <label className={`${!available ? "missing" : ""} ${result?.status || ""}`} key={field.id}>
                  <input type="checkbox" checked={selectedFields.has(field.id)} disabled={!available} onChange={() => toggleField(field.id)} />
                  <span className="profile-match-check">{selectedFields.has(field.id) && <Check size={12} />}</span>
                  <span><strong>{field.key ? FIELD_NAMES[field.key] || field.label : "待识别字段"}</strong><small>{field.section ? `${field.section} · ` : ""}{field.label}</small></span>
                  <em>{available ? value : result?.reason || "资料未填写"}<small>{resultLabel}</small></em>
                </label>
              );
            })}
          </div>
          {retryCount > 0 && (
            <button className="profile-fill-button" disabled={busy} onClick={fill}><Check size={15} />重试未成功项 {retryCount} 项</button>
          )}
          <p>已自动填写可用资料；请在网页中检查，OfferDuoDuo 不会点击提交按钮。</p>
        </div>
      )}

      <ProfileSection
        sectionKey="basic"
        open={openSections.basic}
        onToggle={toggleSection}
        title="基本信息"
        description="常见网申字段"
      >
        <div className="profile-grid">
          <Field label="姓名"><input value={draft.fullName} onChange={(e) => set("fullName", e.target.value)} /></Field>
          <Field label="性别"><select value={draft.gender} onChange={(e) => set("gender", e.target.value)}><option value="">请选择</option><option>男</option><option>女</option><option>不便透露</option></select></Field>
          <Field label="手机号"><input type="tel" value={draft.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="邮箱"><input type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="民族"><input value={draft.nationality} onChange={(e) => set("nationality", e.target.value)} placeholder="例如：汉族" /></Field>
          <Field label="证件类型"><input value={draft.idType} onChange={(e) => set("idType", e.target.value)} placeholder="例如：身份证" /></Field>
          <Field label="证件号码"><input value={draft.idNumber} onChange={(e) => set("idNumber", e.target.value)} /></Field>
          <Field label="出生日期"><input type="date" value={draft.birthDate} onChange={(e) => set("birthDate", e.target.value)} /></Field>
          <Field label="毕业时间"><input type="month" value={draft.graduationDate} onChange={(e) => set("graduationDate", e.target.value)} /></Field>
          <Field label="现居城市"><input value={draft.currentCity} onChange={(e) => set("currentCity", e.target.value)} /></Field>
          <Field label="籍贯"><input value={draft.nativePlace} onChange={(e) => set("nativePlace", e.target.value)} /></Field>
          <Field label="生源地"><input value={draft.studentSource} onChange={(e) => set("studentSource", e.target.value)} /></Field>
          <Field label="现居住地"><input value={draft.currentResidence} onChange={(e) => set("currentResidence", e.target.value)} /></Field>
          <Field label="身高（厘米）"><input inputMode="numeric" value={draft.height} onChange={(e) => set("height", e.target.value)} /></Field>
          <Field label="体重（公斤）"><input inputMode="decimal" value={draft.weight} onChange={(e) => set("weight", e.target.value)} /></Field>
          <Field label="是否统招"><select value={draft.recruitmentType} onChange={(e) => set("recruitmentType", e.target.value)}><option value="">请选择</option><option>是</option><option>否</option></select></Field>
          <Field label="应届/往届"><select value={draft.graduateStatus} onChange={(e) => set("graduateStatus", e.target.value)}><option value="">请选择</option><option>应届</option><option>往届</option></select></Field>
          <Field label="微信号"><input value={draft.wechat} onChange={(e) => set("wechat", e.target.value)} /></Field>
          <Field label="QQ"><input value={draft.qq} onChange={(e) => set("qq", e.target.value)} /></Field>
          <Field label="政治面貌"><input value={draft.politicalStatus} onChange={(e) => set("politicalStatus", e.target.value)} placeholder="例如：共青团员" /></Field>
          <Field label="婚姻状况"><input value={draft.maritalStatus} onChange={(e) => set("maritalStatus", e.target.value)} placeholder="例如：未婚" /></Field>
          <Field label="健康状况"><input value={draft.healthStatus} onChange={(e) => set("healthStatus", e.target.value)} /></Field>
          <Field label="特长"><input value={draft.specialty} onChange={(e) => set("specialty", e.target.value)} /></Field>
          <Field label="工作年限"><input value={draft.workYears} onChange={(e) => set("workYears", e.target.value)} /></Field>
          <Field label="国家/地区"><input value={draft.countryRegion} onChange={(e) => set("countryRegion", e.target.value)} placeholder="例如：中国" /></Field>
          <Field label="紧急联系人姓名"><input value={draft.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} /></Field>
          <Field label="紧急联系人电话"><input type="tel" value={draft.emergencyContactPhone} onChange={(e) => set("emergencyContactPhone", e.target.value)} /></Field>
          <Field label="联系地址" wide><input value={draft.address} onChange={(e) => set("address", e.target.value)} /></Field>
        </div>
      </ProfileSection>

      <ProfileSection
        sectionKey="preference"
        open={openSections.preference}
        onToggle={toggleSection}
        title="求职偏好"
        description="用于申请信息"
      >
        <div className="profile-grid">
          <Field label="目标岗位"><input value={draft.targetRole} onChange={(e) => set("targetRole", e.target.value)} /></Field>
          <Field label="意向城市"><input value={draft.targetCities} onChange={(e) => set("targetCities", e.target.value)} placeholder="例如：北京、上海" /></Field>
          <Field label="最早到岗"><input type="date" value={draft.earliestStartDate} onChange={(e) => set("earliestStartDate", e.target.value)} /></Field>
          <Field label="期望薪资"><input value={draft.expectedSalary} onChange={(e) => set("expectedSalary", e.target.value)} placeholder="例如：15-20K" /></Field>
          <Field label="推荐码 / 内推码"><input value={draft.referralCode} onChange={(e) => set("referralCode", e.target.value)} /></Field>
          <Field label="作品集"><input type="url" value={draft.portfolioUrl} onChange={(e) => set("portfolioUrl", e.target.value)} /></Field>
          <Field label="GitHub" wide><input type="url" value={draft.githubUrl} onChange={(e) => set("githubUrl", e.target.value)} /></Field>
        </div>
      </ProfileSection>

      <ProfileSection
        sectionKey="education"
        open={openSections.education}
        onToggle={toggleSection}
        title="教育经历"
        description={draft.education.length ? `${draft.education.length} 段经历 · 第一条用于自动匹配` : "可添加多段 · 第一条用于自动匹配"}
        action="添加教育经历"
        onAction={addEducation}
      >
        {draft.education.map((item) => (
          <EntryCard entryId={item.id} key={item.id} title={item.school || "新教育经历"} onRemove={() => set("education", draft.education.filter((entry) => entry.id !== item.id))}>
            <div className="profile-grid">
              <Field label="学校"><input value={item.school || ""} onChange={(e) => updateEducation(item.id, { school: e.target.value })} /></Field>
              <Field label="学院 / 院系"><input value={item.college || ""} onChange={(e) => updateEducation(item.id, { college: e.target.value })} /></Field>
              <Field label="专业"><input value={item.major || ""} onChange={(e) => updateEducation(item.id, { major: e.target.value })} /></Field>
              <Field label="学历"><input value={item.degree || ""} onChange={(e) => updateEducation(item.id, { degree: e.target.value })} /></Field>
              <Field label="学位"><input value={item.educationDegree || ""} onChange={(e) => updateEducation(item.id, { educationDegree: e.target.value })} /></Field>
              <Field label="学习形式"><input value={item.educationForm || ""} onChange={(e) => updateEducation(item.id, { educationForm: e.target.value })} placeholder="例如：全日制" /></Field>
              <Field label="GPA"><input value={item.gpa || ""} onChange={(e) => updateEducation(item.id, { gpa: e.target.value })} /></Field>
              <Field label="专业排名"><input value={item.rank || ""} onChange={(e) => updateEducation(item.id, { rank: e.target.value })} /></Field>
              <Field label="是否海外教育"><input value={item.overseasEducation || ""} onChange={(e) => updateEducation(item.id, { overseasEducation: e.target.value })} /></Field>
              <Field label="开始时间"><input type="month" value={item.startDate || ""} onChange={(e) => updateEducation(item.id, { startDate: e.target.value })} /></Field>
              <Field label="结束时间"><input type="month" value={item.endDate || ""} onChange={(e) => updateEducation(item.id, { endDate: e.target.value })} /></Field>
              <Field label="辅修 / 双学位"><input value={item.minorMajor || ""} onChange={(e) => updateEducation(item.id, { minorMajor: e.target.value })} /></Field>
              <Field label="导师姓名"><input value={item.advisorName || ""} onChange={(e) => updateEducation(item.id, { advisorName: e.target.value })} /></Field>
              <Field label="专业课程" wide><textarea rows={2} value={item.courses || ""} onChange={(e) => updateEducation(item.id, { courses: e.target.value })} /></Field>
              <Field label="研究方向" wide><textarea rows={2} value={item.researchDirection || ""} onChange={(e) => updateEducation(item.id, { researchDirection: e.target.value })} /></Field>
              <Field label="毕业论文" wide><textarea rows={2} value={item.thesis || ""} onChange={(e) => updateEducation(item.id, { thesis: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {draft.education.length > 0 && <AddEntryButton onClick={addEducation} text="添加教育经历" />}
        {!draft.education.length && <EmptyEntry onClick={addEducation} text="添加教育经历" />}
      </ProfileSection>

      <ProfileSection
        sectionKey="experience"
        open={openSections.experience}
        onToggle={toggleSection}
        title="实习 / 工作"
        description={draft.experiences.length ? `${draft.experiences.length} 段经历 · 支持添加多段` : "支持添加多段经历"}
        action="添加工作经历"
        onAction={addExperience}
      >
        {draft.experiences.map((item) => (
          <EntryCard entryId={item.id} key={item.id} title={item.organization || "新经历"} onRemove={() => set("experiences", draft.experiences.filter((entry) => entry.id !== item.id))}>
            <div className="profile-grid">
              <Field label="公司 / 组织"><input value={item.organization || ""} onChange={(e) => updateExperience(item.id, { organization: e.target.value })} /></Field>
              <Field label="岗位"><input value={item.title || ""} onChange={(e) => updateExperience(item.id, { title: e.target.value })} /></Field>
              <Field label="工作类型"><input value={item.type || ""} onChange={(e) => updateExperience(item.id, { type: e.target.value })} placeholder="例如：实习 / 全职" /></Field>
              <Field label="部门"><input value={item.department || ""} onChange={(e) => updateExperience(item.id, { department: e.target.value })} /></Field>
              <Field label="薪资"><input value={item.salary || ""} onChange={(e) => updateExperience(item.id, { salary: e.target.value })} /></Field>
              <Field label="下属人数"><input value={item.subordinateCount || ""} onChange={(e) => updateExperience(item.id, { subordinateCount: e.target.value })} /></Field>
              <Field label="开始时间"><input type="month" value={item.startDate || ""} onChange={(e) => updateExperience(item.id, { startDate: e.target.value })} /></Field>
              <Field label="结束时间"><input type="month" value={item.endDate || ""} onChange={(e) => updateExperience(item.id, { endDate: e.target.value })} disabled={item.isCurrent} /></Field>
              <Field label="当前仍在职"><input type="checkbox" checked={Boolean(item.isCurrent)} onChange={(e) => updateExperience(item.id, { isCurrent: e.target.checked })} /></Field>
              <Field label="经历描述" wide><textarea rows={4} value={item.description || ""} onChange={(e) => updateExperience(item.id, { description: e.target.value })} /></Field>
              <Field label="工作成果" wide><textarea rows={3} value={item.achievements || ""} onChange={(e) => updateExperience(item.id, { achievements: e.target.value })} /></Field>
              <Field label="证明人姓名"><input value={item.refereeName || ""} onChange={(e) => updateExperience(item.id, { refereeName: e.target.value })} /></Field>
              <Field label="证明人职位"><input value={item.refereeTitle || ""} onChange={(e) => updateExperience(item.id, { refereeTitle: e.target.value })} /></Field>
              <Field label="证明人联系方式"><input value={item.refereeContact || ""} onChange={(e) => updateExperience(item.id, { refereeContact: e.target.value })} /></Field>
              <Field label="离职原因" wide><input value={item.leavingReason || ""} onChange={(e) => updateExperience(item.id, { leavingReason: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {draft.experiences.length > 0 && <AddEntryButton onClick={addExperience} text="添加工作经历" />}
        {!draft.experiences.length && <EmptyEntry onClick={addExperience} text="添加工作经历" />}
      </ProfileSection>

      <ProfileSection
        sectionKey="projects"
        open={openSections.projects}
        onToggle={toggleSection}
        title="项目经历"
        description={draft.projects.length ? `${draft.projects.length} 个项目 · 产品、研究或比赛` : "产品、研究或比赛项目"}
        action="添加项目经历"
        onAction={addProject}
      >
        {draft.projects.map((item) => (
          <EntryCard entryId={item.id} key={item.id} title={item.name || "新项目"} onRemove={() => set("projects", draft.projects.filter((entry) => entry.id !== item.id))}>
            <div className="profile-grid">
              <Field label="项目名称"><input value={item.name || ""} onChange={(e) => updateProject(item.id, { name: e.target.value })} /></Field>
              <Field label="担任角色"><input value={item.role || ""} onChange={(e) => updateProject(item.id, { role: e.target.value })} /></Field>
              <Field label="开始时间"><input type="month" value={item.startDate || ""} onChange={(e) => updateProject(item.id, { startDate: e.target.value })} /></Field>
              <Field label="结束时间"><input type="month" value={item.endDate || ""} onChange={(e) => updateProject(item.id, { endDate: e.target.value })} /></Field>
              <Field label="项目链接"><input type="url" value={item.link || ""} onChange={(e) => updateProject(item.id, { link: e.target.value })} /></Field>
              <Field label="项目描述" wide><textarea rows={4} value={item.description || ""} onChange={(e) => updateProject(item.id, { description: e.target.value })} /></Field>
              <Field label="项目成果" wide><textarea rows={3} value={item.achievement || ""} onChange={(e) => updateProject(item.id, { achievement: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {draft.projects.length > 0 && <AddEntryButton onClick={addProject} text="添加项目经历" />}
        {!draft.projects.length && <EmptyEntry onClick={addProject} text="添加项目经历" />}
      </ProfileSection>

      <ProfileSection
        sectionKey="campus"
        open={openSections.campus}
        onToggle={toggleSection}
        title="在校经历"
        description={draft.campusExperiences.length ? `${draft.campusExperiences.length} 段经历 · 社团、学生组织或志愿服务` : "可添加多段校内经历"}
        action="添加在校经历"
        onAction={addCampusExperience}
      >
        {draft.campusExperiences.map((item) => (
          <EntryCard
            entryId={item.id}
            key={item.id}
            title={item.type || "新在校经历"}
            onRemove={() => set("campusExperiences", draft.campusExperiences.filter((entry) => entry.id !== item.id))}
          >
            <div className="profile-grid">
              <Field label="经历类型"><input value={item.type} onChange={(e) => updateCampusExperience(item.id, { type: e.target.value })} placeholder="例如：学生会、志愿服务" /></Field>
              <Field label="担任角色"><input value={item.role} onChange={(e) => updateCampusExperience(item.id, { role: e.target.value })} /></Field>
              <Field label="开始时间"><input type="month" value={item.startDate} onChange={(e) => updateCampusExperience(item.id, { startDate: e.target.value })} /></Field>
              <Field label="结束时间"><input type="month" value={item.endDate} onChange={(e) => updateCampusExperience(item.id, { endDate: e.target.value })} /></Field>
              <Field label="经历描述" wide><textarea rows={4} value={item.description} onChange={(e) => updateCampusExperience(item.id, { description: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {draft.campusExperiences.length > 0 && <AddEntryButton onClick={addCampusExperience} text="添加在校经历" />}
        {!draft.campusExperiences.length && <EmptyEntry onClick={addCampusExperience} text="添加在校经历" />}
      </ProfileSection>

      <ProfileSection
        sectionKey="awards"
        open={openSections.awards}
        onToggle={toggleSection}
        title="获奖情况"
        description={draft.awards.length ? `${draft.awards.length} 项奖励 · 可补充获奖详情` : "可添加多项奖励"}
        action="添加获奖情况"
        onAction={addAward}
      >
        {draft.awards.map((item) => (
          <EntryCard
            entryId={item.id}
            key={item.id}
            title={item.name || "新获奖记录"}
            onRemove={() => set("awards", draft.awards.filter((entry) => entry.id !== item.id))}
          >
            <div className="profile-grid">
              <Field label="获奖时间"><input type="month" value={item.date} onChange={(e) => updateAward(item.id, { date: e.target.value })} /></Field>
              <Field label="奖项名称"><input value={item.name} onChange={(e) => updateAward(item.id, { name: e.target.value })} /></Field>
              <Field label="奖励等级"><input value={item.level} onChange={(e) => updateAward(item.id, { level: e.target.value })} placeholder="例如：国家级 / 一等奖" /></Field>
              <Field label="奖励描述" wide><textarea rows={4} value={item.description} onChange={(e) => updateAward(item.id, { description: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {draft.awards.length > 0 && <AddEntryButton onClick={addAward} text="添加获奖情况" />}
        {!draft.awards.length && <EmptyEntry onClick={addAward} text="添加获奖情况" />}
      </ProfileSection>

      <ProfileSection
        sectionKey="languages"
        open={openSections.languages}
        onToggle={toggleSection}
        title="外语能力"
        description={draft.languages.length ? `${draft.languages.length} 项语言记录` : "语言、证书和听说读写能力"}
        action="添加外语能力"
        onAction={addLanguage}
      >
        {draft.languages.map((item) => (
          <EntryCard entryId={item.id} key={item.id} title={item.name || "新外语能力"} onRemove={() => set("languages", draft.languages.filter((entry) => entry.id !== item.id))}>
            <div className="profile-grid">
              <Field label="外语语种"><input value={item.name || ""} onChange={(e) => updateLanguage(item.id, { name: e.target.value })} /></Field>
              <Field label="证书名称"><input value={item.certificate || ""} onChange={(e) => updateLanguage(item.id, { certificate: e.target.value })} /></Field>
              <Field label="英语水平"><input value={item.englishLevel || ""} onChange={(e) => updateLanguage(item.id, { englishLevel: e.target.value })} /></Field>
              <Field label="成绩"><input value={item.score || ""} onChange={(e) => updateLanguage(item.id, { score: e.target.value })} /></Field>
              <Field label="掌握程度"><input value={item.proficiency || ""} onChange={(e) => updateLanguage(item.id, { proficiency: e.target.value })} /></Field>
              <Field label="听说能力"><input value={item.listeningSpeaking || ""} onChange={(e) => updateLanguage(item.id, { listeningSpeaking: e.target.value })} /></Field>
              <Field label="读写能力"><input value={item.readingWriting || ""} onChange={(e) => updateLanguage(item.id, { readingWriting: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {draft.languages.length > 0 && <AddEntryButton onClick={addLanguage} text="添加外语能力" />}
        {!draft.languages.length && <EmptyEntry onClick={addLanguage} text="添加外语能力" />}
      </ProfileSection>

      <ProfileSection
        sectionKey="computer"
        open={openSections.computer}
        onToggle={toggleSection}
        title="计算机技能"
        description={draft.computerSkills.length ? `${draft.computerSkills.length} 项技能` : "技能类型和掌握程度"}
        action="添加计算机技能"
        onAction={addComputerSkill}
      >
        {draft.computerSkills.map((item) => (
          <EntryCard entryId={item.id} key={item.id} title={item.type || "新计算机技能"} onRemove={() => set("computerSkills", draft.computerSkills.filter((entry) => entry.id !== item.id))}>
            <div className="profile-grid">
              <Field label="技能类型"><input value={item.type || ""} onChange={(e) => updateComputerSkill(item.id, { type: e.target.value })} placeholder="例如：Python、Excel" /></Field>
              <Field label="掌握程度"><input value={item.proficiency || ""} onChange={(e) => updateComputerSkill(item.id, { proficiency: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {draft.computerSkills.length > 0 && <AddEntryButton onClick={addComputerSkill} text="添加计算机技能" />}
        {!draft.computerSkills.length && <EmptyEntry onClick={addComputerSkill} text="添加计算机技能" />}
      </ProfileSection>

      <ProfileSection
        sectionKey="qualifications"
        open={openSections.qualifications}
        onToggle={toggleSection}
        title="资格证书"
        description={draft.qualifications.length ? `${draft.qualifications.length} 项证书` : "证书名称、编号和说明"}
        action="添加资格证书"
        onAction={addQualification}
      >
        {draft.qualifications.map((item) => (
          <EntryCard entryId={item.id} key={item.id} title={item.name || "新资格证书"} onRemove={() => set("qualifications", draft.qualifications.filter((entry) => entry.id !== item.id))}>
            <div className="profile-grid">
              <Field label="获得时间"><input type="month" value={item.date || ""} onChange={(e) => updateQualification(item.id, { date: e.target.value })} /></Field>
              <Field label="证书名称"><input value={item.name || ""} onChange={(e) => updateQualification(item.id, { name: e.target.value })} /></Field>
              <Field label="证书编号"><input value={item.number || ""} onChange={(e) => updateQualification(item.id, { number: e.target.value })} /></Field>
              <Field label="证书说明" wide><textarea rows={3} value={item.description || ""} onChange={(e) => updateQualification(item.id, { description: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {draft.qualifications.length > 0 && <AddEntryButton onClick={addQualification} text="添加资格证书" />}
        {!draft.qualifications.length && <EmptyEntry onClick={addQualification} text="添加资格证书" />}
      </ProfileSection>

      <ProfileSection
        sectionKey="family"
        open={openSections.family}
        onToggle={toggleSection}
        title="家庭情况"
        description={draft.familyMembers.length ? `${draft.familyMembers.length} 位家庭成员` : "仅在目标网申要求时填写"}
        action="添加家庭成员"
        onAction={addFamilyMember}
      >
        {draft.familyMembers.map((item) => (
          <EntryCard entryId={item.id} key={item.id} title={item.name || "新家庭成员"} onRemove={() => set("familyMembers", draft.familyMembers.filter((entry) => entry.id !== item.id))}>
            <div className="profile-grid">
              <Field label="姓名"><input value={item.name || ""} onChange={(e) => updateFamilyMember(item.id, { name: e.target.value })} /></Field>
              <Field label="关系"><input value={item.relation || ""} onChange={(e) => updateFamilyMember(item.id, { relation: e.target.value })} /></Field>
              <Field label="电话"><input type="tel" value={item.phone || ""} onChange={(e) => updateFamilyMember(item.id, { phone: e.target.value })} /></Field>
              <Field label="公司"><input value={item.company || ""} onChange={(e) => updateFamilyMember(item.id, { company: e.target.value })} /></Field>
              <Field label="职位"><input value={item.position || ""} onChange={(e) => updateFamilyMember(item.id, { position: e.target.value })} /></Field>
              <Field label="政治面貌"><input value={item.politicalStatus || ""} onChange={(e) => updateFamilyMember(item.id, { politicalStatus: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {draft.familyMembers.length > 0 && <AddEntryButton onClick={addFamilyMember} text="添加家庭成员" />}
        {!draft.familyMembers.length && <EmptyEntry onClick={addFamilyMember} text="添加家庭成员" />}
      </ProfileSection>

      <ProfileSection
        sectionKey="publications"
        open={openSections.publications}
        onToggle={toggleSection}
        title="论文期刊"
        description={draft.publications.length ? `${draft.publications.length} 项论文记录` : "论文、期刊和发表信息"}
        action="添加论文期刊"
        onAction={addPublication}
      >
        {draft.publications.map((item) => (
          <EntryCard entryId={item.id} key={item.id} title={item.title || "新论文记录"} onRemove={() => set("publications", draft.publications.filter((entry) => entry.id !== item.id))}>
            <div className="profile-grid">
              <Field label="发表时间"><input type="month" value={item.date || ""} onChange={(e) => updatePublication(item.id, { date: e.target.value })} /></Field>
              <Field label="刊物名称"><input value={item.journal || ""} onChange={(e) => updatePublication(item.id, { journal: e.target.value })} /></Field>
              <Field label="刊物层级"><input value={item.level || ""} onChange={(e) => updatePublication(item.id, { level: e.target.value })} /></Field>
              <Field label="论文名称"><input value={item.title || ""} onChange={(e) => updatePublication(item.id, { title: e.target.value })} /></Field>
              <Field label="论文作者"><input value={item.authors || ""} onChange={(e) => updatePublication(item.id, { authors: e.target.value })} /></Field>
              <Field label="影响因子"><input value={item.impactFactor || ""} onChange={(e) => updatePublication(item.id, { impactFactor: e.target.value })} /></Field>
              <Field label="论文链接"><input type="url" value={item.link || ""} onChange={(e) => updatePublication(item.id, { link: e.target.value })} /></Field>
              <Field label="论文描述" wide><textarea rows={3} value={item.description || ""} onChange={(e) => updatePublication(item.id, { description: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {draft.publications.length > 0 && <AddEntryButton onClick={addPublication} text="添加论文期刊" />}
        {!draft.publications.length && <EmptyEntry onClick={addPublication} text="添加论文期刊" />}
      </ProfileSection>

      <ProfileSection
        sectionKey="patents"
        open={openSections.patents}
        onToggle={toggleSection}
        title="专利"
        description={draft.patents.length ? `${draft.patents.length} 项专利` : "专利名称、编号和成果"}
        action="添加专利"
        onAction={addPatent}
      >
        {draft.patents.map((item) => (
          <EntryCard entryId={item.id} key={item.id} title={item.name || "新专利"} onRemove={() => set("patents", draft.patents.filter((entry) => entry.id !== item.id))}>
            <div className="profile-grid">
              <Field label="发表时间"><input type="month" value={item.date || ""} onChange={(e) => updatePatent(item.id, { date: e.target.value })} /></Field>
              <Field label="专利名称"><input value={item.name || ""} onChange={(e) => updatePatent(item.id, { name: e.target.value })} /></Field>
              <Field label="专利编号"><input value={item.number || ""} onChange={(e) => updatePatent(item.id, { number: e.target.value })} /></Field>
              <Field label="专利类型"><input value={item.type || ""} onChange={(e) => updatePatent(item.id, { type: e.target.value })} /></Field>
              <Field label="专利成果" wide><textarea rows={3} value={item.achievement || ""} onChange={(e) => updatePatent(item.id, { achievement: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {draft.patents.length > 0 && <AddEntryButton onClick={addPatent} text="添加专利" />}
        {!draft.patents.length && <EmptyEntry onClick={addPatent} text="添加专利" />}
      </ProfileSection>

      <ProfileSection
        sectionKey="portfolio"
        open={openSections.portfolio}
        onToggle={toggleSection}
        title="作品集"
        description={draft.works.length ? `${draft.works.length} 项作品` : "作品名称、链接和描述"}
        action="添加作品"
        onAction={addWork}
      >
        {draft.works.map((item) => (
          <EntryCard entryId={item.id} key={item.id} title={item.name || "新作品"} onRemove={() => set("works", draft.works.filter((entry) => entry.id !== item.id))}>
            <div className="profile-grid">
              <Field label="作品名称"><input value={item.name || ""} onChange={(e) => updateWork(item.id, { name: e.target.value })} /></Field>
              <Field label="作品链接"><input type="url" value={item.link || ""} onChange={(e) => updateWork(item.id, { link: e.target.value })} /></Field>
              <Field label="作品描述" wide><textarea rows={3} value={item.description || ""} onChange={(e) => updateWork(item.id, { description: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {draft.works.length > 0 && <AddEntryButton onClick={addWork} text="添加作品" />}
        {!draft.works.length && <EmptyEntry onClick={addWork} text="添加作品" />}
      </ProfileSection>

      <ProfileSection
        sectionKey="competitions"
        open={openSections.competitions}
        onToggle={toggleSection}
        title="竞赛"
        description={draft.competitions.length ? `${draft.competitions.length} 项竞赛` : "竞赛名称、时间和详情"}
        action="添加竞赛"
        onAction={addCompetition}
      >
        {draft.competitions.map((item) => (
          <EntryCard entryId={item.id} key={item.id} title={item.name || "新竞赛"} onRemove={() => set("competitions", draft.competitions.filter((entry) => entry.id !== item.id))}>
            <div className="profile-grid">
              <Field label="竞赛名称"><input value={item.name || ""} onChange={(e) => updateCompetition(item.id, { name: e.target.value })} /></Field>
              <Field label="参与时间"><input type="month" value={item.date || ""} onChange={(e) => updateCompetition(item.id, { date: e.target.value })} /></Field>
              <Field label="详情内容" wide><textarea rows={3} value={item.description || ""} onChange={(e) => updateCompetition(item.id, { description: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {draft.competitions.length > 0 && <AddEntryButton onClick={addCompetition} text="添加竞赛" />}
        {!draft.competitions.length && <EmptyEntry onClick={addCompetition} text="添加竞赛" />}
      </ProfileSection>

      <ProfileSection
        sectionKey="answers"
        open={openSections.answers}
        onToggle={toggleSection}
        title="常用回答"
        description="可复用并按公司微调"
      >
        <div className="profile-long-fields">
          <Field label="兴趣爱好"><textarea rows={3} value={draft.hobbies} onChange={(e) => set("hobbies", e.target.value)} /></Field>
          <Field label="自我介绍"><textarea rows={5} value={draft.selfIntroduction} onChange={(e) => set("selfIntroduction", e.target.value)} /></Field>
          <Field label="个人优势"><textarea rows={4} value={draft.strengths} onChange={(e) => set("strengths", e.target.value)} /></Field>
          <Field label="职业规划"><textarea rows={4} value={draft.careerPlan} onChange={(e) => set("careerPlan", e.target.value)} /></Field>
        </div>
      </ProfileSection>

      <div className="profile-save-bar">
        <span><ShieldCheck size={15} />不会发送给 AI</span>
        <button onClick={save} disabled={busy}><Check size={15} />保存个人资料</button>
      </div>
    </section>
  );
}

function ProfileSection({
  sectionKey,
  title,
  description,
  action,
  onAction,
  open,
  onToggle,
  children
}: {
  sectionKey: ProfileSectionId;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
  open: boolean;
  onToggle: (id: ProfileSectionId) => void;
  children: ReactNode;
}) {
  const bodyId = `profile-section-${sectionKey}`;
  return (
    <section className={`profile-section ${open ? "is-open" : "is-collapsed"}`}>
      <div className="profile-section-title">
        <button
          className="profile-section-toggle"
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onToggle(sectionKey)}
        >
          <span>
            <strong>{title}</strong>
            <small>{description}</small>
          </span>
          <ChevronDown className="profile-section-chevron" size={16} strokeWidth={1.8} />
        </button>
        {action && (
          <button className="profile-section-action" type="button" onClick={onAction}>
            <Plus size={13} />
            {action}
          </button>
        )}
      </div>
      {open && <div className="profile-section-body" id={bodyId}>{children}</div>}
    </section>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? "wide" : ""}><span>{label}</span>{children}</label>;
}

function EntryCard({ entryId, title, onRemove, children }: { entryId: string; title: string; onRemove: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`profile-entry ${open ? "is-open" : "is-collapsed"}`} data-profile-entry-id={entryId}>
      <div className="profile-entry-header">
        <button
          className="profile-entry-toggle"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown className="profile-entry-chevron" size={14} strokeWidth={1.8} />
          <strong>{title}</strong>
        </button>
        <button className="profile-entry-remove" type="button" onClick={onRemove} aria-label="删除">
          <Trash2 size={14} />
        </button>
      </div>
      {open && <div className="profile-entry-body">{children}</div>}
    </div>
  );
}

function AddEntryButton({ onClick, text }: { onClick: () => void; text: string }) {
  return (
    <button className="profile-add-entry" type="button" onClick={onClick}>
      <Plus size={15} />
      {text}
    </button>
  );
}

function EmptyEntry({ onClick, text }: { onClick: () => void; text: string }) {
  return <button className="profile-empty-entry" type="button" onClick={onClick}><Plus size={15} />{text}</button>;
}

