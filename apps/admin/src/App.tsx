import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  AdminDashboardBreakdownItem,
  AdminDashboardDailyPoint,
  AdminDashboardRangeDays,
  AdminDashboardResponse,
  AdminFeedbackItem,
  AdminFeedbackStatusCounts,
  ProductFeedbackCategory,
  ProductFeedbackStatus,
  SessionUser
} from "@offerflow/contracts";
import { OfferFlowApiError } from "@offerflow/api-client";
import {
  Activity,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  Inbox,
  LogOut,
  MessageCircleMore,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  User,
  UserRoundCheck,
  UsersRound,
  X
} from "lucide-react";
import { api } from "./api";

type ViewState = "loading" | "anonymous" | "ready" | "forbidden" | "error";
type DailyMetric = keyof Pick<AdminDashboardDailyPoint, "registrations" | "activeChatUsers" | "conversations" | "messages">;

const numberFormatter = new Intl.NumberFormat("zh-CN");
const dateFormatter = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatRate(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

function formatDate(value?: string): string {
  return value ? dateTimeFormatter.format(new Date(value)) : "暂无活动";
}

const statusLabels: Record<ProductFeedbackStatus, string> = {
  new: "待处理",
  reviewing: "处理中",
  planned: "已规划",
  resolved: "已解决",
  closed: "已关闭"
};

const categoryLabels: Record<ProductFeedbackCategory, string> = {
  suggestion: "功能建议",
  issue: "使用问题",
  content: "内容纠错",
  other: "其他想法"
};

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "default"
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone?: "default" | "good" | "signal";
}) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__icon" aria-hidden="true">{icon}</div>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function TrendChart({
  data,
  series,
  label
}: {
  data: AdminDashboardDailyPoint[];
  series: Array<{ key: DailyMetric; label: string; color: string }>;
  label: string;
}) {
  const width = 760;
  const height = 250;
  const padding = { top: 24, right: 22, bottom: 34, left: 42 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, ...data.flatMap((point) => series.map((item) => point[item.key])));
  const x = (index: number) => padding.left + (data.length <= 1 ? innerWidth / 2 : index * innerWidth / (data.length - 1));
  const y = (value: number) => padding.top + innerHeight - value / max * innerHeight;
  const ticks = [0, 0.5, 1];

  return (
    <div className="trend-chart">
      <div className="chart-legend" aria-hidden="true">
        {series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        {ticks.map((tick) => {
          const tickY = padding.top + innerHeight - tick * innerHeight;
          return (
            <g key={tick}>
              <line className="chart-grid" x1={padding.left} x2={width - padding.right} y1={tickY} y2={tickY} />
              <text className="chart-axis" x={padding.left - 10} y={tickY + 4} textAnchor="end">{Math.round(max * tick)}</text>
            </g>
          );
        })}
        {series.map((item) => {
          const points = data.map((point, index) => `${x(index)},${y(point[item.key])}`).join(" ");
          return (
            <g key={item.key}>
              <polyline points={points} fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              {data.map((point, index) => (
                <circle key={`${item.key}-${point.date}`} cx={x(index)} cy={y(point[item.key])} r="3.4" fill={item.color} />
              ))}
            </g>
          );
        })}
        {data.map((point, index) => {
          if (data.length > 14 && index !== 0 && index !== data.length - 1 && index % Math.ceil(data.length / 6) !== 0) return null;
          return <text key={point.date} className="chart-axis" x={x(index)} y={height - 9} textAnchor="middle">{dateFormatter.format(new Date(`${point.date}T00:00:00+08:00`))}</text>;
        })}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th>日期</th>{series.map((item) => <th key={item.key}>{item.label}</th>)}</tr></thead>
        <tbody>{data.map((point) => <tr key={point.date}><th>{point.date}</th>{series.map((item) => <td key={item.key}>{point[item.key]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Breakdown({ items, emptyText }: { items: AdminDashboardBreakdownItem[]; emptyText: string }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!total) return <div className="empty-state"><Sparkles aria-hidden="true" /><p>{emptyText}</p></div>;
  return (
    <ul className="breakdown-list">
      {items.map((item) => {
        const rate = item.value / total;
        return (
          <li key={item.key}>
            <div><span>{item.label}</span><strong>{formatNumber(item.value)}</strong></div>
            <div className="breakdown-track" aria-label={`${item.label} ${formatRate(rate)}`}>
              <span style={{ inlineSize: `${Math.max(rate * 100, item.value ? 2 : 0)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function FeedbackCard({
  item,
  updating,
  copied,
  onUpdateStatus,
  onCopyContact
}: {
  item: AdminFeedbackItem;
  updating: boolean;
  copied: boolean;
  onUpdateStatus: (id: string, status: ProductFeedbackStatus) => void;
  onCopyContact: (contact: string, id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = item.content.length > 180;
  const displayContent = isLong && !expanded ? `${item.content.slice(0, 180)}…` : item.content;

  return (
    <article className="feedback-card">
      <header className="feedback-card-header">
        <div className="feedback-tag-group">
          <span className={`feedback-cat-tag feedback-cat-tag--${item.category}`}>
            {categoryLabels[item.category]}
          </span>
          <time className="feedback-time" dateTime={item.createdAt}>
            {formatDate(item.createdAt)}
          </time>
          {item.pagePath && (
            <span className="feedback-page-tag" title={`提交页面: ${item.pagePath}`}>
              {item.pagePath}
            </span>
          )}
        </div>
        <div className="feedback-status-dropdown">
          <select
            className={`feedback-status-select feedback-status-select--${item.status}`}
            value={item.status}
            disabled={updating}
            onChange={(event) => onUpdateStatus(item.id, event.target.value as ProductFeedbackStatus)}
            aria-label="变更反馈处理状态"
          >
            {(["new", "reviewing", "planned", "resolved", "closed"] as const).map((statusKey) => (
              <option key={statusKey} value={statusKey}>
                {statusLabels[statusKey]}
              </option>
            ))}
          </select>
          {updating && <RefreshCw className="spin status-spinner" size={12} aria-hidden="true" />}
        </div>
      </header>

      <div className="feedback-card-content">
        <p>{displayContent}</p>
        {isLong && (
          <button
            type="button"
            className="feedback-expand-btn"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "收起全文" : "展开阅读全文"}
          </button>
        )}
      </div>

      <footer className="feedback-card-footer">
        <div className="feedback-user-info">
          <User size={13} aria-hidden="true" />
          {item.userDisplayName ? (
            <span>
              <strong>{item.userDisplayName}</strong>
              {item.userEmail && <small> ({item.userEmail})</small>}
            </span>
          ) : (
            <span>未登录访客（游客）</span>
          )}
        </div>

        {item.contact ? (
          <div className="feedback-contact-pill">
            <span>联系方式: <strong>{item.contact}</strong></span>
            <button
              type="button"
              className={`feedback-copy-btn ${copied ? "is-copied" : ""}`}
              onClick={() => onCopyContact(item.contact!, item.id)}
              title="一键复制联系方式"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span>{copied ? "已复制" : "复制"}</span>
            </button>
          </div>
        ) : (
          <span className="feedback-no-contact">未留联系方式</span>
        )}
      </footer>
    </article>
  );
}

function LoginPanel({ onAuthenticated }: { onAuthenticated: (user: SessionUser) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("请输入管理员邮箱和密码。");
      return;
    }
    setBusy(true);
    try {
      const session = await api.auth.login({ email: email.trim(), password });
      await onAuthenticated(session.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page" id="main-content">
      <section className="login-story" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true"><span>J</span><i /></div>
        <p className="eyebrow">JobKoI / operations</p>
        <h1 id="login-title">把产品的脉搏，<br />放在一张纸上。</h1>
        <p>注册、活跃、对话质量和关键功能使用情况，集中在一个只读运营视图中。</p>
        <div className="login-story__signal"><Activity aria-hidden="true" /><span>数据直接来自 JobKoI API，不向浏览器暴露数据库权限。</span></div>
      </section>
      <section className="login-card" aria-labelledby="signin-title">
        <p className="login-card__index">PRIVATE / 01</p>
        <h2 id="signin-title">管理员登录</h2>
        <p>使用已加入后台白名单的 JobKoI 账号。</p>
        <form onSubmit={submit} noValidate>
          <label htmlFor="admin-email">邮箱</label>
          <input id="admin-email" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(error)} />
          <label htmlFor="admin-password">密码</label>
          <input id="admin-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} />
          <div className="form-message" id="login-error" role="alert">{error}</div>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? <RefreshCw className="spin" aria-hidden="true" /> : <ArrowUpRight aria-hidden="true" />}
            {busy ? "正在验证" : "进入运营后台"}
          </button>
        </form>
      </section>
    </main>
  );
}

export function App() {
  const [view, setView] = useState<ViewState>("loading");
  const [user, setUser] = useState<SessionUser>();
  const [dashboard, setDashboard] = useState<AdminDashboardResponse>();
  const [range, setRange] = useState<AdminDashboardRangeDays>(30);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Feedback states
  const [feedbacks, setFeedbacks] = useState<AdminFeedbackItem[]>([]);
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [feedbackCounts, setFeedbackCounts] = useState<AdminFeedbackStatusCounts>({
    all: 0,
    new: 0,
    reviewing: 0,
    planned: 0,
    resolved: 0,
    closed: 0
  });
  const [feedbackStatus, setFeedbackStatus] = useState<ProductFeedbackStatus | "all">("all");
  const [feedbackCategory, setFeedbackCategory] = useState<ProductFeedbackCategory | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const [feedbackKeyword, setFeedbackKeyword] = useState("");
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type?: "info" | "success" | "error" } | null>(null);
  const [activeSection, setActiveSection] = useState<string>("overview");

  const pageSize = 15;

  const showToast = useCallback((message: string, type: "info" | "success" | "error" = "info") => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Debounce search input
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFeedbackKeyword(searchInput.trim());
      setFeedbackPage(1);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadFeedbacks = useCallback(async (params?: {
    status?: ProductFeedbackStatus | "all";
    category?: ProductFeedbackCategory | "all";
    keyword?: string;
    page?: number;
  }) => {
    setFeedbackLoading(true);
    const targetStatus = params?.status ?? feedbackStatus;
    const targetCategory = params?.category ?? feedbackCategory;
    const targetKeyword = params?.keyword ?? feedbackKeyword;
    const targetPage = params?.page ?? feedbackPage;
    const offset = (targetPage - 1) * pageSize;

    try {
      const res = await api.admin.feedbackList({
        status: targetStatus,
        category: targetCategory,
        keyword: targetKeyword,
        limit: pageSize,
        offset
      });
      setFeedbacks(res.items);
      setFeedbackTotal(res.total);
      setFeedbackCounts(res.counts);
    } catch (reason) {
      console.error("加载反馈列表失败", reason);
      showToast("获取用户反馈失败，请检查网络", "error");
    } finally {
      setFeedbackLoading(false);
    }
  }, [feedbackStatus, feedbackCategory, feedbackKeyword, feedbackPage, pageSize, showToast]);

  const loadDashboard = useCallback(async (days: AdminDashboardRangeDays, currentUser?: SessionUser) => {
    setRefreshing(true);
    setError("");
    try {
      const data = await api.admin.dashboard(days);
      setDashboard(data);
      if (currentUser) setUser(currentUser);
      setView("ready");
    } catch (reason) {
      if (reason instanceof OfferFlowApiError && reason.status === 401) setView("anonymous");
      else if (reason instanceof OfferFlowApiError && reason.status === 403) setView("forbidden");
      else {
        setError(reason instanceof Error ? reason.message : "暂时无法读取统计数据。");
        setView("error");
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api.auth.session()
      .then((session) => {
        if (!active) return;
        setUser(session.user);
        return Promise.all([loadDashboard(30, session.user), loadFeedbacks()]);
      })
      .catch(() => { if (active) setView("anonymous"); });
    return () => { active = false; };
  }, [loadDashboard, loadFeedbacks]);

  // Reload feedbacks when filters change
  useEffect(() => {
    if (view === "ready") {
      void loadFeedbacks();
    }
  }, [feedbackStatus, feedbackCategory, feedbackKeyword, feedbackPage, view, loadFeedbacks]);

  // Scroll spy to highlight active section in sidebar
  useEffect(() => {
    if (view !== "ready") return;
    const handleScroll = () => {
      const sectionIds = ["overview", "conversations", "features", "feedbacks", "users"];
      const scrollPosition = window.scrollY + 200;
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(id);
            break;
          }
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [view]);

  const selectRange = (days: AdminDashboardRangeDays) => {
    setRange(days);
    void loadDashboard(days);
  };

  const handleUpdateStatus = async (id: string, newStatus: ProductFeedbackStatus) => {
    setUpdatingId(id);
    try {
      const res = await api.admin.updateFeedbackStatus(id, { status: newStatus });
      if (res.success) {
        setFeedbacks((prev) => prev.map((item) => (item.id === id ? res.item : item)));
        setFeedbackCounts((prev) => {
          const oldItem = feedbacks.find((item) => item.id === id);
          if (!oldItem || oldItem.status === newStatus) return prev;
          return {
            ...prev,
            [oldItem.status]: Math.max(0, prev[oldItem.status] - 1),
            [newStatus]: prev[newStatus] + 1
          };
        });
        showToast(`已将反馈标记为「${statusLabels[newStatus]}」`, "success");
      }
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "状态更新失败", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCopyContact = async (contact: string, id: string) => {
    try {
      await navigator.clipboard.writeText(contact);
      setCopiedId(id);
      showToast(`已复制联系方式：${contact}`, "success");
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast("复制失败，请手动长按复制", "error");
    }
  };

  const totalPages = Math.max(1, Math.ceil(feedbackTotal / pageSize));

  const metricCards = useMemo(() => dashboard ? [
    { label: "累计注册", value: formatNumber(dashboard.overview.totalUsers), detail: `近 ${range} 天新增 ${formatNumber(dashboard.overview.newUsers)}`, icon: <UsersRound size={21} />, tone: "default" as const },
    { label: "活跃用户", value: formatNumber(dashboard.overview.activeUsers), detail: `近 ${range} 天有登录活动`, icon: <UserRoundCheck size={21} />, tone: "good" as const },
    { label: "新建对话", value: formatNumber(dashboard.overview.conversations), detail: `${formatNumber(dashboard.overview.userMessages)} 条用户消息`, icon: <MessageCircleMore size={21} />, tone: "default" as const },
    { label: "回答成功率", value: formatRate(dashboard.overview.chatSuccessRate), detail: `${formatNumber(dashboard.overview.assistantMessages)} 条 AI 回答`, icon: <CheckCircle2 size={21} />, tone: "good" as const },
    { label: "回答好评率", value: formatRate(dashboard.overview.positiveFeedbackRate), detail: "仅统计主动评价", icon: <Sparkles size={21} />, tone: "signal" as const },
    { label: "新增投递", value: formatNumber(dashboard.featureUsage.applications), detail: `${formatNumber(dashboard.featureUsage.usersWithApplications)} 位用户使用`, icon: <Send size={21} />, tone: "default" as const }
  ] : [], [dashboard, range]);

  if (view === "loading") return <main className="loading-page" id="main-content"><div className="loader" /><p>正在校验后台权限…</p></main>;
  if (view === "anonymous") return <><a className="skip-link" href="#main-content">跳到主要内容</a><LoginPanel onAuthenticated={async (nextUser) => { await Promise.all([loadDashboard(range, nextUser), loadFeedbacks()]); }} /></>;
  if (view === "forbidden") return (
    <main className="status-page" id="main-content">
      <CircleAlert aria-hidden="true" />
      <p className="eyebrow">ACCESS / DENIED</p>
      <h1>这个账号没有后台权限</h1>
      <p>请在 API 环境变量 <code>ADMIN_EMAILS</code> 中加入当前账号邮箱，然后重新启动服务。</p>
      <button className="secondary-button" onClick={() => { void api.auth.logout().finally(() => setView("anonymous")); }}><LogOut aria-hidden="true" />换一个账号</button>
    </main>
  );
  if (view === "error" || !dashboard) return (
    <main className="status-page" id="main-content">
      <CircleAlert aria-hidden="true" />
      <p className="eyebrow">DATA / OFFLINE</p>
      <h1>统计数据暂时不可用</h1>
      <p>{error || "API 没有返回可用数据。"}</p>
      <button className="secondary-button" onClick={() => void Promise.all([loadDashboard(range), loadFeedbacks()])}><RefreshCw aria-hidden="true" />重新加载</button>
    </main>
  );

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>

      {toast && (
        <aside className={`admin-toast admin-toast--${toast.type || "info"}`} role="status">
          <Sparkles size={16} aria-hidden="true" />
          <span>{toast.message}</span>
        </aside>
      )}

      <aside className="sidebar">
        <div className="sidebar__brand"><div className="brand-mark" aria-hidden="true"><span>J</span><i /></div><div><strong>JobKoI</strong><span>运营后台</span></div></div>
        <nav aria-label="后台导航">
          <a href="#overview" aria-current={activeSection === "overview" ? "page" : undefined}><Activity aria-hidden="true" /><span>数据总览</span></a>
          <a href="#conversations" aria-current={activeSection === "conversations" ? "page" : undefined}><MessageCircleMore aria-hidden="true" /><span>对话质量</span></a>
          <a href="#features" aria-current={activeSection === "features" ? "page" : undefined}><BriefcaseBusiness aria-hidden="true" /><span>功能使用</span></a>
          <a href="#feedbacks" aria-current={activeSection === "feedbacks" ? "page" : undefined}>
            <MessageSquareText aria-hidden="true" />
            <span>用户反馈</span>
            {feedbackCounts.new > 0 && <span className="sidebar-nav-badge" title={`${feedbackCounts.new} 条待处理`}>{feedbackCounts.new}</span>}
          </a>
          <a href="#users" aria-current={activeSection === "users" ? "page" : undefined}><UsersRound aria-hidden="true" /><span>最近用户</span></a>
        </nav>
        <div className="sidebar__foot">
          <span className="live-dot">只读数据源</span>
          <strong>{user?.displayName}</strong>
          <small>{user?.email}</small>
          <button type="button" onClick={() => { void api.auth.logout().finally(() => setView("anonymous")); }}><LogOut aria-hidden="true" />退出登录</button>
        </div>
      </aside>

      <main className="dashboard" id="main-content">
        <header className="dashboard-header" id="overview">
          <div>
            <p className="eyebrow">OPERATIONS / LIVE LEDGER</p>
            <h1>产品运行一览</h1>
            <p>从注册到对话，再到求职动作与用户原声。集中管理的运营视图。</p>
          </div>
          <div className="header-controls">
            <div className="range-control" aria-label="统计周期">
              {([7, 30, 90] as const).map((days) => <button type="button" key={days} aria-pressed={range === days} onClick={() => selectRange(days)}>{days} 天</button>)}
            </div>
            <button className="icon-button" type="button" aria-label="刷新统计数据与反馈" onClick={() => void Promise.all([loadDashboard(range), loadFeedbacks()])} disabled={refreshing || feedbackLoading}>
              <RefreshCw className={refreshing || feedbackLoading ? "spin" : ""} aria-hidden="true" />
            </button>
          </div>
        </header>

        <section className="metric-grid" aria-label="核心指标">
          {metricCards.map((card) => <MetricCard key={card.label} {...card} />)}
        </section>

        <section className="chart-grid" id="conversations" aria-labelledby="trend-title">
          <article className="panel panel--wide">
            <div className="panel-heading"><div><p className="panel-index">01 / GROWTH</p><h2 id="trend-title">注册与对话活跃</h2></div><span>每日</span></div>
            <TrendChart data={dashboard.daily} label={`近 ${range} 天每日注册用户与对话用户趋势`} series={[{ key: "registrations", label: "新注册", color: "#e66b4d" }, { key: "activeChatUsers", label: "对话用户", color: "#1d7767" }]} />
          </article>
          <article className="panel">
            <div className="panel-heading"><div><p className="panel-index">02 / QUALITY</p><h2>AI 回答状态</h2></div><span>{range} 天</span></div>
            <Breakdown items={dashboard.messageStatuses} emptyText="这个周期还没有 AI 回答" />
          </article>
        </section>

        <section className="chart-grid" id="features" aria-labelledby="usage-title">
          <article className="panel panel--wide">
            <div className="panel-heading"><div><p className="panel-index">03 / DIALOGUE</p><h2 id="usage-title">消息与新建对话</h2></div><span>每日</span></div>
            <TrendChart data={dashboard.daily} label={`近 ${range} 天每日消息与新建对话趋势`} series={[{ key: "messages", label: "全部消息", color: "#233f39" }, { key: "conversations", label: "新建对话", color: "#d3a62d" }]} />
          </article>
          <article className="panel feature-panel">
            <div className="panel-heading"><div><p className="panel-index">04 / ACTIONS</p><h2>关键功能使用</h2></div><span>{range} 天</span></div>
            <dl className="feature-list">
              <div><dt><BriefcaseBusiness aria-hidden="true" />新增投递</dt><dd>{formatNumber(dashboard.featureUsage.applications)}</dd></div>
              <div><dt><Sparkles aria-hidden="true" />简历版本</dt><dd>{formatNumber(dashboard.featureUsage.resumeVersions)}</dd></div>
              <div><dt><Clock3 aria-hidden="true" />面试记录</dt><dd>{formatNumber(dashboard.featureUsage.interviewRecords)}</dd></div>
            </dl>
          </article>
        </section>

        <section className="detail-grid" aria-label="反馈概览">
          <article className="panel"><div className="panel-heading"><div><p className="panel-index">05 / FEEDBACK</p><h2>反馈类型</h2></div></div><Breakdown items={dashboard.feedbackCategories} emptyText="这个周期还没有产品反馈" /></article>
          <article className="panel"><div className="panel-heading"><div><p className="panel-index">06 / QUEUE</p><h2>反馈处理状态</h2></div></div><Breakdown items={dashboard.feedbackStatuses} emptyText="目前没有待处理反馈" /></article>
        </section>

        {/* 07 / USER FEEDBACK MANAGEMENT */}
        <section className="panel feedbacks-panel" id="feedbacks" aria-labelledby="feedbacks-title">
          <div className="panel-heading">
            <div>
              <p className="panel-index">07 / FEEDBACK LIST</p>
              <h2 id="feedbacks-title">用户共建反馈详情</h2>
            </div>
            <div className="panel-heading-note">
              <span>共 {formatNumber(feedbackTotal)} 条用户留言</span>
              {feedbackCounts.new > 0 && <span className="feedback-pending-alert">（{feedbackCounts.new} 条待处理）</span>}
            </div>
          </div>

          <div className="feedback-toolbar">
            <div className="feedback-tabs" role="tablist" aria-label="反馈状态筛选">
              {(["all", "new", "reviewing", "planned", "resolved", "closed"] as const).map((key) => {
                const label = key === "all" ? "全部" : statusLabels[key];
                const count = feedbackCounts[key];
                const isSelected = feedbackStatus === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    className="feedback-tab-btn"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setFeedbackStatus(key);
                      setFeedbackPage(1);
                    }}
                  >
                    <span>{label}</span>
                    <span className="feedback-badge">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="feedback-filters">
              <select
                className="feedback-category-select"
                aria-label="按反馈分类筛选"
                value={feedbackCategory}
                onChange={(event) => {
                  setFeedbackCategory(event.target.value as ProductFeedbackCategory | "all");
                  setFeedbackPage(1);
                }}
              >
                <option value="all">全部分类</option>
                <option value="suggestion">💡 功能建议</option>
                <option value="issue">⚠️ 使用问题</option>
                <option value="content">📝 内容纠错</option>
                <option value="other">💬 其他想法</option>
              </select>

              <div className="feedback-search-box">
                <Search size={14} aria-hidden="true" />
                <input
                  type="search"
                  className="feedback-search-input"
                  placeholder="搜索反馈/联系方式/页面/邮箱"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  aria-label="搜索反馈"
                />
                {searchInput && (
                  <button
                    type="button"
                    className="feedback-search-clear"
                    onClick={() => setSearchInput("")}
                    aria-label="清空搜索"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <button
                type="button"
                className="icon-button feedback-refresh-btn"
                onClick={() => void loadFeedbacks()}
                title="刷新反馈列表"
                disabled={feedbackLoading}
                aria-label="刷新反馈列表"
              >
                <RefreshCw className={feedbackLoading ? "spin" : ""} size={15} aria-hidden="true" />
              </button>
            </div>
          </div>

          {feedbackLoading && feedbacks.length === 0 ? (
            <div className="empty-state">
              <RefreshCw className="spin" aria-hidden="true" />
              <p>正在读取反馈记录…</p>
            </div>
          ) : feedbacks.length === 0 ? (
            <div className="empty-state">
              <Inbox aria-hidden="true" />
              <p>{feedbackKeyword || feedbackCategory !== "all" || feedbackStatus !== "all" ? "没有找到符合条件的反馈记录" : "暂无用户反馈记录"}</p>
              {(feedbackKeyword || feedbackCategory !== "all" || feedbackStatus !== "all") && (
                <button
                  type="button"
                  className="feedback-reset-filters-btn"
                  onClick={() => {
                    setFeedbackStatus("all");
                    setFeedbackCategory("all");
                    setSearchInput("");
                    setFeedbackPage(1);
                  }}
                >
                  重置筛选条件
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="feedback-list">
                {feedbacks.map((item) => (
                  <FeedbackCard
                    key={item.id}
                    item={item}
                    updating={updatingId === item.id}
                    copied={copiedId === item.id}
                    onUpdateStatus={handleUpdateStatus}
                    onCopyContact={handleCopyContact}
                  />
                ))}
              </div>

              <footer className="feedback-pagination">
                <span>第 {feedbackPage} / {totalPages} 页（共 {feedbackTotal} 条）</span>
                <div className="feedback-page-controls">
                  <button
                    type="button"
                    className="feedback-page-btn"
                    disabled={feedbackPage <= 1 || feedbackLoading}
                    onClick={() => setFeedbackPage((prev) => Math.max(1, prev - 1))}
                  >
                    <ChevronLeft size={14} aria-hidden="true" />上一页
                  </button>
                  <button
                    type="button"
                    className="feedback-page-btn"
                    disabled={feedbackPage >= totalPages || feedbackLoading}
                    onClick={() => setFeedbackPage((prev) => Math.min(totalPages, prev + 1))}
                  >
                    下一页<ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>

        {/* 08 / RECENT USERS */}
        <section className="panel users-panel" id="users" aria-labelledby="users-title">
          <div className="panel-heading"><div><p className="panel-index">08 / PEOPLE</p><h2 id="users-title">最近注册用户</h2></div><span>邮箱已脱敏</span></div>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="最近注册用户表格">
            <table>
              <thead><tr><th>用户</th><th>注册时间</th><th>最后活跃</th><th>对话</th><th>投递</th></tr></thead>
              <tbody>{dashboard.recentUsers.map((item) => <tr key={item.id}><td><strong>{item.displayName}</strong><span>{item.maskedEmail}</span></td><td>{formatDate(item.createdAt)}</td><td>{formatDate(item.lastActiveAt)}</td><td>{formatNumber(item.conversationCount)}</td><td>{formatNumber(item.applicationCount)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <footer className="dashboard-footer"><span>数据生成于 {formatDate(dashboard.generatedAt)}</span><span>统计不含体验账号和已注销用户</span></footer>
        <div className="sr-only" role="status" aria-live="polite">{refreshing ? "正在刷新统计数据" : `统计数据已更新，周期为 ${range} 天`}</div>
      </main>
    </div>
  );
}
