import { useEffect, useMemo, useState } from "react";
import type { OpportunityStatus } from "@offerflow/domain";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Filter,
  MapPin,
  RefreshCw,
  Route,
  Search
} from "lucide-react";
import {
  CAMPUS_HIRING_FEED_URL,
  fetchCampusHiringFeed,
  type CampusHiringOpportunity
} from "../features/opportunities/campusHiringFeed";

const PAGE_SIZE = 80;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const statusLabels: Record<OpportunityStatus, string> = {
  upcoming: "即将开始",
  open: "开放投递",
  closing: "即将截止",
  closed: "已截止",
  ongoing: "持续招聘"
};

interface DeadlineCopy {
  primary: string;
  secondary?: string;
  tone: "default" | "urgent" | "closed";
}

function dateLabel(value?: string): string {
  if (!value) return "待公布";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}

function updatedLabel(value?: string): string {
  if (!value) return "更新时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function deadlineCopy(opportunity: CampusHiringOpportunity): DeadlineCopy {
  if (!opportunity.deadline) {
    return {
      primary: opportunity.deadlineLabel || "待公布",
      tone: opportunity.status === "closed" ? "closed" : "default"
    };
  }

  const deadline = new Date(`${opportunity.deadline}T00:00:00`);
  if (Number.isNaN(deadline.getTime())) {
    return { primary: opportunity.deadlineLabel || opportunity.deadline, tone: "default" };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysRemaining = Math.round((deadline.getTime() - today.getTime()) / DAY_IN_MS);
  const formatted = dateLabel(opportunity.deadline);

  if (daysRemaining < 0) {
    return { primary: "已截止", secondary: formatted, tone: "closed" };
  }
  if (daysRemaining <= 3) {
    return {
      primary: daysRemaining === 0 ? "今天截止" : `${daysRemaining} 天后截止`,
      secondary: formatted,
      tone: "urgent"
    };
  }
  return { primary: formatted, tone: "default" };
}

function OpportunityTags({ company, tags }: { company: string; tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="tag-row" aria-label={`${company} 的岗位方向`}>
      {tags.slice(0, 3).map((tag, index) => <li key={`${tag}-${index}`} title={tag}>{tag}</li>)}
    </ul>
  );
}

function OpportunityDeadline({ opportunity }: { opportunity: CampusHiringOpportunity }) {
  const deadline = deadlineCopy(opportunity);
  return (
    <span className={`deadline-cell deadline-cell--${deadline.tone}`}>
      <CalendarClock aria-hidden="true" size={17} strokeWidth={1.7} />
      <span>
        <strong>{deadline.primary}</strong>
        {deadline.secondary && <small>{deadline.secondary}</small>}
      </span>
    </span>
  );
}

export function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<CampusHiringOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | OpportunityStatus>("all");
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    fetchCampusHiringFeed(signal)
      .then((result) => {
        setOpportunities(result.opportunities);
        setUpdatedAt(result.sourceUpdatedAt || result.fetchedAt);
        setVisibleCount(PAGE_SIZE);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "无法载入校招信息");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const timer = window.setInterval(() => load(), 10 * 60_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return opportunities.filter((opportunity) => {
      const searchable = [
        opportunity.company,
        opportunity.title,
        opportunity.batch,
        opportunity.companyType,
        opportunity.industry,
        ...opportunity.cities,
        ...opportunity.roleTags
      ].filter(Boolean).join(" ").toLowerCase();
      const matchesQuery = !normalized || searchable.includes(normalized);
      const matchesStatus = status === "all" || opportunity.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [opportunities, query, status]);

  const visible = filtered.slice(0, visibleCount);
  const initialLoading = loading && opportunities.length === 0;
  const resultsAnnouncement = loading
    ? "正在刷新校招信息"
    : `找到 ${filtered.length.toLocaleString("zh-CN")} 条校招机会`;

  return (
    <section className="data-page opportunities-page" aria-labelledby="opportunities-title">
      <header className="page-header opportunity-page-header">
        <div className="opportunity-page-heading">
          <span className="page-kicker"><Route aria-hidden="true" size={16} strokeWidth={2} />校招机会</span>
          <h1 id="opportunities-title" tabIndex={-1}>校招信息速递</h1>
          <p>直连公开校招数据，每次刷新都能拿到最新批次、岗位与投递入口。</p>
        </div>
        <div className="page-header-meta" aria-live="polite">
          <span><i className="status-dot" aria-hidden="true" />公开 JSON 已直连</span>
          <small>{opportunities.length ? `${opportunities.length.toLocaleString("zh-CN")} 条 · 更新于 ${updatedLabel(updatedAt)}` : "正在连接数据源"}</small>
        </div>
      </header>

      <div className="data-toolbar opportunity-toolbar" role="search" aria-label="筛选校招机会">
        <label className="search-control">
          <span className="sr-only">搜索校招信息</span>
          <Search aria-hidden="true" size={19} strokeWidth={1.7} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索公司、类型、行业、岗位或城市"
            aria-controls="opportunity-results"
          />
        </label>
        <label className="select-control">
          <Filter aria-hidden="true" size={18} strokeWidth={1.7} />
          <span className="sr-only">按状态筛选</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            aria-controls="opportunity-results"
          >
            <option value="all">全部状态</option>
            {Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <button
          className="secondary-button opportunity-refresh-button"
          type="button"
          onClick={() => load()}
          disabled={loading}
          aria-label="刷新校招信息"
        >
          <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" size={18} strokeWidth={1.8} />刷新
        </button>
      </div>

      <p className="sr-only" role="status">{resultsAnnouncement}</p>
      {error && <div className="inline-alert" role="alert">{error}</div>}

      <div id="opportunity-results" className="opportunity-results" aria-busy={loading}>
        {initialLoading ? (
          <div className="data-loading" role="status"><span className="loading-orbit" />正在读取最新校招信息…</div>
        ) : opportunities.length === 0 ? (
          <div className="integration-empty">
            <span className="page-kicker">公开数据源</span>
            <h2>暂时没有可展示的校招信息</h2>
            <p>数据会直接从公开 JSON 接口读取，无需额外中转。</p>
            <a className="source-link" href={CAMPUS_HIRING_FEED_URL} target="_blank" rel="noreferrer">查看原始数据源 <ArrowUpRight aria-hidden="true" size={15} /></a>
          </div>
        ) : filtered.length === 0 ? (
          <div className="filter-empty">
            <Search aria-hidden="true" size={22} />
            <h2>没有匹配的校招信息</h2>
            <p>调整关键词或清除状态筛选。</p>
            <button type="button" onClick={() => { setQuery(""); setStatus("all"); }}>清除筛选</button>
          </div>
        ) : (
          <div className="opportunity-table-wrap">
            <table className="data-table opportunity-table">
              <caption className="sr-only">校招机会列表，共 {filtered.length.toLocaleString("zh-CN")} 条</caption>
              <colgroup>
                <col className="opportunity-col-company" />
                <col className="opportunity-col-type" />
                <col className="opportunity-col-industry" />
                <col className="opportunity-col-status" />
                <col className="opportunity-col-city" />
                <col className="opportunity-col-deadline" />
                <col className="opportunity-col-action" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">公司与岗位</th>
                  <th scope="col">招聘类型</th>
                  <th scope="col">行业</th>
                  <th scope="col">状态</th>
                  <th scope="col">城市</th>
                  <th scope="col">截止时间</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((opportunity) => {
                  const opportunityStatus = opportunity.status || "upcoming";
                  return (
                    <tr key={opportunity.id}>
                      <td className="opportunity-company-cell">
                        <strong title={opportunity.company}>{opportunity.company}</strong>
                        <span>{opportunity.graduationYears.join("、") || "届次不限"}</span>
                        <OpportunityTags company={opportunity.company} tags={opportunity.roleTags} />
                      </td>
                      <td><span className="opportunity-type-badge" title={opportunity.batch || "未分类"}>{opportunity.batch || "未分类"}</span></td>
                      <td><span className="industry-cell" title={opportunity.industry || "其他"}>{opportunity.industry || "其他"}</span></td>
                      <td><span className={`status-badge status-badge--${opportunityStatus}`}>{statusLabels[opportunityStatus]}</span></td>
                      <td><span className="cell-icon"><MapPin aria-hidden="true" size={17} strokeWidth={1.7} /><span>{opportunity.cities.slice(0, 2).join("、") || "不限"}</span></span></td>
                      <td><OpportunityDeadline opportunity={opportunity} /></td>
                      <td>
                        <a
                          className="table-action opportunity-table-action"
                          href={opportunity.officialUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`查看 ${opportunity.company} 官方招聘页（新标签页打开）`}
                        >
                          <ArrowRight className="icon-directional" aria-hidden="true" size={19} strokeWidth={1.8} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <ul className="opportunity-card-list" aria-label="校招机会卡片列表">
              {visible.map((opportunity) => {
                const opportunityStatus = opportunity.status || "upcoming";
                return (
                  <li key={opportunity.id}>
                    <article className="opportunity-card">
                      <header>
                        <div>
                          <h2>{opportunity.company}</h2>
                          <p>{opportunity.graduationYears.join("、") || "届次不限"}</p>
                        </div>
                        <span className={`status-badge status-badge--${opportunityStatus}`}>{statusLabels[opportunityStatus]}</span>
                      </header>
                      <OpportunityTags company={opportunity.company} tags={opportunity.roleTags} />
                      <dl className="opportunity-card-meta">
                        <div>
                          <dt>招聘类型</dt>
                          <dd><span className="opportunity-type-badge">{opportunity.batch || "未分类"}</span></dd>
                        </div>
                        <div>
                          <dt>行业</dt>
                          <dd>{opportunity.industry || "其他"}</dd>
                        </div>
                        <div>
                          <dt>城市</dt>
                          <dd><span className="cell-icon"><MapPin aria-hidden="true" size={17} strokeWidth={1.7} /><span>{opportunity.cities.slice(0, 2).join("、") || "不限"}</span></span></dd>
                        </div>
                        <div className="opportunity-card-deadline">
                          <dt>截止时间</dt>
                          <dd><OpportunityDeadline opportunity={opportunity} /></dd>
                        </div>
                      </dl>
                      <a
                        className="opportunity-card-action"
                        href={opportunity.officialUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`查看 ${opportunity.company} 官方招聘页（新标签页打开）`}
                      >
                        查看官方招聘
                        <ArrowRight className="icon-directional" aria-hidden="true" size={18} strokeWidth={1.8} />
                      </a>
                    </article>
                  </li>
                );
              })}
            </ul>

            {visible.length < filtered.length && (
              <div className="opportunity-load-more">
                <span>已显示 {visible.length.toLocaleString("zh-CN")} / {filtered.length.toLocaleString("zh-CN")} 条</span>
                <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>继续加载</button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
