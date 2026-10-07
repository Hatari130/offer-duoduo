/**
 * Second gate for written text: a model lists what the new version claims that
 * the old one did not, and checks each new claim against the evidence.
 *
 * fabrication.ts catches what code can see (numbers, tool names, a few fixed
 * words). This catches the rest: an action the user said they never did
 * ("没做过给药" → "小鼠给药"), or a skill inflated from "帮忙整理" to "熟悉流程".
 * It runs only after the code check passes, so the cheap check goes first.
 */
import type { ModelClient } from "./loop.ts";

const CHECKER_PROMPT = [
  "你是简历事实核对员。对比【改前】和【改后】，找出改后新增的说法，逐条到【证据】里找出处。",
  "",
  "必须有出处的新增说法：",
  "- 做过的动作或环节（比如新增了“选题”“复盘”“核对”“给药”）",
  "- 职责程度和独立性（“帮忙写”→“负责”，“写”→“独立完成”）",
  "- 能力和熟练度判断（“喜欢写作”→“文字功底扎实”，“整理过”→“熟悉流程”）",
  "- 结果、规模、数字、渠道、对象（比如新增“官网”“现金及银行存款”）",
  "- 用户在证据里明确否认过的事（说过“没做过 X”，改后却写了 X），这是最严重的一种",
  "",
  "不算问题：",
  "- 同一件事换个说法、调整语序、合并或拆分句子",
  "- 把具体动作概括成上位说法，但没有抬高程度（“整理会议记录”→“文字整理”）",
  "- 证据里任何地方能找到出处的内容，包括简历的其他条目和用户在对话里的回答，哪怕改前这一条没写",
  "",
  "只输出 JSON，不要别的文字：",
  "{\"unsupported\":[{\"claim\":\"改后里的原文片段\",\"why\":\"为什么找不到出处\"}]}",
  "全部有出处时输出 {\"unsupported\":[]}。"
].join("\n");

interface CheckerOutput {
  unsupported?: Array<{ claim?: unknown; why?: unknown }>;
}

/**
 * New claims in `after` the evidence does not back, as messages the agent can act on.
 * Empty when everything is backed, and also when the checker's reply cannot be read:
 * the code check has already passed, and a broken reply should not block the user.
 */
export async function unbackedClaims(model: ModelClient, input: { before: string; after: string; evidence: string[] }): Promise<string[]> {
  const reply = await model.complete([
    { role: "system", content: CHECKER_PROMPT },
    {
      role: "user",
      content: [`【改前】\n${input.before || "（无）"}`, `【改后】\n${input.after}`, `【证据】\n${input.evidence.join("\n\n")}`].join("\n\n")
    }
  ], []);
  const json = (reply.content || "").match(/\{[\s\S]*\}/)?.[0];
  if (!json) return [];
  let output: CheckerOutput;
  try {
    output = JSON.parse(json) as CheckerOutput;
  } catch {
    return [];
  }
  return (output.unsupported ?? [])
    .filter((item) => typeof item.claim === "string" && item.claim.trim())
    .map((item) => `「${String(item.claim).trim()}」找不到出处：${String(item.why || "").trim()}`);
}
