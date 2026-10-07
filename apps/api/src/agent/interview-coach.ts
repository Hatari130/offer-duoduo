/**
 * Interview team: a mock interview built on the user's resume and target job.
 *
 * Sample answers go through propose_sample_answer, which applies the same
 * fabrication check as resume rewrites: only facts from the resume or from what
 * the user said may appear, so “帮我编一个” cannot slip through.
 */
import type { ChatAgentExpertNote, PersonalProfile, TailorJobContext } from "@offerflow/domain";
import { createConsultExpertTool, type ExpertSkill } from "./experts.ts";
import { getJobTool, getResumeTool, resumeEntries, unsupportedFacts } from "./material-tools.ts";
import type { AgentTool, ModelClient } from "./loop.ts";
import { expertPanelRules, jobMaterials, type AcceptedRewrite } from "./resume-coach.ts";

export const INTERVIEW_TEAM_DEFAULT_SKILLS = ["business-interviewer", "answer-coach", "hr-screener", "group-interview"];

export function createInterviewCoachSession(options: {
  profile?: PersonalProfile;
  job?: TailorJobContext;
  userStatements: () => string[];
  /** Recent turns of both sides, so experts can see the question that was answered. */
  transcript: () => string[];
  experts?: ExpertSkill[];
  expertModel?: ModelClient;
  onExpertNote?: (note: ChatAgentExpertNote) => void;
}) {
  const entries = options.profile ? resumeEntries(options.profile) : [];
  const accepted = new Map<string, AcceptedRewrite>();
  const notes: ChatAgentExpertNote[] = [];

  const tools: AgentTool[] = [
    getResumeTool(entries),
    getJobTool(options.job),
    {
      name: "propose_sample_answer",
      description: "提交一道题的示范答案。系统会检查里面的数字、技术名和职责强度能否在简历或用户说过的话里找到出处；找不到就退回。缺少的信息用【需要你补充：……】标出来，不要自己编。",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "这道面试题" },
          answer: { type: "string", description: "示范答案全文，按背景、任务、行动、结果组织" },
          reason: { type: "string", description: "相比用户原来的回答，主要改进了什么" }
        },
        required: ["question", "answer", "reason"],
        additionalProperties: false
      },
      run: (args) => {
        const question = String(args.question || "").trim();
        const answer = String(args.answer || "").trim();
        if (!question || !answer) return { accepted: false, problem: "题目和示范答案都不能为空" };
        const said = options.userStatements();
        const evidence = [...entries.map((entry) => `${entry.title}\n${entry.text}`), ...said];
        const problems = unsupportedFacts(answer, evidence, {
          allow: options.job ? [options.job.position, options.job.company] : [],
          // The user's latest answer is the "before": upgrading 参与 there to 主导 is flagged.
          before: said.at(-1) ?? ""
        });
        if (problems.length) return { accepted: false, problems, hint: "删掉这些内容，或改成【需要你补充：……】让用户自己填" };
        const key = `answer:${question}`;
        accepted.set(key, {
          entryId: key,
          title: `示范答案｜${question}`,
          before: said.at(-1) ?? "",
          after: answer,
          reason: String(args.reason || "")
        });
        return { accepted: true };
      }
    }
  ];

  const consult = options.expertModel && createConsultExpertTool({
    experts: options.experts ?? [],
    model: options.expertModel,
    materials: () => [
      "【目标岗位】", jobMaterials(options.job), "",
      "【简历】", entries.map((entry) => `【${entry.title}】\n${entry.text}`).join("\n\n") || "（还没有简历）", "",
      "【最近的面试对话】", options.transcript().slice(-8).join("\n")
    ].join("\n"),
    onNote: (note) => {
      notes.push(note);
      options.onExpertNote?.(note);
    }
  });
  if (consult) tools.push(consult);

  return { tools, entries, accepted, notes };
}

export function interviewCoachSystemPrompt(experts: ExpertSkill[]): string {
  const has = (id: string) => experts.some((expert) => expert.id === id);
  return [
    "你是 JobKoI 面试陪练团队的主教练“小鲤”，基于用户的简历和目标岗位陪他做一场模拟面试。",
    "",
    "工作方式：",
    "1. 第一轮：先调用 get_resume 和 get_job（调用前不写开场白）。用一句话说明这场模拟面试的安排（类型、大约几道题），然后只问第一道题。用户没说类型时默认业务面；用户说要练 HR 面或群面就按他说的来。",
    "2. 一次只问一道题。题目要贴合岗位要求和他简历里的具体经历，不要问空泛的通用题。问完就停下，等用户回答。",
    `3. 用户回答后：${has("answer-coach") ? "请复盘教练小林打分；" : ""}用两三句话给出最关键的反馈；再用 propose_sample_answer 提交一版示范答案；然后问下一道题，或针对他回答里最模糊的地方追问一题。`,
    "4. 示范答案只能用简历和用户说过的事实。缺少的信息用【需要你补充：……】标出来，不要自己编。被退回时按原因修改后重新提交。",
    "5. 用户说“不会”“直接告诉我”“帮我编一个”：先用两三句话给答题思路，再只问一个帮他回忆真实经历的小问题；不要替他编一个经历，也不要一次列出好几个问题。",
    "6. 已经问过的题不要再问。大约 5 道题后，主动问他要不要做一个整体复盘。",
    ...expertPanelRules(experts),
    ...(has("business-interviewer") ? ["- 需要更贴近业务负责人风格的题目或追问时，请面试官老陈出题。"] : []),
    ...(has("group-interview") ? ["- 用户要练群面（无领导小组讨论）时，请群面教练阿凯出题和点评。"] : []),
    "",
    "硬规则：",
    "- 每次回复最多只问一个问题（面试题或追问二选一），问完就停。不要用 1. 2. 3. 列出多个问题。",
    "- 只根据简历、岗位和对话内容，不编造用户的经历、数字或结果。",
    "- 反馈要具体，指出原话里哪句有问题；不说“回答得很好”这类空话。",
    "- 所有回复都用中文。"
  ].join("\n");
}
