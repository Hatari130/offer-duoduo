import type { ChatAgentName, JobApplication } from "@offerflow/domain";

/**
 * Rules for “今天” on the home page (experimental, signed-in users only): up to three
 * things worth doing today, read from the user's own applications. Nothing is
 * invented — a card only appears when the records behind it exist.
 */

const DAY = 24 * 60 * 60 * 1000;
const STALLED_DAYS = 14;

export type BriefAction =
  | { type: "applications" }
  | { type: "invite"; team: ChatAgentName; applicationId?: string };

export interface BriefCard {
  id: string;
  label: string;
  /** Expert portrait in the header; the deadline card uses a warm dot instead. */
  portrait?: string;
  title: string;
  detail: string;
  cta: string;
  action: BriefAction;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole days from today to the deadline; undefined when there is no usable date. */
function daysLeft(deadline: string | undefined, today: number): number | undefined {
  const match = deadline?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return undefined;
  return Math.round((new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime() - today) / DAY);
}

function monthDay(deadline: string): string {
  const [, month, day] = deadline.match(/^\d{4}-(\d{2})-(\d{2})/) ?? [];
  return `${Number(month)} 月 ${Number(day)} 日`;
}

function names(items: JobApplication[]): string {
  const shown = items.slice(0, 2).map((item) => item.company).join("、");
  return items.length > 2 ? `${shown} 等 ${items.length} 家` : shown;
}

export function briefCards(applications: JobApplication[], now = new Date()): BriefCard[] {
  const today = startOfDay(now);
  const cards: BriefCard[] = [];

  const closing = applications
    .filter((item) => item.stage === "interested" || item.stage === "to_apply")
    .map((item) => ({ item, days: daysLeft(item.deadline, today) }))
    .filter((entry): entry is { item: JobApplication; days: number } => entry.days !== undefined && entry.days >= 0 && entry.days <= 3)
    .sort((a, b) => a.days - b.days);
  if (closing.length) {
    const last = closing.at(-1)!.days;
    cards.push({
      id: "closing",
      label: "快截止",
      title: `${names(closing.map((entry) => entry.item))}的投递${last === 0 ? "今天" : ` ${last} 天内`}截止`,
      detail: `${closing.slice(0, 2).map(({ item }) => `${item.company}${item.position} ${monthDay(item.deadline!)}`).join("、")}，都还没投。`,
      cta: "去投递 →",
      action: { type: "applications" }
    });
  }

  const interviewing = applications
    .filter((item) => item.stage === "interview")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const stalled = applications.filter((item) =>
    item.stage === "applied" && today - new Date(item.updatedAt).getTime() > STALLED_DAYS * DAY);
  if (interviewing.length) {
    const next = interviewing[0];
    cards.push({
      id: "interview",
      label: "面试陪练",
      portrait: "business-interviewer",
      title: `${next.company}${next.position}进入面试`,
      detail: "老陈按这个岗位和你的简历出题，花 20 分钟练一遍？",
      cta: "开始模拟 →",
      action: { type: "invite", team: "interview_coach", applicationId: next.id }
    });
  } else if (stalled.length) {
    cards.push({
      id: "stalled",
      label: "求职规划",
      portrait: "career-planner",
      title: `${stalled.length} 个投递超过两周没有进展`,
      detail: "安姐帮你排一下这周先跟进哪几个、哪些可以放下。",
      cta: "排一下计划 →",
      action: { type: "invite", team: "career_planner" }
    });
  }

  const applied = applications.filter((item) => item.stage !== "interested" && item.stage !== "to_apply").length;
  cards.push({
    id: "radar",
    label: "岗位雷达",
    portrait: "job-analyst",
    title: "找找现在还能投的岗位",
    detail: applied
      ? `按你的届别和城市挑，已经投过的 ${applied} 家会自动避开。`
      : "按你的届别和城市，从岗位库里挑出现在还能投的。",
    cta: "开始找 →",
    action: { type: "invite", team: "job_radar" }
  });

  return cards;
}
