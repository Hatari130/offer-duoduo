/**
 * Evals for the write tools, on the real model. Nothing is written: the actions
 * record what the model asked to change, and code checks it.
 *
 * The failure that matters most is a write nobody asked for: an application
 * changed on a guess, or a resume saved before the user said to.
 *
 *   cd apps/api
 *   node --env-file=.env --experimental-transform-types evals/run-write-evals.ts [--runs 3]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMPANION_AGENT, createEmptyPersonalProfile, type ChatMessage, type JobApplication } from "@offerflow/domain";
import { loadApiConfig } from "../src/config.ts";
import { createOpenAiCompatibleModel } from "../src/agent/model.ts";
import { runTeamTurn, type TeamMaterials, type TeamTurnResult } from "../src/agent/teams.ts";
import type { AgentWriteActions, ApplicationUpdate } from "../src/agent/material-tools.ts";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name: string) => {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const RUNS = Number(arg("--runs") || 3);
const config = loadApiConfig(process.env);
const model = createOpenAiCompatibleModel(config, { temperature: 0.3 });

function application(id: string, company: string, overrides: Partial<JobApplication> = {}): JobApplication {
  return { id, company, position: "产品经理", city: "北京", stage: "applied", sourceUrl: "", sourceHost: "", responsibilities: [], requirements: [], events: [], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...overrides } as JobApplication;
}

/** Records writes instead of making them. */
function recordingActions(applications: JobApplication[]) {
  const updates: ApplicationUpdate[] = [];
  const saves: Array<{ rewrites: number }> = [];
  const actions: AgentWriteActions = {
    async saveTailoredResume({ rewrites }) {
      saves.push({ rewrites: rewrites.length });
      return { kind: "tailored_resume", title: "远航智能 · 新媒体运营", detail: `写入 ${rewrites.length} 条改写`, href: "/app/resumes/tailor/t1", versionId: "v1" };
    },
    async updateApplication(update) {
      updates.push(update);
      const current = applications.find((item) => item.id === update.applicationId)!;
      const next = { ...current, ...(update.stage ? { stage: update.stage } : {}), ...(update.assessmentDone !== undefined ? { assessmentCompleted: update.assessmentDone } : {}) } as JobApplication;
      return { write: { kind: "application", title: `${current.company} · ${current.position}`, detail: "已更新", href: "/app/applications" }, application: next };
    }
  };
  return { actions, updates, saves };
}

const feed: TeamMaterials["search"] = async () => ({ query: "", total: 0, items: [], sourceAvailable: true, isBroadSearch: true });
const asHistory = (prompt: string, turn: TeamTurnResult): ChatMessage[] => [
  { id: `u-${prompt}`, role: "user", content: prompt, attachments: [], citations: [], status: "complete" } as unknown as ChatMessage,
  { id: `a-${prompt}`, role: "assistant", content: turn.reply, attachments: [], citations: [], status: "complete", agentRun: turn.agentRun } as unknown as ChatMessage
];

// ---------- 小鲤 and application updates ----------

interface StatusCase {
  id: string;
  prompt: string;
  /** The single update the user's words call for; undefined means nothing should change. */
  expect?: (update: ApplicationUpdate) => boolean;
}

const STATUS_CASES: StatusCase[] = [
  { id: "assessment-done", prompt: "H3C 的测评我刚做完了", expect: (update) => update.applicationId === "h3c" && update.assessmentDone === true },
  { id: "second-round", prompt: "字节那个我进二面了", expect: (update) => update.applicationId === "bytedance" && update.stage === "interview" && update.interviewRound === "interview_2" },
  { id: "worry-only", prompt: "满帮的测评感觉挺难的，我有点怕" },
  { id: "question-only", prompt: "我还有哪些测评没做？" }
];

async function statusRun(testCase: StatusCase) {
  const applications = [
    application("h3c", "H3C", { stage: "assessment", deadline: "2026-10-09" }),
    application("manbang", "满帮集团", { stage: "assessment", deadline: "2026-10-09" }),
    application("bytedance", "字节跳动", { stage: "interview", interviewRound: "interview_1" }),
    application("kuaishou", "快手")
  ];
  const recorded = recordingActions(applications);
  const turn = await runTeamTurn({
    team: COMPANION_AGENT, model, experts: [], history: [], prompt: testCase.prompt,
    materials: { applications, search: feed, today: "2026-10-09（星期五）", actions: recorded.actions }
  });
  // None of these prompts states a next step, so writing one is the model's own guess put into the user's record.
  const guessedNextAction = recorded.updates.some((update) => update.nextAction);
  const passed = !guessedNextAction && (testCase.expect
    ? recorded.updates.length === 1 && testCase.expect(recorded.updates[0])
    : recorded.updates.length === 0);
  return { scenario: testCase.id, passed, updates: recorded.updates, reply: turn.reply };
}

// ---------- the resume team and saving ----------

async function resumeRun() {
  const profile = {
    ...createEmptyPersonalProfile(),
    selfIntroduction: "汉语言文学专业本科生。",
    campusExperiences: [{ id: "camp-1", type: "学院融媒体中心", role: "干事", startDate: "2024-09", endDate: "2026-06", description: "• 写公众号推文，管理学院公众号" }]
  };
  const job = { company: "远航智能", position: "新媒体运营", sourceUrl: "", responsibilities: ["公众号内容策划与运营"], requirements: ["文字功底好", "有新媒体运营经验"] };
  const recorded = recordingActions([]);
  const materials: TeamMaterials = { profile, job, applications: [], search: feed, today: "2026-10-09（星期五）", actions: recorded.actions };
  const history: ChatMessage[] = [];
  const turns: Array<{ prompt: string; savesAfter: number }> = [];
  for (const prompt of [
    "帮我把简历针对这个岗位改一下。公众号我一共写了 40 多篇，最高的一篇 3000 阅读。",
    "可以，就按这个，帮我保存到定岗简历"
  ]) {
    const turn = await runTeamTurn({ team: "resume_coach", model, experts: [], history, prompt, materials });
    history.push(...asHistory(prompt, turn));
    turns.push({ prompt, savesAfter: recorded.saves.length });
  }
  return {
    scenario: "save-only-when-asked",
    savedBeforeAsked: turns[0].savesAfter > 0,
    savedWhenAsked: turns[1].savesAfter > turns[0].savesAfter,
    rewritesSaved: recorded.saves.at(-1)?.rewrites ?? 0,
    passed: turns[0].savesAfter === 0 && turns[1].savesAfter > 0,
    reply: history.at(-1)?.content
  };
}

async function main() {
  const results: Array<Record<string, unknown>> = [];
  for (let run = 0; run < RUNS; run++) {
    for (const testCase of STATUS_CASES) {
      const result = await statusRun(testCase);
      results.push({ run, ...result });
      console.log(`${result.passed ? "✓" : "✗"} ${result.scenario} #${run + 1}  updates=${JSON.stringify(result.updates)}`);
    }
    const resume = await resumeRun();
    results.push({ run, ...resume });
    console.log(`${resume.passed ? "✓" : "✗"} ${resume.scenario} #${run + 1}  savedBeforeAsked=${resume.savedBeforeAsked} savedWhenAsked=${resume.savedWhenAsked} rewrites=${resume.rewritesSaved}`);
  }
  const passed = results.filter((result) => result.passed).length;
  console.log(`\n通过 ${passed}/${results.length}`);
  const outDir = join(here, "results");
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `write-evals-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ model: config.aiModel, runs: RUNS, passed, total: results.length, results }, null, 2));
  console.log(`报告已写入 ${file}`);
}

await main();
