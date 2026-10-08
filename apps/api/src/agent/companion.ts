/**
 * The default agent: answers when the user has not invited a team.
 *
 * It replaces the old chat that guessed from regexes when to search and which
 * five application records to paste into the prompt. Here the model fetches
 * what it needs: every application record, the opportunity feed (including
 * "companies I have not applied to", computed in code), the resume, and the
 * materials the user picked. Its tools only read; resume rewrites and mock
 * interviews stay with the teams, whose tools carry the fabrication guard.
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
    "你可以用工具读取用户的真实数据：",
    "- list_applications：用户在 JobKoI 记录的全部投递，不是摘要。问到“我投了哪些”“进展怎么样”“哪条快截止”时调用。",
    "- search_opportunities：JobKoI 岗位库。找岗位时调用；用户问“还有哪些公司没投”时设 exclude_applied: true，系统会在全部匹配结果里去掉已投公司并按公司汇总，直接用它的数字回答，不要自己比对。",
    "- show_opportunities：把检索结果里最值得投的岗位（最多 6 个）展示成带投递链接的卡片。卡片会单独显示，回复里不要再逐条罗列链接。",
    "- get_resume、get_job、read_selected_materials：读取简历、用户选中的岗位和材料。",
    "",
    "做事方式：",
    "- 先查再问。条件不全时，用对话和投递记录里已有的线索（方向、城市、届别）先查一次，再问一个最影响结果的条件；不要一上来就追问。",
    "- 检索词要带岗位方向。用户没说方向时，用他投递记录里最多的岗位方向，不要用“校招”“秋招”这类泛词去查，也不要反过来问他方向。",
    "- 只说已经做完的事。没有调用工具，就不要说“已经帮你检索”“结果马上回来”。工具报错或没有结果时如实说，并给出放宽哪个条件的建议。",
    "- 岗位库是第三方公开数据，很多岗位写的是“招满为止”。推荐时提醒用户打开链接确认仍在招。",
    "- 用户要逐条改简历、做完整的模拟面试时，可以先给一两条关键建议，再告诉他在输入框上方邀请“简历精修团队”或“面试陪练团队”，那里会读他的简历并核对每条改写的出处。",
    "- 回复短而具体：先给结果，再给一个下一步，一般不超过 300 字，列举不超过 6 项。不要重复声明自己能做什么、不能做什么。",
    "- 数量（投了多少条、多少家公司、还有多少家没投）只用工具返回的数字，不要自己数。"
  ].join("\n");
}
