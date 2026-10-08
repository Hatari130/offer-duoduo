import type { JobApplication } from "@offerflow/domain";
import { applicationStageLabel, selectableStage } from "@offerflow/domain";
import type { KnowledgeEntry } from "./service.ts";

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
    `投递阶段：${applicationStageLabel(application)}`,
    selectableStage(application.stage) === "assessment" && `测评：${application.assessmentCompleted ? "已完成" : "未完成"}`,
    application.externalStage && `招聘网站状态：${application.externalStage}`,
    application.appliedAt && `投递时间：${dateLabel(application.appliedAt)}`,
    application.deadline && `测评截止：${dateLabel(application.deadline)}`,
    application.nextAction && `下一步：${application.nextAction}`,
    application.summary && `岗位摘要：${application.summary}`,
    application.responsibilities.length && `岗位职责：\n${application.responsibilities.join("\n")}`,
    application.requirements.length && `岗位要求：\n${application.requirements.join("\n")}`,
    application.rawExcerpt && `岗位原文：\n${application.rawExcerpt}`,
    `最近更新：${dateLabel(application.updatedAt)}`
  ].filter(Boolean).join("\n\n").slice(0, 10_000);
}

/** One application as a material the user can pick in the composer. */
export function applicationKnowledgeEntry(application: JobApplication): KnowledgeEntry {
  return {
    id: `application:${application.id}`,
    sourceId: `application:${application.id}`,
    title: `投递记录｜${application.company} · ${application.position}`,
    content: applicationKnowledgeContent(application),
    url: application.sourceUrl
  };
}
