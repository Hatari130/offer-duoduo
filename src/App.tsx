import { useEffect, useMemo, useState } from "react";
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
  KeyRound,
  Target,
  Trash2,
  X
} from "lucide-react";
import {
  DEFAULT_DEEPSEEK_MODEL,
  extractWithDeepSeek,
  testDeepSeekConnection
} from "./deepseek";
import {
  chooseObsidianDirectory,
  downloadBackup,
  getStoredDirectory,
  syncJobToObsidian
} from "./obsidian";
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
} from "./storage";
import {
  loadOpportunityCache,
  OPPORTUNITY_CACHE_KEY,
  refreshOpportunityFeed
} from "./opportunities";
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
} from "./types";
import ProfileView from "./ProfileView";
import OpportunityView from "./OpportunityView";

type View = "dashboard" | "calendar" | "capture" | "settings";
type CompactView = View | "jobs";

type CalendarEvent = {
  id: string;
  date: string;
  type: "applied" | "deadline";
  title: string;
  subtitle: string;
  job: JobApplication;
};

const LOCATION_COORDINATES: Record<string, { lng: number; lat: number }> = {
  北京: { lng: 116.41, lat: 39.9 }, 天津: { lng: 117.2, lat: 39.08 },
  上海: { lng: 121.47, lat: 31.23 }, 深圳: { lng: 114.06, lat: 22.54 },
  广州: { lng: 113.26, lat: 23.13 }, 杭州: { lng: 120.15, lat: 30.27 },
  南京: { lng: 118.8, lat: 32.06 }, 苏州: { lng: 120.58, lat: 31.3 },
  武汉: { lng: 114.31, lat: 30.59 }, 成都: { lng: 104.07, lat: 30.67 },
  重庆: { lng: 106.55, lat: 29.56 }, 西安: { lng: 108.94, lat: 34.34 },
  郑州: { lng: 113.63, lat: 34.75 }, 济南: { lng: 117.12, lat: 36.65 },
  青岛: { lng: 120.38, lat: 36.07 }, 长沙: { lng: 112.94, lat: 28.23 },
  厦门: { lng: 118.09, lat: 24.48 }, 福州: { lng: 119.3, lat: 26.08 },
  合肥: { lng: 117.23, lat: 31.82 }, 南昌: { lng: 115.86, lat: 28.68 },
  昆明: { lng: 102.83, lat: 24.88 }, 贵阳: { lng: 106.63, lat: 26.65 },
  南宁: { lng: 108.37, lat: 22.82 }, 海口: { lng: 110.2, lat: 20.04 },
  沈阳: { lng: 123.43, lat: 41.8 }, 大连: { lng: 121.62, lat: 38.91 },
  长春: { lng: 125.32, lat: 43.82 }, 哈尔滨: { lng: 126.53, lat: 45.8 },
  石家庄: { lng: 114.51, lat: 38.04 }, 太原: { lng: 112.55, lat: 37.87 },
  兰州: { lng: 103.83, lat: 36.06 }, 乌鲁木齐: { lng: 87.62, lat: 43.82 },
  香港: { lng: 114.17, lat: 22.32 }, 澳门: { lng: 113.54, lat: 22.2 }
};

const LOCATION_ALIASES = Object.keys(LOCATION_COORDINATES).sort((a, b) => b.length - a.length);

type MapPoint = [number, number];

type ChinaMapFeature = {
  name: string;
  path: string;
  boundary: boolean;
};

const CHINA_MAP_WIDTH = 500;
const CHINA_MAP_HEIGHT = 430;

const DEGREE = Math.PI / 180;
const ALBERS_STANDARD_PARALLEL_1 = 25 * DEGREE;
const ALBERS_STANDARD_PARALLEL_2 = 47 * DEGREE;
const ALBERS_ORIGIN_LONGITUDE = 105 * DEGREE;
const ALBERS_N =
  (Math.sin(ALBERS_STANDARD_PARALLEL_1) +
    Math.sin(ALBERS_STANDARD_PARALLEL_2)) /
  2;
const ALBERS_C =
  Math.cos(ALBERS_STANDARD_PARALLEL_1) ** 2 +
  2 * ALBERS_N * Math.sin(ALBERS_STANDARD_PARALLEL_1);
const ALBERS_RHO_ORIGIN = Math.sqrt(ALBERS_C) / ALBERS_N;
const ALBERS_BOUNDS = {
  minX: -0.4111170389,
  maxX: 0.3454467148,
  minY: 0.057179601,
  maxY: 0.9320904841
};

function projectChinaPoint([lng, lat]: MapPoint): MapPoint {
  const latitude = lat * DEGREE;
  const theta = ALBERS_N * (lng * DEGREE - ALBERS_ORIGIN_LONGITUDE);
  const rho =
    Math.sqrt(ALBERS_C - 2 * ALBERS_N * Math.sin(latitude)) / ALBERS_N;
  const rawX = rho * Math.sin(theta);
  const rawY = ALBERS_RHO_ORIGIN - rho * Math.cos(theta);
  const centerX = (ALBERS_BOUNDS.minX + ALBERS_BOUNDS.maxX) / 2;
  const x = CHINA_MAP_WIDTH / 2 + (rawX - centerX) * 500;
  const y = 18 + (ALBERS_BOUNDS.maxY - rawY) * 450;
  return [x, y];
}

function segmentDistanceSquared(point: MapPoint, start: MapPoint, end: MapPoint): number {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx || dy) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
    dx = point[0] - x;
    dy = point[1] - y;
  } else {
    dx = point[0] - x;
    dy = point[1] - y;
  }
  return dx * dx + dy * dy;
}

function simplifyMapPoints(points: MapPoint[], tolerance = 0.32): MapPoint[] {
  if (points.length <= 2) return points;
  const toleranceSquared = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop()!;
    let index = -1;
    let maxDistance = toleranceSquared;
    for (let current = first + 1; current < last; current += 1) {
      const distance = segmentDistanceSquared(points[current], points[first], points[last]);
      if (distance > maxDistance) {
        index = current;
        maxDistance = distance;
      }
    }
    if (index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

function coordinatesToPath(coordinates: unknown, close: boolean): string {
  if (!Array.isArray(coordinates) || !coordinates.length) return "";
  if (typeof coordinates[0]?.[0] === "number") {
    const points = simplifyMapPoints(
      (coordinates as MapPoint[]).map(projectChinaPoint)
    );
    if (!points.length) return "";
    const commands = points.map(
      ([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`
    );
    return `${commands.join(" ")}${close ? "Z" : ""}`;
  }
  return (coordinates as unknown[])
    .map((item) => coordinatesToPath(item, close))
    .filter(Boolean)
    .join(" ");
}

function normalizeJobLocation(value?: string): string {
  const source = value?.trim();
  if (!source) return "未填写";
  return LOCATION_ALIASES.find((location) => source.includes(location)) ?? source.replace(/[省市]$/, "");
}

const compactStages: ApplicationStage[] = [
  "interested",
  "to_apply",
  "applied",
  "assessment",
  "interview",
  "offer"
];

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}`;
}

function shouldUseDeepSeekForCapture(page: ExtractedJob): boolean {
  if (page.progressEvidence?.length) return true;

  const genericPosition = /^(?:校园招聘|社会招聘|招聘官网|职位列表|职位详情|申请记录|投递记录|我的申请)$/i.test(
    page.position.trim()
  );
  const genericCompany =
    !page.company.trim() ||
    page.company.trim().toLowerCase() === page.sourceHost.trim().toLowerCase();

  return page.confidence < 0.8 || genericPosition || genericCompany;
}

function dueState(deadline?: string): "late" | "soon" | "normal" | "none" {
  if (!deadline) return "none";
  const due = new Date(deadline);
  if (Number.isNaN(due.getTime())) return "none";
  const days = (due.getTime() - Date.now()) / 86400000;
  if (days < 0) return "late";
  if (days <= 3) return "soon";
  return "normal";
}

function formatDeadline(deadline?: string): string {
  if (!deadline) return "未设置";
  const value = new Date(deadline);
  if (Number.isNaN(value.getTime())) return deadline;
  return value.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric"
  });
}

function calendarDateKey(value?: string): string | undefined {
  if (!value) return undefined;
  const direct = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return localDateKey(date);
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthLabel(date: Date): string {
  return `${date.getFullYear()}年 ${String(date.getMonth() + 1).padStart(2, "0")}月`;
}

function inferAppliedAt(job: JobApplication): string | undefined {
  if (job.appliedAt || !job.rawExcerpt) return job.appliedAt;
  const text = job.rawExcerpt;
  const jobIndex = job.jobId ? text.toLowerCase().indexOf(job.jobId.toLowerCase()) : -1;
  const relevantText =
    jobIndex >= 0
      ? text.slice(Math.max(0, jobIndex - 120), Math.min(text.length, jobIndex + 700))
      : text;
  const match = relevantText.match(
    /(?:投递时间|申请时间|提交时间)[：:\s]*(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?(?:\s+\d{1,2}:\d{2})?)/i
  );
  return match?.[1]
    ?.replace(/[年月./]/g, "-")
    .replace(/日(?=\s|$)/, "")
    .trim();
}

function CalendarView({
  jobs,
  onEdit,
  onCapture
}: {
  jobs: JobApplication[];
  onEdit: (job: JobApplication) => void;
  onCapture: () => void;
}) {
  const initialDate = useMemo(() => {
    const datedJob = jobs.find((job) => job.appliedAt || job.deadline);
    const candidate = datedJob?.appliedAt || datedJob?.deadline;
    return candidate ? new Date(candidate) : new Date();
  }, []);
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState(() =>
    localDateKey(initialDate)
  );

  const events = useMemo<CalendarEvent[]>(() => {
    const result: CalendarEvent[] = [];
    for (const job of jobs) {
      const appliedDate = calendarDateKey(job.appliedAt);
      if (appliedDate) {
        result.push({
          id: `${job.id}-applied`,
          date: appliedDate,
          type: "applied",
          title: job.position,
          subtitle: `${job.company} · 已投递`,
          job
        });
      }
      const deadlineDate = calendarDateKey(job.deadline);
      if (deadlineDate) {
        result.push({
          id: `${job.id}-deadline`,
          date: deadlineDate,
          type: "deadline",
          title: job.position,
          subtitle: `${job.company} · 截止`,
          job
        });
      }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date));
  }, [jobs]);

  const days = useMemo(() => {
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      return day;
    });
  }, [visibleMonth]);

  const selectedEvents = events.filter((event) => event.date === selectedDate);
  const missingAppliedAtCount = jobs.filter((job) => !job.appliedAt).length;
  const upcoming = events
    .filter((event) => event.type === "deadline" && event.date >= localDateKey(new Date()))
    .slice(0, 6);

  const moveMonth = (offset: number) =>
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1)
    );

  return (
    <section className="calendar-view">
      <div className="page-heading calendar-heading">
        <div>
          <span className="eyebrow">秋招时间地图</span>
          <h1>每一次投递，都有时间坐标。</h1>
          <p>同时查看真实投递时间与即将到来的截止日期。</p>
        </div>
        <div className="calendar-legend">
          <span><i className="legend-applied" />投递</span>
          <span><i className="legend-deadline" />截止</span>
        </div>
      </div>

      {missingAppliedAtCount > 0 && (
        <div className="calendar-data-notice">
          <CalendarClock size={18} />
          <div>
            <strong>{missingAppliedAtCount} 个岗位还没有真实投递时间</strong>
            <span>打开投递记录页重新抓取，可从“投递时间”字段自动补齐。</span>
          </div>
          <button onClick={onCapture}>从当前页面补齐</button>
        </div>
      )}

      <div className="calendar-layout">
        <div className="calendar-board">
          <header className="calendar-toolbar">
            <button className="icon-button" onClick={() => moveMonth(-1)}>
              <ChevronLeft size={18} />
            </button>
            <h2>{monthLabel(visibleMonth)}</h2>
            <button className="icon-button" onClick={() => moveMonth(1)}>
              <ChevronRight size={18} />
            </button>
            <button
              className="today-button"
              onClick={() => {
                const today = new Date();
                setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                setSelectedDate(localDateKey(today));
              }}
            >
              今天
            </button>
          </header>

          <div className="weekday-row">
            {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="calendar-grid">
            {days.map((day) => {
              const key = localDateKey(day);
              const dayEvents = events.filter((event) => event.date === key);
              const outside = day.getMonth() !== visibleMonth.getMonth();
              const today = key === localDateKey(new Date());
              return (
                <button
                  className={`calendar-day ${outside ? "outside" : ""} ${
                    selectedDate === key ? "selected" : ""
                  }`}
                  key={key}
                  onClick={() => setSelectedDate(key)}
                >
                  <span className={today ? "today-number" : ""}>{day.getDate()}</span>
                  <div className="day-events">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span
                        className={`day-event day-event--${event.type}`}
                        key={event.id}
                        title={`${event.subtitle} ${event.title}`}
                      >
                        {event.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 && <small>+{dayEvents.length - 3}</small>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="calendar-agenda">
          <div className="agenda-date">
            <span>{selectedDate?.slice(5).replace("-", "/") || "--/--"}</span>
            <small>{selectedEvents.length} 个日程</small>
          </div>
          <div className="agenda-list">
            {selectedEvents.length ? (
              selectedEvents.map((event) => (
                <button
                  className={`agenda-item agenda-item--${event.type}`}
                  key={event.id}
                  onClick={() => onEdit(event.job)}
                >
                  <i />
                  <span>
                    <strong>{event.title}</strong>
                    <small>{event.subtitle}</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))
            ) : (
              <div className="agenda-empty">这一天没有投递或截止事项</div>
            )}
          </div>

          <div className="upcoming-block">
            <div className="section-heading">
              <span>接下来截止</span>
              <small>{upcoming.length} 项</small>
            </div>
            {upcoming.map((event) => (
              <button key={event.id} onClick={() => onEdit(event.job)}>
                <time>{event.date.slice(5).replace("-", "/")}</time>
                <span>
                  <strong>{event.title}</strong>
                  <small>{event.job.company}</small>
                </span>
              </button>
            ))}
            {!upcoming.length && <p>暂时没有即将截止的岗位。</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}

function CompactSidebar({
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
          {job.externalStage ? ` · ${job.externalStage}` : ""}
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
          <strong>OfferDuoDuo</strong>
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

function OverlayPanel({
  jobs,
  settings,
  opportunitySnapshot,
  opportunityLoading,
  opportunityError,
  profile,
  onSaveProfile,
  onSaveOpportunityFeed,
  onCapture,
  onOpenOpportunity,
  onOpenSource,
  onEdit,
  onRefresh,
  onRefreshOpportunities,
  onOpenDashboard,
  onClose
}: {
  jobs: JobApplication[];
  settings: OfferFlowSettings;
  opportunitySnapshot: OpportunityFeedSnapshot;
  opportunityLoading: boolean;
  opportunityError?: string;
  profile: PersonalProfile;
  onSaveProfile: (profile: PersonalProfile) => Promise<void>;
  onSaveOpportunityFeed: (url: string) => Promise<void>;
  onCapture: () => void;
  onOpenOpportunity: (opportunity: RecruitmentOpportunity) => void;
  onOpenSource: (job: JobApplication) => void;
  onEdit: (job: JobApplication) => void;
  onRefresh: () => void;
  onRefreshOpportunities: () => void;
  onOpenDashboard: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<
    "overview" | "opportunities" | "jobs" | "agenda" | "locations" | "settings" | "profile"
  >("overview");
  const [opportunityFeedDraft, setOpportunityFeedDraft] = useState(
    settings.opportunityFeedUrl || ""
  );
  const today = localDateKey(new Date());
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(today);
  const [selectedLocation, setSelectedLocation] = useState("全部");
  const [chinaMapFeatures, setChinaMapFeatures] = useState<ChinaMapFeature[]>([]);
  const [chinaMapError, setChinaMapError] = useState(false);

  useEffect(() => {
    setOpportunityFeedDraft(settings.opportunityFeedUrl || "");
  }, [settings.opportunityFeedUrl]);

  useEffect(() => {
    let cancelled = false;
    fetch(new URL("china.geojson", window.location.href))
      .then((response) => {
        if (!response.ok) throw new Error(`Map data ${response.status}`);
        return response.json();
      })
      .then((data: {
        features: Array<{
          properties?: { name?: string };
          geometry: { type: string; coordinates: unknown };
        }>;
      }) => {
        if (cancelled) return;
        setChinaMapFeatures(
          data.features
            .map((feature) => ({
              name: feature.properties?.name || "",
              path: coordinatesToPath(
                feature.geometry.coordinates,
                feature.geometry.type.includes("Polygon")
              ),
              boundary: feature.geometry.type.includes("LineString")
            }))
            .filter((feature) => feature.path)
        );
      })
      .catch(() => {
        if (!cancelled) setChinaMapError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const activeJobs = jobs
    .filter((job) => job.stage !== "closed")
    .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
  const recentJobs = [...activeJobs]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  const locationGroups = Array.from(
    activeJobs.reduce((groups, job) => {
      const location = normalizeJobLocation(job.city);
      const current = groups.get(location) ?? [];
      current.push(job);
      groups.set(location, current);
      return groups;
    }, new Map<string, JobApplication[]>())
  ).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-CN"));
  const locationJobs =
    selectedLocation === "全部"
      ? activeJobs
      : locationGroups.find(([location]) => location === selectedLocation)?.[1] ?? [];
  const mappedLocationGroups = locationGroups.filter(
    ([location]) => LOCATION_COORDINATES[location]
  );
  const calendarEvents = jobs
    .flatMap((job) => {
      const items: Array<{
        id: string;
        date: string;
        label: string;
        kind: "applied" | "deadline";
        job: JobApplication;
      }> = [];
      const appliedAt = calendarDateKey(job.appliedAt);
      const deadline = calendarDateKey(job.deadline);
      if (appliedAt) {
        items.push({
          id: `${job.id}-applied`,
          date: appliedAt,
          label: "完成投递",
          kind: "applied",
          job
        });
      }
      if (deadline) {
        items.push({
          id: `${job.id}-deadline`,
          date: deadline,
          label: "截止日期",
          kind: "deadline",
          job
        });
      }
      return items;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const agenda = calendarEvents.filter((item) => item.date >= today);
  const calendarDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [calendarMonth]);
  const selectedCalendarEvents = calendarEvents.filter(
    (item) => item.date === selectedCalendarDate
  );
  const visibleMonthKey = `${calendarMonth.getFullYear()}-${String(
    calendarMonth.getMonth() + 1
  ).padStart(2, "0")}`;
  const visibleMonthEvents = calendarEvents.filter((item) =>
    item.date.startsWith(visibleMonthKey)
  );
  const moveCalendarMonth = (offset: number) => {
    const next = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + offset,
      1
    );
    setCalendarMonth(next);
    setSelectedCalendarDate(localDateKey(next));
  };

  const renderJob = (job: JobApplication) => (
    <div className="overlay-job" key={job.id}>
      <button
        className="overlay-job-open"
        onClick={() => onOpenSource(job)}
        aria-label={`打开 ${job.company} ${job.position} 的网申页面`}
        title="打开网申页面"
      >
        <span className={`overlay-stage-mark overlay-stage-mark--${job.stage}`} />
        <span className="overlay-job-copy">
          <strong>{job.position}</strong>
          <small>
            {job.company}
            {job.externalStage ? ` · ${job.externalStage}` : ""}
          </small>
        </span>
        <span className="overlay-job-meta">
          {job.deadline ? formatDeadline(job.deadline) : STAGE_LABELS[job.stage]}
        </span>
        <ExternalLink className="overlay-job-external" size={14} />
      </button>
      <button
        className="overlay-job-edit"
        onClick={() => onEdit(job)}
        aria-label={`维护 ${job.company} ${job.position}`}
        title="维护岗位"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );

  return (
    <div className="overlay-app">
      <header className="overlay-header">
        <div className="overlay-identity">
          <span className="overlay-monogram">OF</span>
          <span className="overlay-divider" />
          <button
            className="overlay-space"
            onClick={() => setTab(tab === "profile" ? "overview" : "profile")}
            title="个人资料库"
          >
            <BriefcaseBusiness size={15} />
            {tab === "profile" ? "个人资料库" : "2026 秋招"}
            <ChevronDown size={14} />
          </button>
        </div>
        <div className="overlay-header-tools">
          <button aria-label="打开网页工作台" title="打开网页工作台" onClick={onOpenDashboard}>
            <MonitorUp size={17} />
          </button>
          <button aria-label="刷新" onClick={onRefresh}>
            <RefreshCw size={17} />
          </button>
          <button aria-label="关闭" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
      </header>

      <div className="overlay-scroll">
        {tab !== "profile" && <section className="overlay-capture-card">
          <span className="overlay-capture-icon">
            <Target size={19} />
          </span>
          <span>
            <strong>识别当前招聘页面</strong>
            <small>岗位、投递记录或流程变化</small>
          </span>
          <button onClick={onCapture}>识别</button>
        </section>}

        {tab === "overview" && (
          <>
            <div className="overlay-summary-row">
              <span>
                {activeJobs.length
                  ? `${activeJobs.length} 个岗位正在推进`
                  : "暂无岗位记录"}
              </span>
              <button onClick={() => setTab("jobs")}>查看全部</button>
            </div>

            <section className="overlay-flow">
              <div className="overlay-flow-list">
                {recentJobs.map((job, index) => (
                  <div className="overlay-flow-item" key={job.id}>
                    <span className={`flow-node flow-node--${index % 3}`} />
                    <div className="flow-line" />
                    {renderJob(job)}
                  </div>
                ))}
                {!recentJobs.length && (
                  <div className="overlay-empty">暂无岗位记录</div>
                )}
              </div>
            </section>
          </>
        )}

        {tab === "opportunities" && (
          <OpportunityView
            snapshot={opportunitySnapshot}
            loading={opportunityLoading}
            error={opportunityError}
            configured={Boolean(settings.opportunityFeedUrl)}
            onOpen={onOpenOpportunity}
            onRefresh={onRefreshOpportunities}
            onConfigure={() => setTab("settings")}
          />
        )}

        {tab === "jobs" && (
          <section className="overlay-page">
            <div className="overlay-page-title">
              <span className="overlay-section-icon"><BriefcaseBusiness size={18} /></span>
              <div><h1>岗位</h1><p>{activeJobs.length} 个岗位正在推进</p></div>
            </div>
            <div className="overlay-job-list">
              {activeJobs.map(renderJob)}
              {!activeJobs.length && <div className="overlay-empty">暂无岗位记录</div>}
            </div>
          </section>
        )}

        {tab === "agenda" && (
          <section className="overlay-page">
            <div className="overlay-page-title">
              <span className="overlay-section-icon"><CalendarDays size={18} /></span>
              <div><h1>日程</h1><p>投递时间与截止事项</p></div>
            </div>
            <div className="overlay-calendar">
              <div className="overlay-calendar-toolbar">
                <div>
                  <strong>{calendarMonth.getFullYear()}年 {String(calendarMonth.getMonth() + 1).padStart(2, "0")}月</strong>
                  <small>{visibleMonthEvents.length} 个时间节点</small>
                </div>
                <span>
                  <button aria-label="上个月" onClick={() => moveCalendarMonth(-1)}><ChevronLeft size={17} /></button>
                  <button
                    className="overlay-calendar-today"
                    onClick={() => {
                      const now = new Date();
                      setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                      setSelectedCalendarDate(today);
                    }}
                  >今天</button>
                  <button aria-label="下个月" onClick={() => moveCalendarMonth(1)}><ChevronRight size={17} /></button>
                </span>
              </div>

              <div className="overlay-calendar-weekdays">
                {["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}
              </div>

              <div className="overlay-calendar-grid">
                {calendarDays.map((date) => {
                  const key = localDateKey(date);
                  const dayEvents = calendarEvents.filter((item) => item.date === key);
                  const outside = date.getMonth() !== calendarMonth.getMonth();
                  return (
                    <button
                      className={`${outside ? "outside" : ""} ${key === today ? "today" : ""} ${key === selectedCalendarDate ? "selected" : ""}`}
                      key={key}
                      onClick={() => setSelectedCalendarDate(key)}
                    >
                      <span>{date.getDate()}</span>
                      <i>
                        {dayEvents.some((item) => item.kind === "applied") && <b className="applied" />}
                        {dayEvents.some((item) => item.kind === "deadline") && <b className="deadline" />}
                      </i>
                    </button>
                  );
                })}
              </div>

              <div className="overlay-calendar-legend">
                <span><i className="applied" />投递</span>
                <span><i className="deadline" />截止</span>
              </div>
            </div>

            <div className="overlay-calendar-selection">
              <div className="overlay-calendar-selection-title">
                <strong>{selectedCalendarDate === today ? "今天" : `${Number(selectedCalendarDate.slice(5, 7))}月${Number(selectedCalendarDate.slice(8))}日`}</strong>
                <span>{selectedCalendarEvents.length ? `${selectedCalendarEvents.length} 项` : "无事项"}</span>
              </div>
              <div className="overlay-agenda-list">
                {selectedCalendarEvents.map((item) => (
                  <button key={item.id} onClick={() => onEdit(item.job)}>
                    <time><strong>{item.date.slice(8)}</strong><small>{item.date.slice(5, 7)}月</small></time>
                    <span className={`overlay-agenda-dot overlay-agenda-dot--${item.kind}`} />
                    <span><strong>{item.job.position}</strong><small>{item.job.company} · {item.label}</small></span>
                    <ChevronRight size={14} />
                  </button>
                ))}
                {!selectedCalendarEvents.length && <div className="overlay-calendar-empty">这一天可以留给自己。</div>}
              </div>
            </div>
          </section>
        )}

        {tab === "locations" && (
          <section className="overlay-page">
            <div className="overlay-page-title">
              <span className="overlay-section-icon"><MapPin size={18} /></span>
              <div><h1>地区</h1><p>按地理区位整理你的岗位</p></div>
            </div>

            <div className="overlay-location-overview">
              <div><strong>{locationGroups.filter(([location]) => location !== "未填写").length}</strong><span>个地区</span></div>
              <i />
              <div><strong>{activeJobs.length}</strong><span>个岗位</span></div>
            </div>

            <div className="overlay-location-map">
              <div className="overlay-location-map-heading">
                <span><strong>岗位分布</strong><small>点击城市查看岗位</small></span>
                <em>{mappedLocationGroups.length} 个坐标</em>
              </div>
              <svg
                viewBox={`0 0 ${CHINA_MAP_WIDTH} ${CHINA_MAP_HEIGHT}`}
                role="img"
                aria-label="中国地区岗位分布图"
              >
                {chinaMapFeatures
                  .filter((feature) => !feature.boundary)
                  .map((feature, index) => (
                    <path
                      className="overlay-china-province"
                      d={feature.path}
                      fillRule="evenodd"
                      key={`${feature.name}-${index}`}
                    />
                  ))}
                {chinaMapFeatures
                  .filter((feature) => feature.boundary)
                  .map((feature, index) => (
                    <path
                      className="overlay-china-boundary"
                      d={feature.path}
                      key={`boundary-${index}`}
                    />
                  ))}
                {!chinaMapFeatures.length && !chinaMapError && (
                  <text className="overlay-map-status" x="250" y="200">正在载入标准地图…</text>
                )}
                {chinaMapError && (
                  <text className="overlay-map-status" x="250" y="200">地图数据载入失败</text>
                )}
                {mappedLocationGroups.map(([location, locationItems]) => {
                  const coordinate = LOCATION_COORDINATES[location];
                  const [x, y] = projectChinaPoint([coordinate.lng, coordinate.lat]);
                  const active = selectedLocation === location;
                  const labelOnLeft = coordinate.lng > 119;
                  return (
                    <g
                      className={`overlay-map-marker ${active ? "active" : ""}`}
                      key={location}
                      role="button"
                      tabIndex={0}
                      aria-label={`${location}，${locationItems.length} 个岗位`}
                      onClick={() => setSelectedLocation(location)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") setSelectedLocation(location);
                      }}
                    >
                      <circle className="overlay-map-hit" cx={x} cy={y} r="14" />
                      <circle className="overlay-map-dot" cx={x} cy={y} r="5.5" />
                      <circle className="overlay-map-core" cx={x} cy={y} r="1.7" />
                      <text
                        className="overlay-map-label"
                        x={x + (labelOnLeft ? -10 : 10)}
                        y={y + 3}
                        textAnchor={labelOnLeft ? "end" : "start"}
                      >{location} · {locationItems.length}</text>
                    </g>
                  );
                })}
              </svg>
              <div className="overlay-location-map-source">
                <span>底图来源：天地图标准矢量地图</span>
                <strong>GS(2024)0650</strong>
              </div>
            </div>

            <div className="overlay-location-tags">
              <button
                className={selectedLocation === "全部" ? "active" : ""}
                onClick={() => setSelectedLocation("全部")}
              ><span>全部</span><small>{activeJobs.length}</small></button>
              {locationGroups.map(([location, locationItems]) => (
                <button
                  className={selectedLocation === location ? "active" : ""}
                  key={location}
                  onClick={() => setSelectedLocation(location)}
                ><span>{location}</span><small>{locationItems.length}</small></button>
              ))}
            </div>

            <div className="overlay-location-result">
              <div className="overlay-location-result-title">
                <strong>{selectedLocation}</strong>
                <span>{locationJobs.length} 个岗位</span>
              </div>
              <div className="overlay-job-list">
                {locationJobs.map(renderJob)}
                {!locationJobs.length && <div className="overlay-empty">暂无该地区岗位</div>}
              </div>
            </div>
          </section>
        )}

        {tab === "settings" && (
          <section className="overlay-page">
            <div className="overlay-page-title">
              <span className="overlay-section-icon"><Settings2 size={18} /></span>
              <div><h1>连接</h1><p>OfferDuoDuo 的本地服务状态</p></div>
            </div>
            <div className="overlay-connection-list">
              <div><Megaphone size={17} /><span><strong>校招机会</strong><small>{settings.opportunityFeedUrl ? `${opportunitySnapshot.opportunities.length} 条机会` : "使用内置数据或配置外部源"}</small></span><i className={opportunitySnapshot.opportunities.length ? "active" : ""} /></div>
              <div><Sparkles size={17} /><span><strong>DeepSeek</strong><small>{settings.deepseekApiKey ? "已连接" : "未配置"}</small></span><i className={settings.deepseekApiKey ? "active" : ""} /></div>
              <div><CircleDot size={17} /><span><strong>实时监听</strong><small>{(settings.autoMonitorEnabled ?? true) ? "已开启" : "已关闭"}</small></span><i className={(settings.autoMonitorEnabled ?? true) ? "active" : ""} /></div>
              <div><FileText size={17} /><span><strong>Obsidian</strong><small>{settings.obsidianFolderName || "未连接"}</small></span><i className={settings.obsidianFolderName ? "active" : ""} /></div>
            </div>
            <div className="opportunity-feed-settings">
              <label htmlFor="overlay-opportunity-feed">校招机会 JSON 地址</label>
              <input
                id="overlay-opportunity-feed"
                type="url"
                value={opportunityFeedDraft}
                placeholder="https://example.com/opportunities.json"
                onChange={(event) => setOpportunityFeedDraft(event.target.value)}
              />
              <p>留空使用插件内置数据。支持公司、招聘项目、开放日期、截止日期和官方链接等中英文字段。</p>
              <button
                onClick={() => void onSaveOpportunityFeed(opportunityFeedDraft)}
                disabled={opportunityLoading}
              >
                {opportunityLoading ? <RefreshCw className="spin" size={14} /> : <Check size={14} />}
                保存并同步
              </button>
            </div>
          </section>
        )}

        {tab === "profile" && (
          <ProfileView
            profile={profile}
            onSave={onSaveProfile}
            onBack={() => setTab("overview")}
          />
        )}
      </div>

      <nav className="overlay-toolbar">
        <button title="总览" aria-label="总览" className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}><LayoutDashboard size={19} /></button>
        <button title="机会" aria-label="机会" className={tab === "opportunities" ? "active" : ""} onClick={() => setTab("opportunities")}><Megaphone size={19} /></button>
        <button title="投递" aria-label="投递" className={tab === "jobs" ? "active" : ""} onClick={() => setTab("jobs")}><BriefcaseBusiness size={19} /></button>
        <button title="日历" aria-label="日历" className={tab === "agenda" ? "active" : ""} onClick={() => setTab("agenda")}><CalendarDays size={19} /></button>
        <button title="设置" aria-label="设置" className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Settings2 size={19} /></button>
      </nav>
    </div>
  );
}

function JobCard({
  job,
  onStageChange,
  onEdit
}: {
  job: JobApplication;
  onStageChange: (job: JobApplication, stage: ApplicationStage) => void;
  onEdit: (job: JobApplication) => void;
}) {
  const due = dueState(job.deadline);
  return (
    <article className="job-card" onClick={() => onEdit(job)}>
      <div className="card-topline">
        <span className="company-mark">{job.company.slice(0, 1)}</span>
        <span className={`deadline deadline--${due}`}>
          <CalendarClock size={12} />
          {formatDeadline(job.deadline)}
        </span>
      </div>
      <h3>{job.position}</h3>
      <p className="company-line">
        {job.company}
        {job.city ? ` · ${job.city}` : ""}
      </p>
      <div className="next-action">
        <span>下一步</span>
        <strong>{job.nextAction || "待确定"}</strong>
      </div>
      <div className="card-footer">
        <select
          value={job.stage}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            event.stopPropagation();
            onStageChange(job, event.target.value as ApplicationStage);
          }}
          aria-label="修改投递阶段"
        >
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_LABELS[stage]}
            </option>
          ))}
        </select>
        {job.obsidianPath ? (
          <span className="sync-state" title="已同步到 Obsidian">
            <Check size={13} /> MD
          </span>
        ) : (
          <span className="sync-state sync-state--muted">未同步</span>
        )}
      </div>
    </article>
  );
}

function CaptureForm({
  value,
  duplicate,
  onChange,
  onCancel,
  onSave
}: {
  value: ExtractedJob;
  duplicate?: JobApplication;
  onChange: (value: ExtractedJob) => void;
  onCancel: () => void;
  onSave: (mode: "create" | "update") => void;
}) {
  const update = <K extends keyof ExtractedJob>(key: K, next: ExtractedJob[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <section className="capture-view">
      <div className="capture-hero">
        <div className="eyebrow">
          <Sparkles size={14} /> 页面识别完成
        </div>
        <h1>
          {value.company}
          <span>｜</span>
          {value.position}
        </h1>
        <p>
          已从 {value.sourceHost} 提取 · 置信度{" "}
          {Math.round(value.confidence * 100)}%
        </p>
      </div>

      {duplicate && (
        <div className="duplicate-alert">
          <AlertTriangle size={18} />
          <div>
            <strong>发现可能重复的岗位</strong>
            <span>
              {duplicate.company} · {duplicate.position}，当前阶段为
              {STAGE_LABELS[duplicate.stage]}
            </span>
          </div>
        </div>
      )}

      <div className="form-grid">
        <label>
          <span>公司</span>
          <input value={value.company} onChange={(e) => update("company", e.target.value)} />
        </label>
        <label>
          <span>岗位</span>
          <input value={value.position} onChange={(e) => update("position", e.target.value)} />
        </label>
        <label>
          <span>城市</span>
          <input
            value={value.city || ""}
            placeholder="未识别"
            onChange={(e) => update("city", e.target.value)}
          />
        </label>
        <label>
          <span>岗位编号</span>
          <input
            value={value.jobId || ""}
            placeholder="未识别"
            onChange={(e) => update("jobId", e.target.value)}
          />
        </label>
        <label>
          <span>截止时间</span>
          <input
            type="date"
            value={value.deadline?.slice(0, 10) || ""}
            onChange={(e) => update("deadline", e.target.value)}
          />
        </label>
        <label>
          <span>投递时间</span>
          <input
            type="date"
            value={value.appliedAt?.slice(0, 10) || ""}
            onChange={(e) => update("appliedAt", e.target.value)}
          />
        </label>
        <label>
          <span>下一步行动</span>
          <input
            value={value.nextAction || ""}
            onChange={(e) => update("nextAction", e.target.value)}
          />
        </label>
      </div>

      <label className="summary-field">
        <span>岗位摘要</span>
        <textarea
          value={value.summary || ""}
          rows={5}
          onChange={(e) => update("summary", e.target.value)}
        />
      </label>

      <div className="capture-actions">
        <button className="button button--ghost" onClick={onCancel}>
          <X size={16} /> 取消
        </button>
        {duplicate && (
          <button className="button button--secondary" onClick={() => onSave("update")}>
            <RefreshCw size={16} /> 更新已有岗位
          </button>
        )}
        <button className="button button--primary" onClick={() => onSave("create")}>
          <Plus size={16} /> {duplicate ? "仍然新建" : "加入 OfferDuoDuo"}
        </button>
      </div>
    </section>
  );
}

function CandidatePicker({
  candidates,
  jobs,
  onCancel,
  onImport
}: {
  candidates: ExtractedJob[];
  jobs: JobApplication[];
  onCancel: () => void;
  onImport: (candidates: ExtractedJob[]) => void;
}) {
  const [selected, setSelected] = useState(() => new Set(candidates.map((_, index) => index)));

  const toggle = (index: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <section className="capture-view">
      <div className="capture-hero candidate-hero">
        <div className="eyebrow">
          <Sparkles size={14} /> DeepSeek 多岗位识别
        </div>
        <h1>
          检测到 {candidates.length} 条<span>投递记录</span>
        </h1>
        <p>选择需要创建或更新的岗位，重复记录会自动合并。</p>
      </div>

      <div className="candidate-list">
        {candidates.map((candidate, index) => {
          const duplicate = findDuplicate(jobs, {
            company: candidate.company,
            position: candidate.position,
            jobId: candidate.jobId,
            city: candidate.city,
            sourceUrl: candidate.sourceUrl
          });
          return (
            <label
              className={`candidate-row ${selected.has(index) ? "selected" : ""}`}
              key={`${candidate.jobId || candidate.position}-${index}`}
            >
              <input
                type="checkbox"
                checked={selected.has(index)}
                onChange={() => toggle(index)}
              />
              <span className="candidate-check">
                {selected.has(index) && <Check size={14} />}
              </span>
              <span className="candidate-main">
                <strong>{candidate.position}</strong>
                <small>
                  {candidate.company}
                  {candidate.city ? ` · ${candidate.city}` : ""}
                  {candidate.jobId ? ` · ${candidate.jobId}` : ""}
                </small>
              </span>
              <span className="candidate-stage">
                {candidate.externalStage ||
                  (candidate.suggestedStage
                  ? STAGE_LABELS[candidate.suggestedStage]
                  : "待确认")}
              </span>
              <span className={`candidate-mode ${duplicate ? "update" : ""}`}>
                {duplicate ? "更新" : "新建"}
              </span>
            </label>
          );
        })}
      </div>

      <div className="capture-actions">
        <button className="button button--ghost" onClick={onCancel}>
          <X size={16} /> 取消
        </button>
        <button
          className="button button--primary"
          disabled={!selected.size}
          onClick={() =>
            onImport(candidates.filter((_, index) => selected.has(index)))
          }
        >
          <Plus size={16} /> 导入选中的 {selected.size} 条
        </button>
      </div>
    </section>
  );
}

function EditDrawer({
  job,
  onClose,
  onSave,
  onSync,
  onDelete
}: {
  job: JobApplication;
  onClose: () => void;
  onSave: (job: JobApplication) => void;
  onSync: (job: JobApplication) => void;
  onDelete: (job: JobApplication) => void;
}) {
  const [draft, setDraft] = useState(job);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const set = <K extends keyof JobApplication>(key: K, value: JobApplication[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <span className="eyebrow">岗位维护</span>
            <h2>{draft.position}</h2>
            <p>{draft.company}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={19} />
          </button>
        </div>

        <div className="drawer-body">
          <label>
            <span>当前阶段</span>
            <select
              value={draft.stage}
              onChange={(event) =>
                set("stage", event.target.value as ApplicationStage)
              }
            >
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>下一步行动</span>
            <input
              value={draft.nextAction || ""}
              onChange={(event) => set("nextAction", event.target.value)}
            />
          </label>
          <label>
            <span>投递时间</span>
            <input
              type="datetime-local"
              value={draft.appliedAt?.slice(0, 16) || ""}
              onChange={(event) => set("appliedAt", event.target.value)}
            />
          </label>
          <label>
            <span>截止时间</span>
            <input
              type="datetime-local"
              value={draft.deadline?.slice(0, 16) || ""}
              onChange={(event) => set("deadline", event.target.value)}
            />
          </label>
          <label>
            <span>岗位摘要</span>
            <textarea
              rows={5}
              value={draft.summary || ""}
              onChange={(event) => set("summary", event.target.value)}
            />
          </label>

          <div className="timeline">
            <div className="section-heading">
              <span>时间线</span>
              <small>{draft.events.length} 条事件</small>
            </div>
            {[...draft.events].reverse().map((event) => (
              <div className="timeline-item" key={event.id}>
                <CircleDot size={14} />
                <div>
                  <strong>{event.title}</strong>
                  <span>{new Date(event.occurredAt).toLocaleString("zh-CN")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {confirmingDelete && (
          <div className="drawer-delete-confirm" role="alertdialog" aria-labelledby="delete-job-title">
            <div>
              <strong id="delete-job-title">确定删除这个岗位？</strong>
              <span>岗位信息和时间线将一并移除，此操作无法撤销。</span>
            </div>
            <button className="button button--ghost" onClick={() => setConfirmingDelete(false)}>
              取消
            </button>
            <button className="button button--danger-solid" onClick={() => onDelete(draft)}>
              确认删除
            </button>
          </div>
        )}

        <div className="drawer-footer">
          <button
            className="button button--danger"
            onClick={() => setConfirmingDelete(true)}
            aria-expanded={confirmingDelete}
          >
            <Trash2 size={16} /> 删除
          </button>
          <button className="button button--secondary" onClick={() => onSync(draft)}>
            <FileText size={16} /> 同步 Markdown
          </button>
          <button className="button button--primary" onClick={() => onSave(draft)}>
            <Check size={16} /> 保存修改
          </button>
        </div>
      </aside>
    </div>
  );
}

export default function App({ overlay = false }: { overlay?: boolean }) {
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [settings, setSettings] = useState<OfferFlowSettings>({});
  const [opportunitySnapshot, setOpportunitySnapshot] = useState<OpportunityFeedSnapshot>({
    opportunities: []
  });
  const [opportunityLoading, setOpportunityLoading] = useState(false);
  const [opportunityError, setOpportunityError] = useState("");
  const [profile, setProfile] = useState<PersonalProfile>(() => ({
    ...EMPTY_PROFILE,
    education: [],
    experiences: [],
    projects: []
  }));
  const [view, setView] = useState<View>(() => {
    const requested = new URLSearchParams(location.search).get("view");
    return requested === "calendar" || requested === "settings"
      ? requested
      : "dashboard";
  });
  const [capture, setCapture] = useState<ExtractedJob | null>(null);
  const [captureCandidates, setCaptureCandidates] = useState<ExtractedJob[]>([]);
  const [editing, setEditing] = useState<JobApplication | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [testingAi, setTestingAi] = useState(false);

  useEffect(() => {
    Promise.all([loadJobs(), loadSettings(), loadProfile(), loadOpportunityCache()]).then(([storedJobs, storedSettings, storedProfile, cachedOpportunities]) => {
      let migrationChanged = false;
      const migratedJobs = storedJobs.map((job) => {
        const appliedAt = inferAppliedAt(job);
        if (!job.appliedAt && appliedAt) {
          migrationChanged = true;
          return { ...job, appliedAt };
        }
        return job;
      });
      setJobs(migratedJobs);
      if (migrationChanged) void saveJobs(migratedJobs);
      setSettings(storedSettings);
      setProfile(storedProfile);
      setOpportunitySnapshot(cachedOpportunities);
      setOpportunityLoading(true);
      refreshOpportunityFeed(storedSettings.opportunityFeedUrl)
        .then((snapshot) => {
          setOpportunitySnapshot(snapshot);
          setOpportunityError("");
        })
        .catch((error) => {
          if (storedSettings.opportunityFeedUrl) {
            setOpportunityError(error instanceof Error ? error.message : "机会数据同步失败");
          }
        })
        .finally(() => setOpportunityLoading(false));
    });

    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local") return;
      if (changes[JOBS_KEY]?.newValue) {
        setJobs(changes[JOBS_KEY].newValue as JobApplication[]);
      }
      if (changes[PROFILE_KEY]?.newValue) {
        setProfile(changes[PROFILE_KEY].newValue as PersonalProfile);
      }
      if (changes[OPPORTUNITY_CACHE_KEY]?.newValue) {
        setOpportunitySnapshot(
          changes[OPPORTUNITY_CACHE_KEY].newValue as OpportunityFeedSnapshot
        );
      }
      if (changes[AUTO_SYNC_NOTICE_KEY]?.newValue) {
        const autoNotice = changes[AUTO_SYNC_NOTICE_KEY].newValue as {
          message?: string;
        };
        if (autoNotice.message) setNotice(autoNotice.message);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    chrome.tabs
      ?.query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (tab?.id) return chrome.action.setBadgeText({ text: "", tabId: tab.id });
      })
      .catch(() => undefined);

    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const persistJobs = async (next: JobApplication[]) => {
    setJobs(next);
    await saveJobs(next);
  };

  const persistProfile = async (next: PersonalProfile) => {
    const updated = { ...next, updatedAt: new Date().toISOString() };
    setProfile(updated);
    await saveProfile(updated);
  };

  const refreshOpportunities = async (sourceUrl = settings.opportunityFeedUrl) => {
    setOpportunityLoading(true);
    setOpportunityError("");
    try {
      const snapshot = await refreshOpportunityFeed(sourceUrl);
      setOpportunitySnapshot(snapshot);
      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : "机会数据同步失败";
      setOpportunityError(message);
      throw error;
    } finally {
      setOpportunityLoading(false);
    }
  };

  const saveOpportunityFeedUrl = async (sourceUrl: string) => {
    const normalizedUrl = sourceUrl.trim();
    const next: OfferFlowSettings = {
      ...settings,
      opportunityFeedUrl: normalizedUrl || undefined
    };
    setSettings(next);
    await saveSettings(next);
    try {
      const snapshot = await refreshOpportunities(next.opportunityFeedUrl || "");
      setNotice(`机会数据已同步：${snapshot.opportunities.length} 条`);
    } catch {
      setNotice("数据源已保存，但当前无法读取；请检查地址和访问权限");
    }
  };

  const openOpportunity = async (opportunity: RecruitmentOpportunity) => {
    try {
      const source = new URL(opportunity.officialUrl);
      if (source.protocol !== "http:" && source.protocol !== "https:") {
        throw new Error("unsupported opportunity URL");
      }
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) throw new Error("active tab unavailable");
      await chrome.tabs.update(activeTab.id, { url: source.href });
    } catch {
      setNotice("该机会没有可用的官方招聘链接");
    }
  };

  const filteredJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return jobs;
    return jobs.filter((job) =>
      [job.company, job.position, job.city, job.jobId]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized))
    );
  }, [jobs, query]);

  const duplicate = capture
    ? findDuplicate(jobs, {
        company: capture.company,
        position: capture.position,
        jobId: capture.jobId,
        city: capture.city,
        sourceUrl: capture.sourceUrl
      })
    : undefined;

  const capturePage = async () => {
    setBusy(true);
    setNotice("");
    try {
      if (typeof chrome === "undefined" || !chrome.tabs) {
        setCapture({
          company: "示例科技",
          position: "产品经理",
          city: "上海",
          jobId: "DEMO-001",
          deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          nextAction: "完成网申",
          summary: "负责产品规划、需求分析与跨团队协作。",
          responsibilities: ["负责产品规划", "推进项目落地"],
          requirements: ["具备产品分析能力"],
          sourceUrl: location.href,
          sourceHost: "preview.local",
          confidence: 0.92
        });
      } else {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.id || !tab.url?.startsWith("http")) {
          throw new Error("请在招聘网页中使用 OfferDuoDuo");
        }
        const requestExtraction = () =>
          chrome.tabs.sendMessage(tab.id!, {
            type: "OFFERFLOW_EXTRACT_PAGE"
          }) as Promise<{ ok: boolean; data?: ExtractedJob; error?: string }>;

        let response: { ok: boolean; data?: ExtractedJob; error?: string };
        try {
          response = await requestExtraction();
        } catch (messageError) {
          const reason =
            messageError instanceof Error ? messageError.message : String(messageError);
          const receiverMissing = reason.includes("Receiving end does not exist");
          if (!receiverMissing || !chrome.scripting) throw messageError;

          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"]
          });
          response = await requestExtraction();
        }

        if (!response.ok || !response.data) {
          throw new Error(response.error || "页面解析失败");
        }
        if (settings.deepseekApiKey && shouldUseDeepSeekForCapture(response.data)) {
          try {
            const aiResult = await extractWithDeepSeek(response.data, settings);
            if (aiResult.applications.length > 1) {
              setCaptureCandidates(aiResult.applications);
              setCapture(null);
            } else {
              setCapture(aiResult.applications[0]);
              setCaptureCandidates([]);
            }
          } catch (aiError) {
            setCapture(response.data);
            setCaptureCandidates([]);
            setNotice(
              `DeepSeek识别失败，已使用本地规则：${
                aiError instanceof Error ? aiError.message : "未知错误"
              }`
            );
          }
        } else {
          setCapture(response.data);
          setCaptureCandidates([]);
        }
      }
      setView("capture");
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法抓取当前页面";
      setNotice(
        message.includes("Cannot access") ||
          message.includes("The extensions gallery cannot be scripted")
          ? "浏览器内部页面无法抓取，请打开实际的招聘网页后重试"
          : message
      );
    } finally {
      setBusy(false);
    }
  };

  const saveCapture = async (mode: "create" | "update") => {
    if (!capture) return;
    const now = new Date().toISOString();

    if (mode === "update" && duplicate) {
      const updated: JobApplication = {
        ...duplicate,
        ...capture,
        id: duplicate.id,
        stage: duplicate.stage,
        createdAt: duplicate.createdAt,
        updatedAt: now,
        events: [
          ...duplicate.events,
          {
            id: createId("evt"),
            type: "captured",
            title: "从招聘网页重新抓取并更新岗位",
            occurredAt: now,
            sourceUrl: capture.sourceUrl
          }
        ]
      };
      await persistJobs(jobs.map((job) => (job.id === duplicate.id ? updated : job)));
      setNotice("已有岗位已更新");
    } else {
      const created: JobApplication = {
        ...capture,
        id: createId("job"),
        stage: capture.suggestedStage || "interested",
        createdAt: now,
        updatedAt: now,
        events: [
          {
            id: createId("evt"),
            type: "created",
            title: "从招聘网页加入 OfferDuoDuo",
            occurredAt: now,
            sourceUrl: capture.sourceUrl
          }
        ]
      };
      await persistJobs([created, ...jobs]);
      setNotice("岗位已加入 OfferDuoDuo");
    }

    setCapture(null);
    setCaptureCandidates([]);
    setView("dashboard");
  };

  const importCandidates = async (candidates: ExtractedJob[]) => {
    const now = new Date().toISOString();
    let nextJobs = [...jobs];
    let createdCount = 0;
    let updatedCount = 0;

    for (const candidate of candidates) {
      const duplicate = findDuplicate(nextJobs, {
        company: candidate.company,
        position: candidate.position,
        jobId: candidate.jobId,
        city: candidate.city,
        sourceUrl: candidate.sourceUrl
      });

      if (duplicate) {
        const trustedStage =
          candidate.confidence >= 0.8 ? candidate.suggestedStage : undefined;
        const updated: JobApplication = {
          ...duplicate,
          ...candidate,
          id: duplicate.id,
          stage: trustedStage || duplicate.stage,
          externalStage: trustedStage
            ? candidate.externalStage || duplicate.externalStage
            : duplicate.externalStage,
          createdAt: duplicate.createdAt,
          updatedAt: now,
          events: [
            ...duplicate.events,
            {
              id: createId("evt"),
              type: "captured",
              title: "从投递记录页同步岗位进度",
              occurredAt: now,
              sourceUrl: candidate.sourceUrl
            }
          ]
        };
        nextJobs = nextJobs.map((job) => (job.id === duplicate.id ? updated : job));
        updatedCount += 1;
      } else {
        const created: JobApplication = {
          ...candidate,
          id: createId("job"),
          stage: candidate.suggestedStage || "applied",
          createdAt: now,
          updatedAt: now,
          events: [
            {
              id: createId("evt"),
              type: "created",
              title: "从投递记录页导入 OfferDuoDuo",
              occurredAt: now,
              sourceUrl: candidate.sourceUrl
            }
          ]
        };
        nextJobs.unshift(created);
        createdCount += 1;
      }
    }

    await persistJobs(nextJobs);
    setCaptureCandidates([]);
    setCapture(null);
    setView("dashboard");
    setNotice(`导入完成：新建 ${createdCount} 条，更新 ${updatedCount} 条`);
  };

  const updateStage = async (job: JobApplication, stage: ApplicationStage) => {
    if (job.stage === stage) return;
    const now = new Date().toISOString();
    const updated: JobApplication = {
      ...job,
      stage,
      updatedAt: now,
      events: [
        ...job.events,
        {
          id: createId("evt"),
          type: "stage_changed",
          title: `阶段更新：${STAGE_LABELS[job.stage]} → ${STAGE_LABELS[stage]}`,
          occurredAt: now
        }
      ]
    };
    await persistJobs(jobs.map((item) => (item.id === job.id ? updated : item)));
  };

  const saveEditedJob = async (draft: JobApplication) => {
    const original = jobs.find((job) => job.id === draft.id);
    if (!original) return;
    const now = new Date().toISOString();
    const events = [...draft.events];
    if (original.stage !== draft.stage) {
      events.push({
        id: createId("evt"),
        type: "stage_changed",
        title: `阶段更新：${STAGE_LABELS[original.stage]} → ${STAGE_LABELS[draft.stage]}`,
        occurredAt: now
      });
    } else {
      events.push({
        id: createId("evt"),
        type: "updated",
        title: "更新岗位信息",
        occurredAt: now
      });
    }
    const updated = { ...draft, updatedAt: now, events };
    await persistJobs(jobs.map((job) => (job.id === draft.id ? updated : job)));
    setEditing(null);
    setNotice("岗位进度已保存");
  };

  const deleteJob = async (job: JobApplication) => {
    await persistJobs(jobs.filter((item) => item.id !== job.id));
    setEditing(null);
    setNotice(`已删除：${job.position}`);
  };

  const chooseFolder = async () => {
    try {
      const directory = await chooseObsidianDirectory();
      const next = { ...settings, obsidianFolderName: directory.name };
      setSettings(next);
      await saveSettings(next);
      setNotice(`已连接目录：${directory.name}`);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        setNotice(error instanceof Error ? error.message : "目录连接失败");
      }
    }
  };

  const syncOne = async (job: JobApplication) => {
    setBusy(true);
    try {
      const filename = await syncJobToObsidian(job);
      const updated = {
        ...job,
        obsidianPath: filename,
        updatedAt: new Date().toISOString()
      };
      await persistJobs(jobs.map((item) => (item.id === job.id ? updated : item)));
      setEditing(updated);
      setNotice(`已同步：${filename}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "同步失败");
    } finally {
      setBusy(false);
    }
  };

  const syncAll = async () => {
    setBusy(true);
    try {
      const directory = await getStoredDirectory();
      if (!directory) throw new Error("请先选择 Obsidian 中的岗位目录");
      const synced: JobApplication[] = [];
      for (const job of jobs) {
        const filename = await syncJobToObsidian(job, directory);
        synced.push({ ...job, obsidianPath: filename });
      }
      const timestamp = new Date().toISOString();
      await persistJobs(synced.map((job) => ({ ...job, updatedAt: timestamp })));
      const next = { ...settings, lastExportAt: timestamp };
      setSettings(next);
      await saveSettings(next);
      setNotice(`已同步 ${jobs.length} 个岗位`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "同步失败");
    } finally {
      setBusy(false);
    }
  };

  const saveDeepSeekSettings = async () => {
    const next = {
      ...settings,
      deepseekModel: settings.deepseekModel || DEFAULT_DEEPSEEK_MODEL,
      autoMonitorEnabled: settings.autoMonitorEnabled ?? true
    };
    setSettings(next);
    await saveSettings(next);
    setNotice("DeepSeek配置已保存在本机");
  };

  const testAi = async () => {
    setTestingAi(true);
    try {
      await testDeepSeekConnection({
        ...settings,
        deepseekModel: settings.deepseekModel || DEFAULT_DEEPSEEK_MODEL
      });
      await saveDeepSeekSettings();
      setNotice("DeepSeek连接成功，模型可用");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "DeepSeek连接失败");
    } finally {
      setTestingAi(false);
    }
  };

  const activeCount = jobs.filter((job) => job.stage !== "closed").length;
  const urgentCount = jobs.filter((job) => dueState(job.deadline) === "soon").length;
  const openWebDashboard = () => {
    const url =
      typeof chrome !== "undefined" && chrome.runtime?.getURL
        ? chrome.runtime.getURL("dashboard.html")
        : new URL("dashboard.html", window.location.href).href;
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      void chrome.tabs.create({ url });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (overlay) {
    const captureActive =
      view === "capture" && (captureCandidates.length > 1 || Boolean(capture));
    const closeOverlay = () =>
      window.parent.postMessage({ type: "OFFERFLOW_CLOSE_OVERLAY" }, "*");
    const openJobSource = async (job: JobApplication) => {
      try {
        const source = new URL(job.sourceUrl);
        if (source.protocol !== "http:" && source.protocol !== "https:") {
          throw new Error("unsupported source URL");
        }

        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true
        });
        if (!activeTab?.id) throw new Error("active tab unavailable");
        await chrome.tabs.update(activeTab.id, { url: source.href });
      } catch {
        setEditing(job);
        setNotice("该岗位还没有可用的网申链接，请先补充链接");
      }
    };

    return (
      <main className="overlay-shell">
        {notice && (
          <button className="overlay-notice" onClick={() => setNotice("")}>
            <Check size={14} />
            <span>{notice}</span>
            <X size={13} />
          </button>
        )}

        {captureActive ? (
          <div className="overlay-capture-screen">
            <header className="overlay-header">
              <button
                className="overlay-capture-back"
                onClick={() => {
                  setCapture(null);
                  setCaptureCandidates([]);
                  setView("dashboard");
                }}
              >
                <ChevronLeft size={17} /> 返回
              </button>
              <strong>页面识别</strong>
              <button className="overlay-close-button" onClick={closeOverlay}>
                <X size={19} />
              </button>
            </header>
            <div className="overlay-capture-content">
              {captureCandidates.length > 1 ? (
                <CandidatePicker
                  candidates={captureCandidates}
                  jobs={jobs}
                  onCancel={() => {
                    setCaptureCandidates([]);
                    setView("dashboard");
                  }}
                  onImport={importCandidates}
                />
              ) : capture ? (
                <CaptureForm
                  value={capture}
                  duplicate={duplicate}
                  onChange={setCapture}
                  onCancel={() => {
                    setCapture(null);
                    setView("dashboard");
                  }}
                  onSave={saveCapture}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <OverlayPanel
            jobs={jobs}
            settings={settings}
            opportunitySnapshot={opportunitySnapshot}
            opportunityLoading={opportunityLoading}
            opportunityError={opportunityError}
            profile={profile}
            onSaveProfile={persistProfile}
            onSaveOpportunityFeed={saveOpportunityFeedUrl}
            onCapture={capturePage}
            onOpenOpportunity={(opportunity) => void openOpportunity(opportunity)}
            onOpenSource={(job) => void openJobSource(job)}
            onEdit={setEditing}
            onRefresh={() => {
              void loadJobs().then(setJobs);
              void refreshOpportunities().catch(() => undefined);
            }}
            onRefreshOpportunities={() => void refreshOpportunities().catch(() => undefined)}
            onOpenDashboard={openWebDashboard}
            onClose={closeOverlay}
          />
        )}

        {editing && (
          <EditDrawer
            job={editing}
            onClose={() => setEditing(null)}
            onSave={saveEditedJob}
            onSync={syncOne}
            onDelete={(job) => void deleteJob(job)}
          />
        )}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("dashboard")}>
          <span className="brand-glyph">
            <ArrowRight size={19} strokeWidth={3} />
          </span>
          <span>
            OFFER<strong>FLOW</strong>
          </span>
        </button>
        <div className="topbar-actions">
          <button
            className="workspace-button"
            onClick={openWebDashboard}
            title="打开网页工作台"
          >
            <MonitorUp size={16} />
            网页工作台
          </button>
          <button
            className="capture-button"
            onClick={capturePage}
            disabled={busy}
            title="抓取当前招聘网页"
          >
            {busy ? <RefreshCw className="spin" size={16} /> : <Plus size={17} />}
            抓取当前岗位
          </button>
        </div>
      </header>

      <nav className="rail">
        <button
          className={view === "dashboard" ? "active" : ""}
          onClick={() => setView("dashboard")}
          title="岗位看板"
        >
          <LayoutDashboard size={19} />
        </button>
        <button
          className={view === "calendar" ? "active" : ""}
          onClick={() => setView("calendar")}
          title="投递日历"
        >
          <CalendarDays size={19} />
        </button>
        <button onClick={capturePage} title="抓取岗位">
          <Target size={19} />
        </button>
        <button
          className={view === "settings" ? "active" : ""}
          onClick={() => setView("settings")}
          title="设置与备份"
        >
          <Settings2 size={19} />
        </button>
      </nav>

      <div className="workspace">
        {notice && (
          <button className="notice" onClick={() => setNotice("")}>
            <Check size={14} />
            {notice}
            <X size={13} />
          </button>
        )}

        {view === "capture" && captureCandidates.length > 1 ? (
          <CandidatePicker
            candidates={captureCandidates}
            jobs={jobs}
            onCancel={() => {
              setCaptureCandidates([]);
              setView("dashboard");
            }}
            onImport={importCandidates}
          />
        ) : view === "capture" && capture ? (
          <CaptureForm
            value={capture}
            duplicate={duplicate}
            onChange={setCapture}
            onCancel={() => {
              setCapture(null);
              setCaptureCandidates([]);
              setView("dashboard");
            }}
            onSave={saveCapture}
          />
        ) : view === "calendar" ? (
          <CalendarView jobs={jobs} onEdit={setEditing} onCapture={capturePage} />
        ) : view === "settings" ? (
          <section className="settings-view">
            <div className="page-heading">
              <div>
                <span className="eyebrow">数据与连接</span>
                <h1>把记录留在你手里</h1>
                <p>OfferDuoDuo 保存主数据，Obsidian 接收可阅读、可继续补充的 Markdown。</p>
              </div>
            </div>

            <div className="settings-card opportunity-source-card">
              <div className="setting-icon opportunity-source-icon">
                <Megaphone size={24} />
              </div>
              <div className="setting-copy">
                <h3>校招机会数据源</h3>
                <p>接入公开 JSON 文档，在插件中完整展示招聘批次并直达官方申请页。</p>
                <label className="opportunity-source-field">
                  <span>公开 JSON 地址（留空使用插件内置数据）</span>
                  <input
                    type="url"
                    value={settings.opportunityFeedUrl || ""}
                    placeholder="https://example.com/opportunities.json"
                    onChange={(event) =>
                      setSettings({ ...settings, opportunityFeedUrl: event.target.value })
                    }
                  />
                </label>
                <div className="connection-state">
                  <span className={opportunitySnapshot.opportunities.length ? "connected-dot" : "empty-dot"} />
                  {opportunitySnapshot.opportunities.length
                    ? `已载入 ${opportunitySnapshot.opportunities.length} 条机会`
                    : "当前没有机会数据"}
                </div>
              </div>
              <button
                className="button button--secondary"
                onClick={() => void saveOpportunityFeedUrl(settings.opportunityFeedUrl || "")}
                disabled={opportunityLoading}
              >
                <RefreshCw className={opportunityLoading ? "spin" : ""} size={16} />
                保存并同步
              </button>
            </div>

            <div className="settings-card obsidian-card">
              <div className="setting-icon">
                <FileText size={24} />
              </div>
              <div className="setting-copy">
                <h3>Obsidian Markdown</h3>
                <p>
                  选择 Vault 中的岗位目录。同步只更新 OfferDuoDuo 管理区域，不覆盖你的准备笔记。
                </p>
                <div className="connection-state">
                  <span className={settings.obsidianFolderName ? "connected-dot" : "empty-dot"} />
                  {settings.obsidianFolderName
                    ? `已连接：${settings.obsidianFolderName}`
                    : "尚未连接目录"}
                </div>
              </div>
              <button className="button button--secondary" onClick={chooseFolder}>
                <FolderOpen size={16} />
                {settings.obsidianFolderName ? "更换目录" : "选择目录"}
              </button>
            </div>

            <div className="settings-card ai-card">
              <div className="setting-icon deepseek-icon">
                <Sparkles size={24} />
              </div>
              <div className="setting-copy">
                <h3>DeepSeek 页面理解</h3>
                <p>
                  用于识别投递列表、流程页面和非标准招聘网站。页面可见文本会发送给
                  DeepSeek API。
                </p>
                <div className="ai-fields">
                  <label>
                    <span>API Key（仅保存在当前浏览器）</span>
                    <div className="secret-input">
                      <KeyRound size={14} />
                      <input
                        type="password"
                        autoComplete="off"
                        value={settings.deepseekApiKey || ""}
                        placeholder="sk-..."
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            deepseekApiKey: event.target.value
                          })
                        }
                      />
                    </div>
                  </label>
                  <label>
                    <span>模型</span>
                    <input
                      value={settings.deepseekModel || DEFAULT_DEEPSEEK_MODEL}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          deepseekModel: event.target.value
                        })
                      }
                    />
                  </label>
                </div>
                <label className="monitor-toggle">
                  <input
                    type="checkbox"
                    checked={settings.autoMonitorEnabled ?? true}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        autoMonitorEnabled: event.target.checked
                      })
                    }
                  />
                  <span className="toggle-track">
                    <span />
                  </span>
                  <span className="toggle-copy">
                    <strong>实时监听投递进度页</strong>
                    <small>页面保持打开时，发现阶段变化后自动更新匹配岗位</small>
                  </span>
                </label>
              </div>
              <div className="ai-actions">
                <button className="button button--ghost" onClick={saveDeepSeekSettings}>
                  保存
                </button>
                <button
                  className="button button--secondary"
                  onClick={testAi}
                  disabled={testingAi}
                >
                  {testingAi ? <RefreshCw className="spin" size={16} /> : <Check size={16} />}
                  测试连接
                </button>
              </div>
            </div>

            <div className="settings-grid">
              <div className="settings-card compact">
                <Download size={20} />
                <h3>完整备份</h3>
                <p>导出所有岗位、事件与同步信息。</p>
                <div className="button-row">
                  <button onClick={() => downloadBackup(jobs, "json")}>JSON</button>
                  <button onClick={() => downloadBackup(jobs, "csv")}>CSV</button>
                </div>
              </div>
              <div className="settings-card compact">
                <RefreshCw size={20} />
                <h3>同步全部</h3>
                <p>
                  {settings.lastExportAt
                    ? `上次同步：${new Date(settings.lastExportAt).toLocaleString("zh-CN")}`
                    : "尚未执行过全量同步"}
                </p>
                <button className="text-button" onClick={syncAll} disabled={busy}>
                  立即同步 <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="dashboard-view">
            <div className="page-heading dashboard-heading">
              <div>
                <span className="eyebrow">2026 秋招作战台</span>
                <h1>下一步，比收藏更多。</h1>
              </div>
              <div className="metrics">
                <div>
                  <strong>{activeCount}</strong>
                  <span>推进中</span>
                </div>
                <div className={urgentCount ? "metric-urgent" : ""}>
                  <strong>{urgentCount}</strong>
                  <span>三日内截止</span>
                </div>
                <div>
                  <strong>{jobs.filter((job) => job.stage === "offer").length}</strong>
                  <span>Offer</span>
                </div>
              </div>
            </div>

            <div className="toolbar">
              <label className="search">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索公司、岗位或城市"
                />
              </label>
              <button className="sync-button" onClick={syncAll} disabled={busy || !jobs.length}>
                <RefreshCw size={15} className={busy ? "spin" : ""} />
                同步 Obsidian
              </button>
            </div>

            {jobs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-orbit">
                  <BriefcaseBusiness size={30} />
                </div>
                <span className="eyebrow">从第一个岗位开始</span>
                <h2>别让好机会消失在标签页里</h2>
                <p>打开一个招聘岗位页面，点击“抓取当前岗位”。</p>
                <button className="button button--primary" onClick={capturePage}>
                  <Target size={17} /> 抓取当前页面
                </button>
              </div>
            ) : (
              <div className="kanban">
                {compactStages.map((stage) => {
                  const stageJobs = filteredJobs.filter((job) => job.stage === stage);
                  return (
                    <section className="kanban-column" key={stage}>
                      <header>
                        <span>{STAGE_LABELS[stage]}</span>
                        <strong>{stageJobs.length}</strong>
                      </header>
                      <div className="column-body">
                        {stageJobs.map((job) => (
                          <JobCard
                            key={job.id}
                            job={job}
                            onStageChange={updateStage}
                            onEdit={setEditing}
                          />
                        ))}
                        {!stageJobs.length && <div className="column-empty">暂无岗位</div>}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {editing && (
        <EditDrawer
          job={editing}
          onClose={() => setEditing(null)}
          onSave={saveEditedJob}
          onSync={syncOne}
          onDelete={(job) => void deleteJob(job)}
        />
      )}
    </main>
  );
}

