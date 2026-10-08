import type { ApiConfig } from "../config.ts";
import type { AgentMessage, AgentTool, ModelClient, ModelCallOptions, ToolCall } from "./loop.ts";

interface StreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{ index: number; id?: string; type?: "function"; function?: { name?: string; arguments?: string } }>;
    };
  }>;
}

/**
 * Any OpenAI-compatible chat API with function calling (DeepSeek by default).
 *
 * DeepSeek's thinking models return their reasoning as `reasoning_content`. With
 * tools in the request it must be sent back on every later request, so it is kept
 * on the message (and never shown to the user).
 */
export function createOpenAiCompatibleModel(config: ApiConfig, settings: { temperature?: number } = {}): ModelClient {
  if (!config.aiApiKey) throw new Error("AI 服务尚未配置：请设置 DEEPSEEK_API_KEY");
  return {
    async complete(messages: AgentMessage[], tools: AgentTool[], options: ModelCallOptions = {}): Promise<AgentMessage> {
      const stream = Boolean(options.onText);
      const response = await fetch(`${config.aiBaseUrl}/chat/completions`, {
        method: "POST",
        signal: options.signal,
        headers: {
          Authorization: `Bearer ${config.aiApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: config.aiModel,
          ...(config.aiReasoningEffort ? { reasoning_effort: config.aiReasoningEffort } : {}),
          temperature: settings.temperature ?? 0.3,
          stream,
          messages,
          ...(tools.length ? {
            tools: tools.map(({ name, description, parameters }) => ({
              type: "function",
              function: { name, description, parameters }
            }))
          } : {})
        })
      });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error(`AI 服务请求失败（${response.status}）`);
      }
      if (!stream) {
        const payload = await response.json() as { choices?: Array<{ message?: AgentMessage }> };
        const message = payload.choices?.[0]?.message;
        if (!message) throw new Error("AI 没有返回内容");
        return {
          role: "assistant",
          content: message.content ?? null,
          ...(message.reasoning_content ? { reasoning_content: message.reasoning_content } : {}),
          ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {})
        };
      }

      // Streaming: forward text as it arrives and assemble tool calls from their fragments.
      let content = "";
      let reasoning = "";
      const calls: ToolCall[] = [];
      const decoder = new TextDecoder();
      let buffer = "";
      for await (const bytes of response.body) {
        buffer += decoder.decode(bytes as Uint8Array, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const data = line.startsWith("data:") ? line.slice(5).trim() : "";
          if (!data || data === "[DONE]") continue;
          const delta = (JSON.parse(data) as StreamChunk).choices?.[0]?.delta;
          if (delta?.reasoning_content) reasoning += delta.reasoning_content;
          if (delta?.content) {
            content += delta.content;
            options.onText?.(delta.content);
          }
          for (const fragment of delta?.tool_calls ?? []) {
            const call = calls[fragment.index] ??= { id: "", type: "function", function: { name: "", arguments: "" } };
            if (fragment.id) call.id = fragment.id;
            if (fragment.function?.name) call.function.name += fragment.function.name;
            if (fragment.function?.arguments) call.function.arguments += fragment.function.arguments;
          }
        }
      }
      const toolCalls = calls.filter(Boolean);
      return {
        role: "assistant",
        content: content || null,
        ...(reasoning ? { reasoning_content: reasoning } : {}),
        ...(toolCalls.length ? { tool_calls: toolCalls } : {})
      };
    }
  };
}
