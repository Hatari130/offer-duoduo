export type OpportunityStatus = "upcoming" | "open" | "closing" | "closed" | "ongoing";

export interface RecruitmentOpportunity {
  id: string;
  company: string;
  title: string;
  batch?: string;
  status?: OpportunityStatus;
  openAt?: string;
  deadline?: string;
  graduationYears: string[];
  roleTags: string[];
  cities: string[];
  officialUrl: string;
  sourceUrl?: string;
  sourceName?: string;
  verifiedAt?: string;
  updatedAt?: string;
}

export interface OpportunityFeedSnapshot {
  opportunities: RecruitmentOpportunity[];
  fetchedAt?: string;
  sourceUpdatedAt?: string;
  sourceUrl?: string;
}

/**
 * Derive the effective recruitment status from explicit sheet values plus the
 * current date. A closing deadline is any deadline within the next three days;
 * past deadlines are treated as closed. Used by the extension, the API and the
 * web client so all surfaces agree on the same labels.
 */
export function opportunityStatus(
  opportunity: RecruitmentOpportunity,
  now: Date = new Date()
): OpportunityStatus {
  const today = new Date(now);
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const soon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
  const soonKey = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;

  if (opportunity.status === "closed") return "closed";
  if (opportunity.openAt && opportunity.openAt > todayKey) return "upcoming";
  if (opportunity.deadline && opportunity.deadline < todayKey) return "closed";
  if (opportunity.deadline && opportunity.deadline <= soonKey) return "closing";
  if (opportunity.status === "upcoming") return "upcoming";
  if (opportunity.status === "closing") return "closing";
  if (opportunity.status === "open") return "open";
  if (opportunity.status === "ongoing") return "ongoing";
  if (!opportunity.openAt && !opportunity.deadline) return "ongoing";
  return "open";
}
