/**
 * The default agent: answers when the user has not invited a team.
 *
 * It replaces the old chat that guessed from regexes when to search and which
 * five application records to paste into the prompt. Here the model fetches
 * what it needs: every application record, the opportunity feed, which of a
 * list of companies are hiring, the resume, and the materials the user picked.
 * The prompt gives principles, not procedures: the model decides how to combine
 * its own knowledge with these tools. Its tools only read; resume rewrites and
 * mock interviews stay with the teams, whose tools carry the fabrication guard.
 */
import type { JobApplication, PersonalProfile, TailorJobContext } from "@offerflow/domain";
import { companionSystemPrompt } from "../ai/companion.ts";
import { assistantRuntimeContext } from "../ai/runtime-context.ts";
import { createJobRadarSession, type OpportunitySearch } from "./job-radar.ts";
import { getJobTool } from "./material-tools.ts";
import type { AgentTool } from "./loop.ts";

/** Something the user picked in the composer: an application, a resume version or an interview record. */
export interface SelectedMaterial {
  title: string;
  content: string;
}

export function createCompanionSession(options: {
  search: OpportunitySearch;
  applications: JobApplication[];
  profile?: PersonalProfile;
  job?: TailorJobContext;
  selected?: SelectedMaterial[];
  userStatements: () => string[];
  shownBefore?: string[];
}) {
  const radar = createJobRadarSession({
    search: options.search,
    applications: options.applications,
    profile: options.profile,
    userStatements: options.userStatements,
    shownBefore: options.shownBefore
  });
  const tools: AgentTool[] = [...radar.tools, getJobTool(options.job)];
  if (options.selected?.length) {
    tools.push({
      name: "read_selected_materials",
      description: "读取用户在输入框里选中的材料（投递记录、简历版本或面试记录）的全文。用户提到“这份”“这条”“我选的”时先调用。",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      run: () => ({ materials: options.selected })
    });
  }
  return { tools, notes: radar.notes, results: radar.results };
}

export function companionAgentPrompt(now: Date = new Date()): string {
  return [
    companionSystemPrompt(),
    "",
    assistantRuntimeContext(now),
    "",
    "你有工具可以读用户的全部投递记录、简历和选中的材料，检索 JobKoI 岗位库（第三方公开的校招数据），核对一批公司在岗位库里有没有在招，以及把岗位展示成带投递链接的卡片。需要什么就自己调用。",
    "",
    "原则：",
    "- 先想清楚用户真正要解决什么、什么样的回答对他最有用，再决定用你自己的知识、工具里的数据，还是两者结合。",
    "- 好的回答要有你的判断，而不是复述工具结果。工具给的是数据库按条数排的名单；用户要的往往是懂行的人才看得出的东西：他漏掉了哪一类公司、哪些同类公司最值得投、为什么。",
    "- 你自己对行业、公司、岗位的了解可以放心用，用户往往正需要这种视野。但“某家公司现在在招、截止时间、投递链接”只能来自岗位库；凭了解提到的公司，要么核对过，要么说清楚是你的推荐、需要去官网确认。",
    "- 先做再问：能从对话和投递记录里看出来的，不要问用户。",
    "- 只说已经做完的事，不说“已经帮你检索”“结果马上回来”这类没发生的事。数量用工具算好的。",
    "- 卡片会单独显示，回复里不用再罗列链接。改简历、完整的模拟面试，交给用户在输入框上方邀请的“简历精修团队”“面试陪练团队”，那里会核对每条改写的出处。",
    "- 回复短而具体，先给结果，再给一个下一步，一般不超过 300 字。要列名单时，列最值得看的 6 个左右，其余一句话带过。"
  ].join("\n");
}
