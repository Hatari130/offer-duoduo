import { useEffect, useMemo, useState } from "react";
import type { OpportunityStatus } from "@offerflow/domain";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CarFront,
  CheckCircle2,
  Cpu,
  Gamepad2,
  Globe2,
  HeartPulse,
  Landmark,
  RefreshCw,
  Search,
  ShoppingBag
} from "lucide-react";
import {
  companyDirectory,
  companyDirectoryCount,
  type CompanyCategoryId,
  type CompanyDirectoryEntry
} from "../features/opportunities/companyDirectory";
import { resolveCompanyBrandMark } from "../features/opportunities/companyBrandMarks";
import {
  fetchCampusHiringFeed,
  type CampusHiringOpportunity
} from "../features/opportunities/campusHiringFeed";

type VisibilityFilter = "all" | "open" | "inactive";

const categoryIcons = {
  internet: Globe2,
  finance: Landmark,
  consumer: ShoppingBag,
  hardware: Cpu,
  professional: BriefcaseBusiness,
  mobility: CarFront,
  healthcare: HeartPulse,
  entertainment: Gamepad2
} satisfies Record<CompanyCategoryId, typeof Globe2>;

const openStatuses = new Set<OpportunityStatus>(["open", "closing", "ongoing"]);
const statusPriority: Record<OpportunityStatus, number> = {
  closing: 4,
  open: 3,
  ongoing: 2,
  upcoming: 1,
  closed: 0
};

const statusLabels: Record<OpportunityStatus, string> = {
  upcoming: "即将开启",
  open: "开放投递",
  closing: "即将截止",
  closed: "暂未开放",
  ongoing: "持续招聘"
};

function normalizedCompanyName(value: string): string {
  return value.toLocaleLowerCase("zh-CN").replace(/[^\p{L}\p{N}]/gu, "");
}

function CompanyMark({ company }: { company: CompanyDirectoryEntry }) {
  const brand = resolveCompanyBrandMark(company.name);
  const markText = brand?.wordmark || company.shortName;
  const style = brand ? { "--company-brand": `#${brand.color}` } as React.CSSProperties : undefined;

  return (
    <span className={`company-direct-mark${brand?.icon ? " has-brand-icon" : " has-wordmark"}`} style={style} aria-hidden="true">
      {brand?.icon ? (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d={brand.icon.path} />
        </svg>
      ) : (
        <span>{markText}</span>
      )}
    </span>
  );
}

function opportunityForCompany(
  company: CompanyDirectoryEntry,
  opportunities: CampusHiringOpportunity[]
): CampusHiringOpportunity | undefined {
  const aliases = company.aliases.map(normalizedCompanyName);
  return opportunities
    .filter((opportunity) => {
      const candidate = normalizedCompanyName(opportunity.company);
      return aliases.some((alias) => candidate === alias || candidate.includes(alias) || alias.includes(candidate));
    })
    .sort((a, b) => statusPriority[b.status || "closed"] - statusPriority[a.status || "closed"])[0];
}

function updateLabel(value?: string): string {
  if (!value) return "更新时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function CompanyDirectoryPage() {
  const [opportunities, setOpportunities] = useState<CampusHiringOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");

  const load = (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    fetchCampusHiringFeed(signal)
      .then((result) => {
        setOpportunities(result.opportunities);
        setUpdatedAt(result.sourceUpdatedAt || result.fetchedAt);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "无法同步校招开放状态");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, []);

  const resolvedDirectory = useMemo(() => companyDirectory.map((category) => ({
    ...category,
    companies: category.companies.map((company) => {
      const opportunity = opportunityForCompany(company, opportunities);
      const status = opportunity?.status || "closed";
      return {
        ...company,
        opportunity,
        status,
        isOpen: Boolean(opportunity && openStatuses.has(status)),
        destination: opportunity && openStatuses.has(status) ? opportunity.officialUrl : company.careerUrl
      };
    })
  })), [opportunities]);

  const openCount = useMemo(() => resolvedDirectory.reduce(
    (total, category) => total + category.companies.filter((company) => company.isOpen).length,
    0
  ), [resolvedDirectory]);

  const visibleCategories = useMemo(() => {
    const needle = normalizedCompanyName(query.trim());
    return resolvedDirectory.map((category) => ({
      ...category,
      companies: category.companies.filter((company) => {
        const matchesQuery = !needle || company.aliases.some((alias) => normalizedCompanyName(alias).includes(needle));
        const matchesVisibility = visibility === "all"
          || (visibility === "open" && company.isOpen)
          || (visibility === "inactive" && !company.isOpen);
        return matchesQuery && matchesVisibility;
      })
    })).filter((category) => category.companies.length > 0);
  }, [query, resolvedDirectory, visibility]);

  const visibleCount = visibleCategories.reduce((total, category) => total + category.companies.length, 0);

  return (
    <section className="company-directory-page" aria-labelledby="company-directory-title">
      <header className="company-directory-hero">
        <div>
          <span className="page-kicker"><Building2 aria-hidden="true" size={16} strokeWidth={2} />公司直达</span>
          <h1 id="company-directory-title" tabIndex={-1}>公司投递一键直达</h1>
          <p>按行业找到目标公司，招聘中的入口已点亮；暂未开放的公司保持灰度，开放状态来自校招实时数据。</p>
        </div>
        <div className="company-directory-summary" aria-live="polite">
          <div><strong>{loading ? "—" : openCount}</strong><span>正在招聘</span></div>
          <div><strong>{companyDirectoryCount}</strong><span>收录公司</span></div>
          <button type="button" onClick={() => load()} disabled={loading} aria-label="刷新公司开放状态">
            <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" size={17} />
            <span>{loading ? "同步中" : "刷新状态"}</span>
          </button>
        </div>
      </header>

      <div className="company-directory-toolbar">
        <label className="company-directory-search">
          <span className="sr-only">搜索公司</span>
          <Search aria-hidden="true" size={18} strokeWidth={1.8} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索公司名称"
            aria-controls="company-directory-results"
          />
        </label>
        <div className="company-visibility-filter" aria-label="按开放状态筛选">
          {([
            ["all", "全部"],
            ["open", `招聘中 ${loading ? "" : openCount}`],
            ["inactive", "暂未开放"]
          ] as Array<[VisibilityFilter, string]>).map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={visibility === value}
              onClick={() => setVisibility(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="company-directory-updated">
          <i className={error ? "is-error" : ""} aria-hidden="true" />
          {error || (loading ? "正在同步实时状态" : `更新于 ${updateLabel(updatedAt)}`)}
        </span>
      </div>

      <div id="company-directory-results" className="company-category-list">
        {visibleCategories.map((category) => {
          const CategoryIcon = categoryIcons[category.id];
          const categoryOpenCount = category.companies.filter((company) => company.isOpen).length;
          return (
            <section className="company-category" key={category.id} aria-labelledby={`company-category-${category.id}`}>
              <header>
                <span className={`company-category-icon company-category-icon--${category.id}`} aria-hidden="true">
                  <CategoryIcon size={19} strokeWidth={1.8} />
                </span>
                <div>
                  <h2 id={`company-category-${category.id}`}>{category.label}</h2>
                  <p>{category.description}</p>
                </div>
                <span>{categoryOpenCount} 家招聘中</span>
              </header>
              <div className="company-card-grid">
                {category.companies.map((company) => (
                  <a
                    className={`company-direct-card${company.isOpen ? " is-open" : " is-inactive"}`}
                    href={company.destination}
                    target="_blank"
                    rel="noreferrer"
                    key={company.name}
                    aria-label={`${company.name}，${company.isOpen ? statusLabels[company.status] : "暂未开放"}，打开官方招聘网站`}
                  >
                    <CompanyMark company={company} />
                    <span className="company-direct-copy">
                      <strong>{company.name}</strong>
                      <small>
                        {company.isOpen && <CheckCircle2 aria-hidden="true" size={13} />}
                        {company.isOpen ? statusLabels[company.status] : "暂未开放"}
                      </small>
                    </span>
                    <ArrowUpRight className="company-direct-arrow" aria-hidden="true" size={17} strokeWidth={1.8} />
                  </a>
                ))}
              </div>
            </section>
          );
        })}

        {visibleCount === 0 && (
          <div className="company-directory-empty" role="status">
            <Search aria-hidden="true" size={24} />
            <strong>没有找到匹配公司</strong>
            <p>换一个关键词，或切回“全部”查看完整公司目录。</p>
          </div>
        )}
      </div>
    </section>
  );
}
