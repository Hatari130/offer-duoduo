import {
  PUBLIC_OPPORTUNITY_PAGE_LIMIT,
  opportunityPageRequiresLogin
} from "./paginationAccess.ts";

export type OpportunityQuickFilter = "all" | "latest" | "closing";

export interface OpportunityUrlState {
  page: number;
  query: string;
  city: string;
  industry: string;
  cohort: string;
  batch: string;
  companyType: string;
  quickFilter: OpportunityQuickFilter;
  requiresAuthLogin?: boolean;
}

export const DEFAULT_OPPORTUNITY_URL_STATE: Readonly<OpportunityUrlState> = Object.freeze({
  page: 1,
  query: "",
  city: "all",
  industry: "all",
  cohort: "all",
  batch: "all",
  companyType: "all",
  quickFilter: "all",
  requiresAuthLogin: false
});

export function parseOpportunityUrlState(
  search: string,
  isAuthenticated = false
): OpportunityUrlState {
  const params = new URLSearchParams(search);
  const rawPage = parseInt(params.get("page") || "1", 10);
  const parsedPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const requiresAuth = opportunityPageRequiresLogin(parsedPage, isAuthenticated);
  const page = requiresAuth ? PUBLIC_OPPORTUNITY_PAGE_LIMIT : parsedPage;

  const rawQuickFilter = params.get("quickFilter") || params.get("quick") || "all";
  const quickFilter: OpportunityQuickFilter =
    rawQuickFilter === "latest" || rawQuickFilter === "closing" ? rawQuickFilter : "all";

  return {
    page,
    query: (params.get("q") ?? params.get("query") ?? "").trim(),
    city: params.get("city") || "all",
    industry: params.get("industry") || "all",
    cohort: params.get("cohort") || "all",
    batch: params.get("batch") || "all",
    companyType: params.get("companyType") || "all",
    quickFilter,
    requiresAuthLogin: requiresAuth
  };
}

export function buildOpportunitySearchString(
  state: Partial<OpportunityUrlState>
): string {
  const params = new URLSearchParams();

  if (state.query && state.query.trim()) {
    params.set("q", state.query.trim());
  }
  if (state.city && state.city !== "all") {
    params.set("city", state.city);
  }
  if (state.industry && state.industry !== "all") {
    params.set("industry", state.industry);
  }
  if (state.cohort && state.cohort !== "all") {
    params.set("cohort", state.cohort);
  }
  if (state.batch && state.batch !== "all") {
    params.set("batch", state.batch);
  }
  if (state.companyType && state.companyType !== "all") {
    params.set("companyType", state.companyType);
  }
  if (state.quickFilter && state.quickFilter !== "all") {
    params.set("quickFilter", state.quickFilter);
  }
  if (state.page && state.page > 1) {
    params.set("page", String(state.page));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}
