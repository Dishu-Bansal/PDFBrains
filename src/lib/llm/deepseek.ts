/* DeepSeek provider: OpenAI-compatible chat completions against
 * https://api.deepseek.com. Model: deepseek-chat (V3) by default, or
 * deepseek-reasoner (R1) via VITE_DEEPSEEK_MODEL. Function calling is
 * supported, so the app's tools can be exposed to the model. */

import type {
  LlmChatOptions,
  LlmChatResult,
  LlmMessage,
  LlmProvider,
  LlmToolCall,
} from "./types";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";

interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Resolves provider config from environment variables at call time. */
export function deepseekConfig(): DeepSeekConfig {
  return {
    apiKey: (import.meta.env.VITE_DEEPSEEK_API_KEY as string | undefined) ?? "",
    baseUrl: ((import.meta.env.VITE_DEEPSEEK_BASE_URL as string | undefined) ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: (import.meta.env.VITE_DEEPSEEK_MODEL as string | undefined) ?? DEFAULT_MODEL,
  };
}

interface OpenAiMessage {
  role: string;
  content: string;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
}

function toOpenAiMessages(messages: LlmMessage[]): OpenAiMessage[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return { role: "tool", content: message.content, tool_call_id: message.toolCallId ?? "" };
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      return {
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls.map((call: LlmToolCall) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

function toToolCalls(raw: unknown): LlmToolCall[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const calls = raw
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => {
      const fn = (entry.function ?? {}) as Record<string, unknown>;
      return {
        id: typeof entry.id === "string" ? entry.id : "",
        name: typeof fn.name === "string" ? fn.name : "",
        arguments: typeof fn.arguments === "string" ? fn.arguments : "{}",
      };
    })
    .filter((call) => call.name);
  return calls.length > 0 ? calls : undefined;
}

export function createDeepSeekProvider(): LlmProvider {
  return {
    id: "deepseek",
    label: "DeepSeek",

    async chat(messages: LlmMessage[], options: LlmChatOptions = {}): Promise<LlmChatResult> {
      const config = deepseekConfig();
      if (!config.apiKey) {
        throw new Error(
          "DeepSeek is not configured. Add VITE_DEEPSEEK_API_KEY to .env.local and restart the dev server."
        );
      }

      const body: Record<string, unknown> = {
        model: options.model ?? config.model,
        messages: toOpenAiMessages(messages),
        stream: false,
      };
      if (options.temperature !== undefined) body.temperature = options.temperature;
      if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
      if (options.tools?.length) {
        body.tools = options.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        }));
      }
      if (options.toolChoice !== undefined && options.toolChoice !== "auto") {
        body.tool_choice = options.toolChoice;
      }

      let response: Response;
      try {
        response = await fetch(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch {
        throw new Error(
          "Could not reach the LLM. If the browser blocks CORS for this provider, add a small proxy in front of it."
        );
      }

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 300);
        throw new Error(`The LLM returned an error (HTTP ${response.status}). ${detail}`);
      }

      const data = (await response.json()) as {
        model?: string;
        choices?: { message?: { content?: string | null; tool_calls?: unknown } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const choice = data.choices?.[0];
      if (!choice?.message) {
        throw new Error("The LLM returned an empty response.");
      }

      return {
        content: choice.message.content ?? "",
        toolCalls: toToolCalls(choice.message.tool_calls),
        usage:
          data.usage && data.usage.prompt_tokens !== undefined
            ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens ?? 0,
              }
            : undefined,
        model: data.model ?? config.model,
      };
    },
  };
}
