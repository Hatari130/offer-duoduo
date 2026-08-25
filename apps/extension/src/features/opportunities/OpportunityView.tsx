import { useMemo, useState } from "react";
import {
  CalendarClock,
  ExternalLink,
  Megaphone,
  RefreshCw,
  Search,
  Settings2
} from "lucide-react";
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

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return [...snapshot.opportunities]
      .filter((opportunity) => {
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
  }, [snapshot.opportunities, query]);

  return (
    <section className="overlay-page opportunity-page">
      <div className="opportunity-discovery-controls">
        <div className="opportunity-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索公司、批次、城市或岗位方向"
          />
        </div>
      </div>

      <div className="overlay-page-title opportunity-title">
        <span className="overlay-section-icon"><Megaphone size={18} /></span>
        <div><h1>机会</h1></div>
        <button
          className={`opportunity-refresh ${loading ? "loading" : ""}`}
          onClick={onRefresh}
          disabled={loading}
          aria-label="刷新机会"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {error && (
        <div className="opportunity-error">
          <strong>数据源暂时不可用</strong>
          <span>{error}</span>
          <button onClick={onConfigure}>检查数据源</button>
        </div>
      )}

      <div className="opportunity-list">
        {visible.map((opportunity) => {
          const status = opportunityStatus(opportunity);
          const tags = [
            ...opportunity.graduationYears,
            ...opportunity.roleTags,
            ...opportunity.cities
          ].slice(0, 4);
          return (
            <article className={`opportunity-card opportunity-card--${status}`} key={opportunity.id}>
              <div className="opportunity-card-topline">
                <span>
                  <strong>{opportunity.company}</strong>
                  <small>{opportunity.batch || "校园招聘"}</small>
                </span>
                <em>{STATUS_LABELS[status]}</em>
              </div>
              <h2 title={opportunity.title}>{opportunity.title}</h2>
              {tags.length > 0 && (
                <div className="opportunity-tags">
                  {tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              )}
              <div className="opportunity-card-meta">
                <span>
                  <CalendarClock size={13} />
                  {status === "upcoming" && opportunity.openAt
                    ? `${shortDate(opportunity.openAt)} 开放`
                    : opportunity.deadline
                      ? `${shortDate(opportunity.deadline)} 截止`
                      : "长期有效"}
                </span>
                <small>
                  {opportunity.verifiedAt
                    ? `核验于 ${shortDate(opportunity.verifiedAt)}`
                    : opportunity.sourceName || "外部数据源"}
                </small>
              </div>
              <div className="opportunity-card-actions">
                {opportunity.sourceUrl && (
                  <button onClick={() => window.open(opportunity.sourceUrl, "_blank", "noopener,noreferrer")}>
                    查看来源
                  </button>
                )}
                <button
                  className="primary"
                  onClick={() => onOpen(opportunity)}
                  disabled={status === "closed"}
                >
                  {status === "closed" ? "已结束" : "打开招聘官网"}
                  {status !== "closed" && <ExternalLink size={14} />}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {!visible.length && !loading && !error && (
        <div className="opportunity-empty">
          <span><Megaphone size={22} /></span>
          <strong>
            {snapshot.opportunities.length
              ? "没有符合当前条件的机会"
              : configured
                ? "当前数据源暂时没有机会"
                : "还没有接入校招机会"}
          </strong>
          <p>
            {snapshot.opportunities.length
              ? "清除搜索或切换到“全部”继续查看。"
              : configured
                ? "可以刷新数据，或到设置中检查公开 JSON 地址。"
                : "配置一份公开 JSON 数据源后，所有开放信息会在这里统一出现。"}
          </p>
          <button onClick={onConfigure}><Settings2 size={15} />配置数据源</button>
        </div>
      )}

      {snapshot.fetchedAt && (
        <footer className="opportunity-footnote">
          最近同步：{new Date(snapshot.fetchedAt).toLocaleString("zh-CN", { hour12: false })}
        </footer>
      )}
    </section>
  );
}
