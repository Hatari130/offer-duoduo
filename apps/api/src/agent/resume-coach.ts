/**
 * Resume coach agent: tools and system prompt for tailoring a resume to one job.
 *
 * The agent may only use facts from the resume or from what the user said in
 * this conversation. propose_rewrite enforces that in code with the
 * fabrication grader, so a rejected rewrite goes back to the model to fix.
 */
import type { PersonalProfile, TailorJobContext } from "@offerflow/domain";
import { findUnsupportedClaims, type FabricationFinding } from "./fabrication.ts";
import type { AgentTool } from "./loop.ts";

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
  profile: PersonalProfile;
  job: TailorJobContext;
  /** Everything the user has typed so far; their answers count as evidence. */
  userStatements: () => string[];
}) {
  const entries = resumeEntries(options.profile);
  const accepted = new Map<string, AcceptedRewrite>();

  const tools: AgentTool[] = [
    {
      name: "get_resume",
      description: "读取用户当前的简历，按条目返回（每条有 id）。开始分析前必须先调用。",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      run: () => ({ entries })
    },
    {
      name: "get_job",
      description: "读取目标岗位的公司、职位、职责和要求。分析差距前必须先调用。",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      run: () => options.job
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
          allow: [options.job.position, options.job.company],
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

  return { tools, entries, accepted };
}

export function resumeCoachSystemPrompt(): string {
  return [
    "你是 JobKoI 的简历教练“小鲤”，帮用户把一份简历针对一个目标岗位改好。你通过工具读取资料、提交改写稿。",
    "",
    "工作方式：",
    "1. 先调用 get_resume 和 get_job，找出岗位要求与简历之间最重要的 2～3 个差距。",
    "2. 差距如果是“写法问题”（经历有，但没写清楚），直接改。",
    "3. 差距如果是“素材问题”（缺少规模、数字、结果、具体做了什么），先问用户。一次最多问 3 个问题，问得具体，最好能让用户用一句话回答，例如“这 40 多篇推文里，阅读量最高的一篇大概多少？”。问完就停下等用户回答，不要调用改写工具。",
    "4. 用户回答后，用 propose_rewrite 逐条提交改写稿。被退回时，按退回原因修改后重新提交。",
    "5. 全部提交完后，用几行话告诉用户改了哪几条、每条用到了他的哪句回答。",
    "",
    "硬规则：",
    "- 只能使用简历原文和用户在本次对话里说过的事实。用户让你“编一个”“估一个数”时，礼貌拒绝，换个问法帮他回忆真实情况。",
    "- 不要把“参与、协助”写成“负责、主导”，除非用户明确说是他负责的。",
    "- 语言像真人写的简历：动词开头，具体，不堆砌形容词，不写“赋能、抓手、全方位”这类词。",
    "- 用户只是闲聊或问别的问题时，正常回答，不必调用工具。"
  ].join("\n");
}
