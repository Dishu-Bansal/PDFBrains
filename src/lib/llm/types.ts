/* Provider-agnostic LLM types. The AI Assist chat and the tool hooks talk to
 * this interface, so swapping the model (DeepSeek, OpenAI, Anthropic, a local
 * server...) is just registering another provider in llm/index.ts. */

export type LlmRole = "system" | "user" | "assistant" | "tool";

export interface LlmToolCall {
  id: string;
  name: string;
  /** JSON-encoded arguments string, as returned by the model. */
  arguments: string;
}

export interface LlmMessage {
  role: LlmRole;
  content: string;
  /** Required for role "tool": which tool call this result answers. */
  toolCallId?: string;
  /** Present on assistant messages that invoked tools. */
  toolCalls?: LlmToolCall[];
  /** Thinking-mode models (e.g. deepseek-reasoner) require the previous
   * assistant turn's reasoning text to be passed back on the next request. */
  reasoningContent?: string;
}

/** One function the model may call. `parameters` is a JSON Schema object. */
export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: LlmTool[];
  /** "auto" (default), "none", or force a specific tool. */
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LlmChatResult {
  content: string;
  toolCalls?: LlmToolCall[];
  usage?: LlmUsage;
  model: string;
  /** Thinking-mode models return this alongside content; must be echoed back
   * when the conversation continues. */
  reasoningContent?: string;
}

/** What every LLM provider must implement to plug into the app. */
export interface LlmProvider {
  /** Stable id used in the registry, e.g. "deepseek". */
  id: string;
  /** Human label, e.g. "DeepSeek". */
  label: string;
  /** Sends one chat turn (with optional tools) and returns the reply. */
  chat(messages: LlmMessage[], options?: LlmChatOptions): Promise<LlmChatResult>;
}
