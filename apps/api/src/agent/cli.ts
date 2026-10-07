/**
 * Talk to the resume coach agent in the terminal.
 *
 *   cd apps/api
 *   node --env-file=.env --experimental-transform-types src/agent/cli.ts [case-id]
 *
 * The resume and job come from evals/datasets/resume-tailor.json (default case:
 * chinese-lit-to-admin). Type your answers; an empty line or "exit" ends the
 * session. The full trace is saved to evals/results/traces/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { PersonalProfile, TailorJobContext } from "@offerflow/domain";
import { createEmptyPersonalProfile } from "@offerflow/domain";
import { loadApiConfig } from "../config.ts";
import { runAgentTurn, type AgentEvent, type AgentMessage } from "./loop.ts";
import { createOpenAiCompatibleModel } from "./model.ts";
import { createResumeCoachSession, resumeCoachSystemPrompt } from "./resume-coach.ts";

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const caseId = process.argv[2] || "chinese-lit-to-admin";
const exam = JSON.parse(readFileSync(join(apiRoot, "evals/datasets/resume-tailor.json"), "utf8")) as {
  cases: Array<{ id: string; job: TailorJobContext; resume: Partial<PersonalProfile> }>;
};
const item = exam.cases.find((candidate) => candidate.id === caseId);
if (!item) throw new Error(`考卷里没有 ${caseId}，可选：${exam.cases.map((candidate) => candidate.id).join(", ")}`);

const profile = {
  ...createEmptyPersonalProfile(),
  ...item.resume,
  experiences: (item.resume.experiences || []).map((entry) => ({ kind: "internship", ...entry })),
  projects: item.resume.projects || [],
  campusExperiences: item.resume.campusExperiences || []
} as PersonalProfile;

const messages: AgentMessage[] = [{ role: "system", content: resumeCoachSystemPrompt() }];
const userStatements = () => messages.filter((message) => message.role === "user").map((message) => message.content || "");
const model = createOpenAiCompatibleModel(loadApiConfig(process.env));
const session = createResumeCoachSession({ profile, job: item.job, userStatements, claimChecker: model });

const gray = (text: string) => `\x1b[90m${text}\x1b[0m`;
const short = (value: unknown) => {
  const text = JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
};
function show(event: AgentEvent) {
  if (event.type === "tool_call") console.log(gray(`  → 调用 ${event.name} ${short(event.args)}`));
  if (event.type === "tool_result") console.log(gray(`  ← ${short(event.result)}`));
  if (event.type === "reply") console.log(`\n小鲤：${event.content}\n`);
}

console.log(`简历：${caseId}　目标岗位：${item.job.company} · ${item.job.position}`);
console.log(gray("灰色是 agent 的内部步骤。输入你的话，空行或 exit 结束。\n"));

const input = createInterface({ input: process.stdin });
const lines = input[Symbol.asyncIterator]();
let next = "帮我把简历针对这个岗位改一下";
console.log(`你：${next}`);

while (next && next !== "exit") {
  messages.push({ role: "user", content: next });
  const result = await runAgentTurn({ model, tools: session.tools, messages, onEvent: show });
  console.log(gray(`  （本轮 ${result.steps} 步${result.stoppedByStepLimit ? "，达到步数上限" : ""}）`));
  process.stdout.write("你：");
  const line = await lines.next();
  next = line.done ? "" : String(line.value).trim();
  if (!process.stdin.isTTY && next) console.log(next);
}
input.close();

console.log("\n=== 最终被采纳的改写 ===");
for (const rewrite of session.accepted.values()) {
  console.log(`\n【${rewrite.title}】\n改前：${rewrite.before}\n改后：${rewrite.after}\n理由：${rewrite.reason}`);
}
if (!session.accepted.size) console.log("（没有）");

const traceDir = join(apiRoot, "evals/results/traces");
mkdirSync(traceDir, { recursive: true });
const traceFile = join(traceDir, `${caseId}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(traceFile, JSON.stringify({ caseId, messages, accepted: [...session.accepted.values()] }, null, 2));
console.log(gray(`\n完整轨迹已保存：${traceFile}`));
