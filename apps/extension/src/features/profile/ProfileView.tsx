import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  FileCheck2,
  Plus,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  X
} from "lucide-react";
import { matchFormFields } from "@/integrations/deepseek/deepseek";
import { normalizeRepeatableFormFields } from "@/features/profile/repeatableFormFields";
import {
  ACTIVE_RESUME_KEY,
  applyResumeFixedProfile,
  extractResumeFixedProfile,
  loadActiveResumeId,
  loadResumeLibrary,
  PROFILE_KEY,
  RESUMES_KEY,
  saveBaseProfile,
  saveResumeLibrary,
  setActiveResumeId,
  type StoredResume
} from "@/infrastructure/storage/storage";
import { resolveProfileExperienceKind } from "@/shared/types";
import type {
  ProfileExperienceKind,
  FormFieldMatch,
  FormFillResponse,
  FormScanResponse,
  OfferFlowSettings,
  PersonalProfile,
  ProfileAward,
  ProfileCampusExperience,
  ProfileEducation,
  ProfileExperience,
  ProfileProject
} from "@/shared/types";

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
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

const FIELD_NAMES: Record<string, string> = {
  fullName: "姓名",
  gender: "性别",
  phone: "手机号",
  email: "邮箱",
  birthDate: "出生日期",
  graduationDate: "毕业时间",
  currentCity: "现居城市",
  nativePlace: "籍贯",
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
  | "internships"
  | "work"
  | "projects"
  | "campus"
  | "awards"
  | "answers";

type ProfileSectionState = Record<ProfileSectionId, boolean>;

const DEFAULT_OPEN_SECTIONS: ProfileSectionState = {
  basic: true,
  preference: true,
  education: true,
  internships: true,
  work: true,
  projects: true,
  campus: true,
  awards: true,
  answers: true
};

const COLLAPSED_SECTIONS: ProfileSectionState = {
  basic: false,
  preference: false,
  education: false,
  internships: false,
  work: false,
  projects: false,
  campus: false,
  awards: false,
  answers: false
};

function inferredEducationDegree(level?: string) {
  const normalized = String(level || "").trim();
  if (/博士/.test(normalized)) return "博士";
  if (/硕士|研究生/.test(normalized)) return "硕士";
  if (/本科|学士/.test(normalized)) return "学士";
  return "";
}

function profileValues(profile: PersonalProfile, repeatIndex = 0): Record<string, string> {
  const index = Number.isInteger(repeatIndex) && repeatIndex >= 0 ? repeatIndex : 0;
  const education = profile.education[index];
  const experience = profile.experiences[index];
  const project = profile.projects[index];
  const campusExperience = profile.campusExperiences[index];
  const award = profile.awards[index];
  const language = profile.languages?.[index] || profile.languages?.[0];
  const qualification = profile.qualifications?.[index] || profile.qualifications?.[0];
  const familyMember = profile.familyMembers?.[index] || profile.familyMembers?.[0];
  return {
    fullName: profile.fullName,
    gender: profile.gender,
    phone: profile.phone,
    email: profile.email,
    birthDate: profile.birthDate,
    graduationDate: profile.graduationDate,
    currentCity: profile.currentCity,
    nativePlace: profile.nativePlace,
    height: profile.height,
    weight: profile.weight,
    recruitmentType: profile.recruitmentType,
    graduateStatus: profile.graduateStatus,
    address: profile.address,
    currentResidence: profile.currentResidence || "",
    nationality: profile.nationality || "",
    idType: profile.idType || "",
    idNumber: profile.idNumber || "",
    studentSource: profile.studentSource || "",
    wechat: profile.wechat || "",
    qq: profile.qq || "",
    politicalStatus: profile.politicalStatus || "",
    maritalStatus: profile.maritalStatus || "",
    healthStatus: profile.healthStatus || "",
    specialty: profile.specialty || "",
    workYears: profile.workYears || "",
    emergencyContactName: profile.emergencyContactName || "",
    emergencyContactPhone: profile.emergencyContactPhone || "",
    countryRegion: profile.countryRegion || "",
    targetRole: profile.targetRole,
    targetCities: profile.targetCities,
    earliestStartDate: profile.earliestStartDate,
    expectedSalary: profile.expectedSalary || "",
    referralCode: profile.referralCode || "",
    portfolioUrl: profile.portfolioUrl,
    githubUrl: profile.githubUrl,
    school: education?.school || "",
    educationCollege: education?.college || "",
    major: education?.major || "",
    degree: education?.degree || "",
    educationDegree: education?.educationDegree || inferredEducationDegree(education?.degree),
    educationForm: education?.educationForm || "",
    educationCourses: education?.courses || "",
    educationResearchDirection: education?.researchDirection || "",
    educationThesis: education?.thesis || "",
    educationRank: education?.rank || "",
    overseasEducation: education?.overseasEducation || "",
    minorMajor: education?.minorMajor || "",
    advisorName: education?.advisorName || "",
    gpa: education?.gpa || "",
    educationStartDate: education?.startDate || "",
    educationEndDate: education?.endDate || "",
    experienceOrganization: experience?.organization || "",
    experienceTitle: experience?.title || "",
    experienceStartDate: experience?.startDate || "",
    experienceEndDate: experience?.isCurrent ? "至今" : experience?.endDate || "",
    experienceDescription: experience?.description || "",
    experienceType: experience?.type || "",
    experienceDepartment: experience?.department || "",
    experienceSalary: experience?.salary || "",
    experienceAchievements: experience?.achievements || "",
    refereeName: experience?.refereeName || "",
    refereeTitle: experience?.refereeTitle || "",
    refereeContact: experience?.refereeContact || "",
    leavingReason: experience?.leavingReason || "",
    subordinateCount: experience?.subordinateCount || "",
    experienceCurrent: experience?.isCurrent === undefined ? "" : experience.isCurrent ? "是" : "否",
    projectName: project?.name || "",
    projectRole: project?.role || "",
    projectStartDate: project?.startDate || "",
    projectEndDate: project?.endDate || "",
    projectDescription: project?.description || "",
    projectAchievement: project?.achievement || "",
    projectLink: project?.link || "",
    campusExperienceType: campusExperience?.type || "",
    campusExperienceRole: campusExperience?.role || "",
    campusExperienceStartDate: campusExperience?.startDate || "",
    campusExperienceEndDate: campusExperience?.endDate || "",
    campusExperienceDescription: campusExperience?.description || "",
    awardDate: award?.date || "",
    awardName: award?.name || "",
    awardLevel: award?.level || "",
    awardDescription: award?.description || "",
    languageName: language?.name || "",
    languageCertificate: language?.certificate || "",
    englishLevel: language?.englishLevel || "",
    languageScore: language?.score || "",
    languageProficiency: language?.proficiency || "",
    listeningSpeaking: language?.listeningSpeaking || "",
    readingWriting: language?.readingWriting || "",
    qualificationDate: qualification?.date || "",
    qualificationName: qualification?.name || "",
    qualificationNumber: qualification?.number || "",
    qualificationDescription: qualification?.description || "",
    familyName: familyMember?.name || "",
    familyRelation: familyMember?.relation || "",
    familyPhone: familyMember?.phone || "",
    familyCompany: familyMember?.company || "",
    familyPosition: familyMember?.position || "",
    familyPoliticalStatus: familyMember?.politicalStatus || "",
    selfIntroduction: profile.selfIntroduction,
    strengths: profile.strengths,
    careerPlan: profile.careerPlan,
    hobbies: profile.hobbies || "",
    ...(profile.extraFields || {})
  };
}

function profileRepeatCounts(profile: PersonalProfile) {
  return {
    education: profile.education.length,
    experience: profile.experiences.length,
    project: profile.projects.length,
    campus: profile.campusExperiences.length,
    award: profile.awards.length,
    language: profile.languages?.length || 0,
    qualification: profile.qualifications?.length || 0,
    family: profile.familyMembers?.length || 0
  };
}

function experienceIndexesByKind(profile: PersonalProfile) {
  const work: number[] = [];
  const internship: number[] = [];
  profile.experiences.forEach((experience, index) => {
    if (resolveProfileExperienceKind(experience) === "work") work.push(index);
    else internship.push(index);
  });
  return { work, internship };
}

function profileRepeatPlan(profile: PersonalProfile) {
  const experience = experienceIndexesByKind(profile);
  return {
    experience: {
      work: experience.work.length,
      internship: experience.internship.length,
      workIndexes: experience.work,
      internshipIndexes: experience.internship
    }
  };
}

function experienceSectionKind(field: FormFieldMatch): "internship" | "work" | "" {
  if (field.repeatEntryKind === "internship") return "internship";
  if (field.repeatEntryKind === "work") return "work";
  return /实习|practice|intern/i.test(field.section || "")
    ? "internship"
    : /工作|work|employment/i.test(field.section || "")
      ? "work"
      : "";
}

const INTERNSHIP_FIELD_NAMES: Partial<Record<NonNullable<FormFieldMatch["key"]>, string>> = {
  experienceOrganization: "实习单位",
  experienceTitle: "实习岗位",
  experienceStartDate: "实习开始时间",
  experienceEndDate: "实习结束时间",
  experienceDescription: "实习内容",
  experienceDepartment: "实习部门",
  experienceAchievements: "实习成果"
};

function profileFieldName(field: FormFieldMatch): string {
  if (!field.key) return field.label;
  if (experienceSectionKind(field) === "internship" && INTERNSHIP_FIELD_NAMES[field.key]) {
    return INTERNSHIP_FIELD_NAMES[field.key] || field.label;
  }
  return FIELD_NAMES[field.key] || field.label;
}

function assignPlatformProfileIndexes(fields: FormFieldMatch[], profile: PersonalProfile): FormFieldMatch[] {
  const buckets = experienceIndexesByKind(profile);
  const entryIndexes = new Map<string, number>();
  const sectionCounts = new Map<string, number>();

  for (const field of fields) {
    if (field.repeatGroup !== "experience") continue;
    const sectionKind = experienceSectionKind(field);
    if (!sectionKind) continue;
    if (Number.isInteger(field.repeatLocalIndex) && Number(field.repeatLocalIndex) >= 0) continue;
    const entryKey = `${sectionKind}:${field.repeatEntryFingerprint || field.repeatIndex || 0}`;
    if (!entryIndexes.has(entryKey)) {
      const localIndex = sectionCounts.get(sectionKind) || 0;
      entryIndexes.set(entryKey, localIndex);
      sectionCounts.set(sectionKind, localIndex + 1);
    }
  }

  return fields.map((field) => {
    if (field.repeatGroup !== "experience") return field;
    const sectionKind = experienceSectionKind(field);
    if (!sectionKind) return field;
    const entryKey = `${sectionKind}:${field.repeatEntryFingerprint || field.repeatIndex || 0}`;
    const localIndex = Number.isInteger(field.repeatLocalIndex) && Number(field.repeatLocalIndex) >= 0
      ? Number(field.repeatLocalIndex)
      : entryIndexes.get(entryKey) ?? 0;
    return { ...field, profileRepeatIndex: buckets[sectionKind][localIndex] ?? -1 };
  });
}

function profileFormSnapshots(profile: PersonalProfile): Record<string, string>[] {
  const counts = profileRepeatCounts(profile);
  const snapshotCount = Math.max(1, ...Object.values(counts));
  return Array.from({ length: snapshotCount }, (_, index) => profileValues(profile, index));
}

const PROFILE_DATE_RANGE_SEPARATOR = "\u001f";
const FORM_CONTENT_RUNTIME_VERSION = "2026-08-25.autofill-v28";
const FORM_CONTENT_SESSION_ID = `${FORM_CONTENT_RUNTIME_VERSION}:${
  globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}`;
const dateRangeEndKey: Partial<Record<NonNullable<FormFieldMatch["key"]>, NonNullable<FormFieldMatch["key"]>>> = {
  educationStartDate: "educationEndDate",
  experienceStartDate: "experienceEndDate",
  projectStartDate: "projectEndDate"
};

function profileFieldValue(
  profile: PersonalProfile,
  field: Pick<FormFieldMatch, "key" | "repeatIndex" | "profileRepeatIndex" | "type">
): string {
  if (!field.key) return "";
  const repeatIndex = field.profileRepeatIndex ?? field.repeatIndex ?? 0;
  if (repeatIndex < 0) return "";
  const values = profileValues(profile, repeatIndex);
  const value = values[field.key] || "";
  const endKey = field.type === "date-range" ? dateRangeEndKey[field.key] : undefined;
  return endKey ? `${value}${PROFILE_DATE_RANGE_SEPARATOR}${values[endKey] || ""}` : value;
}

const displayProfileFieldValue = (value: string, key?: string) => {
  if (key === "idNumber" && value.length > 6) return `${value.slice(0, 3)}${"*".repeat(Math.max(4, value.length - 7))}${value.slice(-4)}`;
  return value.includes(PROFILE_DATE_RANGE_SEPARATOR)
    ? value.split(PROFILE_DATE_RANGE_SEPARATOR).filter(Boolean).join(" — ")
    : value;
};

function comparableProfile(profile: PersonalProfile): string {
  const { updatedAt: _updatedAt, ...content } = profile;
  return JSON.stringify(content);
}

async function activeTabMessage(message: unknown) {
  try {
    if (typeof chrome === "undefined" || !chrome.tabs) {
      throw new Error("请在已加载扩展的招聘网页中使用");
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("http")) throw new Error("当前页面不支持表单填写");
    const payload: Record<string, unknown> = message && typeof message === "object"
      ? { ...(message as Record<string, unknown>) }
      : { value: message };
    if (payload.type === "OFFERFLOW_SCAN_APPLICATION_FORM") payload.type = "OFFERFLOW_SCAN_APPLICATION_FORM_V2";
    if (payload.type === "OFFERFLOW_FILL_APPLICATION_FORM") payload.type = "OFFERFLOW_FILL_APPLICATION_FORM_V2";

    // An unpacked extension reload does not replace content scripts already
    // living in an open recruitment tab. Always inject the current artifact;
    // content.js is version-guarded, so this is idempotent.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sessionId: string) => {
        (globalThis as typeof globalThis & { __offerflowDesiredContentSession?: string })
          .__offerflowDesiredContentSession = sessionId;
      },
      args: [FORM_CONTENT_SESSION_ID]
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["adapter-registry.js", "extraction-rules.js", "form-adapters.js", "form-runtime.js", "form-control-drivers.js", "content.js"]
    });
    const response = await chrome.tabs.sendMessage(tab.id, payload);
    if (
      (payload.type === "OFFERFLOW_SCAN_APPLICATION_FORM_V2" || payload.type === "OFFERFLOW_FILL_APPLICATION_FORM_V2") &&
      response?.runtimeVersion !== FORM_CONTENT_RUNTIME_VERSION
    ) {
      throw new Error("招聘页面仍在使用旧版填写脚本，请重新加载插件后重试");
    }
    return response;
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
  onTailor
}: {
  profile: PersonalProfile;
  settings: OfferFlowSettings;
  onSave: (profile: PersonalProfile) => Promise<void>;
  onTailor?: () => void;
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
  const [resumeFileName, setResumeFileName] = useState("");
  const [resumeLibrary, setResumeLibrary] = useState<StoredResume[]>([]);
  const [activeResumeId, setActiveResumeIdState] = useState("");

  useEffect(() => setDraft(profile), [profile]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [library, activeId] = await Promise.all([loadResumeLibrary(), loadActiveResumeId()]);
      if (cancelled) return;
      const currentId = activeId && library.some((resume) => resume.id === activeId) ? activeId : library[0]?.id || "";
      setResumeLibrary(library);
      setActiveResumeIdState(currentId);
      const current = library.find((resume) => resume.id === currentId);
      if (current) {
        setDraft(current.profile);
        setResumeFileName(current.sourceFileName || "");
      }
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
      const profileChange = changes[PROFILE_KEY]?.newValue as PersonalProfile | undefined;
      const libraryChanged = Boolean(changes[RESUMES_KEY] || changes[ACTIVE_RESUME_KEY]);
      if (!libraryChanged && !profileChange) return;
      if (!libraryChanged && profileChange) {
        setDraft(profileChange);
        return;
      }
      void (async () => {
        const [library, activeId] = await Promise.all([loadResumeLibrary(), loadActiveResumeId()]);
        const currentId = activeId && library.some((resume) => resume.id === activeId) ? activeId : library[0]?.id || "";
        setResumeLibrary(library);
        setActiveResumeIdState(currentId);
        const current = library.find((resume) => resume.id === currentId);
        if (current) {
          setDraft(profileChange || current.profile);
          setResumeFileName(current.sourceFileName || "");
        } else if (profileChange) {
          setDraft(profileChange);
        }
      })();
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

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
    draft.awards.length
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
  const currentResume = resumeLibrary.find((resume) => resume.id === activeResumeId);
  const hasPendingChanges = useMemo(() => {
    const baseline = currentResume?.profile || profile;
    const sourceChanged = Boolean(
      currentResume && resumeFileName !== (currentResume.sourceFileName || "")
    );
    return sourceChanged || comparableProfile(draft) !== comparableProfile(baseline);
  }, [currentResume, draft, profile, resumeFileName]);
  const set = <K extends keyof PersonalProfile>(key: K, value: PersonalProfile[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const selectResume = async (id: string) => {
    const selected = resumeLibrary.find((resume) => resume.id === id);
    if (!selected) return;
    setActiveResumeIdState(id);
    setDraft(selected.profile);
    setResumeFileName(selected.sourceFileName || "");
    await Promise.all([
      setActiveResumeId(id),
      saveBaseProfile(extractResumeFixedProfile(selected.profile)),
      onSave(selected.profile)
    ]);
    setStatus(`已切换当前网申简历：${selected.name} · 插件资料已同步`);
  };

  const persistDraft = async () => {
    const now = new Date().toISOString();
    const syncedProfile = { ...draft, updatedAt: now };
    const fixedProfile = extractResumeFixedProfile(syncedProfile);
    let nextActiveResumeId = activeResumeId || resumeLibrary[0]?.id || "";
    let nextLibrary = resumeLibrary;

    if (!nextActiveResumeId) {
      nextActiveResumeId = newId("resume");
      nextLibrary = [{
        id: nextActiveResumeId,
        name: "我的简历",
        sourceFileName: resumeFileName || undefined,
        profile: syncedProfile,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now
      }];
    } else {
      nextLibrary = resumeLibrary.map((resume) => ({
        ...resume,
        profile: resume.id === nextActiveResumeId
          ? syncedProfile
          : applyResumeFixedProfile(resume.profile, fixedProfile),
        sourceFileName: resume.id === nextActiveResumeId
          ? resumeFileName || resume.sourceFileName
          : resume.sourceFileName,
        updatedAt: resume.id === nextActiveResumeId ? now : resume.updatedAt
      }));
    }

    await Promise.all([
      onSave(syncedProfile),
      saveBaseProfile(fixedProfile),
      saveResumeLibrary(nextLibrary),
      nextActiveResumeId !== activeResumeId ? setActiveResumeId(nextActiveResumeId) : Promise.resolve()
    ]);
    setActiveResumeIdState(nextActiveResumeId);
    setDraft(syncedProfile);
    setResumeLibrary(nextLibrary);
    return syncedProfile;
  };

  const save = async () => {
    setBusy(true);
    try {
      await persistDraft();
      setOpenSections(COLLAPSED_SECTIONS);
      setStatus("个人资料与简历中心已同步 · 已收起各资料分组");
    } finally {
      setBusy(false);
    }
  };

  const scan = async () => {
    setBusy(true);
    setStatus("");
    setFillProgress(undefined);
    try {
      await persistDraft();
      const response = (await activeTabMessage({
        type: "OFFERFLOW_SCAN_APPLICATION_FORM",
        expandRepeaters: false,
        repeatCounts: profileRepeatCounts(draft),
        repeatPlan: profileRepeatPlan(draft)
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
      matches = assignPlatformProfileIndexes(normalizeRepeatableFormFields(matches), draft);
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
              profileSnapshots: profileFormSnapshots(draft),
              repeatCounts: profileRepeatCounts(draft),
              repeatPlan: profileRepeatPlan(draft),
              maxRounds: 5,
              fillDynamicFields: true,
              delayMs: 55
            });
            if (!fillResponse?.ok) throw new Error(fillResponse?.error || "填写失败");
            const report = fillResponse as FormFillResponse;
            if (report.finalFields?.length) {
              setFields(assignPlatformProfileIndexes(normalizeRepeatableFormFields(report.finalFields), draft));
            }
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
        profileSnapshots: profileFormSnapshots(draft),
        repeatCounts: profileRepeatCounts(draft),
        repeatPlan: profileRepeatPlan(draft),
        fillDynamicFields: true,
        maxRounds: 5,
        delayMs: 55
      });
      if (!response?.ok) throw new Error(response?.error || "填写失败");
      const report = response as FormFillResponse;
      if (report.finalFields?.length) {
        setFields(assignPlatformProfileIndexes(normalizeRepeatableFormFields(report.finalFields), draft));
      }
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
    set("education", [...draft.education, { id, school: "", college: "", major: "", degree: "", educationForm: "", startDate: "", endDate: "", gpa: "" }]);
    revealSection("education");
    setPendingEntryId(id);
  };
  const updateEducation = (id: string, patch: Partial<ProfileEducation>) =>
    set("education", draft.education.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addExperience = (kind: ProfileExperienceKind) => {
    const id = newId(kind === "internship" ? "internship" : "work");
    set("experiences", [...draft.experiences, { id, kind, organization: "", title: "", startDate: "", endDate: "", description: "" }]);
    revealSection(kind === "internship" ? "internships" : "work");
    setPendingEntryId(id);
  };
  const updateExperience = (id: string, patch: Partial<ProfileExperience>) =>
    set("experiences", draft.experiences.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addProject = () => {
    const id = newId("project");
    set("projects", [...draft.projects, { id, name: "", role: "", startDate: "", endDate: "", description: "" }]);
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
  const retryCount = fields.filter(
    (field) => selectedFields.has(field.id) && resultMap[field.id]?.status !== "filled"
  ).length;
  const internshipExperiences = draft.experiences.filter(
    (experience) => resolveProfileExperienceKind(experience) === "internship"
  );
  const workExperiences = draft.experiences.filter(
    (experience) => resolveProfileExperienceKind(experience) === "work"
  );

  const experienceCards = (items: ProfileExperience[], kind: ProfileExperienceKind) => items.map((item) => (
    <EntryCard
      entryId={item.id}
      key={item.id}
      title={item.organization || (kind === "internship" ? "新实习经历" : "新工作经历")}
      onRemove={() => set("experiences", draft.experiences.filter((entry) => entry.id !== item.id))}
    >
      <div className="profile-grid">
        <Field label="经历类别">
          <select value={resolveProfileExperienceKind(item)} onChange={(e) => updateExperience(item.id, { kind: e.target.value as ProfileExperienceKind })}>
            <option value="internship">实习经历</option>
            <option value="work">工作经历</option>
          </select>
        </Field>
        <Field label={kind === "internship" ? "实习单位 / 组织" : "公司 / 组织"}><input value={item.organization} onChange={(e) => updateExperience(item.id, { organization: e.target.value })} /></Field>
        <Field label={kind === "internship" ? "实习岗位" : "工作岗位"}><input value={item.title} onChange={(e) => updateExperience(item.id, { title: e.target.value })} /></Field>
        <Field label="开始时间"><input type="month" value={monthInputValue(item.startDate)} onChange={(e) => updateExperience(item.id, { startDate: e.target.value })} /></Field>
        <Field label="结束时间"><input type="month" value={monthInputValue(item.endDate)} onChange={(e) => updateExperience(item.id, { endDate: e.target.value })} /></Field>
        <Field label={kind === "internship" ? "实习内容" : "工作职责"} wide><textarea rows={4} value={item.description} onChange={(e) => updateExperience(item.id, { description: e.target.value })} /></Field>
      </div>
    </EntryCard>
  ));

  const toggleSection = (id: ProfileSectionId) =>
    setOpenSections((current) => ({ ...current, [id]: !current[id] }));

  return (
    <section className="profile-view">
      {onTailor && (
        <div className="profile-autofill-card profile-tailor-card">
          <span><Sparkles size={20} /></span>
          <div><strong>为当前岗位定制简历</strong><small>点击后自动读取 JD、匹配经历并生成预览</small></div>
          <button onClick={onTailor}>
            <Wand2 size={14} />
            开始定制
          </button>
        </div>
      )}

      {resumeLibrary.length > 0 && (
        <div className="profile-resume-switcher">
          <div className="profile-resume-switcher-copy">
            <span><FileCheck2 size={16} /></span>
            <div>
              <strong>当前网申简历</strong>
              <small>{hasPendingChanges ? "有修改待保存" : "已与简历中心同步"}</small>
            </div>
          </div>
          <select value={activeResumeId} onChange={(event) => void selectResume(event.target.value)} disabled={busy}>
            {resumeLibrary.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}
          </select>
          <span className={`profile-sync-state ${hasPendingChanges ? "pending" : "synced"}`}>
            {hasPendingChanges ? "待保存" : "已同步"}
          </span>
        </div>
      )}

      <div className="profile-autofill-card">
        <span><ScanLine size={20} /></span>
        <div><strong>填写当前网申</strong><small>自动匹配并填写，缺少资料自动跳过</small></div>
        <button onClick={scan} disabled={busy}>自动填写</button>
      </div>

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
          <Field label="出生日期"><input type="date" value={draft.birthDate} onChange={(e) => set("birthDate", e.target.value)} /></Field>
          <Field label="毕业时间"><input type="month" value={monthInputValue(draft.graduationDate)} onChange={(e) => set("graduationDate", e.target.value)} /></Field>
          <Field label="现居城市"><input value={draft.currentCity} onChange={(e) => set("currentCity", e.target.value)} /></Field>
          <Field label="籍贯"><input value={draft.nativePlace} onChange={(e) => set("nativePlace", e.target.value)} /></Field>
          <Field label="身高（厘米）"><input inputMode="numeric" value={draft.height} onChange={(e) => set("height", e.target.value)} /></Field>
          <Field label="体重（公斤）"><input inputMode="decimal" value={draft.weight} onChange={(e) => set("weight", e.target.value)} /></Field>
          <Field label="是否统招"><select value={draft.recruitmentType} onChange={(e) => set("recruitmentType", e.target.value)}><option value="">请选择</option><option>是</option><option>否</option></select></Field>
          <Field label="应届/往届"><select value={draft.graduateStatus} onChange={(e) => set("graduateStatus", e.target.value)}><option value="">请选择</option><option>应届</option><option>往届</option></select></Field>
          <Field label="联系地址" wide><input value={draft.address} onChange={(e) => set("address", e.target.value)} /></Field>
        </div>
      </ProfileSection>

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
                  <span><strong>{field.key ? profileFieldName(field) : "待识别字段"}</strong><small>{field.section ? `${field.section} · ` : ""}{field.label}</small></span>
                  <em>{available ? displayProfileFieldValue(value, field.key) : result?.reason || "资料未填写"}<small>{resultLabel}</small></em>
                </label>
              );
            })}
          </div>
          {retryCount > 0 && (
            <button className="profile-fill-button" disabled={busy} onClick={fill}><Check size={15} />重试未成功项 {retryCount} 项</button>
          )}
          <p>已自动填写可用资料；请在网页中检查，JobKoI 不会点击提交按钮。</p>
        </div>
      )}

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
              <Field label="学校"><input value={item.school} onChange={(e) => updateEducation(item.id, { school: e.target.value })} /></Field>
              <Field label="学院"><input value={item.college || ""} onChange={(e) => updateEducation(item.id, { college: e.target.value })} placeholder="例如：计算机学院" /></Field>
              <Field label="专业"><input value={item.major} onChange={(e) => updateEducation(item.id, { major: e.target.value })} /></Field>
              <Field label="学历"><input value={item.degree} onChange={(e) => updateEducation(item.id, { degree: e.target.value })} /></Field>
              <Field label="学习形式">
                <select value={item.educationForm || ""} onChange={(e) => updateEducation(item.id, { educationForm: e.target.value })}>
                  <option value="">请选择</option>
                  {item.educationForm && !EDUCATION_FORM_OPTIONS.includes(item.educationForm as typeof EDUCATION_FORM_OPTIONS[number]) && <option value={item.educationForm}>{item.educationForm}</option>}
                  {EDUCATION_FORM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </Field>
              <Field label="GPA"><input value={item.gpa} onChange={(e) => updateEducation(item.id, { gpa: e.target.value })} /></Field>
              <Field label="开始时间"><input type="month" value={monthInputValue(item.startDate)} onChange={(e) => updateEducation(item.id, { startDate: e.target.value })} /></Field>
              <Field label="结束时间"><input type="month" value={monthInputValue(item.endDate)} onChange={(e) => updateEducation(item.id, { endDate: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {draft.education.length > 0 && <AddEntryButton onClick={addEducation} text="添加教育经历" />}
        {!draft.education.length && <EmptyEntry onClick={addEducation} text="添加教育经历" />}
      </ProfileSection>

      <ProfileSection
        sectionKey="internships"
        open={openSections.internships}
        onToggle={toggleSection}
        title="实习经历"
        description={internshipExperiences.length ? `${internshipExperiences.length} 段实习 · 只匹配网申的实习区块` : "只匹配网申的实习经历区块"}
        action="添加实习经历"
        onAction={() => addExperience("internship")}
      >
        {experienceCards(internshipExperiences, "internship")}
        {internshipExperiences.length > 0 && <AddEntryButton onClick={() => addExperience("internship")} text="添加实习经历" />}
        {!internshipExperiences.length && <EmptyEntry onClick={() => addExperience("internship")} text="添加实习经历" />}
      </ProfileSection>

      <ProfileSection
        sectionKey="work"
        open={openSections.work}
        onToggle={toggleSection}
        title="工作经历"
        description={workExperiences.length ? `${workExperiences.length} 段工作 · 只匹配网申的工作区块` : "只匹配网申的工作经历区块"}
        action="添加工作经历"
        onAction={() => addExperience("work")}
      >
        {experienceCards(workExperiences, "work")}
        {workExperiences.length > 0 && <AddEntryButton onClick={() => addExperience("work")} text="添加工作经历" />}
        {!workExperiences.length && <EmptyEntry onClick={() => addExperience("work")} text="添加工作经历" />}
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
              <Field label="项目名称"><input value={item.name} onChange={(e) => updateProject(item.id, { name: e.target.value })} /></Field>
              <Field label="担任角色"><input value={item.role} onChange={(e) => updateProject(item.id, { role: e.target.value })} /></Field>
              <Field label="开始时间"><input type="month" value={monthInputValue(item.startDate)} onChange={(e) => updateProject(item.id, { startDate: e.target.value })} /></Field>
              <Field label="结束时间"><input type="month" value={monthInputValue(item.endDate)} onChange={(e) => updateProject(item.id, { endDate: e.target.value })} /></Field>
              <Field label="项目描述" wide><textarea rows={4} value={item.description} onChange={(e) => updateProject(item.id, { description: e.target.value })} /></Field>
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
              <Field label="开始时间"><input type="month" value={monthInputValue(item.startDate)} onChange={(e) => updateCampusExperience(item.id, { startDate: e.target.value })} /></Field>
              <Field label="结束时间"><input type="month" value={monthInputValue(item.endDate)} onChange={(e) => updateCampusExperience(item.id, { endDate: e.target.value })} /></Field>
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
              <Field label="获奖时间"><input type="month" value={monthInputValue(item.date)} onChange={(e) => updateAward(item.id, { date: e.target.value })} /></Field>
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
        sectionKey="answers"
        open={openSections.answers}
        onToggle={toggleSection}
        title="常用回答"
        description="可复用并按公司微调"
      >
        <div className="profile-long-fields">
          <Field label="自我介绍"><textarea rows={5} value={draft.selfIntroduction} onChange={(e) => set("selfIntroduction", e.target.value)} /></Field>
          <Field label="个人优势"><textarea rows={4} value={draft.strengths} onChange={(e) => set("strengths", e.target.value)} /></Field>
          <Field label="职业规划"><textarea rows={4} value={draft.careerPlan} onChange={(e) => set("careerPlan", e.target.value)} /></Field>
        </div>
      </ProfileSection>

      <div className="profile-save-bar">
        <span><ShieldCheck size={15} />不会发送给 AI · 保存后同步简历中心</span>
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
