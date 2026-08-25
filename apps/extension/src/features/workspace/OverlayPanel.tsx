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
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  LayoutDashboard,
  MapPin,
  Megaphone,
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
import CloudSyncSettings from "@/features/settings/CloudSyncSettings";
import {
  CHINA_MAP_HEIGHT,
  CHINA_MAP_WIDTH,
  LOCATION_COORDINATES,
  calendarDateKey,
  coordinatesToPath,
  formatDeadline,
  localDateKey,
  normalizeJobLocation,
  projectChinaPoint,
  type ChinaMapFeature
} from "./workspaceUtils";

export function OverlayPanel({
  jobs,
  settings,
  opportunitySnapshot,
  opportunityLoading,
  opportunityError,
  profile,
  onSaveProfile,
  onCapture,
  onTailor,
  onOpenOpportunity,
  onOpenSource,
  onEdit,
  onToggleFavorite,
  onRefresh,
  onOpenResumeManager,
  onClose
}: {
  jobs: JobApplication[];
  settings: OfferFlowSettings;
  opportunitySnapshot: OpportunityFeedSnapshot;
  opportunityLoading: boolean;
  opportunityError?: string;
  profile: PersonalProfile;
  onSaveProfile: (profile: PersonalProfile) => Promise<void>;
  onCapture: () => void;
  onTailor?: () => void;
  onOpenOpportunity: (opportunity: RecruitmentOpportunity) => void;
  onOpenSource: (job: JobApplication) => void;
  onEdit: (job: JobApplication) => void;
  onToggleFavorite: (job: JobApplication) => void;
  onRefresh: () => void;
  onOpenResumeManager: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<
    "overview" | "opportunities" | "agenda" | "locations" | "settings" | "profile"
  >("overview");
  const overlayScrollRef = useRef<HTMLDivElement>(null);
  const today = localDateKey(new Date());
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(today);
  const [selectedLocation, setSelectedLocation] = useState("全部");
  const [chinaMapFeatures, setChinaMapFeatures] = useState<ChinaMapFeature[]>([]);
  const [chinaMapError, setChinaMapError] = useState(false);

  useEffect(() => {
    overlayScrollRef.current?.scrollTo(0, 0);
  }, [tab]);

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
          </small>
        </span>
        <span className="overlay-job-meta">
          {job.deadline ? formatDeadline(job.deadline) : STAGE_LABELS[job.stage]}
        </span>
        <ExternalLink className="overlay-job-external" size={14} />
      </button>
      <button
        className={`overlay-job-favorite ${job.isFavorite ? "active" : ""}`}
        onClick={() => onToggleFavorite(job)}
        aria-label={job.isFavorite ? `取消收藏 ${job.position}` : `收藏 ${job.position}`}
        title={job.isFavorite ? "取消收藏" : "收藏岗位"}
      >
        <Star size={16} fill={job.isFavorite ? "currentColor" : "none"} />
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
          <button className="overlay-resume-button" aria-label="打开简历中心" title="打开简历中心" onClick={onOpenResumeManager}>
            <FileText size={17} />
            <span>简历中心</span>
          </button>
          <button aria-label="刷新" onClick={onRefresh}>
            <RefreshCw size={17} />
          </button>
          <button aria-label="关闭" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
      </header>

      <div
        className={`overlay-scroll${tab === "opportunities" ? " overlay-scroll--opportunities" : ""}`}
        ref={overlayScrollRef}
      >
        {tab === "overview" && (
          <div className="overlay-action-stack">
            <section className="overlay-capture-card">
              <span className="overlay-capture-icon">
                <Target size={19} />
              </span>
              <span>
                <strong>识别当前招聘页面</strong>
                <small>岗位、投递记录或流程变化</small>
              </span>
              <button onClick={onCapture}>识别</button>
            </section>
          </div>
        )}

        {tab === "overview" && (
          <>
            <div className="overlay-summary-row">
              <span>
                {activeJobs.length
                  ? `${activeJobs.length} 个岗位正在推进`
                  : "暂无岗位记录"}
              </span>
            </div>

            <section className="overlay-flow">
              <div className="overlay-progress-heading">
                <strong>投递进度</strong>
                <span>{activeJobs.length} 个岗位</span>
              </div>
              <div className="overlay-flow-list">
                {activeJobs.map((job, index) => (
                  <div className="overlay-flow-item" key={job.id}>
                    <span className={`flow-node flow-node--${index % 3}`} />
                    <div className="flow-line" />
                    {renderJob(job)}
                  </div>
                ))}
                {!activeJobs.length && (
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
            onRefresh={onRefresh}
            onConfigure={() => setTab("settings")}
          />
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
              <div><h1>连接</h1><p>服务状态</p></div>
            </div>
            <div className="overlay-connection-list">
              <div><Sparkles size={17} /><span><strong>DeepSeek</strong><small>{settings.deepseekApiKey ? "已连接" : "未配置"}</small></span><i className={settings.deepseekApiKey ? "active" : ""} /></div>
            </div>
            <CloudSyncSettings />
          </section>
        )}

        {tab === "profile" && (
          <ProfileView
            profile={profile}
            settings={settings}
            onSave={onSaveProfile}
            onTailor={onTailor}
          />
        )}
      </div>

      <nav className="overlay-toolbar">
        <button title="总览" aria-label="总览" className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}><LayoutDashboard size={19} /></button>
        <button title="机会" aria-label="机会" className={tab === "opportunities" ? "active" : ""} onClick={() => setTab("opportunities")}><Megaphone size={19} /></button>
        <button title="日历" aria-label="日历" className={tab === "agenda" ? "active" : ""} onClick={() => setTab("agenda")}><CalendarDays size={19} /></button>
        <button title="设置" aria-label="设置" className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Settings2 size={19} /></button>
      </nav>
    </div>
  );
}
