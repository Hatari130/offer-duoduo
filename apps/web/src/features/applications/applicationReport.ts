import type { ClosedStageReason, JobApplication, RecruitmentType } from "@offerflow/domain";

/** Funnel steps on the share card, in order. "interested" never counts as a submission. */
export type ReportStep = "applied" | "assessment" | "interview" | "offer";

export interface ReportCompany {
  name: string;
  furthest: ReportStep;
}

export interface ApplicationReport {
  title: string;
  dateLabel: string;
  counts: Record<ReportStep, number>;
  companies: ReportCompany[];
  comment: string;
}

const STEP_RANK: Record<ReportStep, number> = { applied: 0, assessment: 1, interview: 2, offer: 3 };

// A closed application keeps only its current stage, but the reason it closed tells how far it got.
const CLOSED_REACHED: Record<ClosedStageReason, ReportStep> = {
  resume_rejected: "applied",
  assessment_rejected: "assessment",
  interview_1_rejected: "interview",
  interview_2_rejected: "interview",
  interview_3_rejected: "interview",
  hr_rejected: "interview"
};

/** The furthest funnel step an application reached, or undefined if it was never submitted. */
export function reachedStep(application: Pick<JobApplication, "stage" | "closedReason">): ReportStep | undefined {
  switch (application.stage) {
    case "interested":
    case "to_apply":
      return undefined;
    case "closed":
      return application.closedReason ? CLOSED_REACHED[application.closedReason] : "applied";
    default:
      return application.stage;
  }
}

function reportTitle(types: Array<RecruitmentType | undefined>): string {
  const tally = new Map<string, number>();
  for (const type of types) {
    const season = type === "autumn" || type === "autumn_early" ? "秋招"
      : type === "spring" ? "春招"
      : type === "summer_internship" || type === "daily_internship" ? "实习"
      : undefined;
    if (season) tally.set(season, (tally.get(season) || 0) + 1);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return top === "实习" ? "我的实习投递战报" : top ? `我的${top}战报` : "我的求职战报";
}

// Only the user's own numbers: there is no cohort data, so the card never compares against others.
function reportComment(counts: Record<ReportStep, number>): string {
  if (counts.offer > 0) return `拿到 ${counts.offer} 个 Offer，${counts.interview} 场面试没有白跑。`;
  if (counts.interview > 0) return `${counts.applied} 份投递换来 ${counts.interview} 次面试，下一站是 Offer。`;
  if (counts.assessment > 0) return `${counts.assessment} 场测评已经在路上，下一步冲进面试。`;
  return `${counts.applied} 份投递已经发出，好消息在路上。`;
}

/** "帆软软件有限公司" → "帆软软件": the legal suffix only costs space on a card. */
export function shortCompanyName(name: string): string {
  const trimmed = name.trim();
  const short = trimmed.replace(/(股份)?有限(责任)?公司$/, "").trim();
  return short || trimmed;
}

function formatDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

export function buildApplicationReport(applications: JobApplication[], now = new Date()): ApplicationReport | undefined {
  const submitted = applications
    .map((application) => ({ application, step: reachedStep(application) }))
    .filter((entry): entry is { application: JobApplication; step: ReportStep } => Boolean(entry.step));
  if (submitted.length === 0) return undefined;

  const counts: Record<ReportStep, number> = { applied: 0, assessment: 0, interview: 0, offer: 0 };
  const companies = new Map<string, ReportCompany & { latest: string }>();
  for (const { application, step } of submitted) {
    // Cumulative funnel: an interview also counts as a submission and a passed assessment.
    for (const candidate of Object.keys(STEP_RANK) as ReportStep[]) {
      if (STEP_RANK[candidate] <= STEP_RANK[step]) counts[candidate] += 1;
    }
    const name = shortCompanyName(application.company);
    if (!name) continue;
    const latest = application.updatedAt || application.createdAt;
    const existing = companies.get(name);
    if (!existing || STEP_RANK[step] > STEP_RANK[existing.furthest]) {
      companies.set(name, { name, furthest: step, latest: existing && existing.latest > latest ? existing.latest : latest });
    } else if (latest > existing.latest) {
      existing.latest = latest;
    }
  }

  return {
    title: reportTitle(submitted.map(({ application }) => application.recruitmentType)),
    dateLabel: `截至 ${formatDate(now)}`,
    counts,
    // Furthest stage first so offers and interviews are never the ones hidden behind "+N".
    companies: [...companies.values()]
      .sort((a, b) => STEP_RANK[b.furthest] - STEP_RANK[a.furthest] || b.latest.localeCompare(a.latest))
      .map(({ name, furthest }) => ({ name, furthest })),
    comment: reportComment(counts)
  };
}
