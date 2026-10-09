/**
 * Career planning team: plans and reviews based on the user's real application records.
 */
import type { ChatAgentExpertNote, JobApplication, PersonalProfile } from "@offerflow/domain";
import { createConsultExpertTool, type ExpertSkill } from "./experts.ts";
import { applicationSummary, getResumeTool, listApplicationsTool, resumeEntries, updateApplicationTool, type AgentWriteActions } from "./material-tools.ts";
import type { AgentTool, ModelClient } from "./loop.ts";
import { expertPanelRules } from "./resume-coach.ts";

export const PLANNER_TEAM_DEFAULT_SKILLS = ["career-planner", "funnel-analyst", "senior-peer"];

export function createCareerPlannerSession(options: {
  applications: JobApplication[];
  profile?: PersonalProfile;
  userStatements: () => string[];
  /** Today's date in Asia/Shanghai, so plans and deadlines are computed from the real date. */
  today: string;
  experts?: ExpertSkill[];
  expertModel?: ModelClient;
  onExpertNote?: (note: ChatAgentExpertNote) => void;
  /** Writes to the user's data; without them the planner only reads. */
  actions?: AgentWriteActions;
}) {
  const entries = options.profile ? resumeEntries(options.profile) : [];
  const notes: ChatAgentExpertNote[] = [];
  const tools: AgentTool[] = [listApplicationsTool(options.applications), getResumeTool(entries)];
  if (options.actions) tools.push(updateApplicationTool(options.applications, options.actions));

  const consult = options.expertModel && createConsultExpertTool({
    experts: options.experts ?? [],
    model: options.expertModel,
    materials: () => [
      `【今天】${options.today}`, "",
      `【投递记录，共 ${options.applications.length} 条】`,
      options.applications.slice(0, 60).map((application) => JSON.stringify(applicationSummary(application))).join("\n") || "（没有）", "",
      "【简历】", entries.map((entry) => `【${entry.title}】\n${entry.text}`).join("\n\n") || "（还没有简历）", "",
      "【用户最近说的话】", options.userStatements().slice(-6).map((line) => `- ${line}`).join("\n")
    ].join("\n"),
    onNote: (note) => {
      notes.push(note);
      options.onExpertNote?.(note);
    }
  });
  if (consult) tools.push(consult);

  return { tools, notes };
}

export function careerPlannerSystemPrompt(experts: ExpertSkill[], canWrite = false): string {
  return [
    "你是 JobKoI 求职规划团队的主教练“小鲤”，根据用户真实的投递记录，帮他排计划、做复盘、理清下一步。",
    // The date itself arrives with each turn (runTeamTurn), so this prompt stays cacheable.
    "计算截止时间、排本周计划，都以对话里给出的当前北京时间为准。",
    "",
    "工作方式：",
    "1. 先调用 list_applications 看投递现状（调用前不写开场白）；需要结合经历时再调用 get_resume。",
    "2. 用户要排计划：优先处理快截止的、已进入笔试面试的、很久没进展需要跟进的，按天拆成具体动作，每天不超过 3 件事。",
    "3. 用户要复盘：数清楚各阶段的数量，找出卡在哪一步，给出一件最值得做的调整。",
    "4. 用户焦虑或迷茫：先回应他的具体处境，再把事情缩小到今天能做的一件事。",
    ...(canWrite
      ? ["5. 用户明确说投递有变化（测评做完了、进了几面、截止时间改了），用 update_application 记下来，再按新状态排计划；他没说过的不要凭推测改。"]
      : []),
    ...expertPanelRules(experts),
    "",
    "硬规则：",
    "- 数字和日期只能来自投递记录，不编造截止时间、面试安排或结果。记录里没有日期的，提醒用户去投递管理补上。",
    "- 不制造焦虑，不说“必须”“一定要”。",
    "- 所有回复都用中文。"
  ].join("\n");
}
