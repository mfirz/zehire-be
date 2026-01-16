/**
 * LLM Module Exports
 * ==================
 * Provides a unified interface for LLM inference with multiple provider support.
 */

import type { LLMClient } from "../../domain/jobs/archetypes/inference";
import type { Env, LLMProvider } from "../../types/bindings";
import { createAnthropicClient } from "./anthropic";
import { createGroqClient } from "./groq";
import { createWorkersAIClient } from "./workers-ai";

// Re-export individual clients
export { createAnthropicClient, type AnthropicClientOptions } from "./anthropic";
export { createGroqClient, GROQ_MODELS, type GroqClientOptions, type GroqModel } from "./groq";
export {
  createWorkersAIClient,
  WORKERS_AI_MODELS,
  type WorkersAIClientOptions,
} from "./workers-ai";

// =============================================================================
// LLM CLIENT FACTORY
// =============================================================================

export interface CreateLLMClientOptions {
  /**
   * Environment bindings from Cloudflare Workers
   */
  env: Env;

  /**
   * Override the provider from environment config.
   * If not specified, uses env.LLM_PROVIDER (defaults to "workers-ai")
   */
  provider?: LLMProvider;
}

/**
 * Create an LLM client based on environment configuration.
 *
 * This factory automatically selects the appropriate provider:
 * - "workers-ai": Free Cloudflare Workers AI (default)
 * - "anthropic": Paid Anthropic Claude API
 * - "groq": Fast & cheap Groq with Llama models
 *
 * @example
 * ```typescript
 * // In a Hono route handler:
 * const llmClient = createLLMClient({ env: c.env });
 * const context = await inferJobContext(llmClient, jobPosting);
 * ```
 */
export function createLLMClient(options: CreateLLMClientOptions): LLMClient {
  const { env, provider = env.LLM_PROVIDER ?? "workers-ai" } = options;

  switch (provider) {
    case "anthropic": {
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error(
          "ANTHROPIC_API_KEY is required when using anthropic provider. " +
            "Set it via: wrangler secret put ANTHROPIC_API_KEY"
        );
      }
      return createAnthropicClient({
        apiKey: env.ANTHROPIC_API_KEY,
      });
    }

    case "groq": {
      if (!env.GROQ_API_KEY) {
        throw new Error(
          "GROQ_API_KEY is required when using groq provider. " +
            "Set it via: wrangler secret put GROQ_API_KEY"
        );
      }
      return createGroqClient({
        apiKey: env.GROQ_API_KEY,
        model: env.GROQ_MODEL ?? "llama-3.3-70b",
      });
    }

    case "workers-ai": {
      return createWorkersAIClient({
        ai: env.AI,
      });
    }

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = provider;
      throw new Error(`Unknown LLM provider: ${_exhaustive}`);
    }
  }
}

/**
 * Get the display name for an LLM provider.
 * Useful for logging and debugging.
 */
export function getProviderDisplayName(provider: LLMProvider): string {
  switch (provider) {
    case "workers-ai":
      return "Cloudflare Workers AI (Llama 3.1 8B)";
    case "anthropic":
      return "Anthropic Claude";
    case "groq":
      return "Groq (Llama 3.3 70B)";
  }
}
