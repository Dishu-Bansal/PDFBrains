/* Tool registry for LLM function calling. The ~20 PDF tools will register
 * here (name, description, JSON-schema parameters, and a handler that runs
 * the tool and returns a string result for the model). The chat runner
 * dispatches whatever the model asks for. */

import type { LlmTool } from "./types";

export interface LlmToolHandler {
  (args: Record<string, unknown>): Promise<string> | string;
}

interface RegisteredTool {
  tool: LlmTool;
  handler: LlmToolHandler;
}

const registry = new Map<string, RegisteredTool>();

/** Registers a tool the model may call. Throws on duplicate names. */
export function registerTool(
  name: string,
  tool: Omit<LlmTool, "name">,
  handler: LlmToolHandler
): void {
  if (registry.has(name)) {
    throw new Error(`A tool named "${name}" is already registered.`);
  }
  registry.set(name, { tool: { name, ...tool }, handler });
}

/** All registered tool definitions, for the LLM request. */
export function listLlmTools(): LlmTool[] {
  return Array.from(registry.values()).map((entry) => entry.tool);
}

/** Runs a tool call and returns its result as a string for the model. */
export async function dispatchTool(name: string, rawArguments: string): Promise<string> {
  const entry = registry.get(name);
  if (!entry) {
    return `Error: unknown tool "${name}".`;
  }
  try {
    const args = rawArguments ? (JSON.parse(rawArguments) as Record<string, unknown>) : {};
    const result = await entry.handler(args);
    return typeof result === "string" ? result : JSON.stringify(result);
  } catch (err) {
    return `Error running tool "${name}": ${err instanceof Error ? err.message : String(err)}`;
  }
}
