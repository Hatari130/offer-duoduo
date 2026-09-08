export type ChangelogTag = "new" | "optimize" | "fix";

export interface ChangelogItem {
  tag: ChangelogTag;
  title: string;
  desc: string;
  actionLabel?: string;
  actionHref?: string;
  requiresAuth?: boolean;
}

export interface ChangelogRelease {
  version: string;
  date: string;
  badge?: string;
  title: string;
  summary: string;
  items: ChangelogItem[];
}

export const CHANGELOG_STORAGE_KEY = "offerflow:last-seen-changelog-version";

export const CHANGELOG_RELEASES: ChangelogRelease[] = [
  {
    version: "2026.09.08",
    date: "2026-09-08",
    badge: "秋招冲刺特辑",
    title: "笔试截止预警上线 · 专治拖延症",
    summary: "个人投递页面新增笔试截止时间与 3 天倒计时高亮预警，助你守住每个关键机会！",
    items: [
      {
        tag: "new",
        title: "个人投递页面笔试截止日期字段 & 3天内预警",
        desc: "在个人投递管理中支持录入笔试/在线测评截止时间。距离截止 3 天内自动触发高亮警示与动态倒计时（如「剩 2 天」、「剩 12 小时」），专治拖延症，避免错过任何关键测评！",
        actionLabel: "去个人投递体验",
        actionHref: "/app/applications",
        requiresAuth: true
      },
      {
        tag: "optimize",
        title: "批量导入与导出同步支持笔试时间",
        desc: "投递记录 Excel / 表格批量导入和导出全面打通笔试截止时间字段，高效归档管理全部面试与笔试进度。"
      },
      {
        tag: "optimize",
        title: "产品更新日志与提醒机制",
        desc: "每次上线重磅功能主动弹窗告知，点击「已知悉」后不再打扰。随时可在左下角头像菜单中重新查阅往期更新。"
      }
    ]
  },
  {
    version: "2026.08.30",
    date: "2026-08-30",
    badge: "效率升级",
    title: "岗位定制简历 (AI Tailor) 与直达投递优化",
    summary: "针对企业 JD 精准优化简历匹配度，一键直达头部名企官方投递门户。",
    items: [
      {
        tag: "new",
        title: "智能岗位定制简历工作台",
        desc: "根据目标企业招聘岗位 JD，由 AI 针对性润色经历与项目亮点，大幅提升简历初筛通过率。",
        actionLabel: "前往简历中心",
        actionHref: "/app/resumes",
        requiresAuth: true
      },
      {
        tag: "optimize",
        title: "名企校招投递一键直达通道",
        desc: "精选数百家大厂与国央企官方招聘系统直达入口，告别繁琐搜索。"
      }
    ]
  }
];

export const LATEST_CHANGELOG_VERSION = CHANGELOG_RELEASES[0].version;

export function hasSeenLatestChangelog(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const seenVersion = window.localStorage.getItem(CHANGELOG_STORAGE_KEY);
    return seenVersion === LATEST_CHANGELOG_VERSION;
  } catch {
    return true;
  }
}

export function markLatestChangelogSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHANGELOG_STORAGE_KEY, LATEST_CHANGELOG_VERSION);
  } catch {
    // Ignore storage quota/permission errors
  }
}
