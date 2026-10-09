/**
 * Tools and helpers shared by the teams: reading the user's materials and
 * checking that written text only uses facts the user actually gave.
 */
import type { ChatAgentWrite, InterviewRound, JobApplication, PersonalProfile, TailorJobContext } from "@offerflow/domain";
import { applicationStageLabel, INTERVIEW_ROUNDS, SELECTABLE_STAGES, selectableStage, STAGE_LABELS } from "@offerflow/domain";
import { findUnsupportedClaims, withoutJobPostings, type FabricationFinding } from "./fabrication.ts";
import type { AgentTool } from "./loop.ts";

// Words that do not tell two companies apart: "大疆" and "大疆创新" are one company.
const GENERIC_COMPANY_SUFFIX = /(?:股份有限公司|有限责任公司|有限公司|股份|集团|控股|公司|科技|技术|创新|智能|信息|网络|电子|汽车|出行)+$/;

function companyKey(name: string): string {
  return name.toLowerCase().replace(/[（(][^)）]*[)）]/g, "").replace(/\s+/g, "").replace(/^中国/, "").replace(GENERIC_COMPANY_SUFFIX, "");
}

/**
 * Whether two names refer to the same company. Containment is not enough:
 * "京东" is inside "京东方" and "腾讯" inside "腾讯音乐", and they are different companies.
 * Aliases in other scripts ("H3C" / "新华三集团") are not recognised.
 */
export function sameCompany(left: string, right: string): boolean {
  const key = companyKey(left);
  return Boolean(key) && key === companyKey(right);
}

/** Everything written text may draw on: the resume, and what the user said about themselves. */
export function userEvidence(entries: ResumeEntry[], statements: string[]): string[] {
  return [...entries.map((entry) => `${entry.title}\n${entry.text}`), ...statements.map(withoutJobPostings)];
}

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

/** Rewritten text in the shape of the original: bullets stay bullets. */
function asDescription(original: string, rewritten: string): string {
  const bulleted = original.split("\n").some((line) => /^\s*[•\-]/.test(line));
  const lines = rewritten.split("\n").map(stripBullet).filter(Boolean);
  return bulleted ? lines.map((line) => `• ${line}`).join("\n") : lines.join("\n");
}

/**
 * The inverse of resumeEntries: puts rewritten entries back into a profile.
 * Returns a new profile and the ids that were found; unknown ids are skipped.
 */
export function applyRewrites(
  profile: PersonalProfile,
  rewrites: Array<{ entryId: string; after: string }>
): { profile: PersonalProfile; applied: string[] } {
  const next = structuredClone(profile);
  const applied: string[] = [];
  for (const { entryId, after } of rewrites) {
    if (entryId === "summary") {
      next.selfIntroduction = after.trim();
      applied.push(entryId);
      continue;
    }
    if (entryId === "strengths") {
      next.strengths = after.trim();
      applied.push(entryId);
      continue;
    }
    const entry = [...next.experiences, ...next.projects, ...next.campusExperiences].find((item) => item.id === entryId);
    if (!entry) continue;
    entry.description = asDescription(entry.description, after);
    applied.push(entryId);
  }
  return { profile: next, applied };
}

/** A change to one application, as the agent may make it. */
export interface ApplicationUpdate {
  applicationId: string;
  assessmentDone?: boolean;
  stage?: (typeof SELECTABLE_STAGES)[number];
  interviewRound?: InterviewRound;
  nextAction?: string;
  /** "YYYY-MM-DD" or "YYYY-MM-DD HH:mm"; shows in the calendar. */
  deadline?: string;
}

/**
 * Writes the agents may make, implemented by the app against the store. Absent
 * in evals and tests that only read; the write tools are then not offered.
 */
export interface AgentWriteActions {
  /** Puts accepted rewrites into the job's tailored resume, creating it from the base resume if needed. */
  saveTailoredResume(input: {
    rewrites: Array<{ entryId: string; after: string }>;
    /** The target job when none was picked in the composer. */
    job?: { company: string; position: string };
    /** The version this conversation saved before, to update rather than create another. */
    previousVersionId?: string;
  }): Promise<ChatAgentWrite>;
  updateApplication(update: ApplicationUpdate): Promise<{ write: ChatAgentWrite; application: JobApplication }>;
}

const DEADLINE_FORMAT = /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/;

/**
 * Records a change the user stated (an assessment done, a new interview round,
 * a deadline). The record keeps its history, so a wrong change can be seen and undone.
 */
export function updateApplicationTool(applications: JobApplication[], actions: AgentWriteActions): AgentTool {
  return {
    name: "update_application",
    description: "更新用户的一条投递记录：标记测评已完成、改阶段（含面试轮次）、写下一步、设截止时间（会出现在日历里）。只记录用户明确说过的变化，比如“H3C 测评做完了”“我进二面了”“满帮测评改到 15 号截止”；不要根据推测修改。application_id 来自 list_applications。",
    parameters: {
      type: "object",
      properties: {
        application_id: { type: "string", description: "list_applications 返回的 id" },
        assessment_done: { type: "boolean", description: "测评或笔试是否已完成" },
        stage: { type: "string", enum: [...SELECTABLE_STAGES], description: "新阶段：interested 感兴趣、applied 已投递、assessment 测评、interview 面试、offer、closed 已结束" },
        interview_round: { type: "string", enum: [...INTERVIEW_ROUNDS], description: "面试轮次，stage 为 interview 时填写" },
        next_action: { type: "string", description: "用户自己说了接下来要做什么时才填，一句话；不要替他写建议" },
        deadline: { type: "string", description: "截止时间，格式 2026-10-15 或 2026-10-15 18:00" }
      },
      required: ["application_id"],
      additionalProperties: false
    },
    async run(args) {
      const index = applications.findIndex((application) => application.id === args.application_id);
      if (index < 0) return { error: `没有 id 为 ${String(args.application_id)} 的投递，请先调用 list_applications 查看` };
      const update: ApplicationUpdate = { applicationId: String(args.application_id) };
      if (typeof args.assessment_done === "boolean") update.assessmentDone = args.assessment_done;
      if (typeof args.stage === "string") update.stage = args.stage as ApplicationUpdate["stage"];
      if (typeof args.interview_round === "string") update.interviewRound = args.interview_round as InterviewRound;
      if (typeof args.next_action === "string" && args.next_action.trim()) update.nextAction = args.next_action.trim();
      if (typeof args.deadline === "string") {
        if (!DEADLINE_FORMAT.test(args.deadline.trim())) return { error: "deadline 格式应为 2026-10-15 或 2026-10-15 18:00" };
        update.deadline = args.deadline.trim();
      }
      if (Object.keys(update).length === 1) return { error: "没有要更新的内容" };
      const { write, application } = await actions.updateApplication(update);
      // Later reads in this turn see the change.
      applications[index] = application;
      return { updated: true, write, application: applicationSummary(application) };
    }
  };
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

/** An assessment the user has not marked done in the tracker. */
function assessmentToDo(application: JobApplication): boolean {
  return selectableStage(application.stage) === "assessment" && !application.assessmentCompleted;
}

/** One application as the agents read it: the same facts the tracker shows, including what is already done. */
export function applicationSummary(application: JobApplication) {
  return {
    id: application.id,
    company: application.company,
    position: application.position,
    city: application.city,
    stage: applicationStageLabel(application),
    // Without this the agent only sees "测评, 截止明天" and keeps chasing tests the user already took.
    ...(selectableStage(application.stage) === "assessment" ? { assessmentDone: Boolean(application.assessmentCompleted) } : {}),
    ...(application.externalStage ? { siteStatus: application.externalStage } : {}),
    appliedAt: application.appliedAt,
    deadline: application.deadline,
    nextAction: application.nextAction,
    updatedAt: application.updatedAt
  };
}

export function listApplicationsTool(applications: JobApplication[]): AgentTool {
  return {
    name: "list_applications",
    description: "读取用户的全部投递记录：公司、岗位、城市、阶段（含测评类型、面试轮次、结束原因）、投递时间、deadline（测评截止时间）、assessmentDone（测评是否已完成，已完成的截止时间不再需要赶）、siteStatus（招聘网站上显示的状态）、下一步、最近更新时间。总数、公司数、各阶段数量和还没完成的测评数已经算好，直接引用，不要自己数。",
    parameters: EMPTY_OBJECT_SCHEMA,
    run: () => {
      if (!applications.length) {
        return { total: 0, hint: "用户还没有投递记录。可以建议用户在“个人投递管理”里添加，或用浏览器插件记录网申。" };
      }
      // Counted in code: a model counting distinct companies across 93 rows gets it wrong.
      const stageCounts: Record<string, number> = {};
      for (const application of applications) {
        const stage = STAGE_LABELS[application.stage];
        stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
      }
      return {
        total: applications.length,
        companyCount: new Set(applications.map((application) => application.company.trim())).size,
        stageCounts,
        assessmentsToDo: applications.filter(assessmentToDo).length,
        applications: applications.map(applicationSummary)
      };
    }
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
