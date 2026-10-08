/**
 * Job radar team: find openings in the JobKoI opportunity feed.
 *
 * The model writes search queries itself, checks the results against the
 * user's hard constraints (届别, 城市…) and picks which ones to show. Cards can
 * only come from search results, so it cannot recommend a job that does not exist.
 */
import type { ChatAgentExpertNote, ChatOpportunityResults, JobApplication, PersonalProfile, RecruitmentOpportunity } from "@offerflow/domain";
import { createConsultExpertTool, type ExpertSkill } from "./experts.ts";
import { applicationSummary, getResumeTool, listApplicationsTool, resumeEntries } from "./material-tools.ts";
import type { AgentTool, ModelClient } from "./loop.ts";
import { expertPanelRules } from "./resume-coach.ts";

export const RADAR_TEAM_DEFAULT_SKILLS = ["job-analyst", "soe-hr", "funnel-analyst"];
const MAX_SEARCHES = 4;
const MAX_SHOWN = 6;
/** Openings returned to the model per search. */
const ITEMS_PER_SEARCH = 12;
/** "Which companies have I not applied to" is a set difference over every match, not over one page. */
const WHOLE_FEED = 5_000;
const MAX_COMPANIES = 40;

/** Search options the team passes to the feed. */
export interface OpportunitySearch {
  (query: string, options?: { limit?: number }): Promise<ChatOpportunityResults>;
}

/** Matches grouped by company, most openings first. */
function companySummary(items: RecruitmentOpportunity[]) {
  const byCompany = new Map<string, RecruitmentOpportunity[]>();
  for (const item of items) byCompany.set(item.company, [...(byCompany.get(item.company) ?? []), item]);
  return [...byCompany.entries()]
    .sort((left, right) => right[1].length - left[1].length || (right[1][0].updatedAt ?? "").localeCompare(left[1][0].updatedAt ?? ""))
    .slice(0, MAX_COMPANIES)
    .map(([company, openings]) => ({
      company,
      openings: openings.length,
      roles: [...new Set(openings.flatMap((item) => item.roleTags))].slice(0, 4),
      cities: [...new Set(openings.flatMap((item) => item.cities))].slice(0, 3),
      exampleId: openings[0].id
    }));
}

function compact(opportunity: RecruitmentOpportunity, flags: { applied?: boolean; shownBefore?: boolean } = {}) {
  return {
    ...(flags.applied ? { applied: true } : {}),
    ...(flags.shownBefore ? { shownBefore: true } : {}),
    id: opportunity.id,
    company: opportunity.company,
    title: opportunity.title,
    cities: opportunity.cities,
    graduationYears: opportunity.graduationYears,
    batch: opportunity.batch,
    status: opportunity.status,
    deadline: opportunity.deadline,
    roleTags: opportunity.roleTags.slice(0, 5)
  };
}

export function createJobRadarSession(options: {
  search: OpportunitySearch;
  applications: JobApplication[];
  profile?: PersonalProfile;
  userStatements: () => string[];
  experts?: ExpertSkill[];
  expertModel?: ModelClient;
  onExpertNote?: (note: ChatAgentExpertNote) => void;
  /** Opening ids shown as cards in earlier turns, so "换一组" can skip them. */
  shownBefore?: string[];
}) {
  const appliedCompanies = options.applications.map((application) => application.company.trim()).filter(Boolean);
  const applied = (item: RecruitmentOpportunity) =>
    appliedCompanies.some((company) => item.company.includes(company) || company.includes(item.company));
  const shownBefore = new Set(options.shownBefore ?? []);
  // Flags the model can see on every result, so it does not have to remember to cross-check.
  const flagged = (item: RecruitmentOpportunity) => compact(item, {
    applied: applied(item),
    shownBefore: shownBefore.has(item.id)
  });
  const entries = options.profile ? resumeEntries(options.profile) : [];
  const seen = new Map<string, RecruitmentOpportunity>();
  const notes: ChatAgentExpertNote[] = [];
  let lastResults: ChatOpportunityResults | undefined;
  let shown: ChatOpportunityResults | undefined;
  let searches = 0;

  const tools: AgentTool[] = [
    {
      name: "search_opportunities",
      description: "在 JobKoI 岗位库里检索还能投的校招岗位。query 用关键词写清条件，例如“上海 产品经理 2027届 秋招”。用户问“还有哪些公司没投”“我没投过的”时，把 exclude_applied 设为 true：系统会在全部匹配结果里去掉用户投过的公司，并按公司汇总。可以根据结果调整条件再查，每轮最多查 4 次。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "检索条件：方向、城市、届别、公司、批次等关键词" },
          exclude_applied: { type: "boolean", description: "为 true 时排除用户已经投过的公司，并返回按公司汇总的结果" }
        },
        required: ["query"],
        additionalProperties: false
      },
      async run(args) {
        if (searches >= MAX_SEARCHES) return { error: "这一轮检索次数已用完，请根据已有结果回答" };
        searches += 1;
        const query = String(args.query || "");
        if (args.exclude_applied !== true) {
          const results = await options.search(query);
          lastResults = results;
          for (const item of results.items) seen.set(item.id, item);
          return {
            total: results.total,
            sourceAvailable: results.sourceAvailable,
            feedUpdatedAt: results.sourceUpdatedAt,
            items: results.items.map(flagged)
          };
        }
        // Computed in code over every match, so the answer does not depend on which page the model saw.
        const results = await options.search(query, { limit: WHOLE_FEED });
        const unapplied = results.items.filter((item) => !applied(item));
        for (const item of unapplied) seen.set(item.id, item);
        lastResults = { ...results, total: unapplied.length, items: unapplied.slice(0, ITEMS_PER_SEARCH) };
        const companies = companySummary(unapplied);
        return {
          total: unapplied.length,
          sourceAvailable: results.sourceAvailable,
          feedUpdatedAt: results.sourceUpdatedAt,
          appliedCompaniesExcluded: new Set(results.items.filter(applied).map((item) => item.company)).size,
          companyCount: new Set(unapplied.map((item) => item.company)).size,
          companies,
          items: unapplied.slice(0, ITEMS_PER_SEARCH).map(flagged),
          // Without a direction the answer is "most of the feed", which helps nobody; the
          // direction is usually already in the user's applications, so search again rather than ask.
          ...(results.isBroadSearch ? {
            hint: "这次检索没有岗位方向条件，结果几乎是整个岗位库。先调用 list_applications 看用户投得最多的岗位方向，把方向（如“产品经理”）和届别写进 query 再查一次，不要反过来问用户方向。"
          } : {})
        };
      }
    },
    {
      name: "show_opportunities",
      presents: true,
      description: `从检索结果里选出要以卡片展示给用户的岗位（最多 ${MAX_SHOWN} 个），按推荐顺序排列。只能选检索结果里出现过的 id；不符合用户硬性条件（届别、城市等）的不要选。`,
      parameters: {
        type: "object",
        properties: { ids: { type: "array", items: { type: "string" }, description: "岗位 id，按推荐顺序" } },
        required: ["ids"],
        additionalProperties: false
      },
      run(args) {
        const ids = Array.isArray(args.ids) ? args.ids.map(String) : [];
        const unknown = ids.filter((id) => !seen.has(id));
        if (unknown.length) return { error: `这些 id 不在检索结果里：${unknown.join("、")}` };
        const items = ids.slice(0, MAX_SHOWN).map((id) => seen.get(id)!);
        shown = { ...(lastResults ?? { query: "", sourceAvailable: true, isBroadSearch: false }), total: items.length, items };
        return { shown: items.length };
      }
    },
    listApplicationsTool(options.applications),
    getResumeTool(entries)
  ];

  const consult = options.expertModel && createConsultExpertTool({
    experts: options.experts ?? [],
    model: options.expertModel,
    materials: () => [
      "【这轮检索到的岗位】",
      [...seen.values()].map((item) => JSON.stringify(flagged(item))).join("\n") || "（还没有检索）", "",
      "【用户的投递记录】",
      options.applications.slice(0, 30).map((application) => JSON.stringify(applicationSummary(application))).join("\n") || "（没有）", "",
      "【简历】", entries.map((entry) => `【${entry.title}】\n${entry.text}`).join("\n\n") || "（还没有简历）", "",
      "【用户最近说的话】", options.userStatements().slice(-6).map((line) => `- ${line}`).join("\n")
    ].join("\n"),
    onNote: (note) => {
      notes.push(note);
      options.onExpertNote?.(note);
    }
  });
  if (consult) tools.push(consult);

  return {
    tools,
    notes,
    /** Cards for the message: the chosen ones, else the last search. */
    results: () => shown ?? lastResults
  };
}

export function jobRadarSystemPrompt(experts: ExpertSkill[]): string {
  return [
    "你是 JobKoI 岗位雷达团队的主教练“小鲤”，帮用户在 JobKoI 岗位库里找到真正适合、现在还能投的校招岗位。",
    "",
    "工作方式：",
    "1. 先弄清硬性条件：方向、城市、届别。对话里已经说过的不要再问；完全没有线索时，先按已知条件检索，再问一个最关键的条件。",
    "2. 用 search_opportunities 检索。结果太少就放宽条件，太多或不准就收紧，每轮最多查 4 次。",
    "3. 逐条核对结果：届别、城市不符合用户硬性条件的直接排除。用户要求 2026 届，就不能推荐只招 2027 届的岗位。",
    "   结果里标了 applied 的是用户已经投过的公司，除非用户要求，否则不推荐；用户说“换一组”“再来几个”时，不要再选标了 shownBefore 的岗位。",
    "4. 用 show_opportunities 选出最值得投的岗位（最多 6 个）展示成卡片。卡片会单独显示，你的回复里不要再逐条罗列公司和链接，只用几句话说明为什么推荐这几个、各自适合他的哪一点。",
    "5. 需要判断和他简历的匹配度时，调用 get_resume。用户问“还有哪些公司没投”时，用 exclude_applied: true 检索，按返回的 companies 回答：一共多少家没投、排除了多少家已投、最值得先看的几家，再从中挑卡片。不要自己去数或比对已投记录。",
    ...expertPanelRules(experts),
    "",
    "硬规则：",
    "- 只能推荐检索结果里真实存在的岗位，不编造岗位、公司、截止时间或链接。",
    "- 检索不到时如实说，并建议放宽哪个条件。",
    "- 薪资、编制、招录人数等岗位库里没有的信息，说明需要以官方公告为准。",
    "- 所有回复都用中文。"
  ].join("\n");
}
