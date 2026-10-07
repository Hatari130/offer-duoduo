/**
 * LLM judge for what code cannot check: is a rewrite faithful in meaning, specific,
 * and natural Chinese? Code graders (fabrication.ts) stay the hard gate; the judge
 * only scores, and its scores are compared between versions, not trusted alone.
 */
import type { ModelClient } from "../src/agent/loop.ts";

export interface JudgeItem {
  before: string;
  after: string;
  /** Everything the candidate actually said or wrote. */
  evidence: string;
  job?: string;
}

export interface JudgeScore {
  /** 1–5: says nothing the evidence does not support, including vague exaggeration. */
  faithful: number;
  /** 1–5: concrete actions and results instead of empty words. */
  specific: number;
  /** 1–5: reads like a person wrote it, no AI clichés. */
  natural: number;
  problems: string[];
}

const RUBRIC = [
  "你是严格的简历审稿人。给下面这条改写打分，每项 1～5 分：",
  "- faithful：改后内容是否都能在【证据】里找到依据。新增的数字、职责升级（参与→负责）、效果夸大（显著提升、全面负责）都要扣分；有一处编造最多 2 分。",
  "- specific：是否写清做了什么、怎么做、结果如何，而不是空泛的大词。",
  "- natural：是否像真人写的中文，没有“赋能、闭环、抓手、深度、助力”这类 AI 腔。",
  "problems 列出具体问题（引用原文），没有就给空数组。",
  "只输出 JSON：{\"faithful\":n,\"specific\":n,\"natural\":n,\"problems\":[\"...\"]}"
].join("\n");

export async function judge(model: ModelClient, item: JudgeItem): Promise<JudgeScore | undefined> {
  const reply = await model.complete([
    { role: "system", content: RUBRIC },
    {
      role: "user",
      content: [
        item.job ? `【目标岗位】${item.job}` : "",
        `【证据】\n${item.evidence}`,
        `【改前】\n${item.before || "（新写的内容）"}`,
        `【改后】\n${item.after}`
      ].filter(Boolean).join("\n\n")
    }
  ], []);
  const json = (reply.content || "").match(/\{[\s\S]*\}/)?.[0];
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as JudgeScore;
    const score = (value: unknown) => Math.min(5, Math.max(1, Number(value) || 1));
    return {
      faithful: score(parsed.faithful),
      specific: score(parsed.specific),
      natural: score(parsed.natural),
      problems: Array.isArray(parsed.problems) ? parsed.problems.map(String) : []
    };
  } catch {
    return undefined;
  }
}

export function meanScores(scores: Array<JudgeScore | undefined>) {
  const valid = scores.filter((score): score is JudgeScore => Boolean(score));
  const mean = (key: "faithful" | "specific" | "natural") =>
    valid.length ? Number((valid.reduce((sum, score) => sum + score[key], 0) / valid.length).toFixed(2)) : null;
  return { judged: valid.length, faithful: mean("faithful"), specific: mean("specific"), natural: mean("natural") };
}
