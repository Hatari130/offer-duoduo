import { randomUUID } from "node:crypto";
import type { InterviewQaPair } from "@offerflow/domain";
import type { ApiConfig } from "../config.ts";

export interface InterviewQaParser {
  parse(transcript: string): Promise<InterviewQaPair[]>;
}

interface SpeakerTurn {
  role: "interviewer" | "candidate";
  label: string;
  content: string;
}

const SPEAKER_MARKER =
  /(?:^|\n)\s*((?:面试官|招聘官|考官|HR|Interviewer)(?:\s*\d+)?|(?:候选人|求职者|应聘者|Candidate)(?:\s*\d+)?|Q(?:uestion)?\s*\d*|A(?:nswer)?\s*\d*|问题\s*\d*|回答\s*\d*|问\s*\d*|答\s*\d*)\s*[：:]\s*/gim;

const INTERVIEWER_LABEL = /^(?:面试官|招聘官|考官|HR|Interviewer|Q|Question|问题|问)/i;
const QUESTION_CUE =
  /(?:[？?]\s*$|为什么|怎么(?:样|办|做|理解|看)?|如何|什么|哪些|是否|有没有|能否|可以.+吗|请(?:你)?(?:介绍|说说|谈谈|讲讲|描述|解释|举例)|谈一谈|说一下|怎么看|遇到.+(?:会|该|要).*(?:做|办)|最大的?(?:困难|挑战|收获)|原因是什么)/i;

function compact(value: string): string {
  return value.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function excerpt(value: string, maximum = 600): string {
  const normalized = compact(value);
  return normalized.length > maximum ? `${normalized.slice(0, maximum)}…` : normalized;
}

function speakerTurns(transcript: string): SpeakerTurn[] {
  const matches = [...transcript.matchAll(SPEAKER_MARKER)];
  if (!matches.length) return [];
  return matches
    .map((match, index) => {
      const label = match[1].trim();
      const contentStart = (match.index ?? 0) + match[0].length;
      const contentEnd = matches[index + 1]?.index ?? transcript.length;
      return {
        role: INTERVIEWER_LABEL.test(label) ? "interviewer" as const : "candidate" as const,
        label,
        content: compact(transcript.slice(contentStart, contentEnd))
      };
    })
    .filter((turn) => turn.content);
}

function fromSpeakerTurns(turns: SpeakerTurn[]): InterviewQaPair[] {
  const pairs: Array<Omit<InterviewQaPair, "id" | "order">> = [];
  let question = "";
  let answer = "";
  let evidence = "";

  const flush = () => {
    if (!question) return;
    pairs.push({
      question: compact(question),
      answer: compact(answer),
      evidence: excerpt(evidence)
    });
    question = "";
    answer = "";
    evidence = "";
  };

  for (const turn of turns) {
    if (turn.role === "interviewer") {
      if (question && answer) flush();
      question = question ? `${question}\n${turn.content}` : turn.content;
    } else if (question) {
      answer = answer ? `${answer}\n${turn.content}` : turn.content;
    }
    if (question) {
      evidence += `${evidence ? "\n" : ""}${turn.label}：${turn.content}`;
    }
  }
  flush();
  return pairs.map((pair, index) => ({
    id: randomUUID(),
    ...pair,
    order: index + 1
  }));
}

function transcriptSentences(transcript: string): string[] {
  return compact(transcript)
    .split(/(?<=[。！？?])|\n+/u)
    .map(compact)
    .filter(Boolean);
}

function fromUnlabelledTranscript(transcript: string): InterviewQaPair[] {
  const sentences = transcriptSentences(transcript);
  const pairs: Array<Omit<InterviewQaPair, "id" | "order">> = [];
  let question = "";
  let answers: string[] = [];

  const flush = () => {
    if (!question) return;
    const answer = compact(answers.join(""));
    pairs.push({
      question,
      answer,
      evidence: excerpt(`${question}${answer}`)
    });
    question = "";
    answers = [];
  };

  for (const sentence of sentences) {
    if (QUESTION_CUE.test(sentence)) {
      flush();
      question = sentence;
    } else if (question) {
      answers.push(sentence);
    }
  }
  flush();

  return pairs.map((pair, index) => ({
    id: randomUUID(),
    ...pair,
    order: index + 1
  }));
}

/**
 * Deterministic parser used even when no model key is configured. It favours
 * explicit speaker/Q-A labels and only falls back to question-cue boundaries;
 * it never invents an answer that was absent from the supplied transcript.
 */
export class LocalInterviewQaParser implements InterviewQaParser {
  async parse(transcript: string): Promise<InterviewQaPair[]> {
    const normalized = compact(transcript);
    if (!normalized) return [];
    const turns = speakerTurns(normalized);
    const labelled = fromSpeakerTurns(turns);
    return labelled.length ? labelled : fromUnlabelledTranscript(normalized);
  }
}

function extractJsonObject(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("模型没有返回 JSON object");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function traceText(value: string): string {
  return value.toLowerCase().replace(/[\s，。！？；：、,.!?;:'"“”‘’（）()\-]/g, "");
}

function modelPairs(value: unknown, transcript: string): InterviewQaPair[] {
  if (!value || typeof value !== "object") throw new Error("模型问答结果格式不正确");
  const pairs = (value as { qaPairs?: unknown }).qaPairs;
  if (!Array.isArray(pairs)) throw new Error("模型问答结果缺少 qaPairs");
  return pairs
    .filter((pair): pair is Record<string, unknown> => Boolean(pair) && typeof pair === "object")
    .map((pair) => ({
      question: typeof pair.question === "string" ? compact(pair.question) : "",
      answer: typeof pair.answer === "string" ? compact(pair.answer) : "",
      evidence: typeof pair.evidence === "string" ? excerpt(pair.evidence) : undefined
    }))
    .filter((pair) => {
      const source = traceText(transcript);
      return (
        Boolean(pair.question) &&
        Boolean(pair.evidence) &&
        source.includes(traceText(pair.question)) &&
        (!pair.answer || source.includes(traceText(pair.answer))) &&
        source.includes(traceText(pair.evidence ?? ""))
      );
    })
    .map((pair, index) => ({ id: randomUUID(), ...pair, order: index + 1 }));
}

class ModelInterviewQaParser implements InterviewQaParser {
  constructor(
    private readonly config: ApiConfig,
    private readonly fallback: InterviewQaParser
  ) {}

  async parse(transcript: string): Promise<InterviewQaPair[]> {
    const normalized = compact(transcript);
    if (!normalized) return [];
    // Very large transcripts are kept intact in storage/search, but sending an
    // unbounded payload to a chat model is unsafe. The deterministic parser can
    // still extract labelled turns without truncating the source.
    if (normalized.length > 80_000) return this.fallback.parse(normalized);

    try {
      const response = await fetch(`${this.config.aiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.aiApiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.config.aiModel,
          stream: false,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "你是面试文字稿结构化抽取器。只提取原文中真实出现的提问和对应回答；不得补写、润色、总结或推测答案。没有回答时 answer 必须为空字符串。evidence 必须是支持该问答的简短原文。只返回 JSON：{\"qaPairs\":[{\"question\":\"\",\"answer\":\"\",\"evidence\":\"\"}]}。"
            },
            {
              role: "user",
              content: `请从下面的面试文字稿中按出现顺序抽取问答：\n\n${normalized}`
            }
          ]
        }),
        signal: AbortSignal.timeout(60_000)
      });
      if (!response.ok) throw new Error(`模型请求失败（${response.status}）`);
      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("模型没有返回问答结果");
      const pairs = modelPairs(extractJsonObject(content), normalized);
      // Explicit local labels/question cues are still useful when a model
      // returns an empty or untraceable result. The fallback never invents text.
      return pairs.length ? pairs : this.fallback.parse(normalized);
    } catch {
      return this.fallback.parse(normalized);
    }
  }
}

export function createInterviewQaParser(config: ApiConfig): InterviewQaParser {
  const local = new LocalInterviewQaParser();
  return config.aiApiKey ? new ModelInterviewQaParser(config, local) : local;
}
