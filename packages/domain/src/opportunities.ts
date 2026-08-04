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
