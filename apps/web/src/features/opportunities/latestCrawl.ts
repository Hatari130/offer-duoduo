import type { CampusHiringOpportunity } from "./campusHiringFeed";

export function crawlDateKey(value?: string): string | undefined {
  const match = value?.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function latestCrawlDateKey(opportunities: CampusHiringOpportunity[]): string | undefined {
  return opportunities.reduce<string | undefined>((latest, opportunity) => {
    const crawledOn = crawlDateKey(opportunity.updatedAt);
    if (!crawledOn) return latest;
    return !latest || crawledOn > latest ? crawledOn : latest;
  }, undefined);
}
