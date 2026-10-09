import type { RecruitmentOpportunity } from "./opportunities.ts";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessageStatus = "streaming" | "complete" | "error" | "stopped";

export type ChatContextKind = "application" | "resume" | "interview";

export interface ChatContextReference {
  kind: ChatContextKind;
  id: string;
  label: string;
  description?: string;
  updatedAt?: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** Extracted document text or OCR text only. Original files, image bytes,
   * base64 payloads and download URLs are never stored with a message. */
  content?: string;
}

export interface KnowledgeCitation {
  id: string;
  sourceId: string;
  title: string;
  excerpt: string;
  url?: string;
  score?: number;
}

export interface ChatOpportunityResults {
  query: string;
  total: number;
  items: RecruitmentOpportunity[];
  sourceAvailable: boolean;
  isBroadSearch: boolean;
  fetchedAt?: string;
  sourceUpdatedAt?: string;
}

/** A team the user can invite into a conversation. Each team is one agent with its own tools. */
export type ChatAgentName = "resume_coach" | "interview_coach" | "job_radar" | "career_planner";

export const CHAT_AGENT_NAMES: readonly ChatAgentName[] = ["resume_coach", "interview_coach", "job_radar", "career_planner"];

/** The agent that answers when no team is invited. It is not a team: it cannot be invited and owns no conversation. */
export const COMPANION_AGENT = "companion";

/** Any agent whose turn can be stored on a message. */
export type ChatRunAgent = ChatAgentName | typeof COMPANION_AGENT;

/** One visible step of an agent turn, e.g. “读取简历” or a rejected rewrite. */
export interface ChatAgentStep {
  id: string;
  label: string;
  detail?: string;
  status: "done" | "rejected";
}

export interface ChatAgentRewrite {
  entryId: string;
  title: string;
  before: string;
  after: string;
  reason: string;
}

export type ChatSkillCategory = "resume" | "interview" | "strategy" | "perspective" | "custom";

/** A named expert the user can see and call on, backed by a skill (official file or user-created). */
export interface ChatAgentExpert {
  id: string;
  name: string;
  role: string;
  /** When the main agent (or the user) should call this expert. */
  when: string;
  /** One line for the skill market card. */
  summary: string;
  category: ChatSkillCategory;
  source: "official" | "custom";
  /** Teams this skill can join. */
  teams: ChatAgentName[];
}

/** What a user writes to create their own skill. */
export interface CustomSkillDraft {
  name: string;
  role: string;
  when: string;
  summary: string;
  instructions: string;
  teams: ChatAgentName[];
}

export interface CustomSkill extends CustomSkillDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatAgentExpertNote {
  id: string;
  expertId: string;
  expertName: string;
  expertRole: string;
  request: string;
  content: string;
}

/** Something an agent wrote into the user's data during a turn, shown with a link to it. */
export interface ChatAgentWrite {
  kind: "tailored_resume" | "application";
  /** e.g. "字节跳动 · AI产品经理" */
  title: string;
  /** What changed, e.g. "写入 3 条改写" or "测评已完成". */
  detail: string;
  /** Where the user can see it in the app. */
  href: string;
  /** The tailored resume version, so later turns update it instead of creating another. */
  versionId?: string;
}

export interface ChatAgentRun {
  agent: ChatRunAgent;
  steps: ChatAgentStep[];
  rewrites: ChatAgentRewrite[];
  /** Writes made this turn. Missing on runs stored before agents could write. */
  writes?: ChatAgentWrite[];
  /** Opinions from experts consulted during this turn. Missing on runs stored before experts existed. */
  notes?: ChatAgentExpertNote[];
  /** Skills on the team for this turn; later turns keep them unless the user changes the team. */
  skills?: string[];
  /** The model-side messages of this turn (tool calls and results), replayed
   * on the next turn so the agent can continue where it stopped. */
  trace: unknown[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  status: ChatMessageStatus;
  createdAt: string;
  attachments: ChatAttachment[];
  context?: ChatContextReference[];
  citations: KnowledgeCitation[];
  opportunityResults?: ChatOpportunityResults;
  agentRun?: ChatAgentRun;
  feedback?: "positive" | "negative";
}

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string;
}

export interface ChatContextOption extends ChatContextReference {
  selectable: boolean;
}

export const CAREER_CHAT_SUGGESTIONS = [
  "帮我制定一份秋招时间规划",
  "如何把项目经历写得更有说服力？",
  "面试被问到职业规划时怎么回答？",
  "根据岗位描述帮我提炼准备重点"
] as const;
