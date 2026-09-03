import { useEffect, useMemo, useState } from "react";
import type { OpportunityStatus } from "@offerflow/domain";
import {
  AlarmClock,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  House,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  Flame,
  X
} from "lucide-react";
import {
  cacheCampusHiringFeed,
  fetchCampusHiringFeed,
  readCachedCampusHiringFeed,
  type CampusHiringOpportunity
} from "../features/opportunities/campusHiringFeed";
import { opportunityPageRequiresLogin } from "../features/opportunities/paginationAccess";
import { useAuth } from "../app/AuthContext";
import { navigate } from "../app/router";

const PAGE_SIZE = 20;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const FEATURED_CITIES = [
  "北京", "上海", "深圳", "广州", "杭州", "南京", "成都", "武汉", "西安", "苏州",
  "天津", "重庆", "长沙", "合肥", "郑州", "青岛", "厦门", "福州", "济南", "宁波",
  "无锡", "东莞", "佛山", "珠海", "大连", "沈阳", "长春", "哈尔滨", "昆明", "贵阳",
  "南宁", "海口", "石家庄", "太原", "兰州", "乌鲁木齐", "呼和浩特"
] as const;

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

type PaginationItem = number | "start-ellipsis" | "end-ellipsis";
type OpportunityQuickFilter = "all" | "latest" | "open" | "closing" | "ongoing";

function paginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const firstVisiblePage = Math.max(2, currentPage - 1);
  const lastVisiblePage = Math.min(totalPages - 1, currentPage + 1);
  const items: PaginationItem[] = [1];

  if (firstVisiblePage > 2) items.push("start-ellipsis");
  for (let page = firstVisiblePage; page <= lastVisiblePage; page += 1) items.push(page);
  if (lastVisiblePage < totalPages - 1) items.push("end-ellipsis");
  items.push(totalPages);

  return items;
}

function dateLabel(value?: string): string {
  if (!value) return "待公布";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}

function openAtLabel(value?: string): string {
  return value ? dateLabel(value) : "/";
}

function qccSearchUrl(company: string): string {
  return `https://www.qcc.com/web/search?key=${encodeURIComponent(company.trim())}`;
}

function uniqueOptions(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function isOpenOpportunity(status?: OpportunityStatus): boolean {
  return status === "open" || status === "ongoing" || status === "closing";
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
      {tags.slice(0, 2).map((tag, index) => <li key={`${tag}-${index}`} title={tag}>{tag}</li>)}
    </ul>
  );
}

const companyTagPresentation: Record<string, { tone: string; icon: "flame" | "sparkles" }> = {
  hot: { tone: "hot", icon: "flame" },
  "超多hc": { tone: "hc", icon: "flame" },
  "行业独角兽": { tone: "unicorn", icon: "sparkles" },
  "垂直赛道头部": { tone: "leader", icon: "sparkles" },
  "知名大厂": { tone: "leader", icon: "sparkles" },
  "头部大厂": { tone: "leader", icon: "sparkles" }
};

function CompanySignals({ company, tags }: { company: string; tags: string[] }) {
  const visibleTags = tags.slice(0, 2);
  if (!visibleTags.length) return null;
  return (
    <ul className="company-signal-list" aria-label={`${company} 的企业标签`}>
      {visibleTags.map((tag) => {
        const presentation = companyTagPresentation[tag] || { tone: "default", icon: "sparkles" as const };
        const Icon = presentation.icon === "flame" ? Flame : Sparkles;
        return <li className={`company-signal company-signal--${presentation.tone}`} key={tag} title={tag}><Icon aria-hidden="true" size={12} strokeWidth={2} /><span>{tag}</span></li>;
      })}
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
  const { status: authStatus, requestLogin } = useAuth();
  const isAuthenticated = authStatus === "authenticated";
  const [opportunities, setOpportunities] = useState<CampusHiringOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("all");
  const [industry, setIndustry] = useState("all");
  const [cohort, setCohort] = useState("all");
  const [batch, setBatch] = useState("all");
  const [companyType, setCompanyType] = useState("all");
  const [quickFilter, setQuickFilter] = useState<OpportunityQuickFilter>("all");
  const [page, setPage] = useState(1);

  const load = (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    fetchCampusHiringFeed(signal)
      .then((result) => {
        void cacheCampusHiringFeed(result);
        setOpportunities(result.opportunities);
        setPage(1);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "无法载入校招信息");
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void readCachedCampusHiringFeed().then((cachedFeed) => {
      if (!active || !cachedFeed) return;
      setOpportunities(cachedFeed.opportunities);
      setLoading(false);
    });
    load(controller.signal);
    const timer = window.setInterval(() => load(), 10 * 60_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  const dashboard = useMemo(() => {
    const latestOpenAt = opportunities.reduce<string | undefined>((latest, opportunity) => {
      if (!opportunity.openAt) return latest;
      return !latest || opportunity.openAt > latest ? opportunity.openAt : latest;
    }, undefined);
    return {
      latestOpenAt,
      latestCount: latestOpenAt ? opportunities.filter((opportunity) => opportunity.openAt === latestOpenAt).length : 0,
      openCount: opportunities.filter((opportunity) => isOpenOpportunity(opportunity.status)).length,
      closingCount: opportunities.filter((opportunity) => opportunity.status === "closing").length,
      ongoingCount: opportunities.filter((opportunity) => opportunity.status === "ongoing").length
    };
  }, [opportunities]);

  const filterOptions = useMemo(() => ({
    cities: FEATURED_CITIES.filter((featuredCity) => opportunities.some((opportunity) =>
      opportunity.cities.some((location) => location.includes(featuredCity))
    )),
    industries: uniqueOptions(opportunities.flatMap((opportunity) =>
      (opportunity.industry || "").split(/[,，/]+/)
    )),
    cohorts: uniqueOptions(opportunities.flatMap((opportunity) => opportunity.graduationYears)),
    batches: uniqueOptions(opportunities.map((opportunity) => opportunity.batch)),
    companyTypes: uniqueOptions(opportunities.map((opportunity) => opportunity.companyType))
  }), [opportunities]);

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
        ...opportunity.roleTags,
        ...opportunity.companyTags
      ].filter(Boolean).join(" ").toLowerCase();
      const matchesQuery = !normalized || searchable.includes(normalized);
      const matchesCity = city === "all" || opportunity.cities.some((location) => location.includes(city));
      const matchesIndustry = industry === "all" || opportunity.industry?.includes(industry);
      const matchesCohort = cohort === "all" || opportunity.graduationYears.includes(cohort);
      const matchesBatch = batch === "all" || opportunity.batch === batch;
      const matchesCompanyType = companyType === "all" || opportunity.companyType === companyType;
      const matchesQuickFilter = quickFilter === "all"
        || (quickFilter === "latest" && opportunity.openAt === dashboard.latestOpenAt)
        || (quickFilter === "open" && isOpenOpportunity(opportunity.status))
        || (quickFilter === "closing" && opportunity.status === "closing")
        || (quickFilter === "ongoing" && opportunity.status === "ongoing");
      return matchesQuery
        && matchesCity
        && matchesIndustry
        && matchesCohort
        && matchesBatch
        && matchesCompanyType
        && matchesQuickFilter;
    }).sort((left, right) => {
      if (left.openAt === right.openAt) return 0;
      if (!left.openAt) return 1;
      if (!right.openAt) return -1;
      return right.openAt.localeCompare(left.openAt);
    });
  }, [batch, city, cohort, companyType, dashboard.latestOpenAt, industry, opportunities, query, quickFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageItems = paginationItems(currentPage, totalPages);
  const initialLoading = loading && opportunities.length === 0;
  const resultsAnnouncement = loading
    ? "正在刷新校招信息"
    : `找到 ${filtered.length.toLocaleString("zh-CN")} 条校招机会，当前第 ${currentPage} 页，共 ${totalPages} 页`;
  const activeFilterCount = [
    Boolean(query.trim()),
    city !== "all",
    industry !== "all",
    cohort !== "all",
    batch !== "all",
    companyType !== "all",
    quickFilter !== "all"
  ].filter(Boolean).length;

  const clearFilters = () => {
    setQuery("");
    setCity("all");
    setIndustry("all");
    setCohort("all");
    setBatch("all");
    setCompanyType("all");
    setQuickFilter("all");
    setPage(1);
  };

  const selectQuickFilter = (value: OpportunityQuickFilter) => {
    setQuickFilter(value);
    setPage(1);
  };

  const goToPage = (nextPage: number) => {
    const targetPage = Math.max(1, Math.min(nextPage, totalPages));
    if (opportunityPageRequiresLogin(targetPage, isAuthenticated)) {
      requestLogin("登录后即可查看第 4 页及后续校招信息。");
      return;
    }
    setPage(targetPage);
    document.getElementById("opportunity-results")?.scrollIntoView({ block: "start" });
  };

  return (
    <section className="data-page opportunities-page" aria-labelledby="opportunities-title">
      <header className="page-header opportunity-page-header">
        <div className="opportunity-page-heading">
          <nav className="application-breadcrumb" aria-label="页面位置">
            <a
              href="/app/chat"
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                navigate("/app/chat");
              }}
            ><House aria-hidden="true" size={13} />主页</a>
            <ChevronRight aria-hidden="true" size={13} />
            <span aria-current="page">校招机会</span>
          </nav>
          <h1 id="opportunities-title" tabIndex={-1}>校招信息速递</h1>
          <p>聚合公开校招信息、投递窗口与截止提醒，帮助你快速筛选值得关注的机会。</p>
        </div>

        <div className="opportunity-metrics" aria-label="校招数据概览">
          <article className="opportunity-metric opportunity-metric--latest">
            <span className="opportunity-metric__icon"><Sparkles aria-hidden="true" size={21} strokeWidth={1.8} /></span>
            <span><small>最新发布</small><strong>{dashboard.latestCount.toLocaleString("zh-CN")}</strong><em>{dashboard.latestOpenAt ? `${dateLabel(dashboard.latestOpenAt)} 开放` : "等待更新"}</em></span>
          </article>
          <article className="opportunity-metric opportunity-metric--open">
            <span className="opportunity-metric__icon"><BriefcaseBusiness aria-hidden="true" size={21} strokeWidth={1.8} /></span>
            <span><small>开放投递</small><strong>{dashboard.openCount.toLocaleString("zh-CN")}</strong><em>可继续投递</em></span>
          </article>
          <article className="opportunity-metric opportunity-metric--closing">
            <span className="opportunity-metric__icon"><AlarmClock aria-hidden="true" size={21} strokeWidth={1.8} /></span>
            <span><small>即将截止</small><strong>{dashboard.closingCount.toLocaleString("zh-CN")}</strong><em>3 天内截止</em></span>
          </article>
        </div>
      </header>

      <div className="opportunity-filter-panel">
        <div className="data-toolbar opportunity-toolbar" role="search" aria-label="筛选校招机会">
          <label className="search-control">
            <span className="sr-only">搜索校招信息</span>
            <Search aria-hidden="true" size={19} strokeWidth={1.7} />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="搜索公司、岗位、行业或城市"
              aria-controls="opportunity-results"
            />
          </label>
          <label className="select-control">
            <span className="sr-only">按城市筛选</span>
            <select value={city} onChange={(event) => { setCity(event.target.value); setPage(1); }} aria-controls="opportunity-results">
              <option value="all">城市</option>
              {filterOptions.cities.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <label className="select-control">
            <span className="sr-only">按企业性质筛选</span>
            <select value={companyType} onChange={(event) => { setCompanyType(event.target.value); setPage(1); }} aria-controls="opportunity-results">
              <option value="all">企业性质</option>
              {filterOptions.companyTypes.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <label className="select-control">
            <span className="sr-only">按行业筛选</span>
            <select value={industry} onChange={(event) => { setIndustry(event.target.value); setPage(1); }} aria-controls="opportunity-results">
              <option value="all">行业</option>
              {filterOptions.industries.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <label className="select-control">
            <span className="sr-only">按届别筛选</span>
            <select value={cohort} onChange={(event) => { setCohort(event.target.value); setPage(1); }} aria-controls="opportunity-results">
              <option value="all">全部届别</option>
              {filterOptions.cohorts.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <label className="select-control">
            <span className="sr-only">按招聘类型筛选</span>
            <select value={batch} onChange={(event) => { setBatch(event.target.value); setPage(1); }} aria-controls="opportunity-results">
              <option value="all">全部类型</option>
              {filterOptions.batches.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <div className="opportunity-filter-actions">
            <button className="opportunity-clear-button" type="button" onClick={clearFilters} disabled={activeFilterCount === 0}>
              <X aria-hidden="true" size={16} strokeWidth={1.9} />清空{activeFilterCount > 0 ? ` ${activeFilterCount}` : ""}
            </button>
            <button
              className="opportunity-refresh-button"
              type="button"
              onClick={() => load()}
              disabled={loading}
              aria-label="刷新校招信息"
            >
              <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" size={17} strokeWidth={1.9} />刷新
            </button>
          </div>
        </div>
      </div>

      <nav className="opportunity-quick-tabs" aria-label="按发布状态快速筛选">
        <button type="button" aria-pressed={quickFilter === "all"} onClick={() => selectQuickFilter("all")}>
          全部机会 <span>{opportunities.length.toLocaleString("zh-CN")}</span>
        </button>
        <button type="button" aria-pressed={quickFilter === "latest"} onClick={() => selectQuickFilter("latest")}>
          最新发布 <span>{dashboard.latestCount.toLocaleString("zh-CN")}</span>
        </button>
        <button type="button" aria-pressed={quickFilter === "open"} onClick={() => selectQuickFilter("open")}>
          开放投递 <span>{dashboard.openCount.toLocaleString("zh-CN")}</span>
        </button>
        <button type="button" aria-pressed={quickFilter === "closing"} onClick={() => selectQuickFilter("closing")}>
          即将截止 <span>{dashboard.closingCount.toLocaleString("zh-CN")}</span>
        </button>
        <button type="button" aria-pressed={quickFilter === "ongoing"} onClick={() => selectQuickFilter("ongoing")}>
          持续招聘 <span>{dashboard.ongoingCount.toLocaleString("zh-CN")}</span>
        </button>
      </nav>

      <p className="sr-only" role="status">{resultsAnnouncement}</p>
      {error && <div className="inline-alert" role="alert">{error}</div>}

      <div id="opportunity-results" className="opportunity-results" aria-busy={loading}>
        {initialLoading ? (
          <div className="opportunity-table-wrap">
            <div className="opportunity-skeleton" role="status">
              <span className="sr-only">正在读取最新校招信息…</span>
              <div className="opportunity-skeleton__head" aria-hidden="true">
                <span className="skel" /><span className="skel" /><span className="skel" /><span className="skel" /><span className="skel" />
              </div>
              {Array.from({ length: 7 }, (_item, index) => (
                <div className="opportunity-skeleton__row" key={index} aria-hidden="true">
                  <span className="skel opportunity-skeleton__wide" />
                  <span className="skel" />
                  <span className="skel" />
                  <span className="skel opportunity-skeleton__narrow" />
                  <span className="skel opportunity-skeleton__narrow" />
                </div>
              ))}
            </div>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="integration-empty">
            <span className="page-kicker">校招数据</span>
            <h2>暂时没有可展示的校招信息</h2>
            <p>暂时未获取到校招数据，请稍后刷新。</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="filter-empty">
            <Search aria-hidden="true" size={22} />
            <h2>没有匹配的校招信息</h2>
            <p>调整搜索词或筛选条件后再试。</p>
            <button type="button" onClick={clearFilters}>清除全部筛选</button>
          </div>
        ) : (
          <div className="opportunity-table-wrap">
            <table className="data-table opportunity-table">
              <caption className="sr-only">校招机会列表，共 {filtered.length.toLocaleString("zh-CN")} 条</caption>
              <colgroup>
                <col className="opportunity-col-company" />
                <col className="opportunity-col-type" />
                <col className="opportunity-col-industry" />
                <col className="opportunity-col-company-type" />
                <col className="opportunity-col-status" />
                <col className="opportunity-col-city" />
                <col className="opportunity-col-open-at" />
                <col className="opportunity-col-deadline" />
                <col className="opportunity-col-qcc" />
                <col className="opportunity-col-apply" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">公司与岗位</th>
                  <th scope="col">招聘类型</th>
                  <th scope="col">行业</th>
                  <th scope="col">企业性质</th>
                  <th scope="col">状态</th>
                  <th scope="col">城市</th>
                  <th scope="col">开放投递</th>
                  <th scope="col">截止时间</th>
                  <th scope="col">企查查</th>
                  <th scope="col">一键投递</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((opportunity) => {
                  const opportunityStatus = opportunity.status || "upcoming";
                  return (
                    <tr key={opportunity.id}>
                      <td className="opportunity-company-cell">
                        <div className="opportunity-company-heading"><strong title={opportunity.company}>{opportunity.company}</strong><CompanySignals company={opportunity.company} tags={opportunity.companyTags} /></div>
                        <span>{opportunity.graduationYears.join("、") || "届次不限"}</span>
                        <OpportunityTags company={opportunity.company} tags={opportunity.roleTags} />
                      </td>
                      <td><span className="opportunity-type-badge" title={opportunity.batch || "未分类"}>{opportunity.batch || "未分类"}</span></td>
                      <td><span className="industry-cell" title={opportunity.industry || "未提供"}>{opportunity.industry || "未提供"}</span></td>
                      <td><span className="company-type-cell" title={opportunity.companyType || "未注明"}>{opportunity.companyType || "未注明"}</span></td>
                      <td><span className={`status-badge status-badge--${opportunityStatus}`}>{statusLabels[opportunityStatus]}</span></td>
                      <td><span className="cell-icon"><MapPin aria-hidden="true" size={17} strokeWidth={1.7} /><span>{opportunity.cities.slice(0, 2).join("、") || "不限"}</span></span></td>
                      <td><span className="opportunity-open-at">{openAtLabel(opportunity.openAt)}</span></td>
                      <td><OpportunityDeadline opportunity={opportunity} /></td>
                      <td className="opportunity-qcc-cell">
                        <a
                          className="opportunity-qcc-action"
                          href={qccSearchUrl(opportunity.company)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`在企查查搜索 ${opportunity.company}（新标签页打开）`}
                        >
                          <span>查企业</span>
                        </a>
                      </td>
                      <td>
                        <a
                          className="table-action opportunity-table-action"
                          href={opportunity.officialUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`打开 ${opportunity.company} 的投递入口（新标签页打开）`}
                        >
                          <span>投递</span>
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
                          <div className="opportunity-card-heading"><h2>{opportunity.company}</h2><CompanySignals company={opportunity.company} tags={opportunity.companyTags} /></div>
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
                          <dd>{opportunity.industry || "未提供"}</dd>
                        </div>
                        <div>
                          <dt>企业性质</dt>
                          <dd><span className="company-type-cell">{opportunity.companyType || "未注明"}</span></dd>
                        </div>
                        <div>
                          <dt>城市</dt>
                          <dd><span className="cell-icon"><MapPin aria-hidden="true" size={17} strokeWidth={1.7} /><span>{opportunity.cities.slice(0, 2).join("、") || "不限"}</span></span></dd>
                        </div>
                        <div>
                          <dt>开放投递</dt>
                          <dd>{openAtLabel(opportunity.openAt)}</dd>
                        </div>
                        <div className="opportunity-card-deadline">
                          <dt>截止时间</dt>
                          <dd><OpportunityDeadline opportunity={opportunity} /></dd>
                        </div>
                      </dl>
                      <div className="opportunity-card-actions">
                        <a
                          className="opportunity-card-qcc-action"
                          href={qccSearchUrl(opportunity.company)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`在企查查搜索 ${opportunity.company}（新标签页打开）`}
                        >
                          查企业
                        </a>
                        <a
                          className="opportunity-card-action"
                          href={opportunity.officialUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`查看 ${opportunity.company} 官方招聘页（新标签页打开）`}
                        >
                          前往投递
                          <ArrowRight className="icon-directional" aria-hidden="true" size={18} strokeWidth={1.8} />
                        </a>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>

            {filtered.length > PAGE_SIZE && (
              <nav className="opportunity-pagination" aria-label="校招列表分页">
                <p className="opportunity-pagination__summary">
                  显示第 {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} 条，共 {filtered.length.toLocaleString("zh-CN")} 条
                </p>
                <div className="opportunity-pagination__controls">
                  <button
                    className="opportunity-pagination__direction"
                    type="button"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft aria-hidden="true" size={17} strokeWidth={2} />上一页
                  </button>
                  {pageItems.map((item) => item === "start-ellipsis" || item === "end-ellipsis" ? (
                    <span className="opportunity-pagination__ellipsis" aria-hidden="true" key={item}>…</span>
                  ) : (
                    <button
                      className="opportunity-pagination__page"
                      type="button"
                      key={item}
                      onClick={() => goToPage(item)}
                      aria-current={item === currentPage ? "page" : undefined}
                      aria-label={`第 ${item} 页`}
                    >
                      {item}
                    </button>
                  ))}
                  <button
                    className="opportunity-pagination__direction"
                    type="button"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    下一页<ChevronRight aria-hidden="true" size={17} strokeWidth={2} />
                  </button>
                </div>
              </nav>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
