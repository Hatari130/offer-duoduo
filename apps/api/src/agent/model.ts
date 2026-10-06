import type { ApiConfig } from "../config.ts";
import type { AgentMessage, AgentTool, ModelClient } from "./loop.ts";

/** Any OpenAI-compatible chat API with function calling (DeepSeek by default). */
export function createOpenAiCompatibleModel(config: ApiConfig, options: { temperature?: number } = {}): ModelClient {
  if (!config.aiApiKey) throw new Error("AI 服务尚未配置：请设置 DEEPSEEK_API_KEY");
  return {
    async complete(messages: AgentMessage[], tools: AgentTool[]): Promise<AgentMessage> {
      const response = await fetch(`${config.aiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.aiApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: config.aiModel,
          temperature: options.temperature ?? 0.3,
          messages,
          tools: tools.map(({ name, description, parameters }) => ({
            type: "function",
            function: { name, description, parameters }
          }))
        })
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`AI 服务请求失败（${response.status}）`);
      }
      const payload = await response.json() as { choices?: Array<{ message?: AgentMessage }> };
      const message = payload.choices?.[0]?.message;
      if (!message) throw new Error("AI 没有返回内容");
      return {
        role: "assistant",
        content: message.content ?? null,
        ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {})
      };
    }
  };
}
