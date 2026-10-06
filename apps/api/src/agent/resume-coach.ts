/**
 * Resume coach agent: tools and system prompt for tailoring a resume to one job.
 *
 * The agent may only use facts from the resume or from what the user said in
 * this conversation. propose_rewrite enforces that in code with the
 * fabrication grader, so a rejected rewrite goes back to the model to fix.
 */
import type { ChatAgentExpertNote, PersonalProfile, TailorJobContext } from "@offerflow/domain";
import { createConsultExpertTool, expertRoster } from "./experts.ts";
import { findUnsupportedClaims, type FabricationFinding } from "./fabrication.ts";
import type { AgentTool, ModelClient } from "./loop.ts";

export interface ResumeEntry {
  id: string;
  section: "总结" | "技能" | "工作/实习" | "项目" | "在校经历";
  title: string;
  text: string;
}

export interface AcceptedRewrite {
  entryId: string;
  title: string;
  before: string;
  after: string;
  reason: string;
}

function stripBullet(line: string): string {
  return line.replace(/^[•\-\s]+/, "").trim();
}

export function resumeEntries(profile: PersonalProfile): ResumeEntry[] {
  const lines = (description: string) => description.split("\n").map(stripBullet).filter(Boolean).join("\n");
  return [
    { id: "summary", section: "总结" as const, title: "个人总结", text: profile.selfIntroduction },
    { id: "strengths", section: "技能" as const, title: "技能特长", text: profile.strengths },
    ...profile.experiences.map((entry) => ({ id: entry.id, section: "工作/实习" as const, title: `${entry.organization} · ${entry.title}`, text: lines(entry.description) })),
    ...profile.projects.map((entry) => ({ id: entry.id, section: "项目" as const, title: `${entry.name} · ${entry.role}`, text: lines(entry.description) })),
    ...profile.campusExperiences.map((entry) => ({ id: entry.id, section: "在校经历" as const, title: `${entry.type} · ${entry.role}`, text: lines(entry.description) }))
  ].filter((entry) => entry.text);
}

const FINDING_LABEL: Record<FabricationFinding["kind"], string> = {
  number: "数字",
  term: "技术或工具名",
  ownership: "把配合性的工作写成了主导"
};

export function createResumeCoachSession(options: {
  /** Missing when the user has no resume yet; the tools then tell the model what to ask for. */
  profile?: PersonalProfile;
  /** Missing when no job was selected; the model should ask the user to paste the JD. */
  job?: TailorJobContext;
  /** Everything the user has typed so far; their answers count as evidence. */
  userStatements: () => string[];
  /** Enables consult_expert. Without it the coach works alone (as in the first evals). */
  expertModel?: ModelClient;
  onExpertNote?: (note: ChatAgentExpertNote) => void;
}) {
  const entries = options.profile ? resumeEntries(options.profile) : [];
  const accepted = new Map<string, AcceptedRewrite>();
  const notes: ChatAgentExpertNote[] = [];

  const tools: AgentTool[] = [
    {
      name: "get_resume",
      description: "读取用户当前的简历，按条目返回（每条有 id）。开始分析前必须先调用。",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      run: () => entries.length
        ? { entries }
        : { missing: true, hint: "用户还没有可用的简历。请让用户先到“简历”页面上传或创建一份通用简历，再回来继续。" }
    },
    {
      name: "get_job",
      description: "读取目标岗位的公司、职位、职责和要求。分析差距前必须先调用。",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      run: () => options.job ?? {
        missing: true,
        hint: "用户没有选择目标岗位。如果用户在对话里粘贴过岗位描述（JD），就以那段文字为准；否则请用户粘贴 JD，或在输入框上方的“参考资料”里选一条投递记录。"
      }
    },
    {
      name: "propose_rewrite",
      description: "提交某一条简历条目的改写稿。系统会检查改写里的数字、技术名和职责强度是否都能在简历原文或用户的回答里找到出处；找不到就会被退回，你需要删掉无出处的内容，或者去问用户。每条只提交一次最终稿，被退回后再改。",
      parameters: {
        type: "object",
        properties: {
          entry_id: { type: "string", description: "get_resume 返回的条目 id" },
          text: { type: "string", description: "该条目改写后的完整文字，多条要点用换行分隔" },
          reason: { type: "string", description: "这样改对应岗位的哪条要求，用到了用户的哪句回答" }
        },
        required: ["entry_id", "text", "reason"],
        additionalProperties: false
      },
      run: (args) => {
        const entry = entries.find((candidate) => candidate.id === args.entry_id);
        if (!entry) return { accepted: false, problem: `没有 id 为 ${String(args.entry_id)} 的条目，请先调用 get_resume 查看` };
        const text = String(args.text || "").trim();
        if (!text) return { accepted: false, problem: "改写稿是空的" };
        const evidence = [...entries.map((candidate) => `${candidate.title}\n${candidate.text}`), ...options.userStatements()];
        const findings = findUnsupportedClaims(text, evidence, {
          allow: options.job ? [options.job.position, options.job.company] : [],
          before: entry.text
        });
        if (findings.length) {
          return {
            accepted: false,
            problems: findings.map((finding) => `${FINDING_LABEL[finding.kind]}「${finding.value}」在简历和用户回答里都找不到出处`),
            hint: "删掉这些内容，或者先问用户确认真实情况"
          };
        }
        accepted.set(entry.id, { entryId: entry.id, title: entry.title, before: entry.text, after: text, reason: String(args.reason || "") });
        return { accepted: true, entry_id: entry.id };
      }
    }
  ];

  if (options.expertModel) {
    tools.push(createConsultExpertTool({
      agent: "resume_coach",
      model: options.expertModel,
      materials: () => {
        // Experts read the current version: accepted rewrites replace the original text.
        const resume = entries
          .map((entry) => [`【${entry.title}】（id: ${entry.id}）`, accepted.get(entry.id)?.after ?? entry.text].join("\n"))
          .join("\n\n");
        const job = options.job
          ? [
            `${options.job.company} · ${options.job.position}`,
            `职责：${options.job.responsibilities.join("；")}`,
            `要求：${options.job.requirements.join("；")}`,
            options.job.rawExcerpt ? `JD 原文：${options.job.rawExcerpt.slice(0, 1500)}` : ""
          ].filter(Boolean).join("\n")
          : "（用户没有选择岗位，以对话里提到的岗位为准）";
        const said = options.userStatements().slice(-6).map((line) => `- ${line}`).join("\n");
        return [
          "【目标岗位】", job, "",
          "【简历】", resume || "（还没有简历）", "",
          "【用户最近说的话】", said
        ].join("\n");
      },
      onNote: (note) => {
        notes.push(note);
        options.onExpertNote?.(note);
      }
    }));
  }

  return { tools, entries, accepted, notes };
}

export function resumeCoachSystemPrompt(): string {
  return [
    "你是 JobKoI 的简历教练“小鲤”，帮用户把一份简历针对一个目标岗位改好。你通过工具读取资料、提交改写稿。",
    "",
    "工作方式：",
    "1. 先调用 get_resume 和 get_job。调用工具前不要写开场白。",
    "2. 逐条看与岗位相关的经历，把问题分成两类：",
    "   - 写法问题（事实都有，只是没写清楚、没对上岗位）：第一轮就用 propose_rewrite 提交改写，不要等。",
    "   - 素材问题（缺少结果或规模：成交额、参与人数、篇数、次数、样本量、提升多少）：每条与岗位相关的经历都要确认有没有这类数字，没有就问。",
    "3. 第一轮的回复里同时做两件事：先提交写法问题的改写，再把素材问题合并成最多 4 个具体问题，每个问题能用一句话回答，例如“那场直播最后成交额大概多少？”。问完停下，等用户回答。",
    "4. 用户回答后，用 propose_rewrite 把新素材写进对应条目。被退回时，按退回原因修改后重新提交。",
    "5. 用户说记不清、想不起来、“你看着写”：当轮就提交不带数字的版本，同一个点不再追问第二次。",
    "6. 用户要求编造：一句话说明不能编，问一次真实情况，同时把不需要新素材的改写先提交。",
    "7. 结束时用几行话告诉用户改了哪几条、每条用到了他的哪句回答。",
    "",
    "专家团（用 consult_expert 请他们，只在确实需要时请）：",
    expertRoster("resume_coach"),
    "- 用户点名某位专家（比如“@HR 小周”“让编辑看看”）时，必须先请这位专家。",
    "- 用户想要整体评估、问“能不能过”时，在同一次回复里同时请 HR 小周和面试官老陈，再综合他们的意见。",
    "- 用户嫌改写“太 AI”“太长”“太口语”时，请文字编辑阿简按要求改，再把他的版本用 propose_rewrite 提交。",
    "- 专家的意见会单独展示给用户，你的回复里不要整段复述，只说你据此做了什么、还需要用户补充什么。",
    "",
    "硬规则：",
    "- 只能使用简历原文和用户在本次对话里说过的事实。用户让你“编一个”“估一个数”时，礼貌拒绝，换个问法帮他回忆真实情况。",
    "- 不要把“参与、协助”写成“负责、主导”，除非用户明确说是他负责的。",
    "- 语言像真人写的简历：动词开头，具体，不堆砌形容词，不写“赋能、抓手、全方位”这类词。",
    "- 所有回复都用中文。",
    "- 用户只是闲聊或问别的问题时，正常回答，不必调用工具。"
  ].join("\n");
}
