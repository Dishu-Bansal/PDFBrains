/* Chat runner: sends a conversation to the active LLM provider and resolves
 * any tool calls the model makes, feeding results back until it answers. */

import type { LlmChatResult, LlmMessage } from "./types";
import { getLlmProvider } from "./index";
import { dispatchTool, listLlmTools } from "./tools";

const MAX_TOOL_ROUNDS = 6;

export interface LlmRunOptions {
  /** System prompt prepended to the conversation. */
  systemPrompt?: string;
  /** Whether to expose registered tools to the model. Default true. */
  tools?: boolean;
  temperature?: number;
}

/**
 * Runs the full chat turn: history in, final assistant reply out. When the
 * model asks to call tools, each call is executed through the tool registry
 * and its result is sent back, repeating until the model answers without
 * tools (or the round limit is hit).
 */
export async function runLlmChat(
  history: LlmMessage[],
  options: LlmRunOptions = {}
): Promise<LlmChatResult> {
  const provider = getLlmProvider();
  const tools = options.tools === false ? [] : listLlmTools();
  const messages: LlmMessage[] = options.systemPrompt
    ? [{ role: "system", content: options.systemPrompt }, ...history]
    : [...history];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await provider.chat(messages, {
      tools: tools.length ? tools : undefined,
      temperature: options.temperature,
    });

    if (!result.toolCalls?.length) return result;

    messages.push({
      role: "assistant",
      content: result.content,
      toolCalls: result.toolCalls,
    });
    for (const call of result.toolCalls) {
      const output = await dispatchTool(call.name, call.arguments);
      messages.push({ role: "tool", content: output, toolCallId: call.id });
    }
  }

  return {
    content: "The model kept calling tools without answering. Please try again.",
    model: provider.label,
  };
}
