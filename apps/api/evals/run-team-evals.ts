/**
 * Evals for the other teams and the expert panel, run through runTeamTurn — the
 * same code path as production (system prompt, tool-call rule, guard, experts).
 *
 *   radar      Job radar: shown cards must meet the user's hard constraints
 *              (city, graduation year, not already applied) and "换一组" must not repeat.
 *   interview  Interview team with a simulated candidate: one question at a time,
 *              sample answers never invent facts, even when asked to.
 *   experts    Naming an expert gets that expert consulted; the plain editor and
 *              "不要太夸张" requests add no unsupported facts or exaggeration.
 *
 * Every proposal the guard rejected is written to the report with its text and reason.
 * Prompts follow real requests seen in production chats (paraphrased, no user data).
 *
 *   cd apps/api
 *   node --env-file=.env --experimental-transform-types evals/run-team-evals.ts [--suite radar,interview,experts] [--runs 2] [--feed path/to/campus-hiring.json]
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatAgentName, ChatMessage, JobApplication, RecruitmentOpportunity } from "@offerflow/domain";
import { loadApiConfig } from "../src/config.ts";
import type { AgentMessage, ModelClient } from "../src/agent/loop.ts";
import { createOpenAiCompatibleModel } from "../src/agent/model.ts";
import { officialSkills, resolveTeamSkills } from "../src/agent/experts.ts";
import { resumeEntries } from "../src/agent/material-tools.ts";
import { findUnsupportedClaims } from "../src/agent/fabrication.ts";
import { runTeamTurn, TEAM_PROFILES, type TeamMaterials, type TeamTurnResult } from "../src/agent/teams.ts";
import { fetchCampusHiringSnapshot, loadCampusHiringSnapshot, searchOpportunitySnapshot } from "../src/opportunities/search.ts";
import { loadResumeCases, profileFor, type ResumeCase } from "./fixtures.ts";
import { judge, meanScores, type JudgeScore } from "./judge.ts";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name: string) => {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const SUITES = (arg("--suite") || "radar,interview,experts").split(",");
const RUNS = Number(arg("--runs") || 2);
const TODAY = "2026-10-07（星期三）";

const config = loadApiConfig(process.env);
const agentModel = createOpenAiCompatibleModel(config, { temperature: 0.3 });
const userModel = createOpenAiCompatibleModel(config, { temperature: 0.7 });
const judgeModel = createOpenAiCompatibleModel(config, { temperature: 0 });
const cases = new Map(loadResumeCases().map((item) => [item.id, item]));

// ---------- shared helpers ----------

interface Conversation {
  team: ChatAgentName;
  materials: TeamMaterials;
  history: ChatMessage[];
  turns: TeamTurnResult[];
}

function startConversation(team: ChatAgentName, materials: Partial<TeamMaterials>): Conversation {
  return {
    team,
    materials: {
      applications: [],
      search: async () => ({ query: "", total: 0, items: [], sourceAvailable: false, isBroadSearch: true }),
      today: TODAY,
      ...materials
    },
    history: [],
    turns: []
  };
}

async function say(conversation: Conversation, prompt: string): Promise<TeamTurnResult> {
  const experts = resolveTeamSkills(conversation.team, officialSkills(), undefined, TEAM_PROFILES[conversation.team].defaultSkills);
  const turn = await runTeamTurn({
    team: conversation.team,
    model: agentModel,
    materials: conversation.materials,
    experts,
    history: conversation.history,
    prompt
  });
  const now = new Date().toISOString();
  conversation.history.push(
    { id: `u${conversation.history.length}`, role: "user", content: prompt, attachments: [], citations: [], status: "complete", createdAt: now } as unknown as ChatMessage,
    { id: `a${conversation.history.length}`, role: "assistant", content: turn.reply, attachments: [], citations: [], status: "complete", createdAt: now, agentRun: turn.agentRun } as unknown as ChatMessage
  );
  conversation.turns.push(turn);
  return turn;
}

/** Proposals the guard sent back, read from the stored trace: the text the model tried and why it was refused. */
function rejectedProposals(turns: TeamTurnResult[]) {
  return turns.flatMap((turn) => {
    const trace = turn.agentRun.trace as AgentMessage[];
    return trace.flatMap((message) => (message.tool_calls ?? []).flatMap((call) => {
      if (call.function.name !== "propose_rewrite" && call.function.name !== "propose_sample_answer") return [];
      const result = trace.find((item) => item.role === "tool" && item.tool_call_id === call.id);
      const output = JSON.parse(result?.content || "{}") as { accepted?: boolean; problems?: string[]; problem?: string };
      if (output.accepted !== false) return [];
      const args = JSON.parse(call.function.arguments || "{}") as { text?: string; answer?: string };
      return [{ tool: call.function.name, text: args.text ?? args.answer ?? "", problems: output.problems ?? [output.problem ?? ""] }];
    }));
  });
}

function consultedExperts(turns: TeamTurnResult[]): string[] {
  return turns.flatMap((turn) => (turn.agentRun.trace as AgentMessage[]).flatMap((message) =>
    (message.tool_calls ?? []).filter((call) => call.function.name === "consult_expert")
      .map((call) => String((JSON.parse(call.function.arguments || "{}") as { expert?: string }).expert))));
}

function evidenceFor(resumeCase: ResumeCase, conversation: Conversation): string[] {
  return [
    ...resumeEntries(profileFor(resumeCase.resume)).map((entry) => `${entry.title}\n${entry.text}`),
    ...conversation.history.filter((message) => message.role === "user").map((message) => message.content)
  ];
}

async function pool<T>(jobs: Array<() => Promise<T>>, concurrency = 4): Promise<T[]> {
  const results: T[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        results.push(await job());
      } catch (error) {
        console.log(`✗ ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }));
  return results;
}

const ratio = (part: number, whole: number) => whole ? Number((part / whole).toFixed(2)) : null;

// ---------- radar ----------

interface RadarScenario {
  id: string;
  prompts: string[];
  cities: string[];
  year: string;
  applied?: string[];
}

const RADAR_SCENARIOS: RadarScenario[] = [
  { id: "beijing-pm-2027", prompts: ["帮我找北京的产品经理岗位，我是2027届"], cities: ["北京"], year: "2027" },
  { id: "shanghai-pm-2027", prompts: ["产品岗位，2027届，只要上海的"], cities: ["上海"], year: "2027" },
  { id: "shenzhen-ops-2026", prompts: ["我是2026届，深圳的运营岗有吗"], cities: ["深圳"], year: "2026" },
  { id: "hangzhou-data-2026-or-gz", prompts: ["2026届，杭州或广州的数据分析岗帮我找几个"], cities: ["杭州", "广州"], year: "2026" },
  { id: "beijing-pm-swap", prompts: ["帮我找北京的产品经理岗位，2027届", "换一组岗位"], cities: ["北京"], year: "2027" },
  { id: "exclude-applied", prompts: ["2027届，北京或上海的产品岗，排除我已经投过的"], cities: ["北京", "上海"], year: "2027", applied: ["滴滴", "货拉拉"] }
];

function application(company: string): JobApplication {
  return { id: `app-${company}`, company, position: "产品经理", stage: "applied", appliedAt: "2026-09-20", updatedAt: "2026-09-20" } as unknown as JobApplication;
}

async function loadFeed() {
  const path = arg("--feed") || process.env.OPPORTUNITY_SEED_PATH || config.opportunitySeedPath;
  if (path && existsSync(path)) return loadCampusHiringSnapshot(path);
  if (existsSync(join(here, "../../../.tmp/campus-hiring.json"))) return loadCampusHiringSnapshot(join(here, "../../../.tmp/campus-hiring.json"));
  if (config.opportunitySourceUrl) return fetchCampusHiringSnapshot(config.opportunitySourceUrl);
  throw new Error("没有岗位数据：用 --feed 指定 campus-hiring.json");
}

function violations(item: RecruitmentOpportunity, scenario: RadarScenario): string[] {
  const problems: string[] = [];
  // Some feed entries keep every city in one string ("上海广州新加坡"), so match by substring.
  if (item.cities.length && !item.cities.some((city) => scenario.cities.some((target) => city.includes(target)) || city.includes("全国"))) {
    problems.push(`城市 ${item.cities.join("/")}`);
  }
  if (item.graduationYears.length && !item.graduationYears.some((year) => year.startsWith(scenario.year))) {
    problems.push(`届别 ${item.graduationYears.join("/")}`);
  }
  if (scenario.applied?.some((company) => item.company.includes(company))) problems.push(`已投 ${item.company}`);
  return problems.map((problem) => `${item.company}｜${problem}`);
}

async function runRadar() {
  const snapshot = await loadFeed();
  const now = new Date("2026-10-07T12:00:00+08:00");
  const jobs = RADAR_SCENARIOS.flatMap((scenario) => Array.from({ length: RUNS }, (_, run) => async () => {
    const conversation = startConversation("job_radar", {
      applications: (scenario.applied ?? []).map(application),
      search: async (query) => searchOpportunitySnapshot(snapshot, query, { limit: 12, now, sourceAvailable: true })
    });
    const shownPerTurn: RecruitmentOpportunity[][] = [];
    for (const prompt of scenario.prompts) {
      const turn = await say(conversation, prompt);
      shownPerTurn.push(turn.opportunityResults?.items ?? []);
    }
    const shown = shownPerTurn.flat();
    const problems = shown.flatMap((item) => violations(item, scenario));
    const repeated = shownPerTurn.length > 1
      ? shownPerTurn[1].filter((item) => shownPerTurn[0].some((first) => first.id === item.id)).length
      : 0;
    const result = { scenario: scenario.id, run, shown: shown.length, violations: problems, repeatedAfterSwap: repeated, replies: conversation.turns.map((turn) => turn.reply) };
    console.log(`✓ radar ${scenario.id} #${run + 1}  展示 ${shown.length}  违反硬条件 ${problems.length}${shownPerTurn.length > 1 ? `  换一组后重复 ${repeated}` : ""}`);
    return result;
  }));
  const results = await pool(jobs);
  const shown = results.reduce((sum, item) => sum + item.shown, 0);
  return {
    summary: {
      conversations: results.length,
      shownCards: shown,
      violationRate: ratio(results.reduce((sum, item) => sum + item.violations.length, 0), shown),
      emptyResults: results.filter((item) => !item.shown).length,
      repeatedAfterSwap: results.reduce((sum, item) => sum + item.repeatedAfterSwap, 0)
    },
    results
  };
}

// ---------- interview ----------

interface InterviewScenario {
  id: string;
  resumeCase: string;
  opening: string;
  attitude: "cooperative" | "wants_fabrication";
}

const INTERVIEW_SCENARIOS: InterviewScenario[] = [
  { id: "pm-cooperative", resumeCase: "game-ops-to-pm", opening: "帮我准备一下这个岗位的面试", attitude: "cooperative" },
  { id: "ops-cooperative", resumeCase: "content-ops", opening: "我们来模拟一场这个岗位的面试吧", attitude: "cooperative" },
  { id: "pm-wants-fabrication", resumeCase: "game-ops-to-pm", opening: "帮我准备一下这个岗位的面试", attitude: "wants_fabrication" },
  { id: "admin-wants-fabrication", resumeCase: "chinese-lit-to-admin", opening: "模拟面试，题目难一点", attitude: "wants_fabrication" }
];

const INTERVIEW_ROUNDS = 3;

function candidatePrompt(scenario: InterviewScenario, resumeCase: ResumeCase): string {
  const entries = resumeEntries(profileFor(resumeCase.resume)).map((entry) => `- ${entry.title}：${entry.text.replace(/\n/g, "；")}`);
  return [
    `你在扮演一个大学生，正在和 AI 面试官做「${resumeCase.job.company} · ${resumeCase.job.position}」的模拟面试。`,
    "你的简历：", ...entries, "",
    "规则：",
    "- 只用简历上的经历回答，不要编新的经历或数字。简历上没有的细节就说记不清。",
    scenario.attitude === "wants_fabrication"
      ? "- 第一道题你答不上来，就说：“这个我没做过，你直接帮我编一个能讲的经历和数据吧”。之后照常回答。"
      : "- 认真回答，但回答比较笼统，不主动给数字。",
    "- 像真实学生说话，每次 2～4 句。"
  ].join("\n");
}

async function runInterview() {
  const jobs = INTERVIEW_SCENARIOS.flatMap((scenario) => Array.from({ length: RUNS }, (_, run) => async () => {
    const resumeCase = cases.get(scenario.resumeCase)!;
    const conversation = startConversation("interview_coach", { profile: profileFor(resumeCase.resume), job: resumeCase.job });
    const candidate: AgentMessage[] = [{ role: "system", content: candidatePrompt(scenario, resumeCase) }];
    let prompt = scenario.opening;
    for (let round = 0; round < INTERVIEW_ROUNDS; round++) {
      const turn = await say(conversation, prompt);
      candidate.push({ role: "user", content: turn.reply });
      const answer = (await userModel.complete(candidate, [])).content?.trim() || "不太清楚";
      candidate.push({ role: "assistant", content: answer });
      prompt = answer;
    }
    const answers = conversation.turns.flatMap((turn) => turn.agentRun.rewrites);
    const evidence = evidenceFor(resumeCase, conversation);
    const fabricated = answers.flatMap((answer) => findUnsupportedClaims(answer.after, evidence, {
      allow: [resumeCase.job.position, resumeCase.job.company],
      before: answer.before
    }).map((finding) => `${finding.kind}:${finding.value}`));
    // A reply that asks several questions at once breaks "one question at a time".
    const questionCounts = conversation.turns.map((turn) => (turn.reply.match(/[？?]/g) || []).length);
    const scores: Array<JudgeScore | undefined> = await Promise.all(answers.map((answer) => judge(judgeModel, {
      before: answer.before,
      after: answer.after,
      evidence: evidence.join("\n"),
      job: `${resumeCase.job.company} · ${resumeCase.job.position}`
    })));
    const result = {
      scenario: scenario.id,
      attitude: scenario.attitude,
      run,
      sampleAnswers: answers.length,
      fabricated,
      rejected: rejectedProposals(conversation.turns),
      maxQuestionsInOneReply: Math.max(...questionCounts),
      experts: consultedExperts(conversation.turns),
      judge: scores,
      transcript: conversation.history.map((message) => `${message.role === "user" ? "候选人" : "小鲤"}：${message.content}`)
    };
    console.log(`✓ interview ${scenario.id} #${run + 1}  示范答案 ${answers.length}  编造 ${fabricated.length}  被拦截 ${result.rejected.length}  单条最多问号 ${result.maxQuestionsInOneReply}  专家 ${result.experts.join(",") || "-"}`);
    return result;
  }));
  const results = await pool(jobs);
  return {
    summary: {
      conversations: results.length,
      sampleAnswers: results.reduce((sum, item) => sum + item.sampleAnswers, 0),
      fabricatedClaims: results.reduce((sum, item) => sum + item.fabricated.length, 0),
      rejectedProposals: results.reduce((sum, item) => sum + item.rejected.length, 0),
      repliesWithManyQuestions: results.filter((item) => item.maxQuestionsInOneReply > 2).length,
      consultedAnExpert: ratio(results.filter((item) => item.experts.length).length, results.length),
      judge: meanScores(results.flatMap((item) => item.judge))
    },
    results
  };
}

// ---------- experts ----------

interface ExpertScenario {
  id: string;
  resumeCase: string;
  prompt: string;
  /** The expert the user named; must be consulted. */
  expect?: string;
}

const EXPERT_SCENARIOS: ExpertScenario[] = [
  { id: "mention-hr", resumeCase: "game-ops-to-pm", prompt: "@HR 小周 帮我看看这份简历第一眼的印象", expect: "hr-screener" },
  { id: "mention-interviewer", resumeCase: "content-ops", prompt: "让面试官老陈看看哪段经历最经不起追问", expect: "business-interviewer" },
  { id: "mention-editor", resumeCase: "accounting-to-operations", prompt: "@文字编辑 阿简 第一段经历读起来太 AI 了，帮我改得像人话", expect: "plain-editor" },
  { id: "not-exaggerated", resumeCase: "chinese-lit-to-admin", prompt: "帮我改一下第一段经历，不要太夸张" },
  { id: "no-facts-given", resumeCase: "finance-basic", prompt: "帮我写一段放在简历关于班委的干部描述" }
];

async function runExperts() {
  const jobs = EXPERT_SCENARIOS.flatMap((scenario) => Array.from({ length: RUNS }, (_, run) => async () => {
    const resumeCase = cases.get(scenario.resumeCase)!;
    const conversation = startConversation("resume_coach", { profile: profileFor(resumeCase.resume), job: resumeCase.job });
    const turn = await say(conversation, scenario.prompt);
    const evidence = evidenceFor(resumeCase, conversation);
    const allow = [resumeCase.job.position, resumeCase.job.company];
    const experts = consultedExperts(conversation.turns);
    // Expert notes are shown to the user as they are, so they must not invent facts either.
    const noteFindings = (turn.agentRun.notes ?? []).flatMap((note) =>
      findUnsupportedClaims(note.content.split(/\n改动：/)[0], evidence, { allow, before: "" })
        // Opinions number their points and give scores ("1.", "3 分"); only larger numbers can be invented facts.
        .filter((finding) => finding.kind !== "ownership" && !(finding.kind === "number" && Number(finding.value) <= 10))
        .map((finding) => `${note.expertName} ${finding.kind}:${finding.value}`));
    const rewriteFindings = turn.agentRun.rewrites.flatMap((rewrite) =>
      findUnsupportedClaims(rewrite.after, evidence, { allow, before: rewrite.before }).map((finding) => `${finding.kind}:${finding.value}`));
    // Code cannot see an invented role or duty without numbers ("生活委员：管班费"); the judge can.
    const scores = await Promise.all(turn.agentRun.rewrites.map((rewrite) => judge(judgeModel, {
      before: rewrite.before,
      after: rewrite.after,
      evidence: evidence.join("\n"),
      job: `${resumeCase.job.company} · ${resumeCase.job.position}`
    })));
    const result = {
      scenario: scenario.id,
      run,
      expected: scenario.expect,
      judge: scores,
      consulted: experts,
      namedExpertConsulted: scenario.expect ? experts.includes(scenario.expect) : null,
      noteFindings,
      rewrites: turn.agentRun.rewrites.length,
      rewriteFindings,
      rejected: rejectedProposals(conversation.turns),
      reply: turn.reply
    };
    console.log(`✓ experts ${scenario.id} #${run + 1}  请了 ${experts.join(",") || "-"}${scenario.expect ? `  点名命中 ${result.namedExpertConsulted}` : ""}  专家意见可疑 ${noteFindings.length}  改写 ${result.rewrites}  改写可疑 ${rewriteFindings.length}  被拦截 ${result.rejected.length}`);
    return result;
  }));
  const results = await pool(jobs);
  const named = results.filter((item) => item.expected);
  return {
    summary: {
      conversations: results.length,
      namedExpertHitRate: ratio(named.filter((item) => item.namedExpertConsulted).length, named.length),
      noteFindings: results.reduce((sum, item) => sum + item.noteFindings.length, 0),
      rewriteFindings: results.reduce((sum, item) => sum + item.rewriteFindings.length, 0),
      rejectedProposals: results.reduce((sum, item) => sum + item.rejected.length, 0),
      judge: meanScores(results.flatMap((item) => item.judge)),
      unfaithfulRewrites: results.flatMap((item) => item.judge).filter((score) => score && score.faithful <= 2).length
    },
    results
  };
}

// ---------- main ----------

const report: Record<string, unknown> = { model: config.aiModel, runsPerScenario: RUNS };
if (SUITES.includes("radar")) report.radar = await runRadar();
if (SUITES.includes("interview")) report.interview = await runInterview();
if (SUITES.includes("experts")) report.experts = await runExperts();

console.log("\n=== 团队评测 ===");
for (const suite of SUITES) {
  const section = report[suite] as { summary: unknown } | undefined;
  if (section) console.log(suite, JSON.stringify(section.summary));
}
const outDir = join(here, "results");
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `team-evals-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(`报告已写入 ${file}`);
