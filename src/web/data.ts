import {
  EMPTY_PROFILE,
  JOBS_KEY,
  PROFILE_KEY,
  SETTINGS_KEY,
  loadJobs,
  loadProfile,
  loadSettings,
  saveJobs,
  saveProfile,
  saveSettings
} from "../storage";
import {
  OPPORTUNITY_CACHE_KEY,
  loadOpportunityCache
} from "../opportunities";
import type {
  JobApplication,
  OfferFlowSettings,
  OpportunityFeedSnapshot,
  PersonalProfile
} from "../types";

export const DOCUMENTS_KEY = "offerflow.documents";
export const WEB_PREFERENCES_KEY = "offerflow.webPreferences";
const PUBLIC_DEMO_SEEDED_KEY = "offerflow.publicDemoSeeded";

export type DocumentKind =
  | "resume"
  | "portfolio"
  | "transcript"
  | "certificate"
  | "answer";

export interface OfferFlowDocument {
  id: string;
  name: string;
  kind: DocumentKind;
  targetRole?: string;
  url?: string;
  note?: string;
  primary?: boolean;
  updatedAt: string;
}

export interface WebPreferences {
  compactPipeline?: boolean;
  weekStartsMonday?: boolean;
}

export interface WorkspaceSnapshot {
  version: 1;
  exportedAt: string;
  jobs: JobApplication[];
  profile: PersonalProfile;
  settings: OfferFlowSettings;
  opportunities: OpportunityFeedSnapshot;
  documents: OfferFlowDocument[];
  preferences: WebPreferences;
}

export interface WorkspaceData {
  jobs: JobApplication[];
  profile: PersonalProfile;
  settings: OfferFlowSettings;
  opportunities: OpportunityFeedSnapshot;
  documents: OfferFlowDocument[];
  preferences: WebPreferences;
}

export const isExtensionDashboard = () =>
  location.protocol === "chrome-extension:" &&
  typeof chrome !== "undefined" &&
  Boolean(chrome.storage?.local);

const hasChromeStorage = () =>
  typeof chrome !== "undefined" && Boolean(chrome.storage?.local);

async function readValue<T>(key: string, fallback: T): Promise<T> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(key);
    return (result[key] as T | undefined) ?? fallback;
  }
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeValue<T>(key: string, value: T): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}

export async function loadWorkspace(): Promise<WorkspaceData> {
  const [jobs, profile, settings, opportunities, documents, preferences] =
    await Promise.all([
      loadJobs(),
      loadProfile(),
      loadSettings(),
      loadOpportunityCache(),
      readValue<OfferFlowDocument[]>(DOCUMENTS_KEY, []),
      readValue<WebPreferences>(WEB_PREFERENCES_KEY, {
        compactPipeline: false,
        weekStartsMonday: true
      })
    ]);
  const workspace = {
    jobs,
    profile,
    settings,
    opportunities,
    documents,
    preferences
  };
  const hasUserData =
    jobs.length > 0 ||
    documents.length > 0 ||
    opportunities.opportunities.length > 0 ||
    Boolean(profile.fullName || profile.email || profile.targetRole);
  if (
    !isExtensionDashboard() &&
    !hasUserData &&
    !localStorage.getItem(PUBLIC_DEMO_SEEDED_KEY)
  ) {
    localStorage.setItem(PUBLIC_DEMO_SEEDED_KEY, "1");
    return applyWorkspaceSnapshot({
      version: 1,
      exportedAt: new Date().toISOString(),
      ...createDemoWorkspace()
    });
  }
  return workspace;
}

export const saveDocuments = (documents: OfferFlowDocument[]) =>
  writeValue(DOCUMENTS_KEY, documents);

export const savePreferences = (preferences: WebPreferences) =>
  writeValue(WEB_PREFERENCES_KEY, preferences);

export async function saveOpportunitySnapshot(snapshot: OpportunityFeedSnapshot) {
  await writeValue(OPPORTUNITY_CACHE_KEY, snapshot);
}

export async function applyWorkspaceSnapshot(
  snapshot: Partial<WorkspaceSnapshot>
): Promise<WorkspaceData> {
  const jobs = Array.isArray(snapshot.jobs) ? snapshot.jobs : [];
  const profile = {
    ...EMPTY_PROFILE,
    ...(snapshot.profile || {})
  };
  const settings = snapshot.settings || {};
  const opportunities = snapshot.opportunities || { opportunities: [] };
  const documents = Array.isArray(snapshot.documents) ? snapshot.documents : [];
  const preferences = snapshot.preferences || {
    compactPipeline: false,
    weekStartsMonday: true
  };

  await Promise.all([
    saveJobs(jobs),
    saveProfile(profile),
    saveSettings(settings),
    saveOpportunitySnapshot(opportunities),
    saveDocuments(documents),
    savePreferences(preferences)
  ]);

  return {
    jobs,
    profile,
    settings,
    opportunities,
    documents,
    preferences
  };
}

export function createSnapshot(data: WorkspaceData): WorkspaceSnapshot {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    ...data
  };
}

export function downloadSnapshot(data: WorkspaceData): void {
  const blob = new Blob([JSON.stringify(createSnapshot(data), null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `offerflow-workspace-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function subscribeToWorkspace(
  onChange: (patch: Partial<WorkspaceData>) => void
): () => void {
  if (!hasChromeStorage() || !chrome.storage?.onChanged) return () => undefined;

  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName !== "local") return;
    const patch: Partial<WorkspaceData> = {};
    if (changes[JOBS_KEY]) {
      patch.jobs = (changes[JOBS_KEY].newValue as JobApplication[]) || [];
    }
    if (changes[PROFILE_KEY]) {
      patch.profile = {
        ...EMPTY_PROFILE,
        ...(changes[PROFILE_KEY].newValue as PersonalProfile)
      };
    }
    if (changes[SETTINGS_KEY]) {
      patch.settings =
        (changes[SETTINGS_KEY].newValue as OfferFlowSettings) || {};
    }
    if (changes[OPPORTUNITY_CACHE_KEY]) {
      patch.opportunities =
        (changes[OPPORTUNITY_CACHE_KEY]
          .newValue as OpportunityFeedSnapshot) || { opportunities: [] };
    }
    if (changes[DOCUMENTS_KEY]) {
      patch.documents =
        (changes[DOCUMENTS_KEY].newValue as OfferFlowDocument[]) || [];
    }
    if (changes[WEB_PREFERENCES_KEY]) {
      patch.preferences =
        (changes[WEB_PREFERENCES_KEY].newValue as WebPreferences) || {};
    }
    if (Object.keys(patch).length) onChange(patch);
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

const now = new Date();
const dateFromNow = (days: number) => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const event = (
  id: string,
  title: string,
  daysAgo: number,
  type: "created" | "stage_changed" | "updated" | "captured" = "updated"
) => ({
  id,
  type,
  title,
  occurredAt: new Date(Date.now() - daysAgo * 86400000).toISOString()
});

export function createDemoWorkspace(): WorkspaceData {
  const demoJobs: JobApplication[] = [
    {
      id: "demo_byte",
      company: "字节跳动",
      position: "产品经理—商业产品",
      department: "商业化产品",
      jobId: "A245810",
      city: "北京",
      jobType: "校招",
      stage: "interview",
      externalStage: "一面通过",
      appliedAt: dateFromNow(-16),
      deadline: dateFromNow(2),
      nextAction: "准备二面：商业化案例与指标拆解",
      sourceUrl: "https://jobs.bytedance.com/campus",
      sourceHost: "jobs.bytedance.com",
      summary: "负责商业化产品能力建设和增长策略。",
      responsibilities: ["产品方案设计", "跨团队推进", "数据复盘"],
      requirements: ["产品分析能力", "优秀的沟通与协作能力"],
      createdAt: new Date(Date.now() - 18 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      events: [
        event("evt_byte_1", "从招聘网页加入 OfferFlow", 18, "created"),
        event("evt_byte_2", "完成投递", 16, "stage_changed"),
        event("evt_byte_3", "一面通过，进入下一轮", 1, "stage_changed")
      ]
    },
    {
      id: "demo_tencent",
      company: "腾讯",
      position: "产品策划培训生",
      department: "CSIG",
      jobId: "PCG-2026-018",
      city: "深圳",
      jobType: "校招",
      stage: "assessment",
      externalStage: "在线测评",
      appliedAt: dateFromNow(-8),
      deadline: dateFromNow(5),
      nextAction: "周五 20:00 前完成在线测评",
      sourceUrl: "https://join.qq.com",
      sourceHost: "join.qq.com",
      summary: "面向产业互联网场景进行产品策划。",
      responsibilities: ["用户研究", "需求分析", "产品方案"],
      requirements: ["逻辑清晰", "对产业互联网有兴趣"],
      createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      events: [
        event("evt_tx_1", "从校招机会创建岗位", 10, "created"),
        event("evt_tx_2", "收到在线测评", 2, "stage_changed")
      ]
    },
    {
      id: "demo_meituan",
      company: "美团",
      position: "用户产品经理",
      jobId: "MT-CP-4201",
      city: "上海",
      jobType: "校招",
      stage: "applied",
      appliedAt: dateFromNow(-11),
      deadline: dateFromNow(9),
      nextAction: "整理本地生活业务分析",
      sourceUrl: "https://zhaopin.meituan.com",
      sourceHost: "zhaopin.meituan.com",
      summary: "负责本地生活消费者端产品体验。",
      responsibilities: ["需求洞察", "体验设计", "业务协同"],
      requirements: ["用户同理心", "数据分析能力"],
      createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      events: [
        event("evt_mt_1", "从招聘网页加入 OfferFlow", 12, "created"),
        event("evt_mt_2", "完成投递", 11, "stage_changed")
      ]
    },
    {
      id: "demo_alibaba",
      company: "阿里巴巴",
      position: "AI 产品经理",
      department: "智能信息事业群",
      city: "杭州",
      jobType: "校招",
      stage: "to_apply",
      deadline: dateFromNow(1),
      nextAction: "针对岗位调整简历并完成网申",
      sourceUrl: "https://talent.alibaba.com/campus",
      sourceHost: "talent.alibaba.com",
      summary: "探索大模型在内容与搜索场景中的产品机会。",
      responsibilities: ["AI 产品设计", "需求验证"],
      requirements: ["理解大模型能力边界", "有 AI 项目经验"],
      createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      events: [event("evt_ali_1", "收藏并加入待投递", 4, "created")]
    },
    {
      id: "demo_xhs",
      company: "小红书",
      position: "社区产品经理",
      city: "上海",
      jobType: "校招",
      stage: "interested",
      deadline: dateFromNow(12),
      nextAction: "研究社区治理与内容分发机制",
      sourceUrl: "https://job.xiaohongshu.com",
      sourceHost: "job.xiaohongshu.com",
      summary: "围绕社区用户体验进行产品设计。",
      responsibilities: ["社区体验", "内容生态"],
      requirements: ["深度社区产品用户"],
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      events: [event("evt_xhs_1", "从秋招机会加入关注", 3, "created")]
    },
    {
      id: "demo_dji",
      company: "大疆",
      position: "产品经理",
      department: "行业应用",
      city: "深圳",
      jobType: "校招",
      stage: "offer",
      appliedAt: dateFromNow(-38),
      nextAction: "确认薪酬明细与入职时间",
      sourceUrl: "https://we.dji.com/zh-CN/campus",
      sourceHost: "we.dji.com",
      summary: "行业级无人机产品规划与交付。",
      responsibilities: ["行业研究", "产品规划"],
      requirements: ["关注硬件与行业应用"],
      createdAt: new Date(Date.now() - 40 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
      events: [
        event("evt_dji_1", "完成投递", 38, "created"),
        event("evt_dji_2", "收到 Offer", 0, "stage_changed")
      ]
    }
  ];

  const demoProfile: PersonalProfile = {
    ...EMPTY_PROFILE,
    fullName: "林舟",
    phone: "138 0000 2026",
    email: "linzhou@example.com",
    currentCity: "上海",
    targetRole: "产品经理 / AI 产品",
    targetCities: "上海、杭州、深圳、北京",
    earliestStartDate: dateFromNow(30),
    portfolioUrl: "https://example.com/portfolio",
    education: [
      {
        id: "demo_edu",
        school: "华东理工大学",
        major: "信息管理与信息系统",
        degree: "本科",
        startDate: "2022-09",
        endDate: "2026-06",
        gpa: "3.72 / 4.0"
      }
    ],
    experiences: [
      {
        id: "demo_exp",
        organization: "某互联网公司",
        title: "产品实习生",
        startDate: "2025-06",
        endDate: "2025-10",
        description: "负责增长工具与数据看板的需求分析和项目推进。"
      }
    ],
    projects: [
      {
        id: "demo_project",
        name: "校园活动智能助手",
        role: "产品负责人",
        startDate: "2025-03",
        endDate: "2025-06",
        description: "从 0 到 1 完成需求验证、原型与上线复盘。"
      }
    ],
    selfIntroduction:
      "关注真实用户问题，习惯用数据验证判断，能够在模糊场景中推动方案落地。",
    strengths: "结构化分析、跨团队沟通、快速学习。",
    careerPlan: "持续深耕 AI 与用户产品，成长为兼具业务判断和技术理解的产品负责人。",
    updatedAt: new Date().toISOString()
  };

  return {
    jobs: demoJobs,
    profile: demoProfile,
    settings: {
      autoMonitorEnabled: true,
      deepseekModel: "deepseek-v4-flash"
    },
    opportunities: {
      fetchedAt: new Date().toISOString(),
      opportunities: [
        {
          id: "demo_op_baidu",
          company: "百度",
          title: "2026 届校园招聘",
          batch: "秋招正式批",
          status: "open",
          openAt: dateFromNow(0),
          deadline: dateFromNow(28),
          graduationYears: ["2026"],
          roleTags: ["产品", "AI", "技术"],
          cities: ["北京", "上海", "深圳"],
          officialUrl: "https://talent.baidu.com/jobs/list",
          sourceName: "百度招聘官网",
          verifiedAt: new Date().toISOString()
        },
        {
          id: "demo_op_jd",
          company: "京东",
          title: "TET 管培生校园招聘",
          batch: "秋招第一批",
          status: "open",
          openAt: dateFromNow(-1),
          deadline: dateFromNow(24),
          graduationYears: ["2026"],
          roleTags: ["产品", "供应链", "零售"],
          cities: ["北京", "成都"],
          officialUrl: "https://campus.jd.com",
          sourceName: "京东校园招聘",
          verifiedAt: new Date().toISOString()
        },
        {
          id: "demo_op_vivo",
          company: "vivo",
          title: "2026 校园招聘",
          batch: "全球校园招聘",
          status: "open",
          openAt: dateFromNow(-2),
          deadline: dateFromNow(21),
          graduationYears: ["2026"],
          roleTags: ["产品", "设计", "算法"],
          cities: ["深圳", "东莞", "南京"],
          officialUrl: "https://hr.vivo.com/wt/vivo/web/index/CompvivoCampus",
          sourceName: "vivo 招聘官网",
          verifiedAt: new Date().toISOString()
        },
        {
          id: "demo_op_1",
          company: "网易",
          title: "2026 届校园招聘",
          batch: "秋季提前批",
          status: "open",
          openAt: dateFromNow(-4),
          deadline: dateFromNow(14),
          graduationYears: ["2026"],
          roleTags: ["产品", "运营", "技术"],
          cities: ["杭州", "广州"],
          officialUrl: "https://campus.163.com",
          sourceName: "官方招聘",
          verifiedAt: new Date().toISOString()
        },
        {
          id: "demo_op_2",
          company: "小米",
          title: "未来星校园招聘",
          batch: "产品专项",
          status: "closing",
          openAt: dateFromNow(-18),
          deadline: dateFromNow(2),
          graduationYears: ["2026"],
          roleTags: ["产品", "硬件"],
          cities: ["北京", "武汉"],
          officialUrl: "https://hr.xiaomi.com/campus",
          sourceName: "官方招聘",
          verifiedAt: new Date().toISOString()
        },
        {
          id: "demo_op_3",
          company: "快手",
          title: "2026 届校园招聘",
          batch: "秋招正式批",
          status: "upcoming",
          openAt: dateFromNow(5),
          deadline: dateFromNow(35),
          graduationYears: ["2026"],
          roleTags: ["产品", "设计", "技术"],
          cities: ["北京", "杭州"],
          officialUrl: "https://campus.kuaishou.cn",
          sourceName: "官方招聘",
          verifiedAt: new Date().toISOString()
        }
      ]
    },
    documents: [
      {
        id: "demo_doc_1",
        name: "产品经理通用简历 · 2026 秋招",
        kind: "resume",
        targetRole: "产品经理",
        url: "https://example.com/resume",
        note: "突出增长项目和跨团队推进经历。",
        primary: true,
        updatedAt: new Date().toISOString()
      },
      {
        id: "demo_doc_2",
        name: "AI 产品作品集",
        kind: "portfolio",
        targetRole: "AI 产品经理",
        url: "https://example.com/portfolio",
        note: "包含智能助手与 RAG 项目。",
        updatedAt: new Date(Date.now() - 3 * 86400000).toISOString()
      }
    ],
    preferences: {
      compactPipeline: false,
      weekStartsMonday: true
    }
  };
}
