/**
 * Evals for the default agent (no team invited), built from a real failed chat:
 * a user with 93 applications asked which companies they had not applied to yet.
 * The old chat saw 5 of the 93 records, asked for a city twice and then said it
 * had "submitted the search" without searching.
 *
 * Runs the real model through runTeamTurn against the real opportunity feed, and
 * checks in code: did it search, did it exclude applied companies, did any card
 * come from a company already applied to, did it claim an action it never took.
 *
 *   cd apps/api
 *   node --env-file=.env --experimental-transform-types evals/run-companion-evals.ts [--runs 3]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPANION_AGENT,
  DEFAULT_CAMPUS_HIRING_FEED_URL,
  type ChatMessage,
  type JobApplication,
  type RecruitmentOpportunity
} from "@offerflow/domain";
import { loadApiConfig } from "../src/config.ts";
import type { AgentMessage } from "../src/agent/loop.ts";
import { sameCompany } from "../src/agent/material-tools.ts";
import { createOpenAiCompatibleModel } from "../src/agent/model.ts";
import { runTeamTurn, type TeamMaterials, type TeamTurnResult } from "../src/agent/teams.ts";
import { fetchCampusHiringSnapshot, searchOpportunitySnapshot } from "../src/opportunities/search.ts";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name: string) => {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const RUNS = Number(arg("--runs") || 3);
const ONLY = arg("--only")?.split(",");
const TODAY = "2026-10-08（星期四）";

const config = loadApiConfig(process.env);
const model = createOpenAiCompatibleModel(config, { temperature: 0.3 });

// ---------- fixtures ----------

/** The companies the user's real chat showed, as they were typed into the tracker. */
const NAMED_COMPANIES = ["字节跳动", "快手", "小米", "TCL", "H3C", "京东方", "大疆", "安克创新", "汇川技术", "赛力斯", "小鹏汽车", "泡泡玛特", "满帮集团", "万兴科技", "广州凡岛"];

function application(index: number, company: string, overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: `app-${index}`,
    company,
    position: index % 3 ? "AI产品经理" : "产品经理",
    city: ["北京", "深圳", "广州"][index % 3],
    stage: "applied",
    responsibilities: [],
    requirements: [],
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...overrides
  } as JobApplication;
}

/** 93 records: the named companies plus product roles at companies taken from the feed itself. */
function applicationsFor(feed: RecruitmentOpportunity[]): JobApplication[] {
  const productCompanies = [...new Set(feed
    .filter((item) => item.roleTags.some((tag) => tag.includes("产品")) && item.graduationYears.some((year) => year.includes("2027")))
    .map((item) => item.company))]
    .filter((company) => !NAMED_COMPANIES.some((named) => company.includes(named)))
    .slice(0, 50);
  const companies = [...NAMED_COMPANIES, ...productCompanies];
  // Three assessments, as in the user's real tracker: H3C and 汇川 already done, only 满帮 still to take.
  const assessments: Record<string, Partial<JobApplication>> = {
    H3C: { stage: "assessment", assessmentType: "written_test", deadline: "2026-10-09", assessmentCompleted: true },
    满帮集团: { stage: "assessment", assessmentType: "written_test", deadline: "2026-10-09", nextAction: "完成测评" },
    汇川技术: { stage: "assessment", deadline: "2026-10-11", assessmentCompleted: true }
  };
  return Array.from({ length: 93 }, (_, index) => {
    const company = companies[index % companies.length];
    return application(index, company, index < companies.length ? assessments[company] ?? {} : {});
  });
}

// ---------- running a conversation ----------

interface Scenario {
  id: string;
  /** An earlier user turn, played first so the prompt is a follow-up. */
  before?: string;
  prompt: string;
  check: (turn: TeamTurnResult, context: { applications: JobApplication[] }) => Record<string, unknown>;
}

function toolCalls(turn: TeamTurnResult) {
  return (turn.agentRun.trace as AgentMessage[]).flatMap((message) => (message.tool_calls ?? []).map((call) => ({
    name: call.function.name,
    args: JSON.parse(call.function.arguments || "{}") as Record<string, unknown>,
    result: JSON.parse((turn.agentRun.trace as AgentMessage[]).find((item) => item.role === "tool" && item.tool_call_id === call.id)?.content || "{}") as Record<string, unknown>
  })));
}

const appliedTo = (company: string, applications: JobApplication[]) =>
  applications.some((item) => sameCompany(item.company, company));

// Saying a search happened, or results are on their way, when no search was made this turn.
const CLAIMED_ACTION = /(?:已经?|这就|正在)(?:帮你)?(?:提交|发起|触发|去)?(?:了)?(?:检索|搜索|查询)|结果(?:马上|稍后|会|很快)(?:就)?(?:回来|返回|出来)/;

function common(turn: TeamTurnResult, applications: JobApplication[]) {
  const calls = toolCalls(turn);
  const searched = calls.some((call) => call.name === "search_opportunities");
  // A sentence pushing a deadline for H3C or 汇川, whose assessments are already done.
  const chasesDoneAssessment = turn.reply.split(/[。！？\n]/).some((sentence) =>
    /H3C|汇川/.test(sentence) && /截止|别拖|抓紧|赶紧|尽快|明天|今天|到期/.test(sentence)
      && !/完成|做完|交完|不用管|不用赶|不用再|✅|✓/.test(sentence));
  // "覆盖 17 家公司" when the records cover 65: a count the model made up instead of reading.
  const statedCompanies = turn.reply.match(/(?:覆盖|涉及|投了)\s*(\d+)\s*家/)?.[1];
  const companyCount = new Set(applications.map((item) => item.company)).size;
  return {
    tools: calls.map((call) => call.name),
    usedTools: calls.length > 0,
    claimedActionWithoutTool: !searched && CLAIMED_ACTION.test(turn.reply),
    chasesDoneAssessment,
    wrongAppliedCompanyCount: statedCompanies !== undefined && Number(statedCompanies) !== companyCount ? Number(statedCompanies) : null,
    replyChars: turn.reply.length
  };
}

const SCENARIOS: Scenario[] = [
  {
    id: "unapplied-companies",
    prompt: "根据我现在的投递情况 告诉我有没有什么公司我还没投的",
    // Outcomes only: how the model gets there (its own knowledge, the feed, or both) is its call.
    check(turn, { applications }) {
      const looked = toolCalls(turn).filter((call) => call.name === "lookup_companies")
        .flatMap((call) => (call.result.companies as Array<{ company: string; openings: number; applied: boolean }> | undefined) ?? []);
      const named = (company: string) => turn.reply.includes(company);
      const unlistedNamed = looked.filter((item) => !item.applied && item.openings === 0 && named(item.company)).map((item) => item.company);
      const cards = turn.opportunityResults?.items ?? [];
      return {
        companiesFromKnowledge: looked.filter((item) => !item.applied).map((item) => item.company),
        hiringInFeed: looked.filter((item) => !item.applied && item.openings > 0).map((item) => item.company),
        // Companies the feed does not list may be named, but not as if they were hiring.
        unlistedNamed,
        unlistedLabeled: !unlistedNamed.length || /官网|未收录|没有收录|没收录|没查到|岗位库里没有|暂无/.test(turn.reply),
        appliedRecommendedAgain: looked.filter((item) => item.applied && named(item.company) && !/投过|已投/.test(turn.reply)).map((item) => item.company),
        // The fixture has 字节跳动、快手、小米 among the applications: saying big tech is untouched,
        // without naming any of them, is false. ("腾讯、携程…你没投，而你投了字节" is fine.)
        overclaimsNoBigTech: /大厂.{0,12}(?:一个没碰|一个都没|一家(?:都)?没投|全(?:都)?空|没碰过)/.test(turn.reply)
          && !/字节|快手|小米/.test(turn.reply),
        cards: cards.length,
        cardsFromAppliedCompanies: cards.filter((item) => appliedTo(item.company, applications)).map((item) => item.company)
      };
    }
  },
  {
    id: "my-applications",
    prompt: "我投了哪些公司？有没有快截止要处理的",
    check(turn) {
      return {
        readAllApplications: toolCalls(turn).some((call) => call.name === "list_applications" && call.result.total === 93),
        // 满帮 is the one assessment still to take, due tomorrow.
        mentionsDueTomorrow: /满帮/.test(turn.reply)
      };
    }
  },
  {
    id: "nationwide-ai-pm",
    prompt: "帮我找全国的 AI 产品经理岗位，2027届",
    check(turn) {
      const cards = turn.opportunityResults?.items ?? [];
      return {
        cards: cards.length,
        cardsWrongCohort: cards.filter((item) => item.graduationYears.length && !item.graduationYears.some((year) => year.includes("2027"))).map((item) => item.id)
      };
    }
  },
  {
    id: "anxious-chat",
    prompt: "投了九十多个了还没几个回复，有点焦虑",
    check(turn) {
      return { replyUnder400Chars: turn.reply.length <= 400 };
    }
  },
  {
    // The exact wording of the failed chat's second turn: one word, no context of its own.
    id: "one-word-follow-up",
    before: "根据我现在的投递情况 告诉我有没有什么公司我还没投的",
    prompt: "全国",
    check(turn, { applications }) {
      const cards = turn.opportunityResults?.items ?? [];
      return {
        actedOnOneWord: toolCalls(turn).some((call) => call.name === "search_opportunities" || call.name === "lookup_companies"),
        cardsFromAppliedCompanies: cards.filter((item) => appliedTo(item.company, applications)).map((item) => item.company)
      };
    }
  }
];

async function main() {
  const feed = await fetchCampusHiringSnapshot(DEFAULT_CAMPUS_HIRING_FEED_URL);
  const applications = applicationsFor(feed.opportunities);
  console.log(`feed ${feed.opportunities.length} openings (source ${feed.sourceUpdatedAt}); ${applications.length} applications`);
  const materials: TeamMaterials = {
    applications,
    search: async (query, options) => searchOpportunitySnapshot(feed, query, { limit: options?.limit ?? 12, sourceAvailable: true }),
    today: TODAY
  };

  const results: Array<Record<string, unknown>> = [];
  for (const scenario of SCENARIOS.filter((item) => !ONLY || ONLY.includes(item.id))) {
    for (let run = 0; run < RUNS; run++) {
      const started = Date.now();
      try {
        const history: ChatMessage[] = [];
        if (scenario.before) {
          const first = await runTeamTurn({ team: COMPANION_AGENT, model, materials, experts: [], history, prompt: scenario.before });
          history.push(
            { id: "u0", role: "user", content: scenario.before, attachments: [], citations: [], status: "complete" } as unknown as ChatMessage,
            { id: "a0", role: "assistant", content: first.reply, attachments: [], citations: [], status: "complete", agentRun: first.agentRun } as unknown as ChatMessage
          );
        }
        const turn = await runTeamTurn({ team: COMPANION_AGENT, model, materials, experts: [], history, prompt: scenario.prompt });
        const result = { scenario: scenario.id, run, seconds: Math.round((Date.now() - started) / 100) / 10, ...common(turn, applications), ...scenario.check(turn, { applications }), reply: turn.reply };
        results.push(result);
        const { reply: _reply, ...shown } = result;
        console.log(`✓ ${scenario.id} #${run + 1}`, JSON.stringify(shown));
      } catch (error) {
        console.log(`✗ ${scenario.id} #${run + 1}  ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const outDir = join(here, "results");
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `companion-evals-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ model: config.aiModel, runsPerScenario: RUNS, feedSourceUpdatedAt: feed.sourceUpdatedAt, results }, null, 2));
  console.log(`报告已写入 ${file}`);
}

await main();
