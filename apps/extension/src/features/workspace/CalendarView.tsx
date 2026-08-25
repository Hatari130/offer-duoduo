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
  localDateKey,
  monthLabel,
  type CalendarEvent
} from "./workspaceUtils";

export function CalendarView({
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
