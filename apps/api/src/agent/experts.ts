/**
 * Experts are skills written as Markdown files in ./skills.
 *
 * Each file has a front matter “business card” (who, when to call them, which
 * agents may call them) and a body with their working method. The main agent
 * only sees the business cards; an expert's full instructions are loaded only
 * when the agent consults them, in a separate model call with its own context.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { ChatAgentExpert, ChatAgentExpertNote, ChatAgentName } from "@offerflow/domain";
import type { AgentTool, ModelClient } from "./loop.ts";

export interface ExpertSkill extends ChatAgentExpert {
  agents: ChatAgentName[];
  instructions: string;
}

const skillsDir = join(dirname(fileURLToPath(import.meta.url)), "skills");

export function parseSkill(markdown: string): ExpertSkill {
  const match = markdown.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("技能文件缺少开头的 --- 名片 --- 部分");
  const fields = Object.fromEntries(match[1].split("\n").flatMap((line) => {
    const separator = line.indexOf(":");
    return separator > 0 ? [[line.slice(0, separator).trim(), line.slice(separator + 1).trim()]] : [];
  }));
  for (const key of ["id", "name", "role", "agents", "when"]) {
    if (!fields[key]) throw new Error(`技能文件缺少 ${key}`);
  }
  return {
    id: fields.id,
    name: fields.name,
    role: fields.role,
    when: fields.when,
    agents: fields.agents.split(",").map((agent: string) => agent.trim()) as ChatAgentName[],
    instructions: match[2].trim()
  };
}

let cached: ExpertSkill[] | undefined;
export function loadExperts(): ExpertSkill[] {
  cached ??= readdirSync(skillsDir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => parseSkill(readFileSync(join(skillsDir, file), "utf8")));
  return cached;
}

export function expertsFor(agent: ChatAgentName): ExpertSkill[] {
  return loadExperts().filter((expert) => expert.agents.includes(agent));
}

/** The roster the main agent sees in its system prompt: names and when to call them, not their methods. */
export function expertRoster(agent: ChatAgentName): string {
  return expertsFor(agent).map((expert) => `- ${expert.id}（${expert.name}，${expert.role}）：${expert.when}`).join("\n");
}

const EXPERT_RULES = [
  "通用规则：",
  "- 只根据下面提供的简历、岗位和对话内容说话，不编造任何经历、数字或事实。",
  "- 用中文，简洁，不写客套话和总结句。"
].join("\n");

export function createConsultExpertTool(options: {
  agent: ChatAgentName;
  model: ModelClient;
  /** Resume, job and recent conversation, as plain text the expert can read. */
  materials: () => string;
  onNote?: (note: ChatAgentExpertNote) => void;
}): AgentTool {
  const experts = expertsFor(options.agent);
  return {
    name: "consult_expert",
    description: "请一位专家看材料并给出意见。需要多个视角时，在同一次回复里同时请多位专家（他们会并行工作）。专家只给意见，改写仍然要你用 propose_rewrite 提交。",
    parameters: {
      type: "object",
      properties: {
        expert: { type: "string", enum: experts.map((expert) => expert.id), description: "专家 id" },
        request: { type: "string", description: "具体请专家做什么，比如“看看这份简历能不能过初筛”或“把这条改短一点：……”" }
      },
      required: ["expert", "request"],
      additionalProperties: false
    },
    async run(args) {
      const expert = experts.find((candidate) => candidate.id === args.expert);
      if (!expert) return { error: `没有这位专家，可选：${experts.map((candidate) => candidate.id).join("、")}` };
      const request = String(args.request || "").trim();
      const reply = await options.model.complete([
        { role: "system", content: `${expert.instructions}\n\n${EXPERT_RULES}` },
        { role: "user", content: `${options.materials()}\n\n【请你做的事】\n${request}` }
      ], []);
      const content = (reply.content || "").trim();
      options.onNote?.({ id: randomUUID(), expertId: expert.id, expertName: expert.name, expertRole: expert.role, request, content });
      return { expert: expert.name, opinion: content };
    }
  };
}
