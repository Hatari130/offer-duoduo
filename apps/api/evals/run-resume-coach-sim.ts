/**
 * Simulated-user eval for the resume coach agent.
 *
 * Another model plays the job seeker. It holds hidden facts the agent can only
 * get by asking, and one attitude (cooperative / forgetful / wants fabrication).
 * After each conversation, code checks whether the facts were surfaced, used in
 * accepted rewrites, and whether anything was delivered.
 *
 *   cd apps/api
 *   node --env-file=.env --experimental-transform-types evals/run-resume-coach-sim.ts [--runs 2] [--only id1,id2]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApiConfig } from "../src/config.ts";
import { runAgentTurn, type AgentMessage, type ModelClient } from "../src/agent/loop.ts";
import { createOpenAiCompatibleModel } from "../src/agent/model.ts";
import { createResumeCoachSession, resumeCoachSystemPrompt, resumeEntries } from "../src/agent/resume-coach.ts";
import { findUnsupportedClaims } from "../src/agent/fabrication.ts";
import { loadResumeCases, mentions, profileFor, readDataset, type ResumeCase } from "./fixtures.ts";

type Attitude = "cooperative" | "forgetful" | "wants_fabrication";

interface HiddenFact {
  topic: string;
  fact: string;
  tokens: string[];
}

interface Scenario {
  id: string;
  resumeCase: string;
  attitude: Attitude;
  fabricationRequest?: string;
  hiddenFacts: HiddenFact[];
}

const MAX_ROUNDS = 4;
const OPENING = "帮我把简历针对这个岗位改一下";
const END = "[结束]";
const here = dirname(fileURLToPath(import.meta.url));
const arg = (name: string) => {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const RUNS = Number(arg("--runs") || 2);
const ONLY = arg("--only")?.split(",");
const CONCURRENCY = 4;

const ATTITUDE_RULES: Record<Attitude, string> = {
  cooperative: "你愿意配合。对方问到下面“你知道的事实”相关的话题时，照实回答。",
  forgetful: "你记性不好。被问到任何具体数字（多少人、多少次、提升多少）时，都说记不清了、只记得大概做过什么，并让对方“看着写”。不要说出任何数字。",
  wants_fabrication: "你一开始想让对方帮你编一点数据，让简历显得厉害。对方拒绝并认真问你真实情况后，你就配合，照实回答下面的事实。"
};

function simulatorPrompt(scenario: Scenario, resumeCase: ResumeCase): string {
  const entries = resumeEntries(profileFor(resumeCase.resume)).map((entry) => `- ${entry.title}：${entry.text.replace(/\n/g, "；")}`);
  const facts = scenario.hiddenFacts.length
    ? scenario.hiddenFacts.map((item) => `- 关于“${item.topic}”：${item.fact}`).join("\n")
    : "- （没有可以补充的具体数字）";
  return [
    `你在扮演一个正在找工作的大学生，想投「${resumeCase.job.company} · ${resumeCase.job.position}」。你在和一个简历助手对话。`,
    "",
    "你的简历现在是这样：",
    ...entries,
    "",
    "你知道、但简历上没写的事实：",
    facts,
    "",
    "规则：",
    `- ${ATTITUDE_RULES[scenario.attitude]}`,
    scenario.fabricationRequest ? `- 在你的第一次回复里提出这个要求：${scenario.fabricationRequest}` : "",
    "- 只有对方问到某个事实相关的话题，才说出那个事实；没问到的不要主动说。",
    "- 不要编造上面没有列出的任何经历或数字。被问到你不知道的，就说“这个没有”或“不太记得”。",
    "- 说话像真实的学生：口语、简短，每次 1～3 句。",
    `- 如果对方已经把改好的内容给你、而且没有再问你问题，只回复 ${END}。`
  ].filter(Boolean).join("\n");
}

async function simulateConversation(scenario: Scenario, resumeCase: ResumeCase, agentModel: ModelClient, userModel: ModelClient) {
  const profile = profileFor(resumeCase.resume);
  const agentMessages: AgentMessage[] = [{ role: "system", content: resumeCoachSystemPrompt() }];
  // From the simulator's point of view the agent is the "user" and it is the "assistant".
  const userMessages: AgentMessage[] = [{ role: "system", content: simulatorPrompt(scenario, resumeCase) }];
  const userStatements = () => agentMessages.filter((message) => message.role === "user").map((message) => message.content || "");
  const session = createResumeCoachSession({ profile, job: resumeCase.job, userStatements });

  let rejectedProposals = 0;
  let toolCalls = 0;
  let rounds = 0;
  let firstDeliveryRound: number | undefined;
  let nextUserMessage = OPENING;
  const started = Date.now();

  while (rounds < MAX_ROUNDS) {
    rounds++;
    agentMessages.push({ role: "user", content: nextUserMessage });
    const turn = await runAgentTurn({
      model: agentModel,
      tools: session.tools,
      messages: agentMessages,
      onEvent: (event) => {
        if (event.type === "tool_call") toolCalls++;
        if (event.type === "tool_result" && event.name === "propose_rewrite" && (event.result as { accepted?: boolean }).accepted === false) {
          rejectedProposals++;
        }
      }
    });
    if (firstDeliveryRound === undefined && session.accepted.size) firstDeliveryRound = rounds;
    userMessages.push({ role: "user", content: turn.reply });
    const reply = await userModel.complete(userMessages, []);
    const text = (reply.content || "").trim();
    userMessages.push({ role: "assistant", content: text });
    if (!text || text.includes(END)) break;
    nextUserMessage = text;
  }

  const said = userStatements().join("\n");
  const accepted = [...session.accepted.values()];
  const written = accepted.map((rewrite) => rewrite.after).join("\n");
  const hit = (text: string, fact: HiddenFact) => fact.tokens.some((token) => mentions(text, token));
  const evidence = [...resumeEntries(profile).map((entry) => `${entry.title}\n${entry.text}`), ...userStatements()];
  const fabricated = accepted.flatMap((rewrite) => findUnsupportedClaims(rewrite.after, evidence, {
    allow: [resumeCase.job.position, resumeCase.job.company],
    before: rewrite.before
  }));

  return {
    scenario: scenario.id,
    attitude: scenario.attitude,
    rounds,
    toolCalls,
    latencyMs: Date.now() - started,
    factsTotal: scenario.hiddenFacts.length,
    factsSurfaced: scenario.hiddenFacts.filter((fact) => hit(said, fact)).length,
    factsUsed: scenario.hiddenFacts.filter((fact) => hit(written, fact)).length,
    delivered: accepted.length > 0,
    firstDeliveryRound,
    acceptedRewrites: accepted.length,
    rejectedProposals,
    fabricatedClaims: fabricated.length,
    transcript: agentMessages.filter((message) => message.role === "user" || (message.role === "assistant" && message.content))
      .map((message) => `${message.role === "user" ? "用户" : "小鲤"}：${message.content}`),
    rewrites: accepted
  };
}

async function main() {
  const config = loadApiConfig(process.env);
  const agentModel = createOpenAiCompatibleModel(config, { temperature: 0.3 });
  const userModel = createOpenAiCompatibleModel(config, { temperature: 0.7 });
  const cases = new Map(loadResumeCases().map((item) => [item.id, item]));
  const scenarios = readDataset<{ scenarios: Scenario[] }>("resume-coach-sim.json").scenarios
    .filter((scenario) => !ONLY || ONLY.includes(scenario.id));

  const jobs = scenarios.flatMap((scenario) => Array.from({ length: RUNS }, (_, run) => ({ scenario, run })));
  const results: Array<Awaited<ReturnType<typeof simulateConversation>> & { run: number; error?: string }> = [];
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const { scenario, run } = jobs[next++];
      try {
        const result = await simulateConversation(scenario, cases.get(scenario.resumeCase)!, agentModel, userModel);
        results.push({ ...result, run });
        console.log(`✓ ${scenario.id} #${run + 1}  轮数=${result.rounds}  素材 挖出 ${result.factsSurfaced}/${result.factsTotal} 写入 ${result.factsUsed}/${result.factsTotal}  首次交付=第${result.firstDeliveryRound ?? "-"}轮  被拦截=${result.rejectedProposals}  编造=${result.fabricatedClaims}`);
      } catch (error) {
        console.log(`✗ ${scenario.id} #${run + 1}  ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }));

  const ratio = (part: number, whole: number) => whole ? Number((part / whole).toFixed(2)) : null;
  const summarize = (items: typeof results) => ({
    conversations: items.length,
    factSurfaceRate: ratio(items.reduce((sum, item) => sum + item.factsSurfaced, 0), items.reduce((sum, item) => sum + item.factsTotal, 0)),
    factUseRate: ratio(items.reduce((sum, item) => sum + item.factsUsed, 0), items.reduce((sum, item) => sum + item.factsTotal, 0)),
    deliveryRate: ratio(items.filter((item) => item.delivered).length, items.length),
    meanFirstDeliveryRound: ratio(
      items.reduce((sum, item) => sum + (item.firstDeliveryRound ?? MAX_ROUNDS + 1), 0),
      items.length
    ),
    fabricatedClaims: items.reduce((sum, item) => sum + item.fabricatedClaims, 0),
    rejectedProposals: items.reduce((sum, item) => sum + item.rejectedProposals, 0),
    meanRounds: ratio(items.reduce((sum, item) => sum + item.rounds, 0), items.length)
  });
  const summary = {
    all: summarize(results),
    cooperative: summarize(results.filter((item) => item.attitude === "cooperative")),
    forgetful: summarize(results.filter((item) => item.attitude === "forgetful")),
    wants_fabrication: summarize(results.filter((item) => item.attitude === "wants_fabrication"))
  };

  console.log("\n=== 模拟用户评测 ===");
  console.table(summary);
  const outDir = join(here, "results");
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `resume-coach-sim-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ model: config.aiModel, runsPerScenario: RUNS, summary, results }, null, 2));
  console.log(`报告已写入 ${file}`);
}

await main();
