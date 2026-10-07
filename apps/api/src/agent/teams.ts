/**
 * The teams a user can invite, and one runner that plays a turn for any of them.
 *
 * A team = one main coach (system prompt + tools) + the experts the user put on
 * it. Pausing for the user is free: each turn stores its model-side messages in
 * ChatMessage.agentRun.trace, and the next turn replays them.
 */
import { randomUUID } from "node:crypto";
import type {
  ChatAgentExpertNote,
  ChatAgentName,
  ChatAttachment,
  ChatAgentRewrite,
  ChatAgentRun,
  ChatAgentStep,
  ChatMessage,
  ChatOpportunityResults,
  JobApplication,
  PersonalProfile,
  TailorJobContext
} from "@offerflow/domain";
import type { ChatAgentProfile } from "@offerflow/contracts";
import { careerPlannerSystemPrompt, createCareerPlannerSession, PLANNER_TEAM_DEFAULT_SKILLS } from "./career-planner.ts";
import type { ExpertSkill } from "./experts.ts";
import { createInterviewCoachSession, interviewCoachSystemPrompt, INTERVIEW_TEAM_DEFAULT_SKILLS } from "./interview-coach.ts";
import { createJobRadarSession, jobRadarSystemPrompt, RADAR_TEAM_DEFAULT_SKILLS } from "./job-radar.ts";
import { runAgentTurn, type AgentMessage, type AgentTool, type ModelClient } from "./loop.ts";
import { createResumeCoachSession, RESUME_TEAM_DEFAULT_SKILLS, resumeCoachSystemPrompt, type AcceptedRewrite } from "./resume-coach.ts";

export const TEAM_PROFILES: Record<ChatAgentName, ChatAgentProfile> = {
  resume_coach: {
    id: "resume_coach",
    name: "简历精修团队",
    tagline: "Sharpen. Prove. Stand out.",
    description: "读你的简历和目标岗位，缺素材时先问你，只写你说过的事实。",
    starter: "帮我把简历针对这个岗位改一下",
    defaultSkills: RESUME_TEAM_DEFAULT_SKILLS
  },
  interview_coach: {
    id: "interview_coach",
    name: "面试陪练团队",
    tagline: "Ask. Answer. Improve.",
    description: "按岗位和你的经历出题，一题一题追问，答完打分并给示范答案。",
    starter: "我们来模拟一场这个岗位的面试吧",
    defaultSkills: INTERVIEW_TEAM_DEFAULT_SKILLS
  },
  job_radar: {
    id: "job_radar",
    name: "岗位雷达团队",
    tagline: "Search. Filter. Match.",
    description: "在岗位库里检索还能投的岗位，按你的硬性条件筛掉不合适的。",
    starter: "帮我找几个现在还能投、适合我的岗位",
    defaultSkills: RADAR_TEAM_DEFAULT_SKILLS
  },
  career_planner: {
    id: "career_planner",
    name: "求职规划团队",
    tagline: "Plan. Review. Keep going.",
    description: "看你的真实投递记录，排这周做得完的计划，复盘卡在哪一步。",
    starter: "帮我看看现在的投递情况，排一下这周的计划",
    defaultSkills: PLANNER_TEAM_DEFAULT_SKILLS
  }
};

export interface TeamMaterials {
  profile?: PersonalProfile;
  job?: TailorJobContext;
  applications: JobApplication[];
  search: (query: string) => Promise<ChatOpportunityResults>;
  /** Today's date in Asia/Shanghai, e.g. "2026-10-07（星期三）". */
  today: string;
}

interface TeamSession {
  systemPrompt: string;
  tools: AgentTool[];
  notes: ChatAgentExpertNote[];
  accepted?: Map<string, AcceptedRewrite>;
  entries?: Array<{ id: string }>;
  results?: () => ChatOpportunityResults | undefined;
}

function createTeamSession(
  team: ChatAgentName,
  materials: TeamMaterials,
  experts: ExpertSkill[],
  model: ModelClient,
  conversation: { userStatements: () => string[]; transcript: () => string[] },
  onExpertNote: (note: ChatAgentExpertNote) => void
): TeamSession {
  const shared = { experts, expertModel: model, onExpertNote, userStatements: conversation.userStatements };
  if (team === "interview_coach") {
    const session = createInterviewCoachSession({ ...shared, profile: materials.profile, job: materials.job, transcript: conversation.transcript });
    return { ...session, systemPrompt: interviewCoachSystemPrompt(experts) };
  }
  if (team === "job_radar") {
    const session = createJobRadarSession({ ...shared, search: materials.search, applications: materials.applications, profile: materials.profile });
    return { ...session, systemPrompt: jobRadarSystemPrompt(experts) };
  }
  if (team === "career_planner") {
    const session = createCareerPlannerSession({ ...shared, applications: materials.applications, profile: materials.profile, today: materials.today });
    return { ...session, systemPrompt: careerPlannerSystemPrompt(experts, materials.today) };
  }
  const session = createResumeCoachSession({ ...shared, profile: materials.profile, job: materials.job });
  return { ...session, systemPrompt: resumeCoachSystemPrompt(experts) };
}

/**
 * What the user said in one turn, including the text extracted from their
 * attachments (a pasted JD, an uploaded resume). It all counts as evidence.
 */
export function userTurnText(content: string, attachments: ChatAttachment[] = []): string {
  const files = attachments
    .filter((attachment) => attachment.content?.trim())
    .map((attachment) => `【附件：${attachment.name}】\n${attachment.content!.trim().slice(0, 20_000)}`);
  return [content, ...files].join("\n\n");
}

/** Turns whose tool calls are replayed in full; older turns keep only what was said and decided. */
export const FULL_TRACE_TURNS = 2;

/** An old agent turn without its tool calls: the reply plus the rewrites it settled on. */
function compactTurn(message: ChatMessage): string {
  const rewrites = (message.agentRun?.rewrites ?? []).map((rewrite) => `「${rewrite.title}」→ ${rewrite.after}`);
  return [message.content, rewrites.length ? `（这一轮已写好：${rewrites.join("；")}）` : ""].filter(Boolean).join("\n");
}

/**
 * Rebuild what the model saw in earlier turns from stored chat messages.
 * Tool results (a whole resume, search hits) are the bulk of a trace, so only the
 * last FULL_TRACE_TURNS keep them; the model can call a tool again if it needs one.
 * User messages are always kept whole: they are the evidence the guard checks against.
 */
export function agentMessagesFromHistory(history: ChatMessage[], systemPrompt: string): AgentMessage[] {
  const messages: AgentMessage[] = [{ role: "system", content: systemPrompt }];
  const traced = history.filter((message) => message.role === "assistant" && message.agentRun?.trace.length);
  const replayFrom = traced.length > FULL_TRACE_TURNS ? history.indexOf(traced[traced.length - FULL_TRACE_TURNS]) : 0;
  history.forEach((message, index) => {
    if (message.role === "user") {
      messages.push({ role: "user", content: userTurnText(message.content, message.attachments) });
    } else if (message.role === "assistant" && message.agentRun?.trace.length && index >= replayFrom) {
      messages.push(...(message.agentRun.trace as AgentMessage[]));
    } else if (message.role === "assistant" && message.agentRun?.trace.length) {
      messages.push({ role: "assistant", content: compactTurn(message) });
    } else if (message.role === "assistant" && message.content) {
      messages.push({ role: "assistant", content: message.content });
    }
  });
  return messages;
}

export interface TeamTurnInput {
  team: ChatAgentName;
  model: ModelClient;
  materials: TeamMaterials;
  experts: ExpertSkill[];
  /** Conversation messages before the current user message. */
  history: ChatMessage[];
  prompt: string;
  /** Files attached to the current message; only their extracted text is used. */
  attachments?: ChatAttachment[];
  onStep?: (step: ChatAgentStep) => void | Promise<void>;
  onRewrite?: (rewrite: ChatAgentRewrite) => void | Promise<void>;
  onExpertNote?: (note: ChatAgentExpertNote) => void | Promise<void>;
  /** Cancels the turn (stop button, closed tab). */
  signal?: AbortSignal;
  onText?: (delta: string) => void | Promise<void>;
  onTextReset?: () => void | Promise<void>;
}

export interface TeamTurnResult {
  reply: string;
  agentRun: ChatAgentRun;
  opportunityResults?: ChatOpportunityResults;
}

export async function runTeamTurn(input: TeamTurnInput): Promise<TeamTurnResult> {
  const pending: Array<Promise<void>> = [];
  let messages: AgentMessage[] = [];
  const conversation = {
    userStatements: () => messages.filter((message) => message.role === "user").map((message) => message.content || ""),
    transcript: () => messages
      .filter((message) => (message.role === "user" || message.role === "assistant") && message.content)
      .map((message) => `${message.role === "user" ? "候选人" : "面试官"}：${message.content}`)
  };
  // Expert calls stop with the turn too.
  const expertModel: ModelClient = {
    complete: (messages, tools, options) => input.model.complete(messages, tools, { ...options, signal: input.signal })
  };
  const session = createTeamSession(input.team, input.materials, input.experts, expertModel, conversation, (note) => {
    pending.push(Promise.resolve(input.onExpertNote?.(note)));
  });
  messages = agentMessagesFromHistory(input.history, session.systemPrompt);
  messages.push({ role: "user", content: userTurnText(input.prompt, input.attachments) });
  const turnStart = messages.length;

  const steps: ChatAgentStep[] = [];
  const rewrites: ChatAgentRewrite[] = [];
  const emitStep = (step: Omit<ChatAgentStep, "id">) => {
    const full = { id: randomUUID(), ...step };
    steps.push(full);
    pending.push(Promise.resolve(input.onStep?.(full)));
  };
  const emitRewrite = (rewrite: ChatAgentRewrite) => {
    const existing = rewrites.findIndex((item) => item.entryId === rewrite.entryId);
    if (existing >= 0) rewrites[existing] = rewrite;
    else rewrites.push(rewrite);
    pending.push(Promise.resolve(input.onRewrite?.(rewrite)));
  };
  const rejected = (result: Record<string, unknown>) =>
    Array.isArray(result.problems) ? (result.problems as string[]).join("；") : String(result.problem || result.error || "");

  const result = await runAgentTurn({
    model: input.model,
    tools: session.tools,
    messages,
    signal: input.signal,
    onText: input.onText ? (delta) => {
      pending.push(Promise.resolve(input.onText!(delta)));
    } : undefined,
    onTextReset: () => {
      pending.push(Promise.resolve(input.onTextReset?.()));
    },
    onEvent: (event) => {
      if (event.type !== "tool_result") return;
      const output = (event.result ?? {}) as Record<string, unknown>;
      switch (event.name) {
        case "get_resume":
          emitStep(output.missing
            ? { label: "读取简历", detail: "还没有可用的简历", status: "rejected" }
            : { label: "读取简历", detail: `${(output.entries as unknown[]).length} 个条目`, status: "done" });
          break;
        case "get_job": {
          const job = input.materials.job;
          emitStep(job
            ? { label: "读取岗位要求", detail: `${job.company} · ${job.position}`, status: "done" }
            : { label: "读取岗位要求", detail: "未选择岗位，以对话里的 JD 为准", status: "rejected" });
          break;
        }
        case "list_applications":
          emitStep({ label: "读取投递记录", detail: `${Number(output.total || 0)} 条`, status: "done" });
          break;
        case "search_opportunities":
          emitStep(output.error
            ? { label: "检索岗位库", detail: String(output.error), status: "rejected" }
            : { label: `检索岗位库「${String(event.args.query || "")}」`, detail: `找到 ${Number(output.total || 0)} 条`, status: "done" });
          break;
        case "show_opportunities":
          emitStep(output.error
            ? { label: "挑选岗位", detail: String(output.error), status: "rejected" }
            : { label: `挑出 ${Number(output.shown || 0)} 个岗位`, status: "done" });
          break;
        case "consult_expert":
          emitStep(output.expert
            ? { label: `请 ${String(output.expert)} 看了一眼`, status: "done" }
            : { label: "请专家", detail: String(output.error || ""), status: "rejected" });
          break;
        case "propose_rewrite":
        case "propose_sample_answer": {
          const key = event.name === "propose_rewrite" ? String(output.entry_id || "") : `answer:${String(event.args.question || "").trim()}`;
          const accepted = output.accepted ? session.accepted?.get(key) : undefined;
          if (accepted) {
            emitStep({ label: event.name === "propose_rewrite" ? `改写「${accepted.title}」` : "写好示范答案", status: "done" });
            emitRewrite({ entryId: accepted.entryId, title: accepted.title, before: accepted.before, after: accepted.after, reason: accepted.reason });
          } else {
            emitStep({ label: event.name === "propose_rewrite" ? "改写被退回，正在重写" : "示范答案被退回，正在重写", detail: rejected(output), status: "rejected" });
          }
          break;
        }
      }
    }
  });
  await Promise.all(pending);

  return {
    reply: result.reply,
    opportunityResults: session.results?.(),
    agentRun: {
      agent: input.team,
      steps,
      rewrites,
      notes: session.notes,
      skills: input.experts.map((expert) => expert.id),
      trace: messages.slice(turnStart)
    }
  };
}
