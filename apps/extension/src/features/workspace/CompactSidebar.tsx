import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleDot,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  LayoutDashboard,
  MapPin,
  Megaphone,
  MonitorUp,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Star,
  KeyRound,
  Target,
  Trash2,
  X
} from "lucide-react";
import {
  DEFAULT_DEEPSEEK_MODEL,
  extractWithDeepSeek,
  testDeepSeekConnection
} from "@/integrations/deepseek/deepseek";
import {
  chooseObsidianDirectory,
  downloadBackup,
  getStoredDirectory,
  syncJobToObsidian
} from "@/integrations/obsidian/obsidian";
import {
  AUTO_SYNC_NOTICE_KEY,
  EMPTY_PROFILE,
  findDuplicate,
  JOBS_KEY,
  loadJobs,
  loadProfile,
  loadSettings,
  PROFILE_KEY,
  saveJobs,
  saveProfile,
  saveSettings
} from "@/infrastructure/storage/storage";
import {
  DEFAULT_OPPORTUNITY_FEED_URL,
  loadOpportunityCache,
  OPPORTUNITY_CACHE_KEY,
  refreshOpportunityFeed
} from "@/features/opportunities/opportunities";
import {
  STAGES,
  STAGE_LABELS,
  type ApplicationStage,
  type ExtractedJob,
  type JobApplication,
  type OfferFlowSettings,
  type OpportunityFeedSnapshot,
  type PersonalProfile,
  type RecruitmentOpportunity
} from "@/shared/types";
import ProfileView from "@/features/profile/ProfileView";
import OpportunityView from "@/features/opportunities/OpportunityView";
import {
  calendarDateKey,
  dueState,
  formatDeadline,
  localDateKey,
  type CompactView
} from "./workspaceUtils";

export function CompactSidebar({
  view,
  jobs,
  settings,
  query,
  onQueryChange,
  onViewChange,
  onCapture,
  onOpenWorkspace,
  onEdit
}: {
  view: CompactView;
  jobs: JobApplication[];
  settings: OfferFlowSettings;
  query: string;
  onQueryChange: (value: string) => void;
  onViewChange: (view: CompactView) => void;
  onCapture: () => void;
  onOpenWorkspace: (view?: CompactView) => void;
  onEdit: (job: JobApplication) => void;
}) {
  const [stageFilter, setStageFilter] = useState<ApplicationStage | "all">("all");
  const today = localDateKey(new Date());
  const activeJobs = jobs
    .filter((job) => job.stage !== "closed")
    .sort((a, b) => {
      const aDate = a.deadline || "9999";
      const bDate = b.deadline || "9999";
      return aDate.localeCompare(bDate);
    });
  const urgentJobs = activeJobs.filter((job) => {
    const deadline = calendarDateKey(job.deadline);
    if (!deadline) return false;
    const diff = (new Date(deadline).getTime() - new Date(today).getTime()) / 86400000;
    return diff >= 0 && diff <= 3;
  });
  const recentEvents = jobs
    .flatMap((job) =>
      job.events.map((event) => ({
        ...event,
        job
      }))
    )
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 4);
  const agenda = jobs
    .flatMap((job) => {
      const items: Array<{
        id: string;
        date: string;
        type: "applied" | "deadline";
        job: JobApplication;
      }> = [];
      const applied = calendarDateKey(job.appliedAt);
      const deadline = calendarDateKey(job.deadline);
      if (applied) items.push({ id: `${job.id}-a`, date: applied, type: "applied", job });
      if (deadline) items.push({ id: `${job.id}-d`, date: deadline, type: "deadline", job });
      return items;
    })
    .filter((item) => item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 12);

  const filteredJobs = activeJobs.filter((job) => {
    const matchesStage = stageFilter === "all" || job.stage === stageFilter;
    const normalized = query.trim().toLowerCase();
    const matchesQuery =
      !normalized ||
      [job.company, job.position, job.city, job.jobId]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized));
    return matchesStage && matchesQuery;
  });

  const jobRow = (job: JobApplication) => (
    <button className="compact-job-row" key={job.id} onClick={() => onEdit(job)}>
      <span className={`stage-dot stage-dot--${job.stage}`} />
      <span className="compact-job-main">
        <strong>{job.position}</strong>
        <small>
          {job.company}
        </small>
      </span>
      <span className={`compact-job-date deadline--${dueState(job.deadline)}`}>
        {job.deadline ? formatDeadline(job.deadline) : "—"}
      </span>
      <ChevronRight size={14} />
    </button>
  );

  return (
    <div className="compact-surface">
      <header className="compact-header">
        <button className="compact-brand" onClick={() => onViewChange("dashboard")}>
          <span>OF</span>
          <strong>JobKoI</strong>
        </button>
        <div className="compact-header-actions">
          <button title="打开完整工作台" onClick={() => onOpenWorkspace(view)}>
            <ExternalLink size={16} />
          </button>
          <button className="compact-capture" onClick={onCapture}>
            <Plus size={15} /> 抓取
          </button>
        </div>
      </header>

      <div className="compact-content">
        {view === "dashboard" && (
          <>
            <section className="context-panel">
              <div>
                <span className="compact-kicker">当前网页</span>
                <h1>把这个机会加入进度</h1>
                <p>识别岗位、投递记录或流程变化。</p>
              </div>
              <button onClick={onCapture}>
                <Target size={17} />
                识别当前页面
              </button>
            </section>

            <div className="compact-metrics">
              <button onClick={() => onViewChange("jobs")}>
                <strong>{activeJobs.length}</strong>
                <span>推进中</span>
              </button>
              <button onClick={() => onViewChange("calendar")}>
                <strong className={urgentJobs.length ? "urgent-number" : ""}>
                  {urgentJobs.length}
                </strong>
                <span>三日内截止</span>
              </button>
              <button onClick={() => onViewChange("jobs")}>
                <strong>{jobs.filter((job) => job.stage === "interview").length}</strong>
                <span>面试中</span>
              </button>
            </div>

            <section className="compact-section">
              <header>
                <div>
                  <span className="compact-kicker">优先处理</span>
                  <h2>接下来要做的事</h2>
                </div>
                <button onClick={() => onViewChange("calendar")}>全部日程</button>
              </header>
              <div className="compact-list">
                {(urgentJobs.length ? urgentJobs : activeJobs).slice(0, 4).map(jobRow)}
                {!activeJobs.length && (
                  <div className="compact-empty">还没有进行中的岗位</div>
                )}
              </div>
            </section>

            <section className="compact-section">
              <header>
                <div>
                  <span className="compact-kicker">动态</span>
                  <h2>最近变化</h2>
                </div>
              </header>
              <div className="activity-list">
                {recentEvents.map((event) => (
                  <button key={event.id} onClick={() => onEdit(event.job)}>
                    <span className="activity-line" />
                    <span>
                      <strong>{event.title}</strong>
                      <small>
                        {event.job.company} ·{" "}
                        {new Date(event.occurredAt).toLocaleString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </small>
                    </span>
                  </button>
                ))}
                {!recentEvents.length && (
                  <div className="compact-empty">进度变化会出现在这里</div>
                )}
              </div>
            </section>
          </>
        )}

        {view === "jobs" && (
          <section className="compact-page">
            <header className="compact-page-heading">
              <span className="compact-kicker">岗位档案</span>
              <h1>{activeJobs.length} 个岗位正在推进</h1>
            </header>
            <label className="compact-search">
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="搜索公司或岗位"
              />
            </label>
            <div className="stage-filters">
              {(["all", "applied", "assessment", "interview", "offer"] as const).map(
                (stage) => (
                  <button
                    className={stageFilter === stage ? "active" : ""}
                    key={stage}
                    onClick={() => setStageFilter(stage)}
                  >
                    {stage === "all" ? "全部" : STAGE_LABELS[stage]}
                  </button>
                )
              )}
            </div>
            <div className="compact-list compact-list--bordered">
              {filteredJobs.map(jobRow)}
              {!filteredJobs.length && <div className="compact-empty">没有匹配的岗位</div>}
            </div>
          </section>
        )}

        {view === "calendar" && (
          <section className="compact-page">
            <header className="compact-page-heading compact-page-heading--row">
              <div>
                <span className="compact-kicker">时间安排</span>
                <h1>未来日程</h1>
              </div>
              <button onClick={() => onOpenWorkspace("calendar")}>
                打开月历 <ExternalLink size={13} />
              </button>
            </header>
            <div className="compact-agenda">
              {agenda.map((item) => (
                <button key={item.id} onClick={() => onEdit(item.job)}>
                  <time>
                    <strong>{item.date.slice(8)}</strong>
                    <small>{item.date.slice(5, 7)}月</small>
                  </time>
                  <i className={`agenda-mark agenda-mark--${item.type}`} />
                  <span>
                    <strong>{item.job.position}</strong>
                    <small>
                      {item.job.company} · {item.type === "applied" ? "已投递" : "截止"}
                    </small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))}
              {!agenda.length && <div className="compact-empty">暂无未来日程</div>}
            </div>
          </section>
        )}

        {view === "settings" && (
          <section className="compact-page">
            <header className="compact-page-heading">
              <span className="compact-kicker">连接与数据</span>
              <h1>系统状态</h1>
            </header>
            <div className="compact-settings-list">
              <div>
                <Sparkles size={16} />
                <span><strong>DeepSeek</strong><small>{settings.deepseekApiKey ? "已连接" : "未配置"}</small></span>
                <i className={settings.deepseekApiKey ? "status-ok" : ""} />
              </div>
              <div>
                <CircleDot size={16} />
                <span><strong>实时监听</strong><small>{(settings.autoMonitorEnabled ?? true) ? "已开启" : "已关闭"}</small></span>
                <i className={(settings.autoMonitorEnabled ?? true) ? "status-ok" : ""} />
              </div>
              <div>
                <FileText size={16} />
                <span><strong>Obsidian</strong><small>{settings.obsidianFolderName || "未连接目录"}</small></span>
                <i className={settings.obsidianFolderName ? "status-ok" : ""} />
              </div>
            </div>
            <button
              className="open-workspace-button"
              onClick={() => onOpenWorkspace("settings")}
            >
              打开完整设置 <ExternalLink size={15} />
            </button>
          </section>
        )}
      </div>

      <nav className="compact-nav">
        <button
          className={view === "dashboard" ? "active" : ""}
          onClick={() => onViewChange("dashboard")}
        >
          <LayoutDashboard size={17} /><span>今日</span>
        </button>
        <button
          className={view === "jobs" ? "active" : ""}
          onClick={() => onViewChange("jobs")}
        >
          <BriefcaseBusiness size={17} /><span>岗位</span>
        </button>
        <button
          className={view === "calendar" ? "active" : ""}
          onClick={() => onViewChange("calendar")}
        >
          <CalendarDays size={17} /><span>日程</span>
        </button>
        <button
          className={view === "settings" ? "active" : ""}
          onClick={() => onViewChange("settings")}
        >
          <Settings2 size={17} /><span>更多</span>
        </button>
      </nav>
    </div>
  );
}
