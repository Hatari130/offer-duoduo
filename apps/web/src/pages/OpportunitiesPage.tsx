import { useEffect, useMemo, useState } from "react";
import type { OpportunityStatus, RecruitmentOpportunity } from "@offerflow/domain";
import {
  ArrowUpRight,
  CalendarClock,
  DatabaseZap,
  Filter,
  MapPin,
  RefreshCw,
  Search,
  Sparkles
} from "lucide-react";
import { api } from "../app/api";

const statusLabels: Record<OpportunityStatus, string> = {
  upcoming: "即将开始",
  open: "开放投递",
  closing: "即将截止",
  closed: "已截止",
  ongoing: "持续招聘"
};

function dateLabel(value?: string): string {
  if (!value) return "待公布";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

export function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<RecruitmentOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | OpportunityStatus>("all");
  const [updatedAt, setUpdatedAt] = useState<string>();

  const load = () => {
    setLoading(true);
    setError("");
    api.opportunities
      .list()
      .then((result) => {
        setOpportunities(result.opportunities);
        setUpdatedAt(result.fetchedAt);
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "无法载入校招信息"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return opportunities.filter((opportunity) => {
      const matchesQuery = !normalized || `${opportunity.company} ${opportunity.title} ${opportunity.cities.join(" ")} ${opportunity.roleTags.join(" ")}`.toLowerCase().includes(normalized);
      const matchesStatus = status === "all" || opportunity.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [opportunities, query, status]);

  return (
    <section className="data-page opportunities-page">
      <header className="page-header">
        <div>
          <span className="page-kicker"><Sparkles aria-hidden="true" size={14} />CAMPUS SIGNAL</span>
          <h1 tabIndex={-1}>校招信息速递</h1>
          <p>把分散的批次、岗位方向与截止时间整理成一张可行动的机会地图。</p>
        </div>
        <div className="page-header-meta">
          <span><i className="status-dot" />数据接口已就绪</span>
          <small>{updatedAt ? `最近检查 ${dateLabel(updatedAt)}` : "等待表格方案接入"}</small>
        </div>
      </header>

      <div className="data-toolbar">
        <label className="search-control">
          <span className="sr-only">搜索校招信息</span>
          <Search aria-hidden="true" size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、批次、岗位或城市" />
        </label>
        <label className="select-control">
          <Filter aria-hidden="true" size={16} />
          <span className="sr-only">按状态筛选</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="all">全部状态</option>
            {Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <button className="secondary-button" type="button" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" size={16} />刷新
        </button>
      </div>

      {error && <div className="inline-alert" role="alert">{error}</div>}

      {loading ? (
        <div className="data-loading" role="status"><span className="loading-orbit" />正在检查数据源…</div>
      ) : opportunities.length === 0 ? (
        <div className="integration-empty">
          <div className="integration-visual" aria-hidden="true">
            <span><DatabaseZap size={28} /></span><i /><i /><i />
          </div>
          <span className="page-kicker">WAITING FOR PLUGIN SYNC</span>
          <h2>等待浏览器插件推送数据</h2>
          <p>在 OfferDuoDuo 插件中打开一次「机会」（或等待后台自动同步），数据会自动出现在这里，每分钟自动刷新。</p>
          <div className="reserved-flow" aria-label="数据流">
            <span>飞书表格</span><b>→</b><span>插件自动同步</span><b>→</b><span>此页面</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="filter-empty"><Search aria-hidden="true" size={22} /><h2>没有匹配的校招信息</h2><p>调整关键词或清除状态筛选。</p><button type="button" onClick={() => { setQuery(""); setStatus("all"); }}>清除筛选</button></div>
      ) : (
        <div className="opportunity-table-wrap">
          <table className="data-table">
            <caption className="sr-only">校招机会列表</caption>
            <thead><tr><th>公司与批次</th><th>状态</th><th>城市</th><th>截止时间</th><th><span className="sr-only">操作</span></th></tr></thead>
            <tbody>
              {filtered.map((opportunity) => (
                <tr key={opportunity.id}>
                  <td><strong>{opportunity.company}</strong><span>{opportunity.title}{opportunity.batch ? ` · ${opportunity.batch}` : ""}</span><div className="tag-row">{opportunity.roleTags.slice(0, 3).map((tag) => <em key={tag}>{tag}</em>)}</div></td>
                  <td><span className={`status-badge status-badge--${opportunity.status || "upcoming"}`}>{statusLabels[opportunity.status || "upcoming"]}</span></td>
                  <td><span className="cell-icon"><MapPin aria-hidden="true" size={14} />{opportunity.cities.slice(0, 2).join("、") || "不限"}</span></td>
                  <td><span className="cell-icon"><CalendarClock aria-hidden="true" size={14} />{dateLabel(opportunity.deadline)}</span></td>
                  <td><a className="table-action" href={opportunity.officialUrl} target="_blank" rel="noreferrer" aria-label={`打开 ${opportunity.company} 官方招聘页`}><ArrowUpRight aria-hidden="true" size={17} /></a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
