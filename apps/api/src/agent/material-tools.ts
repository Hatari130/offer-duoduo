/**
 * Tools and helpers shared by the teams: reading the user's materials and
 * checking that written text only uses facts the user actually gave.
 */
import type { JobApplication, PersonalProfile, TailorJobContext } from "@offerflow/domain";
import { STAGE_LABELS } from "@offerflow/domain";
import { findUnsupportedClaims, type FabricationFinding } from "./fabrication.ts";
import type { AgentTool } from "./loop.ts";

export interface ResumeEntry {
  id: string;
  section: "总结" | "技能" | "工作/实习" | "项目" | "在校经历";
  title: string;
  text: string;
}

function stripBullet(line: string): string {
  return line.replace(/^[•\-\s]+/, "").trim();
}

export function resumeEntries(profile: PersonalProfile): ResumeEntry[] {
  const lines = (description: string) => description.split("\n").map(stripBullet).filter(Boolean).join("\n");
  return [
    { id: "summary", section: "总结" as const, title: "个人总结", text: profile.selfIntroduction },
    { id: "strengths", section: "技能" as const, title: "技能特长", text: profile.strengths },
    ...profile.experiences.map((entry) => ({ id: entry.id, section: "工作/实习" as const, title: `${entry.organization} · ${entry.title}`, text: lines(entry.description) })),
    ...profile.projects.map((entry) => ({ id: entry.id, section: "项目" as const, title: `${entry.name} · ${entry.role}`, text: lines(entry.description) })),
    ...profile.campusExperiences.map((entry) => ({ id: entry.id, section: "在校经历" as const, title: `${entry.type} · ${entry.role}`, text: lines(entry.description) }))
  ].filter((entry) => entry.text);
}

const EMPTY_OBJECT_SCHEMA = { type: "object", properties: {}, additionalProperties: false };

export function getResumeTool(entries: ResumeEntry[]): AgentTool {
  return {
    name: "get_resume",
    description: "读取用户当前的简历，按条目返回（每条有 id）。需要了解用户经历时先调用。",
    parameters: EMPTY_OBJECT_SCHEMA,
    run: () => entries.length
      ? { entries }
      : { missing: true, hint: "用户还没有可用的简历。请让用户先到“简历”页面上传或创建一份通用简历，再回来继续。" }
  };
}

export function getJobTool(job: TailorJobContext | undefined): AgentTool {
  return {
    name: "get_job",
    description: "读取目标岗位的公司、职位、职责和要求。需要对照岗位时先调用。",
    parameters: EMPTY_OBJECT_SCHEMA,
    run: () => job ?? {
      missing: true,
      hint: "用户没有选择目标岗位。如果用户在对话里粘贴过岗位描述（JD），就以那段文字为准；否则请用户粘贴 JD，或在输入框上方的“选择已有材料”里选一条投递记录。"
    }
  };
}

export function applicationSummary(application: JobApplication) {
  return {
    id: application.id,
    company: application.company,
    position: application.position,
    city: application.city,
    stage: STAGE_LABELS[application.stage],
    appliedAt: application.appliedAt,
    deadline: application.deadline,
    nextAction: application.nextAction,
    updatedAt: application.updatedAt
  };
}

export function listApplicationsTool(applications: JobApplication[]): AgentTool {
  return {
    name: "list_applications",
    description: "读取用户的投递记录：公司、岗位、城市、阶段、投递时间、截止时间、下一步、最近更新时间。",
    parameters: EMPTY_OBJECT_SCHEMA,
    run: () => applications.length
      ? { total: applications.length, applications: applications.map(applicationSummary) }
      : { total: 0, hint: "用户还没有投递记录。可以建议用户在“个人投递管理”里添加，或用浏览器插件记录网申。" }
  };
}

const FINDING_LABEL: Record<FabricationFinding["kind"], string> = {
  number: "数字",
  term: "技术或工具名",
  ownership: "把配合性的工作写成了主导",
  magnitude: "夸大效果的说法"
};

/**
 * Every place a flagged word appears, with a little context. Without this the model
 * fixes the first occurrence, resubmits, and is rejected again for the next one.
 */
function occurrences(text: string, value: string): string[] {
  const lower = text.toLowerCase();
  const needle = value.toLowerCase();
  const snippets: string[] = [];
  for (let index = lower.indexOf(needle); index >= 0 && snippets.length < 4; index = lower.indexOf(needle, index + needle.length)) {
    snippets.push(`…${text.slice(Math.max(0, index - 10), index + needle.length + 10).replace(/\s+/g, " ")}…`);
  }
  return snippets;
}

/** Problems with text that uses facts the user never gave; empty means it may be written. */
export function unsupportedFacts(text: string, evidence: string[], options: { allow?: string[]; before?: string } = {}): string[] {
  return findUnsupportedClaims(text, evidence, options).map((finding) => {
    const places = occurrences(text, finding.value);
    const where = places.length ? `，共 ${places.length} 处：${places.join("；")}` : "";
    return `${FINDING_LABEL[finding.kind]}「${finding.value}」在简历和用户的话里都找不到出处${where}`;
  });
}
