import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  ExternalLink,
  Flame,
  Megaphone,
  RefreshCw,
  Search,
  Settings2,
  Sparkles
} from "lucide-react";
import { openWebWorkspace } from "../workspace/openWebWorkspace";
import { opportunityStatus } from "./opportunities";
import type {
  OpportunityFeedSnapshot,
  OpportunityStatus,
  RecruitmentOpportunity
} from "@/shared/types";

const STATUS_LABELS: Record<OpportunityStatus, string> = {
  upcoming: "即将开放",
  open: "正在招聘",
  closing: "即将截止",
  closed: "已结束",
  ongoing: "长期招聘"
};

const STATUS_ORDER: OpportunityStatus[] = ["closing", "open", "ongoing", "upcoming", "closed"];

function shortDate(value?: string) {
  const match = value?.match(/\d{4}-(\d{1,2})-(\d{1,2})/);
  if (!match) return "";
  const [, month, day] = match;
  return `${Number(month)}月${Number(day)}日`;
}

/**
 * 智能提纯标签：过滤掉与公司、标题、批次完全重复的冗余文本，只保留最具辨识度的高价值标签（如届次、城市）
 */
function getCleanTags(opportunity: RecruitmentOpportunity): string[] {
  const titleLower = opportunity.title.toLowerCase();
  const companyLower = opportunity.company.toLowerCase();
  const batchLower = (opportunity.batch || "").toLowerCase();

  const rawList = [
    ...opportunity.graduationYears,
    ...opportunity.cities,
    ...opportunity.roleTags
  ];

  const result: string[] = [];
  for (const item of rawList) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();

    // 过滤与批次、公司完全重复的文本
    if (batchLower && (batchLower.includes(lower) || lower.includes(batchLower))) continue;
    if (companyLower && (companyLower.includes(lower) || lower.includes(companyLower))) continue;

    // 过滤与标题完全一致、或标题中已显著包含的岗位名称
    if (titleLower === lower) continue;
    if (lower.length >= 4 && titleLower.includes(lower)) continue;

    // 避免同名标签重复出现
    if (result.some((existing) => existing.toLowerCase() === lower)) continue;

    result.push(trimmed);
    if (result.length >= 3) break; // 侧边栏紧凑空间最多保留 3 个关键标签
  }
  return result;
}

export default function OpportunityView({
  snapshot,
  loading,
  error,
  configured,
  onOpen,
  onRefresh,
  onConfigure
}: {
  snapshot: OpportunityFeedSnapshot;
  loading: boolean;
  error?: string;
  configured: boolean;
  onOpen: (opportunity: RecruitmentOpportunity) => void;
  onRefresh: () => void;
  onConfigure: () => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "closing" | "open">("all");

  const counts = useMemo(() => {
    let closingCount = 0;
    let openCount = 0;
    for (const opp of snapshot.opportunities) {
      const st = opportunityStatus(opp);
      if (st === "closing") closingCount += 1;
      else if (st === "open" || st === "ongoing") openCount += 1;
    }
    return {
      all: snapshot.opportunities.length,
      closing: closingCount,
      open: openCount
    };
  }, [snapshot.opportunities]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return [...snapshot.opportunities]
      .filter((opportunity) => {
        const st = opportunityStatus(opportunity);
        if (statusFilter === "closing" && st !== "closing") return false;
        if (statusFilter === "open" && st !== "open" && st !== "ongoing") return false;

        if (!keyword) return true;
        return [
          opportunity.company,
          opportunity.title,
          opportunity.batch,
          ...opportunity.cities,
          ...opportunity.roleTags,
          ...opportunity.graduationYears
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(keyword));
      })
      .sort((left, right) => {
        const statusDifference =
          STATUS_ORDER.indexOf(opportunityStatus(left)) -
          STATUS_ORDER.indexOf(opportunityStatus(right));
        if (statusDifference) return statusDifference;
        return (right.openAt || right.updatedAt || "").localeCompare(
          left.openAt || left.updatedAt || ""
        );
      });
  }, [snapshot.opportunities, query, statusFilter]);

  const handleOpenWebOpportunities = () => {
    openWebWorkspace("/app/opportunities");
  };

  return (
    <section className="overlay-page opportunity-page">
      {/* 顶部标题区 */}
      <div className="overlay-page-title opportunity-title">
        <span className="overlay-section-icon"><Megaphone size={18} /></span>
        <div>
          <h1>机会</h1>
          <p>精选校招直达 · 实时同步</p>
        </div>
        <button
          className={`opportunity-refresh ${loading ? "loading" : ""}`}
          onClick={onRefresh}
          disabled={loading}
          aria-label="刷新机会"
          title="刷新最新数据"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Web 工作台导流引导横幅 */}
      <div
        className="opportunity-web-banner"
        onClick={handleOpenWebOpportunities}
        role="button"
        tabIndex={0}
        title="点击在新标签页打开 Web 端校招工作台"
      >
        <div className="opportunity-web-banner-icon">
          <Sparkles size={16} />
        </div>
        <div className="opportunity-web-banner-info">
          <div className="opportunity-web-banner-title">
            <strong>校招信息速递 · Web 工作台</strong>
            <span className="opportunity-web-banner-badge">全量数据</span>
          </div>
          <p>支持 37+ 城市热力筛选、多维岗位透视与深度搜索</p>
        </div>
        <span className="opportunity-web-banner-cta">
          打开 <ArrowRight size={13} />
        </span>
      </div>

      {/* 搜索与轻量筛选区 */}
      <div className="opportunity-discovery-controls">
        <div className="opportunity-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索公司、批次、城市或方向"
          />
        </div>

        <div className="opportunity-chips" role="tablist" aria-label="快捷状态筛选">
          <button
            type="button"
            className={`opportunity-chip ${statusFilter === "all" ? "active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            全部 <small>{counts.all}</small>
          </button>
          <button
            type="button"
            className={`opportunity-chip ${statusFilter === "closing" ? "active is-urgent" : ""}`}
            onClick={() => setStatusFilter("closing")}
          >
            <Flame size={12} /> 即将截止 <small>{counts.closing}</small>
          </button>
          <button
            type="button"
            className={`opportunity-chip ${statusFilter === "open" ? "active" : ""}`}
            onClick={() => setStatusFilter("open")}
          >
            正在招聘 <small>{counts.open}</small>
          </button>
        </div>
      </div>

      {error && (
        <div className="opportunity-error">
          <strong>数据源暂时不可用</strong>
          <span>{error}</span>
          <button onClick={onConfigure}>检查数据源</button>
        </div>
      )}

      {/* 紧凑极简机会列表 */}
      <div className="opportunity-list">
        {visible.map((opportunity) => {
          const status = opportunityStatus(opportunity);
          const tags = getCleanTags(opportunity);
          const isClosed = status === "closed";

          return (
            <article
              className={`opportunity-card opportunity-card--${status}`}
              key={opportunity.id}
              onClick={() => onOpen(opportunity)}
              role="button"
              tabIndex={0}
              title={`点击在新标签页打开 ${opportunity.company} 招聘官网`}
            >
              <div className="opportunity-card-topline">
                <div className="opportunity-card-company-wrap">
                  <strong className="opportunity-card-company">{opportunity.company}</strong>
                  <span className="opportunity-card-batch">
                    {opportunity.batch || "校园招聘"}
                  </span>
                </div>
                <span className={`opportunity-status-pill opportunity-status-pill--${status}`}>
                  {status === "closing" && <Flame size={10} />}
                  {STATUS_LABELS[status]}
                </span>
              </div>

              <h2 className="opportunity-card-title" title={opportunity.title}>
                {opportunity.title}
              </h2>

              <div className="opportunity-card-bottom">
                <div className="opportunity-card-meta-left">
                  {status === "upcoming" && opportunity.openAt ? (
                    <span className="opportunity-card-date">
                      <CalendarClock size={12} />
                      {shortDate(opportunity.openAt)} 开放
                    </span>
                  ) : opportunity.deadline ? (
                    <span className={`opportunity-card-date ${status === "closing" ? "is-urgent" : ""}`}>
                      <CalendarClock size={12} />
                      {shortDate(opportunity.deadline)} 截止
                    </span>
                  ) : null}

                  {tags.map((tag) => (
                    <span className="opportunity-card-tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="opportunity-card-action">
                  <button
                    type="button"
                    className="opportunity-apply-link"
                    disabled={isClosed}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(opportunity);
                    }}
                  >
                    {isClosed ? "已结束" : "投递"}
                    {!isClosed && <ExternalLink size={12} />}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* 空状态 */}
      {!visible.length && !loading && !error && (
        <div className="opportunity-empty">
          <span><Megaphone size={22} /></span>
          <strong>
            {snapshot.opportunities.length
              ? "没有符合当前筛选条件的机会"
              : configured
                ? "当前数据源暂时没有机会"
                : "还没有接入校招机会"}
          </strong>
          <p>
            {snapshot.opportunities.length
              ? "可以切换到“全部”标签或清除搜索词重试。"
              : "可在设置中查看公开 JSON 地址，或前往 Web 工作台查看全量校招。"}
          </p>
          <div className="opportunity-empty-actions">
            {statusFilter !== "all" && (
              <button onClick={() => setStatusFilter("all")}>查看全部</button>
            )}
            <button className="primary" onClick={handleOpenWebOpportunities}>
              前往网页版 <ExternalLink size={13} />
            </button>
          </div>
        </div>
      )}

      {/* 底部引导与同步信息 */}
      {visible.length > 0 && (
        <footer className="opportunity-footnote">
          <button
            type="button"
            className="opportunity-footer-web-link"
            onClick={handleOpenWebOpportunities}
          >
            <span>在 Web 工作台查看更多机会与城市筛选</span>
            <ArrowRight size={13} />
          </button>
          {snapshot.fetchedAt && (
            <div className="opportunity-footer-synctime">
              最近同步：{new Date(snapshot.fetchedAt).toLocaleString("zh-CN", { hour12: false })}
            </div>
          )}
        </footer>
      )}
    </section>
  );
}
