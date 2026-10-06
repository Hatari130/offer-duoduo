/**
 * Runs one resume-coach turn inside a chat conversation.
 *
 * Pausing for the user is free: each turn stores its model-side messages in
 * ChatMessage.agentRun.trace, and the next turn replays them, so the agent
 * continues with full memory of what it read, asked and submitted.
 */
import { randomUUID } from "node:crypto";
import type {
  ChatAgentExpertNote,
  ChatAgentRewrite,
  ChatAgentRun,
  ChatAgentStep,
  ChatMessage,
  PersonalProfile,
  TailorJobContext
} from "@offerflow/domain";
import { runAgentTurn, type AgentMessage, type ModelClient } from "./loop.ts";
import { createResumeCoachSession, resumeCoachSystemPrompt } from "./resume-coach.ts";

export interface ResumeCoachTurnInput {
  model: ModelClient;
  profile?: PersonalProfile;
  job?: TailorJobContext;
  /** Conversation messages before the current user message. */
  history: ChatMessage[];
  prompt: string;
  onStep?: (step: ChatAgentStep) => void | Promise<void>;
  onRewrite?: (rewrite: ChatAgentRewrite) => void | Promise<void>;
  onExpertNote?: (note: ChatAgentExpertNote) => void | Promise<void>;
}

export interface ResumeCoachTurnResult {
  reply: string;
  agentRun: ChatAgentRun;
}

/** Rebuild what the model saw in earlier turns from stored chat messages. */
export function agentMessagesFromHistory(history: ChatMessage[]): AgentMessage[] {
  const messages: AgentMessage[] = [{ role: "system", content: resumeCoachSystemPrompt() }];
  for (const message of history) {
    if (message.role === "user") {
      messages.push({ role: "user", content: message.content });
    } else if (message.role === "assistant" && message.agentRun?.trace.length) {
      messages.push(...(message.agentRun.trace as AgentMessage[]));
    } else if (message.role === "assistant" && message.content) {
      messages.push({ role: "assistant", content: message.content });
    }
  }
  return messages;
}

export async function runResumeCoachTurn(input: ResumeCoachTurnInput): Promise<ResumeCoachTurnResult> {
  const messages = agentMessagesFromHistory(input.history);
  messages.push({ role: "user", content: input.prompt });
  const turnStart = messages.length;

  const userStatements = () => messages.filter((message) => message.role === "user").map((message) => message.content || "");
  const pending: Array<Promise<void>> = [];
  const session = createResumeCoachSession({
    profile: input.profile,
    job: input.job,
    userStatements,
    expertModel: input.model,
    onExpertNote: (note) => {
      pending.push(Promise.resolve(input.onExpertNote?.(note)));
    }
  });
  const steps: ChatAgentStep[] = [];
  const rewrites: ChatAgentRewrite[] = [];
  const emitStep = (step: Omit<ChatAgentStep, "id">) => {
    const full = { id: randomUUID(), ...step };
    steps.push(full);
    pending.push(Promise.resolve(input.onStep?.(full)));
  };

  const result = await runAgentTurn({
    model: input.model,
    tools: session.tools,
    messages,
    onEvent: (event) => {
      if (event.type !== "tool_result") return;
      const result = event.result as Record<string, unknown>;
      if (event.name === "get_resume") {
        emitStep(result.missing
          ? { label: "读取简历", detail: "还没有可用的简历", status: "rejected" }
          : { label: "读取简历", detail: `${session.entries.length} 个条目`, status: "done" });
      } else if (event.name === "get_job") {
        const job = input.job;
        emitStep(job
          ? { label: "读取岗位要求", detail: `${job.company} · ${job.position}`, status: "done" }
          : { label: "读取岗位要求", detail: "未选择岗位，以对话里的 JD 为准", status: "rejected" });
      } else if (event.name === "consult_expert") {
        emitStep(result.expert
          ? { label: `请 ${String(result.expert)} 看了一眼`, status: "done" }
          : { label: "请专家", detail: String(result.error || ""), status: "rejected" });
      } else if (event.name === "propose_rewrite") {
        const entryId = String(result.entry_id || "");
        const accepted = session.accepted.get(entryId);
        if (result.accepted && accepted) {
          emitStep({ label: `改写「${accepted.title}」`, status: "done" });
          const rewrite = { entryId, title: accepted.title, before: accepted.before, after: accepted.after, reason: accepted.reason };
          const existing = rewrites.findIndex((item) => item.entryId === entryId);
          if (existing >= 0) rewrites[existing] = rewrite;
          else rewrites.push(rewrite);
          pending.push(Promise.resolve(input.onRewrite?.(rewrite)));
        } else {
          const problems = Array.isArray(result.problems) ? (result.problems as string[]).join("；") : String(result.problem || "");
          emitStep({ label: "改写被退回，正在重写", detail: problems, status: "rejected" });
        }
      }
    }
  });
  await Promise.all(pending);

  return {
    reply: result.reply,
    agentRun: {
      agent: "resume_coach",
      steps,
      rewrites,
      notes: session.notes,
      trace: messages.slice(turnStart)
    }
  };
}
