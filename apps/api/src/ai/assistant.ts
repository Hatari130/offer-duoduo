import type { ChatMessage, KnowledgeCitation } from "@offerflow/domain";
import type { ApiConfig } from "../config.ts";
import { assistantCapabilityContext } from "./capabilities.ts";
import { companionSystemPrompt } from "./companion.ts";
import { assistantRuntimeContext } from "./runtime-context.ts";

export interface GenerateAnswerInput {
  prompt: string;
  history: ChatMessage[];
  citations: KnowledgeCitation[];
  signal?: AbortSignal;
}

export interface AssistantProvider {
  readonly model: string;
  generate(input: GenerateAnswerInput): AsyncGenerator<string>;
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (!milliseconds) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

function demoAnswer(prompt: string, citations: KnowledgeCitation[]): string {
  const normalized = prompt.toLowerCase();
  if (/项目|简历|star/.test(normalized)) {
    return [
      "可以把这段经历压缩成一条清晰的证据链：",
      "\n\n1. 场景与目标：一句话交代为什么要做，以及你负责的边界。",
      "\n2. 关键动作：写你亲自完成的分析、设计、推动和验证，不只写“参与”。",
      "\n3. 可验证结果：优先写效率、规模、准确率、转化率或周期变化。",
      "\n\n你可以直接套用：在【场景】下，为解决【问题】，我负责【动作】，通过【方法】，最终实现【结果】。",
      "\n\n把原始项目描述发给我，我可以继续帮你改成简历版本和面试版本。"
    ].join("");
  }
  if (/秋招|校招|时间|规划|准备/.test(normalized)) {
    return [
      "建议把准备拆成五条并行轨道，而不是等材料全部完美后才投递：",
      "\n\n- 定位：确定 1 个主岗位族、1 个备选岗位族和城市边界。",
      "\n- 材料：先完成可投递的基础简历，再按高优岗位迭代。",
      "\n- 信息：每周固定两次更新岗位，给截止日期留出缓冲。",
      "\n- 训练：按岗位高频能力准备题库、项目追问和模拟面试。",
      "\n- 复盘：每周看回复率和流程转化，决定扩大投递还是优化材料。",
      "\n\n如果你告诉我目标岗位和毕业时间，我可以把它排成一份周计划。"
    ].join("");
  }
  if (/职业规划|未来|三年|五年/.test(normalized)) {
    return "回答时可以用“岗位理解 → 能力路径 → 公司匹配”三段式。先说明你理解这个岗位解决什么问题，再给出未来一到三年要建立的具体能力，最后解释目标团队为什么能提供对应场景。重点是成长路径，不是空泛地承诺长期稳定。";
  }
  if (/投递|进度|复盘/.test(normalized)) {
    return "先把每条投递统一记录为“岗位、阶段、关键时间、下一步行动”四个字段。状态变化保留时间线，每周再看投递量、回复率、笔试转化和面试转化。这样能区分问题出在岗位选择、材料还是面试，而不是只凭感觉加大投递量。";
  }

  const sourceHint = citations[0]?.title
    ? `我先结合「${citations[0].title}」给你一个可执行的起点。`
    : "我先给你一个可执行的起点。";
  return `${sourceHint}\n\n把问题拆成“目标、现状、证据、下一步”四部分：先明确你要争取的岗位或结果，再列出现有经历和限制，从经历里找出能证明能力的事实，最后安排一个本周就能完成的动作。你可以补充目标岗位、当前阶段和最卡住的地方，我会继续细化。`;
}

function chunks(content: string): string[] {
  return content.match(/.{1,12}(?:[，。；：！？、\n]|$)/gu)?.filter(Boolean) ?? [content];
}

class DemoAssistantProvider implements AssistantProvider {
  readonly model = "offerflow-career-demo";

  constructor(private readonly streamDelayMs: number) {}

  async *generate(input: GenerateAnswerInput): AsyncGenerator<string> {
    for (const chunk of chunks(demoAnswer(input.prompt, input.citations))) {
      if (input.signal?.aborted) throw input.signal.reason;
      await delay(this.streamDelayMs, input.signal);
      yield chunk;
    }
  }
}

class OpenAiCompatibleProvider implements AssistantProvider {
  readonly model: string;

  constructor(
    private readonly config: ApiConfig,
    private readonly now: () => Date
  ) {
    this.model = config.aiModel;
  }

  async *generate(input: GenerateAnswerInput): AsyncGenerator<string> {
    const context = input.citations
      .map((citation, index) => `[资料 ${index + 1}] ${citation.title}\n${citation.excerpt}`)
      .join("\n\n");
    const history = input.history
      .filter((message) => message.role !== "system" && message.status === "complete")
      .slice(-10)
      .map((message) => ({ role: message.role, content: message.content }));
    const response = await fetch(`${this.config.aiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.aiApiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.config.aiModel,
        stream: true,
        messages: [
          {
            role: "system",
            content: [
              companionSystemPrompt(),
              assistantRuntimeContext(this.now()),
              assistantCapabilityContext(),
              context ? `本轮可引用资料：\n${context}` : "本轮没有提供可引用资料。"
            ].join("\n\n")
          },
          ...history,
          { role: "user", content: input.prompt }
        ]
      }),
      signal: input.signal
    });
    if (!response.ok || !response.body) {
      throw new Error(`模型请求失败（${response.status}）`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          const payload = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const content = payload.choices?.[0]?.delta?.content;
          if (content) yield content;
        }
        if (done) break;
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export function createAssistantProvider(
  config: ApiConfig,
  now: () => Date = () => new Date()
): AssistantProvider {
  return config.aiApiKey
    ? new OpenAiCompatibleProvider(config, now)
    : new DemoAssistantProvider(config.demoStreamDelayMs);
}
