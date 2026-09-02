/* Provider registry. To switch the model, add a provider here and set
 * VITE_LLM_PROVIDER in .env.local to its id. Each provider reads its own
 * VITE_*_* environment variables. */

import type { LlmProvider } from "./types";
import { createDeepSeekProvider } from "./deepseek";

type ProviderFactory = () => LlmProvider;

const REGISTRY: Record<string, ProviderFactory> = {
  deepseek: createDeepSeekProvider,
  // Example for swapping models later:
  // openai: () => new OpenAiProvider(import.meta.env.VITE_OPENAI_API_KEY, ...),
  // anthropic: () => new AnthropicProvider(...),
  // local: () => new OpenAiCompatibleProvider(import.meta.env.VITE_LOCAL_LLM_URL, ...),
};

function providerId(): string {
  return ((import.meta.env.VITE_LLM_PROVIDER as string | undefined) ?? "deepseek").toLowerCase();
}

/** Returns the active provider for the current VITE_LLM_PROVIDER setting. */
export function getLlmProvider(): LlmProvider {
  const id = providerId();
  const factory = REGISTRY[id];
  if (!factory) {
    throw new Error(
      `Unknown LLM provider "${id}". Add it to the registry in src/lib/llm/index.ts.`
    );
  }
  return factory();
}

/** True when the active provider has an API key configured. */
export function isLlmConfigured(): boolean {
  const id = providerId();
  if (id === "deepseek") {
    return Boolean(import.meta.env.VITE_DEEPSEEK_API_KEY);
  }
  // Per-provider checks go here as new providers are registered.
  return false;
}

/** The active provider's id, for display. */
export function activeProviderId(): string {
  return providerId();
}
