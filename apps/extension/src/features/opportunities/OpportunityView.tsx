import { useMemo, useState } from "react";
import {
  CalendarClock,
  Clock3,
  ExternalLink,
  Megaphone,
  RefreshCw,
  Search,
  Settings2
} from "lucide-react";
import CompanyLogo from "./CompanyLogo";
import {
  opportunityDisplayTitle,
  opportunityStatus,
  type OpportunityUpdateMeta
} from "./opportunities";
import type {
  OpportunityFeedSnapshot,
  OpportunityStatus,
  RecruitmentOpportunity
} from "@/shared/types";

const STATUS_LABELS: Record<OpportunityStatus, string> = {
  upcoming: "",
  open: "正在招聘",
  closing: "即将截止",
  closed: "已结束",
  ongoing: "长期招聘"
};

const STATUS_ORDER: OpportunityStatus[] = ["closing", "open", "ongoing", "upcoming", "closed"];
const FILTER_STATUSES: Array<Exclude<OpportunityStatus, "upcoming">> = [
  "closing",
  "open",
  "ongoing",
  "closed"
];

function shortDate(value?: string) {
  const match = value?.match(/\d{4}-(\d{1,2})-(\d{1,2})/);
  if (!match) return "";
  const [, month, day] = match;
  return `${Number(month)}月${Number(day)}日`;
}

function syncTime(value?: string) {
  if (!value) return "尚未同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function batchTone(value: string) {
  if (/秋招|秋季/.test(value)) return "autumn";
  if (/春招|春季/.test(value)) return "spring";
  if (/提前批/.test(value)) return "early";
  if (/实习/.test(value)) return "intern";
  return "batch";
}

export default function OpportunityView({
  snapshot,
  loading,
  error,
  configured,
  updateMeta,
  onOpen,
  onRefresh,
  onConfigure
}: {
  snapshot: OpportunityFeedSnapshot;
  loading: boolean;
  error?: string;
  configured: boolean;
  updateMeta: OpportunityUpdateMeta;
  onOpen: (opportunity: RecruitmentOpportunity) => void;
  onRefresh: () => void;
  onConfigure: () => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | Exclude<OpportunityStatus, "upcoming">
  >("all");

  const counts = useMemo(() => {
    const result = new Map<OpportunityStatus, number>();
    for (const opportunity of snapshot.opportunities) {
      const status = opportunityStatus(opportunity);
      result.set(status, (result.get(status) || 0) + 1);
    }
    return result;
  }, [snapshot.opportunities]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return [...snapshot.opportunities]
      .filter((opportunity) => {
        const status = opportunityStatus(opportunity);
        if (statusFilter !== "all" && status !== statusFilter) return false;
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

  return (
    <section className="overlay-page opportunity-page">
      <div className="overlay-page-title opportunity-title">
        <span className="overlay-section-icon"><Megaphone size={18} /></span>
        <div>
          <h1>机会</h1>
          <p>全部校招入口，不替你筛掉任何公司</p>
        </div>
        <button
          className={`opportunity-refresh ${loading ? "loading" : ""}`}
          onClick={onRefresh}
          disabled={loading}
          aria-label="刷新机会"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="opportunity-search">
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索公司、批次、城市或岗位方向"
        />
      </div>

      <div className="opportunity-filters" role="tablist" aria-label="招聘状态">
        <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>
          全部 <small>{snapshot.opportunities.length}</small>
        </button>
        {FILTER_STATUSES.map((status) => (
          <button
            className={statusFilter === status ? "active" : ""}
            key={status}
            onClick={() => setStatusFilter(status)}
          >
            {STATUS_LABELS[status]} <small>{counts.get(status) || 0}</small>
          </button>
        ))}
      </div>

      <div className="opportunity-sync-status">
        <span><i />每 5 分钟自动同步</span>
        <time>最近同步 {syncTime(updateMeta.lastSyncedAt || snapshot.fetchedAt)}</time>
        {(updateMeta.addedCount > 0 || updateMeta.updatedCount > 0 || updateMeta.removedCount > 0) && (
          <strong>
            {updateMeta.addedCount > 0 ? `新增 ${updateMeta.addedCount}` : ""}
            {updateMeta.updatedCount > 0 ? `${updateMeta.addedCount > 0 ? " · " : ""}更新 ${updateMeta.updatedCount}` : ""}
            {updateMeta.removedCount > 0 ? `${updateMeta.addedCount + updateMeta.updatedCount > 0 ? " · " : ""}下线 ${updateMeta.removedCount}` : ""}
          </strong>
        )}
      </div>

      {error && (
        <div className="opportunity-error">
          <strong>
            {snapshot.opportunities.length
              ? `本次同步失败，已保留 ${snapshot.opportunities.length} 条缓存`
              : "数据源暂时不可用"}
          </strong>
          <span>{error}</span>
          <button onClick={onConfigure}>检查数据源</button>
        </div>
      )}

      <div className="opportunity-list">
        {visible.map((opportunity) => {
          const status = opportunityStatus(opportunity);
          const tags = [
            ...(opportunity.batch
              ? [{ value: opportunity.batch, kind: batchTone(opportunity.batch) }]
              : []),
            ...opportunity.graduationYears.map((value) => ({ value, kind: "year" })),
            ...opportunity.roleTags.map((value) => ({ value, kind: "role" })),
            ...opportunity.cities.map((value) => ({ value, kind: "city" }))
          ]
            .filter(
              (tag, index, items) => items.findIndex((item) => item.value === tag.value) === index
            )
            .slice(0, 6);
          return (
            <article className={`opportunity-card opportunity-card--${status}`} key={opportunity.id}>
              <div className="opportunity-card-topline">
                <CompanyLogo company={opportunity.company} />
                <span>
                  <strong>{opportunity.company}</strong>
                  <small>{opportunity.sourceName?.replace(/^飞书表格\s*·\s*/, "") || "校园招聘"}</small>
                </span>
                {status !== "upcoming" && <em>{STATUS_LABELS[status]}</em>}
              </div>
              <h2 title={opportunity.title}>{opportunityDisplayTitle(opportunity)}</h2>
              {tags.length > 0 && (
                <div className="opportunity-tags">
                  {tags.map((tag) => (
                    <span className={`opportunity-tag--${tag.kind}`} key={`${tag.kind}-${tag.value}`}>
                      {tag.value}
                    </span>
                  ))}
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
                <small className="opportunity-card-updated">
                  <Clock3 size={12} />
                  {opportunity.updatedAt
                    ? `数据更新 ${shortDate(opportunity.updatedAt)}`
                    : opportunity.verifiedAt
                      ? `核验 ${shortDate(opportunity.verifiedAt)}`
                      : `同步 ${syncTime(snapshot.fetchedAt)}`}
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
          飞书更新后将在下一次自动同步中出现 · 最近同步 {syncTime(snapshot.fetchedAt)}
        </footer>
      )}
    </section>
  );
}
