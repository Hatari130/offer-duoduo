import {
  Activity,
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Bell,
  BookOpenText,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Cloud,
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  Filter,
  FolderOpen,
  GraduationCap,
  GripVertical,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Link2,
  ListFilter,
  MapPin,
  Megaphone,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Upload,
  UserRound,
  X
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode
} from "react";
import { refreshOpportunityFeed, opportunityStatus } from "../opportunities";
import {
  EMPTY_PROFILE,
  findDuplicate,
  saveJobs,
  saveProfile,
  saveSettings
} from "../storage";
import {
  STAGES,
  STAGE_LABELS,
  type ApplicationStage,
  type JobApplication,
  type OfferFlowSettings,
  type OpportunityFeedSnapshot,
  type PersonalProfile,
  type RecruitmentOpportunity
} from "../types";
import {
  applyWorkspaceSnapshot,
  createDemoWorkspace,
  downloadSnapshot,
  isExtensionDashboard,
  loadWorkspace,
  saveDocuments,
  saveOpportunitySnapshot,
  savePreferences,
  subscribeToWorkspace,
  type DocumentKind,
  type OfferFlowDocument,
  type WebPreferences,
  type WorkspaceData
} from "./data";

type WebView =
  | "overview"
  | "pipeline"
  | "jobs"
  | "opportunities"
  | "calendar"
  | "profile"
  | "documents"
  | "settings";

type Toast = {
  id: number;
  message: string;
  tone?: "default" | "success" | "danger";
};

const VIEW_LABELS: Record<WebView, string> = {
  overview: "我的",
  pipeline: "投递看板",
  jobs: "投递管理",
  opportunities: "信息速递",
  calendar: "日历",
  profile: "个人资料",
  documents: "文档中心",
  settings: "同步与设置"
};

const STAGE_DESCRIPTIONS: Record<ApplicationStage, string> = {
  interested: "刚刚发现，等待判断",
  to_apply: "准备材料，完成网申",
  applied: "已提交，等待筛选",
  assessment: "笔试、测评与作业",
  interview: "面试推进与准备",
  offer: "录用与入职确认",
  closed: "拒绝、放弃或结束"
};

const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  resume: "简历",
  portfolio: "作品集",
  transcript: "成绩单",
  certificate: "证书",
  answer: "常用回答"
};

const emptyOpportunitySnapshot: OpportunityFeedSnapshot = {
  opportunities: []
};

const initialData: WorkspaceData = {
  jobs: [],
  profile: { ...EMPTY_PROFILE },
  settings: {},
  opportunities: emptyOpportunitySnapshot,
  documents: [],
  preferences: {
    compactPipeline: false,
    weekStartsMonday: true
  }
};

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value?: string): string | undefined {
  if (!value) return undefined;
  const direct = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : localDateKey(parsed);
}

function daysBetween(dateKey: string, compare = localDateKey(new Date())): number {
  const from = new Date(`${compare}T00:00:00`);
  const to = new Date(`${dateKey}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function shortDate(value?: string): string {
  const key = parseDateKey(value);
  if (!key) return "未设置";
  const [, month, day] = key.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function relativeDate(value?: string): string {
  const key = parseDateKey(value);
  if (!key) return "未设置";
  const days = daysBetween(key);
  if (days === 0) return "今天";
  if (days === 1) return "明天";
  if (days === -1) return "昨天";
  if (days > 0 && days <= 30) return `${days} 天后`;
  if (days < 0 && days >= -30) return `${Math.abs(days)} 天前`;
  return shortDate(key);
}

function openingDateLabel(value?: string): string {
  const key = parseDateKey(value);
  if (!key) return "持续开放";
  const days = daysBetween(key);
  if (days === 0) return "今天开启";
  if (days === -1) return "昨天开启";
  if (days < 0 && days >= -30) return `${Math.abs(days)} 天前开启`;
  if (days > 0 && days <= 30) return `${days} 天后开启`;
  return `${shortDate(key)} 开启`;
}

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 7)}`;
}

function createEmptyJob(): JobApplication {
  const now = new Date().toISOString();
  return {
    id: createId("job"),
    company: "",
    position: "",
    city: "",
    jobType: "校招",
    stage: "interested",
    sourceUrl: "",
    sourceHost: "",
    responsibilities: [],
    requirements: [],
    createdAt: now,
    updatedAt: now,
    events: []
  };
}

function cleanUrlHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

function completionOfProfile(profile: PersonalProfile) {
  const essentials = [
    profile.fullName,
    profile.phone,
    profile.email,
    profile.currentCity,
    profile.targetRole,
    profile.targetCities,
    profile.education.length ? "education" : "",
    profile.selfIntroduction
  ];
  return Math.round(
    (essentials.filter((value) => Boolean(value?.trim())).length /
      essentials.length) *
      100
  );
}

function viewFromLocation(): WebView {
  const raw = location.hash.replace(/^#\/?/, "") as WebView;
  return raw && raw in VIEW_LABELS ? raw : "opportunities";
}

function allJobEvents(jobs: JobApplication[]) {
  return jobs
    .flatMap((job) =>
      job.events.map((event) => ({
        ...event,
        job
      }))
    )
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function isUrgent(job: JobApplication) {
  const key = parseDateKey(job.deadline);
  if (!key || job.stage === "closed") return false;
  const days = daysBetween(key);
  return days >= 0 && days <= 3;
}

function stageClass(stage: ApplicationStage) {
  return `stage-${stage}`;
}

export default function WebApp() {
  const [view, setViewState] = useState<WebView>(viewFromLocation);
  const [data, setData] = useState<WorkspaceData>(initialData);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [editingJob, setEditingJob] = useState<JobApplication | null>(null);
  const [creatingJob, setCreatingJob] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounter = useRef(0);

  const notify = (
    message: string,
    tone: Toast["tone"] = "default"
  ) => {
    const id = ++toastCounter.current;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(
      () =>
        setToasts((current) => current.filter((toast) => toast.id !== id)),
      3200
    );
  };

  useEffect(() => {
    let cancelled = false;
    loadWorkspace()
      .then((workspace) => {
        if (!cancelled) setData(workspace);
      })
      .catch(() => notify("工作区读取失败，请刷新后重试", "danger"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const unsubscribe = subscribeToWorkspace((patch) => {
      setData((current) => ({ ...current, ...patch }));
    });
    const handleHash = () => setViewState(viewFromLocation());
    window.addEventListener("hashchange", handleHash);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("hashchange", handleHash);
    };
  }, []);

  const setView = (next: WebView) => {
    setViewState(next);
    setMobileNav(false);
    if (location.hash !== `#/${next}`) history.pushState(null, "", `#/${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const persistJobs = async (jobs: JobApplication[]) => {
    setData((current) => ({ ...current, jobs }));
    await saveJobs(jobs);
  };

  const saveJob = async (draft: JobApplication) => {
    if (!draft.company.trim() || !draft.position.trim()) {
      notify("请先填写公司和岗位名称", "danger");
      return;
    }
    const now = new Date().toISOString();
    const existing = data.jobs.find((job) => job.id === draft.id);
    const stageChanged = existing && existing.stage !== draft.stage;
    const nextEvent = {
      id: createId("evt"),
      type: existing
        ? stageChanged
          ? ("stage_changed" as const)
          : ("updated" as const)
        : ("created" as const),
      title: existing
        ? stageChanged
          ? `阶段更新：${STAGE_LABELS[existing.stage]} → ${
              STAGE_LABELS[draft.stage]
            }`
          : "在网页工作台更新岗位信息"
        : "在网页工作台创建岗位",
      occurredAt: now
    };
    const normalized: JobApplication = {
      ...draft,
      company: draft.company.trim(),
      position: draft.position.trim(),
      sourceHost: cleanUrlHost(draft.sourceUrl) || draft.sourceHost || "手动创建",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      events: [...(existing?.events || draft.events), nextEvent]
    };
    const next = existing
      ? data.jobs.map((job) => (job.id === normalized.id ? normalized : job))
      : [normalized, ...data.jobs];
    await persistJobs(next);
    setEditingJob(null);
    setCreatingJob(false);
    notify(existing ? "岗位信息已保存" : "岗位已加入工作区", "success");
  };

  const deleteJob = async (job: JobApplication) => {
    if (!window.confirm(`确定删除「${job.company} · ${job.position}」吗？`)) {
      return;
    }
    await persistJobs(data.jobs.filter((item) => item.id !== job.id));
    setEditingJob(null);
    notify("岗位已删除");
  };

  const updateStage = async (
    job: JobApplication,
    stage: ApplicationStage
  ) => {
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
    await persistJobs(
      data.jobs.map((item) => (item.id === job.id ? updated : item))
    );
    notify(`已移到「${STAGE_LABELS[stage]}」`, "success");
  };

  const updateStages = async (
    ids: string[],
    stage: ApplicationStage
  ) => {
    if (!ids.length) return;
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    const next = data.jobs.map((job) => {
      if (!idSet.has(job.id) || job.stage === stage) return job;
      return {
        ...job,
        stage,
        updatedAt: now,
        events: [
          ...job.events,
          {
            id: createId("evt"),
            type: "stage_changed" as const,
            title: `批量更新：${STAGE_LABELS[job.stage]} → ${STAGE_LABELS[stage]}`,
            occurredAt: now
          }
        ]
      };
    });
    await persistJobs(next);
    notify(`已更新 ${ids.length} 条投递记录`, "success");
  };

  const startCreateJob = () => {
    setCreatingJob(true);
    setEditingJob(createEmptyJob());
  };

  const installDemo = async () => {
    const demo = createDemoWorkspace();
    const next = await applyWorkspaceSnapshot({
      version: 1,
      exportedAt: new Date().toISOString(),
      ...demo
    });
    setData(next);
    notify("演示工作区已经准备好", "success");
  };

  const filteredJobCount = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data.jobs.length;
    return data.jobs.filter((job) =>
      [job.company, job.position, job.city, job.department, job.jobId]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    ).length;
  }, [data.jobs, search]);

  const renderView = () => {
    const common = {
      jobs: data.jobs,
      onEdit: setEditingJob,
      onCreate: startCreateJob
    };
    if (view === "overview") {
      return (
        <MyPage
          jobs={data.jobs}
          profile={data.profile}
          onNavigate={setView}
        />
      );
    }
    if (view === "pipeline") {
      return (
        <PipelinePage
          {...common}
          compact={Boolean(data.preferences.compactPipeline)}
          onStageChange={updateStage}
        />
      );
    }
    if (view === "jobs") {
      return (
        <JobsPage
          {...common}
          initialSearch={search}
          onStageChange={updateStage}
          onBulkStageChange={updateStages}
          onNavigate={setView}
        />
      );
    }
    if (view === "opportunities") {
      return (
        <OpportunitiesPage
          snapshot={data.opportunities}
          settings={data.settings}
          jobs={data.jobs}
          onSnapshot={async (snapshot) => {
            setData((current) => ({ ...current, opportunities: snapshot }));
            await saveOpportunitySnapshot(snapshot);
          }}
          onJobs={persistJobs}
          onSettings={async (settings) => {
            setData((current) => ({ ...current, settings }));
            await saveSettings(settings);
          }}
          notify={notify}
        />
      );
    }
    if (view === "calendar") {
      return <CalendarPage {...common} />;
    }
    if (view === "profile") {
      return (
        <ProfilePage
          profile={data.profile}
          onSave={async (profile) => {
            const next = { ...profile, updatedAt: new Date().toISOString() };
            setData((current) => ({ ...current, profile: next }));
            await saveProfile(next);
            notify("个人资料已保存", "success");
          }}
        />
      );
    }
    if (view === "documents") {
      return (
        <DocumentsPage
          documents={data.documents}
          profile={data.profile}
          onChange={async (documents) => {
            setData((current) => ({ ...current, documents }));
            await saveDocuments(documents);
          }}
          notify={notify}
        />
      );
    }
    return (
      <SettingsPage
        data={data}
        onData={setData}
        notify={notify}
      />
    );
  };

  return (
    <div className="web-app">
      <Sidebar
        view={view}
        open={mobileNav}
        onClose={() => setMobileNav(false)}
        onView={setView}
        jobs={data.jobs}
      />

      <main className="web-main">
        <header className="web-topbar">
          <div className="web-topbar-left">
            <button
              className="mobile-menu"
              aria-label="打开导航"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <div className="minimal-brandline">
              <strong>OF</strong>
              <i />
              <span>
                <BriefcaseBusiness size={18} />
                2026 秋招
              </span>
              <ChevronRight size={16} />
            </div>
          </div>

          <div className="web-topbar-actions">
            <button
              className="icon-button notification-button"
              aria-label="导入"
              onClick={startCreateJob}
            >
              <Upload size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="刷新"
              onClick={() => location.reload()}
            >
              <RefreshCw size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="关闭"
              onClick={() => setView("opportunities")}
            >
              <X size={19} />
            </button>
          </div>
        </header>

        <div className={`web-page ${loading ? "is-loading" : ""}`}>
          {loading ? <PageSkeleton /> : renderView()}
        </div>
      </main>

      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            className={`toast toast-${toast.tone || "default"}`}
            onClick={() =>
              setToasts((current) =>
                current.filter((item) => item.id !== toast.id)
              )
            }
          >
            {toast.tone === "success" ? (
              <CheckCircle2 size={16} />
            ) : toast.tone === "danger" ? (
              <AlertCircle size={16} />
            ) : (
              <CircleDot size={16} />
            )}
            <span>{toast.message}</span>
            <X size={14} />
          </button>
        ))}
      </div>

      {editingJob && (
        <JobDrawer
          job={editingJob}
          isNew={creatingJob}
          onClose={() => {
            setEditingJob(null);
            setCreatingJob(false);
          }}
          onSave={saveJob}
          onDelete={deleteJob}
        />
      )}
    </div>
  );
}

function Sidebar({
  view,
  open,
  onClose,
  onView,
  jobs
}: {
  view: WebView;
  open: boolean;
  onClose: () => void;
  onView: (view: WebView) => void;
  jobs: JobApplication[];
}) {
  const sections: Array<{
    label: string;
    items: Array<{
      view: WebView;
      icon: ReactNode;
      count?: number;
    }>;
  }> = [
    {
      label: "菜单",
      items: [
        { view: "opportunities", icon: <Megaphone size={17} /> },
        { view: "overview", icon: <LayoutDashboard size={17} /> }
      ]
    }
  ];

  return (
    <>
      {open && <button className="sidebar-scrim" onClick={onClose} />}
      <aside className={`web-sidebar ${open ? "open" : ""}`}>
        <div className="web-brand">
          <span>
            <ArrowRight size={20} strokeWidth={3} />
          </span>
          <strong>
            OFFER<b>FLOW</b>
          </strong>
          <small>2026 秋招</small>
        </div>

        <nav>
          {sections.map((section) => (
            <div className="nav-section" key={section.label}>
              <span className="nav-label">{section.label}</span>
              {section.items.map((item) => (
                <button
                  key={item.view}
                  className={view === item.view ? "active" : ""}
                  onClick={() => onView(item.view)}
                >
                  {item.icon}
                  <span>{VIEW_LABELS[item.view]}</span>
                  {item.count !== undefined && <em>{item.count}</em>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer" />
      </aside>
    </>
  );
}

function PageSkeleton() {
  return (
    <div className="page-skeleton">
      <div className="skeleton-line large" />
      <div className="skeleton-line medium" />
      <div className="skeleton-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="skeleton-card" />
        ))}
      </div>
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading-web">
      <div>
        <span className="web-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </div>
  );
}

function MyPage({
  jobs,
  profile,
  onNavigate
}: {
  jobs: JobApplication[];
  profile: PersonalProfile;
  onNavigate: (view: WebView) => void;
}) {
  const activeJobs = jobs.filter((job) => job.stage !== "closed");
  const appliedJobs = jobs.filter((job) =>
    ["applied", "assessment", "interview", "offer"].includes(job.stage)
  );
  const urgent = activeJobs.filter(isUrgent);
  const stageCounts = STAGES.map((stage) => ({
    stage,
    count: jobs.filter((job) => job.stage === stage).length
  }));
  const progress = jobs.length
    ? Math.round((appliedJobs.length / jobs.length) * 100)
    : 0;

  return (
    <section className="minimal-my-page">
      <header className="minimal-section-heading">
        <span>
          <LayoutDashboard size={22} />
        </span>
        <div>
          <h1>我的</h1>
          <p>{profile.fullName || "求职者"} 的投递进度大屏</p>
        </div>
      </header>

      <section className="progress-screen">
        <div className="progress-screen-main">
          <span className="web-eyebrow">APPLICATION PROGRESS</span>
          <strong>{progress}%</strong>
          <p>
            {jobs.length
              ? `${appliedJobs.length} 个机会已经进入投递流程，${urgent.length} 个需要尽快处理。`
              : "还没有投递记录。先从信息速递里把机会加入投递表。"}
          </p>
          <i>
            <b style={{ width: `${progress}%` }} />
          </i>
        </div>
        <div className="progress-screen-stats">
          <button onClick={() => onNavigate("opportunities")}>
            <span>关注机会</span>
            <strong>{jobs.length}</strong>
          </button>
          <button onClick={() => onNavigate("overview")}>
            <span>推进中</span>
            <strong>{activeJobs.length}</strong>
          </button>
          <button onClick={() => onNavigate("overview")}>
            <span>临近截止</span>
            <strong>{urgent.length}</strong>
          </button>
        </div>
      </section>

      <section className="stage-board-minimal">
        {stageCounts.map(({ stage, count }) => (
          <article key={stage}>
            <span>{STAGE_LABELS[stage]}</span>
            <strong>{count}</strong>
          </article>
        ))}
      </section>
    </section>
  );
}

function OverviewPage({
  jobs,
  profile,
  opportunities,
  onEdit,
  onCreate,
  onNavigate,
  onInstallDemo
}: {
  jobs: JobApplication[];
  profile: PersonalProfile;
  opportunities: OpportunityFeedSnapshot;
  onEdit: (job: JobApplication) => void;
  onCreate: () => void;
  onNavigate: (view: WebView) => void;
  onInstallDemo: () => Promise<void>;
}) {
  const today = localDateKey(new Date());
  const activeJobs = jobs.filter((job) => job.stage !== "closed");
  const urgent = activeJobs
    .filter(isUrgent)
    .sort((a, b) => (a.deadline || "").localeCompare(b.deadline || ""));
  const stale = activeJobs
    .filter(
      (job) =>
        (Date.now() - new Date(job.updatedAt).getTime()) / 86400000 >= 7
    )
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const interview = activeJobs.filter((job) => job.stage === "interview");
  const tasks = [
    ...urgent.map((job) => ({
      kind: "deadline" as const,
      title: job.nextAction || `完成 ${job.company} 的投递`,
      meta: `${job.company} · ${relativeDate(job.deadline)}截止`,
      job
    })),
    ...interview.map((job) => ({
      kind: "interview" as const,
      title: job.nextAction || `准备 ${job.company} 面试`,
      meta: `${job.position} · ${STAGE_LABELS[job.stage]}`,
      job
    })),
    ...stale.map((job) => ({
      kind: "stale" as const,
      title: job.nextAction || `跟进 ${job.company} 的申请进度`,
      meta: `${job.position} · ${relativeDate(job.updatedAt)}更新`,
      job
    }))
  ].filter(
    (item, index, array) =>
      array.findIndex((candidate) => candidate.job.id === item.job.id) === index
  );
  const recentEvents = allJobEvents(jobs).slice(0, 6);
  const opportunityCount = opportunities.opportunities.filter((item) => {
    const status = opportunityStatus(item);
    return status === "open" || status === "closing" || status === "ongoing";
  }).length;
  const recentOpenings = opportunities.opportunities
    .filter((item) => {
      const status = opportunityStatus(item);
      return status === "open" || status === "closing" || status === "ongoing";
    })
    .sort((a, b) => (b.openAt || "").localeCompare(a.openAt || ""))
    .slice(0, 4);
  const greeting =
    new Date().getHours() < 12
      ? "早上好"
      : new Date().getHours() < 18
        ? "下午好"
        : "晚上好";

  if (!jobs.length) {
    return (
      <section className="empty-workspace">
        <div className="empty-workspace-copy">
          <span className="web-eyebrow">你的求职指挥中心</span>
          <h1>让每一个机会，<br />都有明确的下一步。</h1>
          <p>
            OfferFlow 把浏览器里发现的岗位，变成可推进、可提醒、可复盘的求职工作流。
          </p>
          <div>
            <button className="web-button primary" onClick={onCreate}>
              <Plus size={16} /> 创建第一个岗位
            </button>
            <button className="web-button subtle" onClick={onInstallDemo}>
              <Sparkles size={16} /> 查看完整演示
            </button>
          </div>
          <small>
            {isExtensionDashboard()
              ? "插件抓取的新岗位会自动出现在这里。"
              : "公开网页版只在当前浏览器保存数据，可随时导入或导出。"}
          </small>
        </div>
        <div className="empty-flow-visual" aria-hidden="true">
          <div className="flow-orbit orbit-one" />
          <div className="flow-orbit orbit-two" />
          <span className="flow-node node-a">发现</span>
          <span className="flow-node node-b">投递</span>
          <span className="flow-node node-c">面试</span>
          <span className="flow-node node-d">Offer</span>
          <div className="flow-center">
            <ArrowRight size={31} strokeWidth={2.8} />
            <strong>下一步</strong>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="overview-hero">
        <div className="overview-greeting">
          <span className="web-eyebrow">
            {new Date().toLocaleDateString("zh-CN", {
              month: "long",
              day: "numeric",
              weekday: "long"
            })}
          </span>
          <h1>
            {greeting}，{profile.fullName || "求职者"}。
          </h1>
          <p>
            {tasks.length
              ? `今天有 ${tasks.length} 件值得优先处理的事，把精力放在离结果最近的一步。`
              : "今天没有紧急事项，可以整理机会或准备下一轮面试。"}
          </p>
        </div>
        <button className="web-button acid" onClick={onCreate}>
          <Plus size={17} /> 新建岗位
        </button>
      </div>

      <section className="opening-signal">
        <div className="opening-signal-title">
          <span className="signal-live">
            <i />
            LIVE
          </span>
          <div>
            <strong>哪些公司刚刚开启了投递？</strong>
            <small>聚合校招官网更新，优先展示最近开放的批次。</small>
          </div>
        </div>
        <div className="opening-signal-list">
          {recentOpenings.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate("opportunities")}
            >
              <span className="company-monogram">
                {item.company.slice(0, 1)}
              </span>
              <span>
                <strong>{item.company}</strong>
                <small>{openingDateLabel(item.openAt)}</small>
              </span>
              <ArrowRight size={14} />
            </button>
          ))}
          {!recentOpenings.length && (
            <button onClick={() => onNavigate("opportunities")}>
              <span className="company-monogram">+</span>
              <span>
                <strong>同步开招信息</strong>
                <small>查看哪些公司已经开放</small>
              </span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
        <button
          className="opening-signal-more"
          onClick={() => onNavigate("opportunities")}
        >
          查看全部 <ArrowRight size={14} />
        </button>
      </section>

      <div className="metric-strip">
        <button onClick={() => onNavigate("pipeline")}>
          <span>推进中</span>
          <strong>{activeJobs.length}</strong>
          <small>跨 {new Set(activeJobs.map((job) => job.company)).size} 家公司</small>
          <ArrowRight size={16} />
        </button>
        <button
          className={urgent.length ? "urgent" : ""}
          onClick={() => onNavigate("calendar")}
        >
          <span>三日内截止</span>
          <strong>{urgent.length}</strong>
          <small>{urgent.length ? "需要优先处理" : "暂时没有风险"}</small>
          <ArrowRight size={16} />
        </button>
        <button onClick={() => onNavigate("pipeline")}>
          <span>面试中</span>
          <strong>{interview.length}</strong>
          <small>准备下一轮沟通</small>
          <ArrowRight size={16} />
        </button>
        <button onClick={() => onNavigate("opportunities")}>
          <span>开放机会</span>
          <strong>{opportunityCount}</strong>
          <small>来自机会收件箱</small>
          <ArrowRight size={16} />
        </button>
      </div>

      <div className="overview-layout">
        <div className="overview-primary">
          <section className="web-panel today-panel">
            <div className="panel-heading">
              <div>
                <span className="web-eyebrow">TODAY / {today.slice(5)}</span>
                <h2>接下来要做的事</h2>
              </div>
              <button className="text-link" onClick={() => onNavigate("calendar")}>
                查看日历 <ArrowRight size={14} />
              </button>
            </div>
            <div className="today-list">
              {tasks.slice(0, 5).map((task, index) => (
                <button key={task.job.id} onClick={() => onEdit(task.job)}>
                  <span className={`task-index task-${task.kind}`}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="task-copy">
                    <strong>{task.title}</strong>
                    <small>{task.meta}</small>
                  </span>
                  <span className={`stage-chip ${stageClass(task.job.stage)}`}>
                    {STAGE_LABELS[task.job.stage]}
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
              {!tasks.length && (
                <div className="panel-empty">
                  <CheckCircle2 size={24} />
                  <strong>今天的关键事项已经清空</strong>
                  <span>可以去机会库寻找新的可能。</span>
                </div>
              )}
            </div>
          </section>

          <section className="web-panel pipeline-glance">
            <div className="panel-heading">
              <div>
                <span className="web-eyebrow">PIPELINE</span>
                <h2>投递漏斗</h2>
              </div>
              <button className="text-link" onClick={() => onNavigate("pipeline")}>
                打开管线 <ArrowRight size={14} />
              </button>
            </div>
            <div className="funnel-bars">
              {STAGES.filter((stage) => stage !== "closed").map((stage) => {
                const count = jobs.filter((job) => job.stage === stage).length;
                const max = Math.max(
                  1,
                  ...STAGES.map(
                    (candidate) =>
                      jobs.filter((job) => job.stage === candidate).length
                  )
                );
                return (
                  <button
                    key={stage}
                    onClick={() => onNavigate("pipeline")}
                    title={`${STAGE_LABELS[stage]} ${count} 个岗位`}
                  >
                    <span>
                      <i
                        className={stageClass(stage)}
                        style={{ height: `${Math.max(10, (count / max) * 100)}%` }}
                      />
                    </span>
                    <strong>{count}</strong>
                    <small>{STAGE_LABELS[stage]}</small>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="overview-secondary">
          <section className="web-panel momentum-card">
            <div className="momentum-top">
              <span>
                <Activity size={18} />
              </span>
              <div>
                <small>本周推进</small>
                <strong>
                  {
                    allJobEvents(jobs).filter(
                      (item) =>
                        Date.now() - new Date(item.occurredAt).getTime() <
                        7 * 86400000
                    ).length
                  }
                </strong>
              </div>
            </div>
            <p>每一次更新都在缩短你和结果之间的距离。</p>
            <div className="momentum-track">
              {Array.from({ length: 7 }, (_, index) => {
                const date = new Date();
                date.setDate(date.getDate() - (6 - index));
                const key = localDateKey(date);
                const active = allJobEvents(jobs).some(
                  (item) => parseDateKey(item.occurredAt) === key
                );
                return <i key={key} className={active ? "active" : ""} />;
              })}
            </div>
          </section>

          <section className="web-panel activity-card">
            <div className="panel-heading compact">
              <div>
                <span className="web-eyebrow">RECENT</span>
                <h2>最近动态</h2>
              </div>
            </div>
            <div className="recent-activity">
              {recentEvents.map((item) => (
                <button key={item.id} onClick={() => onEdit(item.job)}>
                  <i />
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.job.company} · {relativeDate(item.occurredAt)}
                    </small>
                  </span>
                </button>
              ))}
              {!recentEvents.length && <p>岗位更新会出现在这里。</p>}
            </div>
          </section>

          <button
            className="profile-completion-card"
            onClick={() => onNavigate("profile")}
          >
            <div>
              <span>
                <UserRound size={17} /> 个人资料完整度
              </span>
              <strong>{completionOfProfile(profile)}%</strong>
            </div>
            <i>
              <b style={{ width: `${completionOfProfile(profile)}%` }} />
            </i>
            <small>完善后可用于插件识别和填写网申表单。</small>
          </button>
        </aside>
      </div>
    </section>
  );
}

function PipelinePage({
  jobs,
  compact,
  onEdit,
  onCreate,
  onStageChange
}: {
  jobs: JobApplication[];
  compact: boolean;
  onEdit: (job: JobApplication) => void;
  onCreate: () => void;
  onStageChange: (job: JobApplication, stage: ApplicationStage) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [city, setCity] = useState("全部城市");
  const activeStages = STAGES;
  const cities = Array.from(
    new Set(jobs.map((job) => job.city).filter(Boolean) as string[])
  ).sort((a, b) => a.localeCompare(b, "zh-CN"));
  const filtered = jobs.filter((job) => {
    const normalized = query.trim().toLowerCase();
    const matchesQuery =
      !normalized ||
      [job.company, job.position, job.department, job.city]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized));
    return matchesQuery && (city === "全部城市" || job.city === city);
  });

  const handleDrop = async (
    event: DragEvent<HTMLDivElement>,
    stage: ApplicationStage
  ) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/offerflow-job") || draggingId;
    setDraggingId(null);
    const job = jobs.find((item) => item.id === id);
    if (job) await onStageChange(job, stage);
  };

  return (
    <section className={`pipeline-page ${compact ? "compact" : ""}`}>
      <PageHeading
        eyebrow="APPLICATION PIPELINE"
        title="投递管线"
        description="拖动岗位卡片推进阶段，把注意力放在下一步，而不是反复查状态。"
        actions={
          <button className="web-button primary" onClick={onCreate}>
            <Plus size={16} /> 新建岗位
          </button>
        }
      />
      <div className="page-toolbar">
        <label className="toolbar-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索管线中的岗位"
          />
        </label>
        <label className="toolbar-select">
          <MapPin size={14} />
          <select value={city} onChange={(event) => setCity(event.target.value)}>
            <option>全部城市</option>
            {cities.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <span className="toolbar-summary">
          {filtered.length} 个岗位 · {new Set(filtered.map((job) => job.company)).size} 家公司
        </span>
      </div>

      <div className="pipeline-board">
        {activeStages.map((stage) => {
          const stageJobs = filtered
            .filter((job) => job.stage === stage)
            .sort((a, b) =>
              (a.deadline || "9999").localeCompare(b.deadline || "9999")
            );
          return (
            <div
              className={`pipeline-column ${stageClass(stage)}`}
              key={stage}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => void handleDrop(event, stage)}
            >
              <header>
                <span>
                  <i />
                  <strong>{STAGE_LABELS[stage]}</strong>
                  <em>{stageJobs.length}</em>
                </span>
                <button
                  aria-label={`在${STAGE_LABELS[stage]}创建岗位`}
                  onClick={onCreate}
                >
                  <Plus size={15} />
                </button>
                <small>{STAGE_DESCRIPTIONS[stage]}</small>
              </header>
              <div className="pipeline-cards">
                {stageJobs.map((job) => (
                  <article
                    key={job.id}
                    className={`pipeline-card ${
                      draggingId === job.id ? "dragging" : ""
                    } ${isUrgent(job) ? "urgent" : ""}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        "text/offerflow-job",
                        job.id
                      );
                      event.dataTransfer.effectAllowed = "move";
                      setDraggingId(job.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                  >
                    <button
                      className="card-main"
                      onClick={() => onEdit(job)}
                    >
                      <span className="company-monogram">
                        {job.company.slice(0, 1)}
                      </span>
                      <span>
                        <small>{job.company}</small>
                        <strong>{job.position}</strong>
                      </span>
                    </button>
                    <div className="card-tags">
                      {job.city && (
                        <span>
                          <MapPin size={11} /> {job.city}
                        </span>
                      )}
                      {job.jobType && <span>{job.jobType}</span>}
                    </div>
                    {job.nextAction && (
                      <p>
                        <Target size={12} />
                        <span>{job.nextAction}</span>
                      </p>
                    )}
                    <footer>
                      <span
                        className={
                          isUrgent(job) ? "deadline urgent" : "deadline"
                        }
                      >
                        <Clock3 size={12} />
                        {job.deadline
                          ? `${relativeDate(job.deadline)}截止`
                          : "无截止日期"}
                      </span>
                      <button
                        aria-label="编辑岗位"
                        onClick={() => onEdit(job)}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      <GripVertical className="drag-handle" size={15} />
                    </footer>
                  </article>
                ))}
                {!stageJobs.length && (
                  <div className="pipeline-dropzone">
                    <ArrowRight size={15} />
                    拖动岗位到这里
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function JobsPage({
  jobs,
  initialSearch,
  onEdit,
  onCreate,
  onStageChange,
  onBulkStageChange,
  onNavigate
}: {
  jobs: JobApplication[];
  initialSearch: string;
  onEdit: (job: JobApplication) => void;
  onCreate: () => void;
  onStageChange: (
    job: JobApplication,
    stage: ApplicationStage
  ) => Promise<void>;
  onBulkStageChange: (
    ids: string[],
    stage: ApplicationStage
  ) => Promise<void>;
  onNavigate: (view: WebView) => void;
}) {
  const [query, setQuery] = useState(initialSearch);
  const [stage, setStage] = useState<
    ApplicationStage | "all" | "submitted"
  >("all");
  const [sort, setSort] = useState<"updated" | "deadline" | "company">(
    "updated"
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => setQuery(initialSearch), [initialSearch]);

  const visible = jobs
    .filter((job) => {
      const normalized = query.trim().toLowerCase();
      const matches =
        !normalized ||
        [job.company, job.position, job.city, job.jobId, job.department]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalized));
      const matchesStage =
        stage === "all" ||
        job.stage === stage ||
        (stage === "submitted" &&
          ["applied", "assessment", "interview", "offer"].includes(job.stage));
      return matches && matchesStage;
    })
    .sort((a, b) => {
      if (sort === "company") return a.company.localeCompare(b.company, "zh-CN");
      if (sort === "deadline")
        return (a.deadline || "9999").localeCompare(b.deadline || "9999");
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  const activeCount = jobs.filter((job) => job.stage !== "closed").length;
  const submittedCount = jobs.filter((job) =>
    ["applied", "assessment", "interview", "offer"].includes(job.stage)
  ).length;
  const interviewCount = jobs.filter((job) => job.stage === "interview").length;
  const attentionCount = jobs.filter(
    (job) =>
      job.stage !== "closed" &&
      (isUrgent(job) ||
        (Date.now() - new Date(job.updatedAt).getTime()) / 86400000 >= 7)
  ).length;
  const visibleIds = visible.map((job) => job.id);
  const allVisibleSelected =
    Boolean(visibleIds.length) &&
    visibleIds.every((id) => selectedIds.has(id));
  const toggleVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="applications-page">
      <div className="applications-heading">
        <div>
          <span className="web-eyebrow">APPLICATIONS / 2026</span>
          <h1>投递管理</h1>
          <p>把岗位、申请阶段和下一步行动放进一张持续更新的表。</p>
        </div>
        <div className="applications-heading-actions">
          <button
            className="web-button subtle"
            onClick={() => onNavigate("pipeline")}
          >
            <Activity size={15} /> 看板视图
          </button>
          <button className="web-button primary" onClick={onCreate}>
            <Plus size={16} /> 新增投递
          </button>
        </div>
      </div>

      <div className="applications-stats">
        <button
          className={stage === "all" ? "active" : ""}
          onClick={() => setStage("all")}
        >
          <span>全部记录</span>
          <strong>{jobs.length}</strong>
          <small>{activeCount} 条正在推进</small>
        </button>
        <button
          className={stage === "submitted" ? "active" : ""}
          onClick={() => setStage("submitted")}
        >
          <span>已经投递</span>
          <strong>{submittedCount}</strong>
          <small>含笔试、面试与 Offer</small>
        </button>
        <button
          className={stage === "interview" ? "active" : ""}
          onClick={() => setStage("interview")}
        >
          <span>面试进行中</span>
          <strong>{interviewCount}</strong>
          <small>需要持续准备</small>
        </button>
        <button
          className={attentionCount ? "attention" : ""}
          onClick={() => setSort("deadline")}
        >
          <span>需要关注</span>
          <strong>{attentionCount}</strong>
          <small>临近截止或久未更新</small>
        </button>
      </div>

      <div className="jobs-toolbar applications-toolbar">
        <label className="toolbar-search large">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索公司、岗位、城市或岗位编号"
          />
        </label>
        <div className="application-stage-filters">
          {(["all", ...STAGES] as const).map((item) => (
            <button
              key={item}
              className={stage === item ? "active" : ""}
              onClick={() => setStage(item)}
            >
              {item === "all" ? "全部" : STAGE_LABELS[item]}
              <span>
                {item === "all"
                  ? jobs.length
                  : jobs.filter((job) => job.stage === item).length}
              </span>
            </button>
          ))}
        </div>
        <label className="toolbar-select">
          <Filter size={14} />
          <select
            value={sort}
            onChange={(event) =>
              setSort(event.target.value as typeof sort)
            }
          >
            <option value="updated">最近更新</option>
            <option value="deadline">截止日期</option>
            <option value="company">公司名称</option>
          </select>
        </label>
      </div>

      {selectedIds.size > 0 && (
        <div className="bulk-action-bar">
          <span>
            <Check size={14} />
            已选择 <strong>{selectedIds.size}</strong> 条
          </span>
          <label>
            <ListFilter size={14} />
            <select
              value=""
              onChange={(event) => {
                const nextStage = event.target.value as ApplicationStage;
                void onBulkStageChange(
                  Array.from(selectedIds),
                  nextStage
                ).then(() => setSelectedIds(new Set()));
              }}
            >
              <option value="" disabled>
                批量修改阶段
              </option>
              {STAGES.map((item) => (
                <option key={item} value={item}>
                  移到 {STAGE_LABELS[item]}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => setSelectedIds(new Set())}>取消选择</button>
        </div>
      )}

      <div className="jobs-table-wrap">
        <table className="jobs-table">
          <thead>
            <tr>
              <th className="selection-column">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleVisible}
                  aria-label="选择当前筛选的全部投递"
                />
              </th>
              <th>公司 / 岗位</th>
              <th>投递阶段</th>
              <th>投递日期</th>
              <th>截止日期</th>
              <th>下一步</th>
              <th>更新</th>
              <th>来源</th>
              <th aria-label="操作" />
            </tr>
          </thead>
          <tbody>
            {visible.map((job) => (
              <tr
                key={job.id}
                className={`${selectedIds.has(job.id) ? "selected" : ""} ${
                  isUrgent(job) ? "urgent" : ""
                }`}
                onClick={() => onEdit(job)}
              >
                <td className="selection-column">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(job.id)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => toggleOne(job.id)}
                    aria-label={`选择 ${job.company} ${job.position}`}
                  />
                </td>
                <td>
                  <span className="company-monogram">
                    {job.company.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{job.position}</strong>
                    <small>
                      {job.company}
                      {job.department ? ` / ${job.department}` : ""}
                      {job.city ? ` · ${job.city}` : ""}
                    </small>
                  </span>
                </td>
                <td>
                  <select
                    className={`inline-stage-select ${stageClass(job.stage)}`}
                    value={job.stage}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      event.stopPropagation();
                      void onStageChange(
                        job,
                        event.target.value as ApplicationStage
                      );
                    }}
                    aria-label={`更新 ${job.company} 的投递阶段`}
                  >
                    {STAGES.map((item) => (
                      <option key={item} value={item}>
                        {STAGE_LABELS[item]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{job.appliedAt ? shortDate(job.appliedAt) : "尚未投递"}</td>
                <td>
                  <span className={isUrgent(job) ? "table-urgent" : ""}>
                    {job.deadline ? shortDate(job.deadline) : "—"}
                  </span>
                </td>
                <td>
                  <span className="next-action-cell">
                    {job.nextAction || "等待补充"}
                  </span>
                </td>
                <td>{relativeDate(job.updatedAt)}</td>
                <td>
                  {job.sourceUrl ? (
                    <button
                      className="source-cell"
                      onClick={(event) => {
                        event.stopPropagation();
                        window.open(
                          job.sourceUrl,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }}
                    >
                      {job.sourceHost || "招聘官网"}
                      <ExternalLink size={11} />
                    </button>
                  ) : (
                    "手动创建"
                  )}
                </td>
                <td>
                  <button
                    className="row-action"
                    aria-label={`编辑 ${job.company} ${job.position}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit(job);
                    }}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <div className="table-empty">
            <Search size={23} />
            <strong>没有符合条件的投递记录</strong>
            <span>清除筛选条件，或者新增一条投递。</span>
            <button className="web-button primary" onClick={onCreate}>
              <Plus size={14} /> 新增投递
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function OpportunitiesPage({
  snapshot,
  settings,
  jobs,
  onSnapshot,
  onJobs,
  onSettings,
  notify
}: {
  snapshot: OpportunityFeedSnapshot;
  settings: OfferFlowSettings;
  jobs: JobApplication[];
  onSnapshot: (snapshot: OpportunityFeedSnapshot) => Promise<void>;
  onJobs: (jobs: JobApplication[]) => Promise<void>;
  onSettings: (settings: OfferFlowSettings) => Promise<void>;
  notify: (message: string, tone?: Toast["tone"]) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "closing" | "upcoming">(
    "all"
  );
  const [loading, setLoading] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [source, setSource] = useState(settings.opportunityFeedUrl || "");
  const visible = snapshot.opportunities
    .filter((item) => {
      const itemStatus = opportunityStatus(item);
      const normalized = query.trim().toLowerCase();
      const matchesQuery =
        !normalized ||
        [item.company, item.title, item.batch, ...item.roleTags, ...item.cities]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalized));
      const matchesStatus =
        status === "all" ||
        itemStatus === status ||
        (status === "open" && itemStatus === "ongoing");
      return matchesQuery && matchesStatus;
    })
    .sort((a, b) => {
      const order = { closing: 0, open: 1, ongoing: 1, upcoming: 2, closed: 3 };
      return (
        order[opportunityStatus(a)] - order[opportunityStatus(b)] ||
        (a.deadline || "9999").localeCompare(b.deadline || "9999")
      );
    });
  const openingUpdates = snapshot.opportunities
    .filter((item) => {
      const itemStatus = opportunityStatus(item);
      return (
        itemStatus === "open" ||
        itemStatus === "ongoing" ||
        itemStatus === "closing"
      );
    })
    .sort(
      (a, b) =>
        (b.openAt || b.updatedAt || "").localeCompare(
          a.openAt || a.updatedAt || ""
        ) ||
        (b.verifiedAt || "").localeCompare(a.verifiedAt || "")
    )
    .slice(0, 6);
  const openCount = snapshot.opportunities.filter((item) => {
    const itemStatus = opportunityStatus(item);
    return itemStatus === "open" || itemStatus === "ongoing";
  }).length;
  const closingCount = snapshot.opportunities.filter(
    (item) => opportunityStatus(item) === "closing"
  ).length;
  const upcomingCount = snapshot.opportunities.filter(
    (item) => opportunityStatus(item) === "upcoming"
  ).length;
  const refresh = async (url = settings.opportunityFeedUrl) => {
    setLoading(true);
    try {
      const next = await refreshOpportunityFeed(url);
      await onSnapshot(next);
      notify(`机会数据已更新：${next.opportunities.length} 条`, "success");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "机会数据更新失败",
        "danger"
      );
    } finally {
      setLoading(false);
    }
  };

  const saveSource = async () => {
    const next = {
      ...settings,
      opportunityFeedUrl: source.trim() || undefined
    };
    await onSettings(next);
    setSourceOpen(false);
    await refresh(next.opportunityFeedUrl);
  };

  const addOpportunity = async (opportunity: RecruitmentOpportunity) => {
    const candidate = {
      company: opportunity.company,
      position: opportunity.title,
      sourceUrl: opportunity.officialUrl,
      city: opportunity.cities.join("、")
    };
    const existing = findDuplicate(jobs, {
      ...candidate,
      jobId: undefined
    });
    if (existing) {
      notify("这个机会已经在岗位库里了");
      return;
    }
    const now = new Date().toISOString();
    const created: JobApplication = {
      id: createId("job"),
      company: opportunity.company,
      position: opportunity.title,
      department: opportunity.batch,
      city: opportunity.cities.join("、"),
      jobType: "校招",
      stage: "interested",
      deadline: opportunity.deadline,
      nextAction: "查看岗位列表并选择目标岗位",
      sourceUrl: opportunity.officialUrl,
      sourceHost: cleanUrlHost(opportunity.officialUrl),
      summary: `${opportunity.batch || "校园招聘"} · ${opportunity.roleTags.join(
        "、"
      )}`,
      responsibilities: [],
      requirements: opportunity.graduationYears.length
        ? [`面向 ${opportunity.graduationYears.join("、")} 届毕业生`]
        : [],
      createdAt: now,
      updatedAt: now,
      events: [
        {
          id: createId("evt"),
          type: "created",
          title: "从秋招机会加入关注",
          occurredAt: now,
          sourceUrl: opportunity.officialUrl
        }
      ]
    };
    await onJobs([created, ...jobs]);
    notify("已加入投递管线的「感兴趣」阶段", "success");
  };

  return (
    <section className="minimal-feed-page">
      <section className="recognize-card">
        <span>
          <Target size={26} />
        </span>
        <div>
          <h1>识别当前招聘页面</h1>
          <p>岗位、投递记录或流程变化</p>
        </div>
        <button onClick={() => void refresh()} disabled={loading}>
          {loading ? "刷新" : "识别"}
        </button>
      </section>

      <header className="minimal-section-heading">
        <span>
          <Megaphone size={22} />
        </span>
        <div>
          <h1>机会</h1>
          <p>全部校招入口，不替你筛掉任何公司</p>
        </div>
        <button
          className="minimal-icon-button"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="刷新机会"
        >
          <RefreshCw size={21} className={loading ? "spin" : ""} />
        </button>
      </header>

      <label className="minimal-search">
        <Search size={21} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索公司、批次、城市或岗位方向"
        />
      </label>

      <div className="minimal-filter-row">
        <button
          className={status === "all" ? "active" : ""}
          onClick={() => setStatus("all")}
        >
          全部 {snapshot.opportunities.length}
        </button>
        <button
          className={status === "closing" ? "active" : ""}
          onClick={() => setStatus("closing")}
        >
          即将截止 {closingCount}
        </button>
        <button
          className={status === "open" ? "active" : ""}
          onClick={() => setStatus("open")}
        >
          正在招聘 {openCount}
        </button>
        <button
          className={status === "upcoming" ? "active" : ""}
          onClick={() => setStatus("upcoming")}
        >
          即将开放 {upcomingCount}
        </button>
        <button onClick={() => setStatus("all")}>长期招聘 0</button>
      </div>

      <div className="minimal-source-row">
        <button
          onClick={() => setSourceOpen((current) => !current)}
        >
          <Settings2 size={16} /> 配置数据源
        </button>
        <div className="filter-chips">
          <span>
            最近同步：
            {snapshot.fetchedAt
              ? new Date(snapshot.fetchedAt).toLocaleString("zh-CN")
              : "尚未同步"}
          </span>
        </div>
      </div>

      {sourceOpen && (
        <div className="source-banner">
          <span>
            <Megaphone size={18} />
          </span>
          <div>
            <strong>公开 JSON 数据源</strong>
            <p>留空使用扩展内置机会，也可以接入自己的招聘数据。</p>
          </div>
          <input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="https://example.com/opportunities.json"
          />
          <button onClick={() => void saveSource()}>
            <Check size={15} /> 保存并同步
          </button>
        </div>
      )}

      <section className="opening-feed">
        <header>
          <div>
            <span className="signal-live">
              <i />
              LIVE
            </span>
            <span>
              <strong>最新开启投递</strong>
              <small>按官方开放时间排序</small>
            </span>
          </div>
          <p>
            {openingUpdates.length
              ? `${openingUpdates.length} 家公司正在开放申请`
              : "同步数据后，这里会显示最近开招的公司"}
          </p>
        </header>
        <div className="opening-feed-list">
          {openingUpdates.map((opportunity) => {
            const exists = Boolean(
              findDuplicate(jobs, {
                company: opportunity.company,
                position: opportunity.title,
                sourceUrl: opportunity.officialUrl,
                city: opportunity.cities.join("、"),
                jobId: undefined
              })
            );
            const state = opportunityStatus(opportunity);
            return (
              <article key={`opening-${opportunity.id}`}>
                <span className="opening-time">
                  <i />
                  <strong>{openingDateLabel(opportunity.openAt)}</strong>
                  <small>
                    {opportunity.verifiedAt
                      ? `${relativeDate(opportunity.verifiedAt)}核验`
                      : "官方信息"}
                  </small>
                </span>
                <span className="company-monogram large">
                  {opportunity.company.slice(0, 1)}
                </span>
                <span className="opening-company">
                  <strong>{opportunity.company}</strong>
                  <small>{opportunity.title}</small>
                </span>
                <span className="opening-roles">
                  {opportunity.roleTags.slice(0, 3).map((tag) => (
                    <em key={tag}>{tag}</em>
                  ))}
                </span>
                <span className="opening-location">
                  <MapPin size={13} />
                  {opportunity.cities.slice(0, 2).join("、") || "多城市"}
                </span>
                <span
                  className={`opening-state ${
                    state === "closing" ? "closing" : ""
                  }`}
                >
                  {state === "closing" ? "即将截止" : "投递开放"}
                </span>
                <button
                  className={exists ? "added" : ""}
                  disabled={exists}
                  onClick={() => void addOpportunity(opportunity)}
                >
                  {exists ? (
                    <>
                      <Check size={13} /> 已加入
                    </>
                  ) : (
                    <>
                      <Plus size={13} /> 加入投递表
                    </>
                  )}
                </button>
                <button
                  className="opening-external"
                  aria-label={`打开 ${opportunity.company} 招聘官网`}
                  onClick={() =>
                    window.open(
                      opportunity.officialUrl,
                      "_blank",
                      "noopener,noreferrer"
                    )
                  }
                >
                  <ExternalLink size={14} />
                </button>
              </article>
            );
          })}
          {!openingUpdates.length && (
            <div className="opening-feed-empty">
              <Megaphone size={25} />
              <strong>还没有接入校招机会</strong>
              <span>配置一份公开 JSON 数据源后，所有开放信息会在这里统一出现。</span>
              <button onClick={() => setSourceOpen(true)}>
                <Settings2 size={16} /> 配置数据源
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="opportunity-toolbar">
        <strong className="opportunity-section-title">全部招聘批次</strong>
        <span className="opportunity-result-count">
          当前显示 {visible.length} 条机会
        </span>
      </div>

      <div className="opportunity-grid">
        {visible.map((opportunity) => {
          const state = opportunityStatus(opportunity);
          const exists = Boolean(
            findDuplicate(jobs, {
              company: opportunity.company,
              position: opportunity.title,
              sourceUrl: opportunity.officialUrl,
              city: opportunity.cities.join("、"),
              jobId: undefined
            })
          );
          return (
            <article
              key={opportunity.id}
              className={`opportunity-card-web opportunity-${state}`}
            >
              <header>
                <span className="company-monogram large">
                  {opportunity.company.slice(0, 1)}
                </span>
                <span>
                  <small>{opportunity.company}</small>
                  <strong>{opportunity.title}</strong>
                </span>
                <em>
                  {state === "closing"
                    ? "即将截止"
                    : state === "open" || state === "ongoing"
                      ? "开放中"
                      : state === "upcoming"
                        ? "即将开放"
                        : "已结束"}
                </em>
              </header>
              <div className="opportunity-meta">
                {opportunity.batch && <span>{opportunity.batch}</span>}
                {opportunity.graduationYears.map((year) => (
                  <span key={year}>{year} 届</span>
                ))}
              </div>
              <div className="opportunity-facts">
                <span>
                  <MapPin size={13} />
                  {opportunity.cities.join("、") || "城市不限"}
                </span>
                <span
                  className={state === "closing" ? "danger" : ""}
                >
                  <Clock3 size={13} />
                  {opportunity.deadline
                    ? `${shortDate(opportunity.deadline)} 截止`
                    : opportunity.openAt
                      ? `${shortDate(opportunity.openAt)} 开放`
                      : "持续招聘"}
                </span>
              </div>
              <div className="role-tags">
                {opportunity.roleTags.slice(0, 5).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <footer>
                <button
                  className="opportunity-open"
                  onClick={() =>
                    window.open(
                      opportunity.officialUrl,
                      "_blank",
                      "noopener,noreferrer"
                    )
                  }
                >
                  打开官网 <ExternalLink size={13} />
                </button>
                <button
                  className={exists ? "added" : "add"}
                  disabled={exists || state === "closed"}
                  onClick={() => void addOpportunity(opportunity)}
                >
                  {exists ? (
                    <>
                      <Check size={13} /> 已在管线
                    </>
                  ) : (
                    <>
                      <Plus size={13} /> 加入关注
                    </>
                  )}
                </button>
              </footer>
            </article>
          );
        })}
        {!visible.length && (
          <div className="opportunity-empty">
            <Inbox size={30} />
            <strong>没有符合条件的机会</strong>
            <span>清除筛选，或者刷新一次数据源。</span>
          </div>
        )}
      </div>
    </section>
  );
}

function CalendarPage({
  jobs,
  onEdit,
  onCreate
}: {
  jobs: JobApplication[];
  onEdit: (job: JobApplication) => void;
  onCreate: () => void;
}) {
  const today = localDateKey(new Date());
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [selected, setSelected] = useState(today);
  const events = useMemo(
    () =>
      jobs.flatMap((job) => {
        const result: Array<{
          id: string;
          date: string;
          kind: "applied" | "deadline";
          title: string;
          job: JobApplication;
        }> = [];
        const applied = parseDateKey(job.appliedAt);
        const deadline = parseDateKey(job.deadline);
        if (applied)
          result.push({
            id: `${job.id}-applied`,
            date: applied,
            kind: "applied",
            title: "完成投递",
            job
          });
        if (deadline)
          result.push({
            id: `${job.id}-deadline`,
            date: deadline,
            kind: "deadline",
            title: "申请截止",
            job
          });
        return result;
      }),
    [jobs]
  );
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - offset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
  const selectedEvents = events.filter((item) => item.date === selected);
  const agenda = events
    .filter((item) => item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 12);
  const moveMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelected(localDateKey(next));
  };

  return (
    <section>
      <PageHeading
        eyebrow="SCHEDULE & DEADLINES"
        title="日历"
        description="把投递、截止和下一步放到同一条时间线上，提前处理风险。"
        actions={
          <button className="web-button primary" onClick={onCreate}>
            <Plus size={16} /> 新建岗位
          </button>
        }
      />
      <div className="calendar-layout">
        <section className="web-panel calendar-main">
          <header className="calendar-toolbar">
            <div>
              <span className="web-eyebrow">MONTH VIEW</span>
              <h2>
                {month.getFullYear()} 年 {month.getMonth() + 1} 月
              </h2>
            </div>
            <div>
              <button aria-label="上个月" onClick={() => moveMonth(-1)}>
                <ChevronLeft size={17} />
              </button>
              <button
                className="today-button"
                onClick={() => {
                  const now = new Date();
                  setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                  setSelected(today);
                }}
              >
                今天
              </button>
              <button aria-label="下个月" onClick={() => moveMonth(1)}>
                <ChevronRight size={17} />
              </button>
            </div>
          </header>
          <div className="calendar-weekdays">
            {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid-web">
            {days.map((date) => {
              const key = localDateKey(date);
              const dayEvents = events.filter((item) => item.date === key);
              return (
                <button
                  key={key}
                  className={`${date.getMonth() !== month.getMonth() ? "outside" : ""} ${
                    key === today ? "today" : ""
                  } ${key === selected ? "selected" : ""}`}
                  onClick={() => setSelected(key)}
                >
                  <span>{date.getDate()}</span>
                  <div>
                    {dayEvents.slice(0, 3).map((item) => (
                      <i
                        key={item.id}
                        className={`calendar-event-dot ${item.kind}`}
                        title={`${item.job.company} · ${item.title}`}
                      />
                    ))}
                  </div>
                  {dayEvents.length > 3 && <small>+{dayEvents.length - 3}</small>}
                </button>
              );
            })}
          </div>
          <footer className="calendar-legend">
            <span>
              <i className="applied" /> 投递日期
            </span>
            <span>
              <i className="deadline" /> 截止日期
            </span>
          </footer>
        </section>

        <aside className="calendar-side">
          <section className="web-panel selected-day">
            <div className="selected-date">
              <strong>{Number(selected.slice(8))}</strong>
              <span>
                {Number(selected.slice(5, 7))}月
                <small>{selected === today ? "今天" : selected.slice(0, 4)}</small>
              </span>
              <em>{selectedEvents.length} 项</em>
            </div>
            <div className="selected-events">
              {selectedEvents.map((item) => (
                <button key={item.id} onClick={() => onEdit(item.job)}>
                  <i className={item.kind} />
                  <span>
                    <strong>{item.job.position}</strong>
                    <small>
                      {item.job.company} · {item.title}
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
              {!selectedEvents.length && (
                <div className="calendar-empty">
                  <CheckCircle2 size={22} />
                  <strong>这一天没有安排</strong>
                  <span>可以留给准备与休息。</span>
                </div>
              )}
            </div>
          </section>

          <section className="web-panel upcoming-agenda">
            <div className="panel-heading compact">
              <div>
                <span className="web-eyebrow">NEXT 14 DAYS</span>
                <h2>未来事项</h2>
              </div>
            </div>
            <div>
              {agenda.map((item) => (
                <button key={item.id} onClick={() => onEdit(item.job)}>
                  <time>
                    <strong>{item.date.slice(8)}</strong>
                    <small>{Number(item.date.slice(5, 7))}月</small>
                  </time>
                  <i className={item.kind} />
                  <span>
                    <strong>{item.job.position}</strong>
                    <small>{item.job.company}</small>
                  </span>
                </button>
              ))}
              {!agenda.length && <p>未来暂时没有投递或截止事项。</p>}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function ProfilePage({
  profile,
  onSave
}: {
  profile: PersonalProfile;
  onSave: (profile: PersonalProfile) => Promise<void>;
}) {
  const [draft, setDraft] = useState<PersonalProfile>(() => ({
    ...profile,
    education: [...profile.education],
    experiences: [...profile.experiences],
    projects: [...profile.projects]
  }));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft({
      ...profile,
      education: [...profile.education],
      experiences: [...profile.experiences],
      projects: [...profile.projects]
    });
  }, [profile]);

  const set = <K extends keyof PersonalProfile>(
    key: K,
    value: PersonalProfile[K]
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    await onSave(draft);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  return (
    <section className="profile-page-web">
      <PageHeading
        eyebrow="PERSONAL PROFILE"
        title="个人资料"
        description="维护一次，在不同公司的网申表单里反复使用。敏感信息默认保存在当前浏览器。"
        actions={
          <button className="web-button primary" onClick={() => void submit()}>
            {saved ? <CheckCircle2 size={16} /> : <Check size={16} />}
            {saved ? "已保存" : "保存资料"}
          </button>
        }
      />

      <div className="profile-overview-web">
        <div className="profile-avatar">
          <span>{draft.fullName?.slice(0, 1) || "OF"}</span>
          <i />
        </div>
        <div>
          <span className="web-eyebrow">PROFILE COMPLETION</span>
          <h2>{draft.fullName || "还没有填写姓名"}</h2>
          <p>{draft.targetRole || "填写目标岗位，让工作台更懂你的求职方向。"}</p>
        </div>
        <div className="profile-progress-web">
          <strong>{completionOfProfile(draft)}%</strong>
          <i>
            <b style={{ width: `${completionOfProfile(draft)}%` }} />
          </i>
          <small>基础档案完整度</small>
        </div>
        <span className="local-only-pill">
          <ShieldCheck size={13} /> 仅保存在本地
        </span>
      </div>

      <div className="profile-layout-web">
        <div className="profile-sections">
          <FormSection
            icon={<UserRound size={17} />}
            title="基本信息"
            description="最常见的网申字段"
          >
            <div className="form-grid-web">
              <Field label="姓名" required>
                <input
                  value={draft.fullName}
                  onChange={(event) => set("fullName", event.target.value)}
                  placeholder="你的姓名"
                />
              </Field>
              <Field label="性别">
                <select
                  value={draft.gender}
                  onChange={(event) => set("gender", event.target.value)}
                >
                  <option value="">请选择</option>
                  <option>男</option>
                  <option>女</option>
                  <option>不便透露</option>
                </select>
              </Field>
              <Field label="手机号码" required>
                <input
                  type="tel"
                  value={draft.phone}
                  onChange={(event) => set("phone", event.target.value)}
                  placeholder="用于招聘方联系"
                />
              </Field>
              <Field label="邮箱" required>
                <input
                  type="email"
                  value={draft.email}
                  onChange={(event) => set("email", event.target.value)}
                  placeholder="name@example.com"
                />
              </Field>
              <Field label="出生日期">
                <input
                  type="date"
                  value={draft.birthDate}
                  onChange={(event) => set("birthDate", event.target.value)}
                />
              </Field>
              <Field label="现居城市">
                <input
                  value={draft.currentCity}
                  onChange={(event) => set("currentCity", event.target.value)}
                  placeholder="例如：上海"
                />
              </Field>
              <Field label="联系地址" wide>
                <input
                  value={draft.address}
                  onChange={(event) => set("address", event.target.value)}
                  placeholder="可选，用于部分公司的网申"
                />
              </Field>
            </div>
          </FormSection>

          <FormSection
            icon={<Target size={17} />}
            title="求职偏好"
            description="帮助筛选机会与复用申请信息"
          >
            <div className="form-grid-web">
              <Field label="目标岗位" required>
                <input
                  value={draft.targetRole}
                  onChange={(event) => set("targetRole", event.target.value)}
                  placeholder="产品经理 / AI 产品"
                />
              </Field>
              <Field label="意向城市">
                <input
                  value={draft.targetCities}
                  onChange={(event) => set("targetCities", event.target.value)}
                  placeholder="上海、杭州、深圳"
                />
              </Field>
              <Field label="最早到岗时间">
                <input
                  type="date"
                  value={draft.earliestStartDate}
                  onChange={(event) =>
                    set("earliestStartDate", event.target.value)
                  }
                />
              </Field>
              <Field label="作品集">
                <input
                  type="url"
                  value={draft.portfolioUrl}
                  onChange={(event) => set("portfolioUrl", event.target.value)}
                  placeholder="https://"
                />
              </Field>
              <Field label="GitHub" wide>
                <input
                  type="url"
                  value={draft.githubUrl}
                  onChange={(event) => set("githubUrl", event.target.value)}
                  placeholder="https://github.com/"
                />
              </Field>
            </div>
          </FormSection>

          <FormSection
            icon={<GraduationCap size={17} />}
            title="教育经历"
            description="第一条会优先用于自动匹配"
            action={
              <button
                onClick={() =>
                  set("education", [
                    ...draft.education,
                    {
                      id: createId("edu"),
                      school: "",
                      major: "",
                      degree: "",
                      startDate: "",
                      endDate: "",
                      gpa: ""
                    }
                  ])
                }
              >
                <Plus size={13} /> 添加教育
              </button>
            }
          >
            <div className="entry-stack">
              {draft.education.map((education, index) => (
                <EntryEditor
                  key={education.id}
                  title={education.school || `教育经历 ${index + 1}`}
                  onDelete={() =>
                    set(
                      "education",
                      draft.education.filter((item) => item.id !== education.id)
                    )
                  }
                >
                  <div className="form-grid-web">
                    <Field label="学校">
                      <input
                        value={education.school}
                        onChange={(event) =>
                          set(
                            "education",
                            draft.education.map((item) =>
                              item.id === education.id
                                ? { ...item, school: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                    <Field label="专业">
                      <input
                        value={education.major}
                        onChange={(event) =>
                          set(
                            "education",
                            draft.education.map((item) =>
                              item.id === education.id
                                ? { ...item, major: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                    <Field label="学历">
                      <input
                        value={education.degree}
                        onChange={(event) =>
                          set(
                            "education",
                            draft.education.map((item) =>
                              item.id === education.id
                                ? { ...item, degree: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                    <Field label="GPA">
                      <input
                        value={education.gpa}
                        onChange={(event) =>
                          set(
                            "education",
                            draft.education.map((item) =>
                              item.id === education.id
                                ? { ...item, gpa: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                    <Field label="开始时间">
                      <input
                        type="month"
                        value={education.startDate}
                        onChange={(event) =>
                          set(
                            "education",
                            draft.education.map((item) =>
                              item.id === education.id
                                ? { ...item, startDate: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                    <Field label="结束时间">
                      <input
                        type="month"
                        value={education.endDate}
                        onChange={(event) =>
                          set(
                            "education",
                            draft.education.map((item) =>
                              item.id === education.id
                                ? { ...item, endDate: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                  </div>
                </EntryEditor>
              ))}
              {!draft.education.length && (
                <EmptyEntry
                  icon={<GraduationCap size={21} />}
                  text="还没有教育经历"
                  onClick={() =>
                    set("education", [
                      {
                        id: createId("edu"),
                        school: "",
                        major: "",
                        degree: "",
                        startDate: "",
                        endDate: "",
                        gpa: ""
                      }
                    ])
                  }
                />
              )}
            </div>
          </FormSection>

          <FormSection
            icon={<BriefcaseBusiness size={17} />}
            title="实习与工作经历"
            description="支持维护多段经历"
            action={
              <button
                onClick={() =>
                  set("experiences", [
                    ...draft.experiences,
                    {
                      id: createId("exp"),
                      organization: "",
                      title: "",
                      startDate: "",
                      endDate: "",
                      description: ""
                    }
                  ])
                }
              >
                <Plus size={13} /> 添加经历
              </button>
            }
          >
            <div className="entry-stack">
              {draft.experiences.map((experience, index) => (
                <EntryEditor
                  key={experience.id}
                  title={
                    experience.organization || `实习 / 工作经历 ${index + 1}`
                  }
                  onDelete={() =>
                    set(
                      "experiences",
                      draft.experiences.filter(
                        (item) => item.id !== experience.id
                      )
                    )
                  }
                >
                  <div className="form-grid-web">
                    <Field label="公司 / 组织">
                      <input
                        value={experience.organization}
                        onChange={(event) =>
                          set(
                            "experiences",
                            draft.experiences.map((item) =>
                              item.id === experience.id
                                ? { ...item, organization: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                    <Field label="岗位">
                      <input
                        value={experience.title}
                        onChange={(event) =>
                          set(
                            "experiences",
                            draft.experiences.map((item) =>
                              item.id === experience.id
                                ? { ...item, title: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                    <Field label="开始时间">
                      <input
                        type="month"
                        value={experience.startDate}
                        onChange={(event) =>
                          set(
                            "experiences",
                            draft.experiences.map((item) =>
                              item.id === experience.id
                                ? { ...item, startDate: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                    <Field label="结束时间">
                      <input
                        type="month"
                        value={experience.endDate}
                        onChange={(event) =>
                          set(
                            "experiences",
                            draft.experiences.map((item) =>
                              item.id === experience.id
                                ? { ...item, endDate: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                    <Field label="经历描述" wide>
                      <textarea
                        rows={4}
                        value={experience.description}
                        onChange={(event) =>
                          set(
                            "experiences",
                            draft.experiences.map((item) =>
                              item.id === experience.id
                                ? { ...item, description: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                  </div>
                </EntryEditor>
              ))}
              {!draft.experiences.length && (
                <EmptyEntry
                  icon={<BriefcaseBusiness size={21} />}
                  text="还没有实习或工作经历"
                  onClick={() =>
                    set("experiences", [
                      {
                        id: createId("exp"),
                        organization: "",
                        title: "",
                        startDate: "",
                        endDate: "",
                        description: ""
                      }
                    ])
                  }
                />
              )}
            </div>
          </FormSection>

          <FormSection
            icon={<BookOpenText size={17} />}
            title="项目经历"
            description="作品、研究、比赛或个人项目"
            action={
              <button
                onClick={() =>
                  set("projects", [
                    ...draft.projects,
                    {
                      id: createId("project"),
                      name: "",
                      role: "",
                      startDate: "",
                      endDate: "",
                      description: ""
                    }
                  ])
                }
              >
                <Plus size={13} /> 添加项目
              </button>
            }
          >
            <div className="entry-stack">
              {draft.projects.map((project, index) => (
                <EntryEditor
                  key={project.id}
                  title={project.name || `项目经历 ${index + 1}`}
                  onDelete={() =>
                    set(
                      "projects",
                      draft.projects.filter((item) => item.id !== project.id)
                    )
                  }
                >
                  <div className="form-grid-web">
                    <Field label="项目名称">
                      <input
                        value={project.name}
                        onChange={(event) =>
                          set(
                            "projects",
                            draft.projects.map((item) =>
                              item.id === project.id
                                ? { ...item, name: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                    <Field label="担任角色">
                      <input
                        value={project.role}
                        onChange={(event) =>
                          set(
                            "projects",
                            draft.projects.map((item) =>
                              item.id === project.id
                                ? { ...item, role: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                    <Field label="开始时间">
                      <input
                        type="month"
                        value={project.startDate}
                        onChange={(event) =>
                          set(
                            "projects",
                            draft.projects.map((item) =>
                              item.id === project.id
                                ? { ...item, startDate: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                    <Field label="结束时间">
                      <input
                        type="month"
                        value={project.endDate}
                        onChange={(event) =>
                          set(
                            "projects",
                            draft.projects.map((item) =>
                              item.id === project.id
                                ? { ...item, endDate: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                    <Field label="项目描述" wide>
                      <textarea
                        rows={4}
                        value={project.description}
                        onChange={(event) =>
                          set(
                            "projects",
                            draft.projects.map((item) =>
                              item.id === project.id
                                ? { ...item, description: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                  </div>
                </EntryEditor>
              ))}
              {!draft.projects.length && (
                <EmptyEntry
                  icon={<BookOpenText size={21} />}
                  text="还没有项目经历"
                  onClick={() =>
                    set("projects", [
                      {
                        id: createId("project"),
                        name: "",
                        role: "",
                        startDate: "",
                        endDate: "",
                        description: ""
                      }
                    ])
                  }
                />
              )}
            </div>
          </FormSection>

          <FormSection
            icon={<Sparkles size={17} />}
            title="常用开放题"
            description="保存母版，申请时根据公司做微调"
          >
            <div className="long-form-stack">
              <Field label="自我介绍">
                <textarea
                  rows={5}
                  value={draft.selfIntroduction}
                  onChange={(event) =>
                    set("selfIntroduction", event.target.value)
                  }
                  placeholder="用 150–300 字介绍你的经历与目标"
                />
              </Field>
              <Field label="个人优势">
                <textarea
                  rows={4}
                  value={draft.strengths}
                  onChange={(event) => set("strengths", event.target.value)}
                />
              </Field>
              <Field label="职业规划">
                <textarea
                  rows={4}
                  value={draft.careerPlan}
                  onChange={(event) => set("careerPlan", event.target.value)}
                />
              </Field>
            </div>
          </FormSection>
        </div>

        <aside className="profile-aside">
          <section className="web-panel profile-checklist">
            <span className="web-eyebrow">READINESS</span>
            <h3>网申准备度</h3>
            {[
              ["基本联系方式", Boolean(draft.fullName && draft.phone && draft.email)],
              ["教育经历", Boolean(draft.education.length)],
              ["目标岗位", Boolean(draft.targetRole)],
              ["实习 / 项目", Boolean(draft.experiences.length || draft.projects.length)],
              ["常用回答", Boolean(draft.selfIntroduction)]
            ].map(([label, done]) => (
              <div key={String(label)} className={done ? "done" : ""}>
                {done ? <Check size={13} /> : <CircleDot size={13} />}
                <span>{label}</span>
              </div>
            ))}
          </section>
          <section className="web-panel privacy-card">
            <ShieldCheck size={22} />
            <h3>你的资料，由你控制</h3>
            <p>
              网页工作台不会自动提交任何网申表单。插件写入字段后，仍需要你检查并手动提交。
            </p>
          </section>
        </aside>
      </div>

      <div className="profile-save-dock">
        <span>
          <ShieldCheck size={15} /> 敏感资料默认不发送给 AI
        </span>
        <button onClick={() => void submit()}>
          <Check size={15} /> 保存全部资料
        </button>
      </div>
    </section>
  );
}

function FormSection({
  icon,
  title,
  description,
  action,
  children
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="web-panel form-section">
      <header>
        <span>{icon}</span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {action && <div className="form-section-action">{action}</div>}
      </header>
      <div className="form-section-body">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  wide,
  children
}: {
  label: string;
  required?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`field-web ${wide ? "wide" : ""}`}>
      <span>
        {label}
        {required && <em>必填</em>}
      </span>
      {children}
    </label>
  );
}

function EntryEditor({
  title,
  onDelete,
  children
}: {
  title: string;
  onDelete: () => void;
  children: ReactNode;
}) {
  return (
    <article className="entry-editor">
      <header>
        <strong>{title}</strong>
        <button aria-label="删除" onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </header>
      {children}
    </article>
  );
}

function EmptyEntry({
  icon,
  text,
  onClick
}: {
  icon: ReactNode;
  text: string;
  onClick: () => void;
}) {
  return (
    <button className="empty-entry-web" onClick={onClick}>
      {icon}
      <span>
        <strong>{text}</strong>
        <small>点击添加一条记录</small>
      </span>
      <Plus size={16} />
    </button>
  );
}

function DocumentsPage({
  documents,
  profile,
  onChange,
  notify
}: {
  documents: OfferFlowDocument[];
  profile: PersonalProfile;
  onChange: (documents: OfferFlowDocument[]) => Promise<void>;
  notify: (message: string, tone?: Toast["tone"]) => void;
}) {
  const [editing, setEditing] = useState<OfferFlowDocument | null>(null);
  const [filter, setFilter] = useState<DocumentKind | "all">("all");
  const createDocument = () =>
    setEditing({
      id: createId("doc"),
      name: "",
      kind: "resume",
      targetRole: profile.targetRole,
      updatedAt: new Date().toISOString()
    });
  const saveDocument = async (document: OfferFlowDocument) => {
    if (!document.name.trim()) {
      notify("请填写文档名称", "danger");
      return;
    }
    const exists = documents.some((item) => item.id === document.id);
    let next = exists
      ? documents.map((item) =>
          item.id === document.id
            ? { ...document, updatedAt: new Date().toISOString() }
            : item
        )
      : [
          { ...document, updatedAt: new Date().toISOString() },
          ...documents
        ];
    if (document.primary) {
      next = next.map((item) => ({
        ...item,
        primary: item.id === document.id
      }));
    }
    await onChange(next);
    setEditing(null);
    notify(exists ? "文档信息已更新" : "文档已加入中心", "success");
  };
  const visible =
    filter === "all"
      ? documents
      : documents.filter((document) => document.kind === filter);

  return (
    <section>
      <PageHeading
        eyebrow="DOCUMENT LIBRARY"
        title="文档中心"
        description="管理不同岗位使用的简历、作品集、成绩单和常用回答版本。"
        actions={
          <button className="web-button primary" onClick={createDocument}>
            <Plus size={16} /> 添加文档
          </button>
        }
      />

      <div className="document-stats">
        <div>
          <span className="document-stat-icon resume">
            <FileText size={18} />
          </span>
          <span>
            <small>简历版本</small>
            <strong>
              {documents.filter((item) => item.kind === "resume").length}
            </strong>
          </span>
        </div>
        <div>
          <span className="document-stat-icon portfolio">
            <BookOpenText size={18} />
          </span>
          <span>
            <small>作品与链接</small>
            <strong>
              {
                documents.filter(
                  (item) =>
                    item.kind === "portfolio" || item.kind === "certificate"
                ).length
              }
            </strong>
          </span>
        </div>
        <div>
          <span className="document-stat-icon answer">
            <Sparkles size={18} />
          </span>
          <span>
            <small>常用回答</small>
            <strong>
              {documents.filter((item) => item.kind === "answer").length}
            </strong>
          </span>
        </div>
      </div>

      <div className="document-toolbar">
        <div className="filter-chips">
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            全部
          </button>
          {(Object.keys(DOCUMENT_KIND_LABELS) as DocumentKind[]).map((kind) => (
            <button
              className={filter === kind ? "active" : ""}
              key={kind}
              onClick={() => setFilter(kind)}
            >
              {DOCUMENT_KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      </div>

      <div className="document-grid">
        {visible.map((document) => (
          <article className="document-card" key={document.id}>
            <header>
              <span className={`document-file-icon ${document.kind}`}>
                {document.kind === "portfolio" ? (
                  <BookOpenText size={21} />
                ) : document.kind === "certificate" ? (
                  <BadgeCheck size={21} />
                ) : (
                  <FileText size={21} />
                )}
              </span>
              <div>
                <small>{DOCUMENT_KIND_LABELS[document.kind]}</small>
                <strong>{document.name}</strong>
              </div>
              {document.primary && <em>默认</em>}
            </header>
            <p>{document.note || "还没有补充使用说明。"}</p>
            <div className="document-tags">
              {document.targetRole && <span>{document.targetRole}</span>}
              <span>{relativeDate(document.updatedAt)}更新</span>
            </div>
            <footer>
              <button
                disabled={!document.url}
                onClick={() =>
                  document.url &&
                  window.open(document.url, "_blank", "noopener,noreferrer")
                }
              >
                <ExternalLink size={13} /> 打开文档
              </button>
              <button onClick={() => setEditing(document)}>
                <Pencil size={13} /> 编辑
              </button>
            </footer>
          </article>
        ))}
        <button className="document-add-card" onClick={createDocument}>
          <Plus size={25} />
          <strong>添加一个文档版本</strong>
          <span>保存链接和使用说明</span>
        </button>
      </div>

      {editing && (
        <Modal
          title={documents.some((item) => item.id === editing.id) ? "编辑文档" : "添加文档"}
          onClose={() => setEditing(null)}
          footer={
            <>
              {documents.some((item) => item.id === editing.id) && (
                <button
                  className="web-button danger"
                  onClick={async () => {
                    await onChange(
                      documents.filter((item) => item.id !== editing.id)
                    );
                    setEditing(null);
                    notify("文档已移除");
                  }}
                >
                  <Trash2 size={14} /> 删除
                </button>
              )}
              <span />
              <button
                className="web-button subtle"
                onClick={() => setEditing(null)}
              >
                取消
              </button>
              <button
                className="web-button primary"
                onClick={() => void saveDocument(editing)}
              >
                <Check size={14} /> 保存
              </button>
            </>
          }
        >
          <div className="modal-form">
            <Field label="名称" required>
              <input
                value={editing.name}
                onChange={(event) =>
                  setEditing({ ...editing, name: event.target.value })
                }
                placeholder="例如：产品经理通用简历"
              />
            </Field>
            <Field label="类型">
              <select
                value={editing.kind}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    kind: event.target.value as DocumentKind
                  })
                }
              >
                {(Object.keys(DOCUMENT_KIND_LABELS) as DocumentKind[]).map(
                  (kind) => (
                    <option key={kind} value={kind}>
                      {DOCUMENT_KIND_LABELS[kind]}
                    </option>
                  )
                )}
              </select>
            </Field>
            <Field label="适用岗位">
              <input
                value={editing.targetRole || ""}
                onChange={(event) =>
                  setEditing({ ...editing, targetRole: event.target.value })
                }
                placeholder="产品经理 / AI 产品"
              />
            </Field>
            <Field label="文档链接">
              <input
                type="url"
                value={editing.url || ""}
                onChange={(event) =>
                  setEditing({ ...editing, url: event.target.value })
                }
                placeholder="https://"
              />
            </Field>
            <Field label="使用说明">
              <textarea
                rows={4}
                value={editing.note || ""}
                onChange={(event) =>
                  setEditing({ ...editing, note: event.target.value })
                }
                placeholder="这个版本突出哪些经历，适合什么岗位？"
              />
            </Field>
            <label className="check-row">
              <input
                type="checkbox"
                checked={Boolean(editing.primary)}
                onChange={(event) =>
                  setEditing({ ...editing, primary: event.target.checked })
                }
              />
              <span>
                <strong>设为默认简历</strong>
                <small>只有一个文档会被标记为默认</small>
              </span>
            </label>
          </div>
        </Modal>
      )}
    </section>
  );
}

function SettingsPage({
  data,
  onData,
  notify
}: {
  data: WorkspaceData;
  onData: (data: WorkspaceData) => void;
  notify: (message: string, tone?: Toast["tone"]) => void;
}) {
  const [settings, setSettingsDraft] = useState(data.settings);
  const [preferences, setPreferencesDraft] = useState(data.preferences);
  const [sourceBusy, setSourceBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setSettingsDraft(data.settings), [data.settings]);
  useEffect(() => setPreferencesDraft(data.preferences), [data.preferences]);

  const saveAll = async () => {
    await Promise.all([
      saveSettings(settings),
      savePreferences(preferences)
    ]);
    onData({ ...data, settings, preferences });
    notify("设置已保存", "success");
  };

  const refreshSource = async () => {
    setSourceBusy(true);
    try {
      const snapshot = await refreshOpportunityFeed(
        settings.opportunityFeedUrl
      );
      await saveOpportunitySnapshot(snapshot);
      const next = { ...data, opportunities: snapshot, settings };
      onData(next);
      await saveSettings(settings);
      notify(`机会数据已同步：${snapshot.opportunities.length} 条`, "success");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "数据源同步失败",
        "danger"
      );
    } finally {
      setSourceBusy(false);
    }
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("这不是 OfferFlow 工作区备份");
      }
      if (
        !("jobs" in parsed) &&
        !("profile" in parsed)
      ) {
        throw new Error("这不是 OfferFlow 工作区备份");
      }
      const next = await applyWorkspaceSnapshot(
        parsed as unknown as Parameters<typeof applyWorkspaceSnapshot>[0]
      );
      onData(next);
      notify("工作区数据已导入", "success");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "备份文件无法读取",
        "danger"
      );
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section>
      <PageHeading
        eyebrow="CONNECTIONS & PRIVACY"
        title="同步与设置"
        description="控制插件连接、机会数据、AI 页面理解和完整备份。"
        actions={
          <button className="web-button primary" onClick={() => void saveAll()}>
            <Check size={15} /> 保存设置
          </button>
        }
      />

      <div className="settings-layout-web">
        <div className="settings-primary">
          <section className="web-panel connection-hero">
            <div className="connection-visual">
              <span className={isExtensionDashboard() ? "online" : ""}>
                <ArrowRight size={22} />
              </span>
              <i />
              <span className={isExtensionDashboard() ? "online" : ""}>
                <LayoutDashboard size={20} />
              </span>
            </div>
            <div>
              <span className="web-eyebrow">EXTENSION CONNECTION</span>
              <h2>
                {isExtensionDashboard()
                  ? "浏览器插件已连接"
                  : "当前是独立本地工作区"}
              </h2>
              <p>
                {isExtensionDashboard()
                  ? "插件抓取的岗位、进度更新和个人资料会即时出现在这个工作台。"
                  : "公开网页不会自动读取扩展数据。可以导入扩展导出的备份，或从插件打开内置工作台。"}
              </p>
            </div>
            <span className={`status-badge ${isExtensionDashboard() ? "online" : ""}`}>
              <CircleDot size={12} />
              {isExtensionDashboard() ? "实时共享" : "浏览器本地"}
            </span>
          </section>

          <section className="web-panel settings-section-web">
            <header>
              <span className="settings-icon opportunity">
                <Megaphone size={18} />
              </span>
              <div>
                <h2>校招机会数据源</h2>
                <p>接入公开 JSON，在机会收件箱中统一查看招聘批次。</p>
              </div>
              <span className="settings-state">
                {data.opportunities.opportunities.length} 条
              </span>
            </header>
            <div className="settings-body">
              <Field label="公开 JSON 地址（留空使用内置数据）">
                <input
                  type="url"
                  value={settings.opportunityFeedUrl || ""}
                  onChange={(event) =>
                    setSettingsDraft({
                      ...settings,
                      opportunityFeedUrl: event.target.value
                    })
                  }
                  placeholder="https://example.com/opportunities.json"
                />
              </Field>
              <button
                className="web-button subtle"
                disabled={sourceBusy}
                onClick={() => void refreshSource()}
              >
                <RefreshCw
                  size={14}
                  className={sourceBusy ? "spin" : ""}
                />
                保存并同步
              </button>
            </div>
          </section>

          <section className="web-panel settings-section-web">
            <header>
              <span className="settings-icon ai">
                <Sparkles size={18} />
              </span>
              <div>
                <h2>DeepSeek 页面理解</h2>
                <p>用于识别非标准招聘页、投递列表和流程变化。</p>
              </div>
              <span className="settings-state">
                {settings.deepseekApiKey ? "已配置" : "未配置"}
              </span>
            </header>
            <div className="settings-body settings-ai-grid">
              <Field label="API Key（仅保存在当前浏览器）">
                <span className="input-with-icon">
                  <KeyRound size={14} />
                  <input
                    type="password"
                    autoComplete="off"
                    value={settings.deepseekApiKey || ""}
                    onChange={(event) =>
                      setSettingsDraft({
                        ...settings,
                        deepseekApiKey: event.target.value
                      })
                    }
                    placeholder="sk-..."
                  />
                </span>
              </Field>
              <Field label="模型">
                <input
                  value={settings.deepseekModel || "deepseek-v4-flash"}
                  onChange={(event) =>
                    setSettingsDraft({
                      ...settings,
                      deepseekModel: event.target.value
                    })
                  }
                />
              </Field>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={settings.autoMonitorEnabled ?? true}
                  onChange={(event) =>
                    setSettingsDraft({
                      ...settings,
                      autoMonitorEnabled: event.target.checked
                    })
                  }
                />
                <i>
                  <b />
                </i>
                <span>
                  <strong>实时监听投递进度页</strong>
                  <small>页面阶段发生变化时更新唯一匹配的岗位</small>
                </span>
              </label>
            </div>
          </section>

          <section className="web-panel settings-section-web">
            <header>
              <span className="settings-icon obsidian">
                <BookOpenText size={18} />
              </span>
              <div>
                <h2>Obsidian Markdown</h2>
                <p>插件侧同步受管内容，并保留你的准备笔记。</p>
              </div>
              <span className="settings-state">
                {settings.obsidianFolderName || "未连接"}
              </span>
            </header>
            <div className="obsidian-note">
              <FolderOpen size={18} />
              <span>
                <strong>
                  {settings.obsidianFolderName
                    ? `已连接：${settings.obsidianFolderName}`
                    : "需要在插件中选择目录"}
                </strong>
                <small>
                  浏览器目录权限只能从扩展界面授权，网页工作台负责显示同步状态。
                </small>
              </span>
            </div>
          </section>

          <section className="web-panel settings-section-web">
            <header>
              <span className="settings-icon display">
                <LayoutDashboard size={18} />
              </span>
              <div>
                <h2>工作台偏好</h2>
                <p>调整管线密度和日历显示方式。</p>
              </div>
            </header>
            <div className="preference-list">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={Boolean(preferences.compactPipeline)}
                  onChange={(event) =>
                    setPreferencesDraft({
                      ...preferences,
                      compactPipeline: event.target.checked
                    })
                  }
                />
                <i>
                  <b />
                </i>
                <span>
                  <strong>紧凑管线</strong>
                  <small>在一屏中显示更多岗位卡片</small>
                </span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={preferences.weekStartsMonday ?? true}
                  onChange={(event) =>
                    setPreferencesDraft({
                      ...preferences,
                      weekStartsMonday: event.target.checked
                    })
                  }
                />
                <i>
                  <b />
                </i>
                <span>
                  <strong>周一作为每周第一天</strong>
                  <small>适用于日历和未来事项</small>
                </span>
              </label>
            </div>
          </section>
        </div>

        <aside className="settings-aside">
          <section className="web-panel backup-card">
            <span className="web-eyebrow">FULL BACKUP</span>
            <FileArchive size={28} />
            <h3>完整工作区备份</h3>
            <p>
              包含岗位、事件、个人资料、机会缓存、文档和偏好设置。
            </p>
            <button
              className="web-button dark"
              onClick={() => downloadSnapshot(data)}
            >
              <Download size={15} /> 导出 JSON
            </button>
            <button
              className="web-button subtle full"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={15} /> 导入备份
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept="application/json,.json"
              onChange={(event) =>
                void importFile(event.target.files?.[0])
              }
            />
          </section>

          <section className="web-panel data-summary-card">
            <span className="web-eyebrow">LOCAL DATA</span>
            <h3>当前数据</h3>
            <div>
              <span>岗位记录</span>
              <strong>{data.jobs.length}</strong>
            </div>
            <div>
              <span>事件时间线</span>
              <strong>
                {data.jobs.reduce((sum, job) => sum + job.events.length, 0)}
              </strong>
            </div>
            <div>
              <span>机会缓存</span>
              <strong>{data.opportunities.opportunities.length}</strong>
            </div>
            <div>
              <span>文档版本</span>
              <strong>{data.documents.length}</strong>
            </div>
          </section>

          <section className="web-panel privacy-card large">
            <ShieldCheck size={22} />
            <h3>隐私边界</h3>
            <p>
              API Key、个人资料和投递记录默认只保存在当前浏览器。仅在你明确使用
              AI 页面理解时，页面可见文本才会发送给对应服务。
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}

function JobDrawer({
  job,
  isNew,
  onClose,
  onSave,
  onDelete
}: {
  job: JobApplication;
  isNew: boolean;
  onClose: () => void;
  onSave: (job: JobApplication) => Promise<void>;
  onDelete: (job: JobApplication) => Promise<void>;
}) {
  const [draft, setDraft] = useState(job);
  const [tab, setTab] = useState<"details" | "timeline">("details");
  const set = <K extends keyof JobApplication>(
    key: K,
    value: JobApplication[K]
  ) => setDraft((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div className="drawer-layer">
      <button className="drawer-scrim" aria-label="关闭" onClick={onClose} />
      <aside className="job-drawer">
        <header className="drawer-header">
          <div>
            <span className="web-eyebrow">
              {isNew ? "NEW APPLICATION" : "APPLICATION DETAIL"}
            </span>
            <h2>{isNew ? "创建岗位" : `${draft.company} · ${draft.position}`}</h2>
          </div>
          <button aria-label="关闭" onClick={onClose}>
            <X size={19} />
          </button>
        </header>

        {!isNew && (
          <div className="drawer-tabs">
            <button
              className={tab === "details" ? "active" : ""}
              onClick={() => setTab("details")}
            >
              岗位信息
            </button>
            <button
              className={tab === "timeline" ? "active" : ""}
              onClick={() => setTab("timeline")}
            >
              事件时间线 <span>{draft.events.length}</span>
            </button>
          </div>
        )}

        <div className="drawer-scroll">
          {tab === "details" ? (
            <>
              <section className="drawer-stage-section">
                <span>当前阶段</span>
                <div>
                  {STAGES.map((stage) => (
                    <button
                      key={stage}
                      className={`${stageClass(stage)} ${
                        draft.stage === stage ? "active" : ""
                      }`}
                      title={STAGE_LABELS[stage]}
                      onClick={() => set("stage", stage)}
                    >
                      <i />
                      <small>{STAGE_LABELS[stage]}</small>
                    </button>
                  ))}
                </div>
              </section>

              <section className="drawer-form-section">
                <h3>基本信息</h3>
                <div className="form-grid-web">
                  <Field label="公司" required>
                    <input
                      value={draft.company}
                      onChange={(event) => set("company", event.target.value)}
                      placeholder="公司名称"
                    />
                  </Field>
                  <Field label="岗位" required>
                    <input
                      value={draft.position}
                      onChange={(event) => set("position", event.target.value)}
                      placeholder="岗位名称"
                    />
                  </Field>
                  <Field label="部门">
                    <input
                      value={draft.department || ""}
                      onChange={(event) => set("department", event.target.value)}
                    />
                  </Field>
                  <Field label="岗位编号">
                    <input
                      value={draft.jobId || ""}
                      onChange={(event) => set("jobId", event.target.value)}
                    />
                  </Field>
                  <Field label="城市">
                    <input
                      value={draft.city || ""}
                      onChange={(event) => set("city", event.target.value)}
                    />
                  </Field>
                  <Field label="招聘类型">
                    <select
                      value={draft.jobType || ""}
                      onChange={(event) => set("jobType", event.target.value)}
                    >
                      <option value="">请选择</option>
                      <option>校招</option>
                      <option>实习</option>
                      <option>社招</option>
                      <option>兼职</option>
                    </select>
                  </Field>
                </div>
              </section>

              <section className="drawer-form-section">
                <h3>时间与下一步</h3>
                <div className="form-grid-web">
                  <Field label="投递日期">
                    <input
                      type="date"
                      value={parseDateKey(draft.appliedAt) || ""}
                      onChange={(event) => set("appliedAt", event.target.value)}
                    />
                  </Field>
                  <Field label="截止日期">
                    <input
                      type="date"
                      value={parseDateKey(draft.deadline) || ""}
                      onChange={(event) => set("deadline", event.target.value)}
                    />
                  </Field>
                  <Field label="下一步行动" wide>
                    <input
                      value={draft.nextAction || ""}
                      onChange={(event) =>
                        set("nextAction", event.target.value)
                      }
                      placeholder="例如：周五前完成测评"
                    />
                  </Field>
                </div>
              </section>

              <section className="drawer-form-section">
                <h3>岗位内容</h3>
                <div className="long-form-stack">
                  <Field label="岗位摘要">
                    <textarea
                      rows={3}
                      value={draft.summary || ""}
                      onChange={(event) => set("summary", event.target.value)}
                    />
                  </Field>
                  <Field label="职责（每行一条）">
                    <textarea
                      rows={4}
                      value={draft.responsibilities.join("\n")}
                      onChange={(event) =>
                        set(
                          "responsibilities",
                          event.target.value
                            .split("\n")
                            .map((item) => item.trim())
                            .filter(Boolean)
                        )
                      }
                    />
                  </Field>
                  <Field label="要求（每行一条）">
                    <textarea
                      rows={4}
                      value={draft.requirements.join("\n")}
                      onChange={(event) =>
                        set(
                          "requirements",
                          event.target.value
                            .split("\n")
                            .map((item) => item.trim())
                            .filter(Boolean)
                        )
                      }
                    />
                  </Field>
                  <Field label="来源链接">
                    <input
                      type="url"
                      value={draft.sourceUrl}
                      onChange={(event) => set("sourceUrl", event.target.value)}
                      placeholder="https://"
                    />
                  </Field>
                </div>
              </section>
            </>
          ) : (
            <section className="drawer-timeline">
              {[...draft.events]
                .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
                .map((event) => (
                  <article key={event.id}>
                    <i />
                    <span>
                      <strong>{event.title}</strong>
                      <small>
                        {new Date(event.occurredAt).toLocaleString("zh-CN", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </small>
                      {event.sourceUrl && (
                        <button
                          onClick={() =>
                            window.open(
                              event.sourceUrl,
                              "_blank",
                              "noopener,noreferrer"
                            )
                          }
                        >
                          查看来源 <ExternalLink size={11} />
                        </button>
                      )}
                    </span>
                  </article>
                ))}
              {!draft.events.length && (
                <div className="timeline-empty">
                  <Clock3 size={23} />
                  <strong>保存岗位后开始记录</strong>
                  <span>阶段变化与信息更新会保留在这里。</span>
                </div>
              )}
            </section>
          )}
        </div>

        <footer className="drawer-footer">
          {!isNew ? (
            <button
              className="web-button danger"
              onClick={() => void onDelete(draft)}
            >
              <Trash2 size={14} /> 删除
            </button>
          ) : (
            <span />
          )}
          <div>
            {draft.sourceUrl && (
              <button
                className="web-button subtle"
                onClick={() =>
                  window.open(
                    draft.sourceUrl,
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
              >
                <ExternalLink size={14} /> 打开来源
              </button>
            )}
            <button
              className="web-button primary"
              onClick={() => void onSave(draft)}
            >
              <Check size={14} /> {isNew ? "创建岗位" : "保存修改"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
  footer
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="modal-layer">
      <button className="modal-scrim" aria-label="关闭" onClick={onClose} />
      <section className="modal-card">
        <header>
          <h2>{title}</h2>
          <button aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        <footer>{footer}</footer>
      </section>
    </div>
  );
}
