import type { ChatConversation } from "@offerflow/domain";

export interface ConversationGroup {
  key: string;
  label: string;
  conversations: ChatConversation[];
}

const BUCKETS = [
  { key: "today", label: "今天", maxDays: 0 },
  { key: "yesterday", label: "昨天", maxDays: 1 },
  { key: "week", label: "7 天内", maxDays: 6 },
  { key: "month", label: "30 天内", maxDays: 29 },
  { key: "earlier", label: "更早", maxDays: Number.POSITIVE_INFINITY }
] as const;

function calendarDaysAgo(value: string, now: number): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  const today = new Date(now);
  const then = new Date(timestamp);
  const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.max(0, Math.round((startOf(today) - startOf(then)) / 86_400_000));
}

/** Pinned first, then calendar buckets like ChatGPT/Claude: 今天, 昨天, 7 天内, 30 天内, 更早. Empty groups are dropped. */
export function groupConversations(
  conversations: ChatConversation[],
  pinnedIds: ReadonlySet<string>,
  now: number
): ConversationGroup[] {
  const newestFirst = [...conversations].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const groups: ConversationGroup[] = [{ key: "pinned", label: "置顶", conversations: [] }];
  for (const bucket of BUCKETS) groups.push({ key: bucket.key, label: bucket.label, conversations: [] });
  for (const conversation of newestFirst) {
    if (pinnedIds.has(conversation.id)) {
      groups[0].conversations.push(conversation);
      continue;
    }
    const days = calendarDaysAgo(conversation.updatedAt, now);
    const index = BUCKETS.findIndex((bucket) => days <= bucket.maxDays);
    groups[index + 1].conversations.push(conversation);
  }
  return groups.filter((group) => group.conversations.length > 0);
}

export function searchTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export interface ConversationMatch {
  conversation: ChatConversation;
  /** A window of the last message around the first hit, when the hit is not in the title. */
  snippet?: string;
}

/** Every term must appear in the title or the last message; title hits rank first, then recency. */
export function searchConversations(conversations: ChatConversation[], query: string): ConversationMatch[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  return conversations
    .map((conversation) => {
      const title = conversation.title.toLowerCase();
      const preview = (conversation.lastMessagePreview || "").replace(/\s+/g, " ").trim();
      const haystack = `${title} ${preview.toLowerCase()}`;
      if (!terms.every((term) => haystack.includes(term))) return undefined;
      const titleHits = terms.filter((term) => title.includes(term)).length;
      const firstPreviewHit = terms
        .map((term) => preview.toLowerCase().indexOf(term))
        .filter((index) => index >= 0)
        .sort((a, b) => a - b)[0];
      let snippet: string | undefined;
      if (firstPreviewHit !== undefined && titleHits < terms.length) {
        const start = Math.max(0, firstPreviewHit - 16);
        snippet = `${start > 0 ? "…" : ""}${preview.slice(start, start + 64)}${start + 64 < preview.length ? "…" : ""}`;
      }
      return { conversation, snippet, titleHits };
    })
    .filter((match): match is NonNullable<typeof match> => Boolean(match))
    .sort((a, b) => b.titleHits - a.titleHits || Date.parse(b.conversation.updatedAt) - Date.parse(a.conversation.updatedAt))
    .map(({ conversation, snippet }) => ({ conversation, snippet }));
}

/** Splits text into plain and matched parts so the UI can wrap hits in <mark>. */
export function highlightParts(text: string, terms: string[]): Array<{ text: string; hit: boolean }> {
  if (terms.length === 0) return [{ text, hit: false }];
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.split(pattern).filter(Boolean).map((part) => ({ text: part, hit: terms.includes(part.toLowerCase()) }));
}

/** "刚刚" / "今天" / "昨天" / "3天前" / "9月3日" for a conversation's last activity. */
export function formatConversationTime(value: string, now: number): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < 10 * 60_000) return "刚刚";

  const current = new Date(now);
  const updated = new Date(timestamp);
  const currentDay = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  const updatedDay = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate()).getTime();
  const dayDifference = Math.round((currentDay - updatedDay) / 86_400_000);

  if (dayDifference <= 0) return "今天";
  if (dayDifference === 1) return "昨天";
  if (dayDifference < 7) return `${dayDifference}天前`;
  return updated.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
    ...(updated.getFullYear() === current.getFullYear() ? {} : { year: "numeric" })
  });
}
