import type { ChatMessage, JobApplication } from "@offerflow/domain";
import { STAGE_LABELS } from "@offerflow/domain";
import type { KnowledgeEntry } from "./service.ts";

const PERSONAL_APPLICATION_INTENT = /(?:我的|我).{0,10}(?:投递|申请|求职|笔试|测评|面试|offer|回复率|通过率|转化率)|(?:投递|申请)(?:记录|进度|情况|状态|阶段|复盘|统计|管理|下一步|待办|跟进|优先级|更新|回复率|通过率|转化率)|我(?:都)?投了|投过哪些|哪些(?:公司|岗位).{0,8}我(?:投|申请)/i;
const APPLICATION_FOLLOW_UP = /^(?:那|这(?:些|几|个|家|条)|其中|它|接下来|下一步|然后|目前|现在|最近|优先|还有|哪个|哪条|具体|为什么)|(?:怎么办|怎么准备|要做什么|该做什么|需要跟进|值得继续|帮我复盘)/;

function normalized(value: string): string {
  return value.toLowerCase().replace(/[\s·•｜|()（）\-_/]/g, "");
}

function dateLabel(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(parsed);
}

export function applicationKnowledgeContent(application: JobApplication): string {
  return [
    `公司：${application.company}`,
    `岗位：${application.position}`,
    application.department && `部门：${application.department}`,
    application.city && `城市：${application.city}`,
    application.jobType && `岗位类型：${application.jobType}`,
    `投递阶段：${STAGE_LABELS[application.stage]}`,
    application.externalStage && `招聘网站状态：${application.externalStage}`,
    application.appliedAt && `投递时间：${dateLabel(application.appliedAt)}`,
    application.deadline && `截止时间：${dateLabel(application.deadline)}`,
    application.nextAction && `下一步：${application.nextAction}`,
    application.summary && `岗位摘要：${application.summary}`,
    application.responsibilities.length && `岗位职责：\n${application.responsibilities.join("\n")}`,
    application.requirements.length && `岗位要求：\n${application.requirements.join("\n")}`,
    application.rawExcerpt && `岗位原文：\n${application.rawExcerpt}`,
    `最近更新：${dateLabel(application.updatedAt)}`
  ].filter(Boolean).join("\n\n").slice(0, 10_000);
}

export function applicationKnowledgeEntry(application: JobApplication): KnowledgeEntry {
  return {
    id: `application:${application.id}`,
    sourceId: `application:${application.id}`,
    title: `投递记录｜${application.company} · ${application.position}`,
    content: applicationKnowledgeContent(application),
    url: application.sourceUrl
  };
}

export function applicationOverviewEntry(applications: JobApplication[]): KnowledgeEntry {
  const sorted = [...applications].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const stageCounts = new Map<string, number>();
  for (const application of sorted) {
    const stage = STAGE_LABELS[application.stage];
    stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);
  }
  const stageSummary = [...stageCounts.entries()]
    .map(([stage, count]) => `${stage} ${count} 条`)
    .join("、") || "暂无记录";
  const activeCount = sorted.filter((item) => item.stage !== "closed").length;
  const recent = sorted.slice(0, 12).map((application) => [
    `${application.company}｜${application.position}`,
    STAGE_LABELS[application.stage],
    application.city,
    application.nextAction && `下一步：${application.nextAction}`,
    `更新于 ${dateLabel(application.updatedAt)}`
  ].filter(Boolean).join("｜"));

  return {
    id: "personal-applications:overview",
    sourceId: "personal-applications:overview",
    title: "个人投递管理｜当前投递概览",
    content: [
      "以下内容来自当前登录用户的 JobKoI 投递管理，是用户本人的实时记录。",
      `投递总数：${sorted.length} 条；进行中：${activeCount} 条；已结束：${sorted.length - activeCount} 条。`,
      `阶段分布：${stageSummary}。`,
      recent.length ? `最近更新的投递：\n${recent.map((item) => `- ${item}`).join("\n")}` : "投递管理中暂时没有记录。",
      "只能依据这些字段描述现状；回复率、通过率等未记录指标不得自行推测。"
    ].join("\n\n")
  };
}

function recentApplicationCitation(history: readonly Pick<ChatMessage, "role" | "citations">[]): boolean {
  return [...history]
    .reverse()
    .slice(0, 4)
    .some((message) => message.role === "assistant" && message.citations.some((citation) =>
      citation.sourceId === "personal-applications:overview" || citation.sourceId.startsWith("application:")
    ));
}

function mentionsTrackedApplication(prompt: string, applications: JobApplication[]): boolean {
  const query = normalized(prompt);
  return applications.some((application) => {
    const company = normalized(application.company);
    const position = normalized(application.position);
    return (company.length >= 2 && query.includes(company))
      || (position.length >= 3 && query.includes(position));
  });
}

export function shouldUseApplicationContext(
  prompt: string,
  history: readonly Pick<ChatMessage, "role" | "citations">[],
  applications: JobApplication[]
): boolean {
  if (PERSONAL_APPLICATION_INTENT.test(prompt)) return true;
  if (mentionsTrackedApplication(prompt, applications)) return true;
  return recentApplicationCitation(history) && APPLICATION_FOLLOW_UP.test(prompt.trim());
}
