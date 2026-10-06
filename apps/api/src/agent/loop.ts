/**
 * The agent loop: let the model pick tools until it answers in plain text.
 *
 * A turn ends when the model replies without tool calls. That reply is either
 * the final answer or a question for the user; both hand control back.
 */

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface AgentTool {
  name: string;
  /** Read by the model: say when to use the tool and when not to. */
  description: string;
  /** JSON Schema of the arguments. */
  parameters: Record<string, unknown>;
  run(args: Record<string, unknown>): unknown | Promise<unknown>;
}

export interface ModelClient {
  complete(messages: AgentMessage[], tools: AgentTool[]): Promise<AgentMessage>;
}

export type AgentEvent =
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "reply"; content: string };

export interface AgentTurnResult {
  reply: string;
  steps: number;
  stoppedByStepLimit: boolean;
}

export async function runAgentTurn(options: {
  model: ModelClient;
  tools: AgentTool[];
  /** Full history including the system prompt; mutated in place. */
  messages: AgentMessage[];
  maxSteps?: number;
  onEvent?: (event: AgentEvent) => void;
}): Promise<AgentTurnResult> {
  const { model, tools, messages, onEvent } = options;
  const maxSteps = options.maxSteps ?? 8;
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  for (let step = 1; step <= maxSteps; step++) {
    const message = await model.complete(messages, tools);
    messages.push(message);

    if (!message.tool_calls?.length) {
      const reply = message.content?.trim() || "";
      onEvent?.({ type: "reply", content: reply });
      return { reply, steps: step, stoppedByStepLimit: false };
    }

    // Calls made in one reply are independent, so they run in parallel (e.g. several experts at once).
    // Results are appended in the model's original order.
    const results = await Promise.all(message.tool_calls.map(async (call) => {
      let result: unknown;
      try {
        const args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        const tool = byName.get(call.function.name);
        onEvent?.({ type: "tool_call", name: call.function.name, args });
        result = tool
          ? await tool.run(args)
          : { error: `没有名为 ${call.function.name} 的工具` };
      } catch (error) {
        // Errors go back to the model as data so it can correct itself.
        result = { error: error instanceof Error ? error.message : String(error) };
      }
      onEvent?.({ type: "tool_result", name: call.function.name, result });
      return { call, result };
    }));
    for (const { call, result } of results) {
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  const reply = "这一轮步骤太多，我先停在这里。你可以告诉我下一步想先做什么。";
  messages.push({ role: "assistant", content: reply });
  onEvent?.({ type: "reply", content: reply });
  return { reply, steps: maxSteps, stoppedByStepLimit: true };
}
