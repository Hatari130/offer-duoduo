export interface ProfileEducation {
  id: string;
  school: string;
  college?: string;
  major: string;
  degree: string;
  educationDegree?: string;
  educationForm?: string;
  courses?: string;
  researchDirection?: string;
  thesis?: string;
  rank?: string;
  overseasEducation?: string;
  minorMajor?: string;
  advisorName?: string;
  startDate: string;
  endDate: string;
  gpa: string;
}

export type ProfileExperienceKind = "internship" | "work";

export interface ProfileExperience {
  id: string;
  organization: string;
  title: string;
  /** Whether this record belongs to an internship or formal work section.
   * `type` remains the site's employment-type value (for example full-time). */
  kind?: ProfileExperienceKind;
  type?: string;
  department?: string;
  salary?: string;
  startDate: string;
  endDate: string;
  description: string;
  /** Semantic resume content used by templates and AI. `description` remains
   * available for form autofill and backwards compatibility. */
  contentBlocks?: ResumeContentBlock[];
  achievements?: string;
  refereeName?: string;
  refereeTitle?: string;
  refereeContact?: string;
  leavingReason?: string;
  subordinateCount?: string;
  isCurrent?: boolean;
}

/** Resolve old profiles that predate the explicit kind field without losing
 * data. Historically unclassified records were treated as internships. */
export function resolveProfileExperienceKind(
  experience: Pick<ProfileExperience, "kind" | "type">
): ProfileExperienceKind {
  if (experience.kind === "work" || experience.kind === "internship") return experience.kind;
  const legacyType = String(experience.type || "").trim();
  if (/实习|实践|intern|trainee/i.test(legacyType)) return "internship";
  if (/工作|全职|兼职|正式|work|employment|full.?time|part.?time/i.test(legacyType)) return "work";
  return "internship";
}

export interface ProfileProject {
  id: string;
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  contentBlocks?: ResumeContentBlock[];
  achievement?: string;
  link?: string;
}

export interface ProfileCampusExperience {
  id: string;
  type: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  contentBlocks?: ResumeContentBlock[];
}

export interface ResumeEvidenceLocation {
  source: "pdf" | "docx" | "text" | "manual";
  page?: number;
  startLine?: number;
  endLine?: number;
  sourceText?: string;
  confidence?: number;
}

/**
 * A resume description is not a list of visual lines. These blocks preserve
 * the semantic hierarchy that templates and the tailoring model need.
 */
export interface ResumeContentBlock {
  id: string;
  kind: "paragraph" | "bullet" | "project";
  text?: string;
  label?: string;
  title?: string;
  children?: ResumeContentBlock[];
  evidence?: ResumeEvidenceLocation[];
}

export interface ProfileAward {
  id: string;
  date: string;
  name: string;
  level: string;
  description: string;
}

export interface PersonalProfile {
  fullName: string;
  gender: string;
  phone: string;
  email: string;
  birthDate: string;
  graduationDate: string;
  currentCity: string;
  nativePlace: string;
  height: string;
  weight: string;
  recruitmentType: string;
  graduateStatus: string;
  address: string;
  targetRole: string;
  targetCities: string;
  earliestStartDate: string;
  portfolioUrl: string;
  githubUrl: string;
  education: ProfileEducation[];
  experiences: ProfileExperience[];
  projects: ProfileProject[];
  campusExperiences: ProfileCampusExperience[];
  awards: ProfileAward[];
  selfIntroduction: string;
  strengths: string;
  careerPlan: string;
  currentResidence?: string;
  nationality?: string;
  idType?: string;
  idNumber?: string;
  studentSource?: string;
  wechat?: string;
  qq?: string;
  politicalStatus?: string;
  maritalStatus?: string;
  healthStatus?: string;
  specialty?: string;
  workYears?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  countryRegion?: string;
  expectedSalary?: string;
  referralCode?: string;
  computerSkills?: Record<string, string>[];
  languages?: Record<string, string>[];
  qualifications?: Record<string, string>[];
  familyMembers?: Record<string, string>[];
  hobbies?: string;
  publications?: Record<string, string>[];
  patents?: Record<string, string>[];
  works?: Record<string, string>[];
  competitions?: Record<string, string>[];
  extraFields?: Record<string, string>;
  updatedAt?: string;
}

/** Create a fresh field-first resume profile for the web editor or extension.
 * A factory is used so callers never share mutable section arrays. */
export function createEmptyPersonalProfile(): PersonalProfile {
  return {
    fullName: "",
    gender: "",
    phone: "",
    email: "",
    birthDate: "",
    graduationDate: "",
    currentCity: "",
    nativePlace: "",
    height: "",
    weight: "",
    recruitmentType: "",
    graduateStatus: "",
    address: "",
    targetRole: "",
    targetCities: "",
    earliestStartDate: "",
    portfolioUrl: "",
    githubUrl: "",
    education: [],
    experiences: [],
    projects: [],
    campusExperiences: [],
    awards: [],
    selfIntroduction: "",
    strengths: "",
    careerPlan: "",
    extraFields: {}
  };
}

/** A complete, clearly fictional resume used as an editable layout baseline.
 * New web resumes start with this content so every section is visible and the
 * user can replace copy in place instead of building the document structure
 * from scratch. */
export function createResumeStarterProfile(): PersonalProfile {
  return {
    ...createEmptyPersonalProfile(),
    fullName: "林知夏",
    phone: "138 0000 0000",
    email: "lin.zhixia@example.com",
    currentCity: "上海",
    targetRole: "AI 产品经理",
    targetCities: "上海",
    earliestStartDate: "随时到岗",
    portfolioUrl: "https://example.com/portfolio",
    education: [
      {
        id: "starter-education-1",
        school: "江南大学（示例）",
        college: "数字媒体学院",
        major: "工业设计",
        degree: "硕士",
        startDate: "2022.09",
        endDate: "2025.06",
        gpa: "3.8/4.0",
        rank: "专业前 10%",
        courses: "用户研究、服务设计、数据分析"
      },
      {
        id: "starter-education-2",
        school: "海城理工大学（示例）",
        college: "设计学院",
        major: "产品设计",
        degree: "本科",
        startDate: "2018.09",
        endDate: "2022.06",
        gpa: "3.6/4.0"
      }
    ],
    experiences: [
      {
        id: "starter-experience-1",
        kind: "internship",
        organization: "启明智能科技（示例）",
        department: "企业智能事业部",
        title: "AI 产品实习生",
        startDate: "2024.03",
        endDate: "2024.09",
        description: "项目一：企业知识库问答产品\n需求分析：访谈 18 位业务用户，梳理高频检索与权限管理场景，并结合工单和搜索日志验证优先级，输出需求文档、流程图与验收口径，推动设计、算法和研发完成两轮评审。\n方案落地：协同算法与研发完成检索增强、引用溯源和反馈闭环，上线后问题命中率提升 21%。\n数据复盘：搭建核心指标看板，将周度复盘时间从 2 小时缩短至 30 分钟。"
      },
      {
        id: "starter-experience-2",
        kind: "internship",
        organization: "远舟网络（示例）",
        department: "产品部",
        title: "产品经理实习生",
        startDate: "2023.06",
        endDate: "2023.11",
        description: "参与内容创作工具的需求分析、原型设计与上线验收。\n体验优化：基于埋点与用户反馈重构发布流程，平均完成时长降低 32%。\n增长实验：设计 3 组新手引导实验，核心功能首日使用率提升 16%。"
      },
      {
        id: "starter-experience-3",
        kind: "work",
        organization: "云帆数据（示例）",
        department: "智能产品部",
        title: "AI 产品经理",
        startDate: "2024.10",
        endDate: "2025.07",
        description: "负责内部智能助手从需求定义到上线运营的完整产品流程。\n业务梳理：整合销售、交付和客服团队的 6 类高频任务，明确版本边界与优先级。\n效果验证：设计灰度测试与质量评估口径，试点团队周均重复操作减少 11 小时。\n迭代机制：建立反馈分级和双周评审流程，使重点问题平均处理周期缩短 36%。"
      }
    ],
    projects: [
      {
        id: "starter-project-1",
        name: "求职信息整理助手",
        role: "产品负责人",
        startDate: "2024.10",
        endDate: "至今",
        link: "https://example.com/project",
        description: "独立完成需求调研、信息架构、交互原型与版本迭代。\n产品设计：将岗位收藏、进度跟踪和面试复盘整合为统一工作流。\n项目结果：完成 4 个版本迭代，邀请 60 位用户参与测试，次周留存提升至 48%。"
      },
      {
        id: "starter-project-2",
        name: "校园职业规划助手",
        role: "独立项目",
        startDate: "2024.01",
        endDate: "2024.05",
        description: "面向应届生设计岗位探索与能力差距分析工具。\n方案验证：完成 12 次用户访谈与两轮可用性测试，优化信息层级和关键任务路径。\n交付结果：沉淀可复用的岗位画像与简历检查规则，支持后续版本快速迭代。\n运营沉淀：持续记录常见问题与行为数据，形成 20 余条产品优化清单。"
      }
    ],
    strengths: "产品能力：熟悉需求分析、用户研究、原型设计与数据复盘，能够独立推进产品从 0 到 1。\nAI 应用：理解大模型、RAG 与 Agent 基础原理，能将业务目标拆解为可验证的产品方案。\n数据能力：熟悉基础 SQL、埋点设计与漏斗分析，能够围绕目标建立评估指标。\n协作能力：擅长跨设计、研发和运营协作，能够清晰组织信息并推动项目落地。",
    selfIntroduction: "关注 AI 产品与工作流创新，具备从用户问题识别、方案设计到上线复盘的完整实践。擅长把复杂需求拆成清晰字段与可验证目标。",
    hobbies: "持续关注 AI 产品动态；业余进行产品拆解与独立项目实践。"
  };
}

export type ProfileFieldKey =
  | keyof PersonalProfile
  | "school"
  | "major"
  | "degree"
  | "gpa"
  | "educationStartDate"
  | "educationEndDate"
  | "experienceOrganization"
  | "experienceTitle"
  | "experienceStartDate"
  | "experienceEndDate"
  | "experienceDescription"
  | "nationality"
  | "idType"
  | "idNumber"
  | "wechat"
  | "qq"
  | "politicalStatus"
  | "maritalStatus"
  | "healthStatus"
  | "specialty"
  | "workYears"
  | "emergencyContactName"
  | "emergencyContactPhone"
  | "countryRegion"
  | "expectedSalary"
  | "educationCollege"
  | "educationDegree"
  | "educationForm"
  | "educationCourses"
  | "educationResearchDirection"
  | "educationThesis"
  | "educationRank"
  | "overseasEducation"
  | "minorMajor"
  | "advisorName"
  | "experienceType"
  | "experienceDepartment"
  | "experienceSalary"
  | "experienceAchievements"
  | "refereeName"
  | "refereeTitle"
  | "refereeContact"
  | "leavingReason"
  | "subordinateCount"
  | "projectName"
  | "projectRole"
  | "projectStartDate"
  | "projectEndDate"
  | "projectDescription"
  | "projectAchievement"
  | "projectLink"
  | "campusExperienceType"
  | "campusExperienceRole"
  | "campusExperienceStartDate"
  | "campusExperienceEndDate"
  | "campusExperienceDescription"
  | "awardDate"
  | "awardName"
  | "awardLevel"
  | "awardDescription"
  | "languageName"
  | "languageCertificate"
  | "englishLevel"
  | "languageScore"
  | "languageProficiency"
  | "listeningSpeaking"
  | "readingWriting"
  | "computerSkillType"
  | "computerSkillProficiency"
  | "qualificationDate"
  | "qualificationName"
  | "qualificationNumber"
  | "qualificationDescription"
  | "familyName"
  | "familyRelation"
  | "familyPhone"
  | "familyCompany"
  | "familyPosition"
  | "familyPoliticalStatus"
  | "publicationDate"
  | "publicationJournal"
  | "publicationLevel"
  | "publicationTitle"
  | "publicationDescription"
  | "publicationAuthors"
  | "publicationImpactFactor"
  | "publicationLink"
  | "patentDate"
  | "patentName"
  | "patentNumber"
  | "patentType"
  | "patentAchievement"
  | "hobbies"
  | "workName"
  | "workLink"
  | "workDescription"
  | "competitionName"
  | "competitionDate"
  | "competitionDescription"
  | "referralCode"
  | "experienceCurrent";
