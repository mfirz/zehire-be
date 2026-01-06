/**
 * Cloudflare Workers AI Client
 * ============================
 * Free LLM inference using Cloudflare's edge AI.
 *
 * Free tier: 10,000 neurons/day
 * Model: @cf/meta/llama-3.1-8b-instruct
 */

import type { LLMClient } from "../../domain/jobs/archetypes/inference";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Workers AI text generation response
 */
interface WorkersAITextResponse {
  response: string;
}

// =============================================================================
// CLIENT IMPLEMENTATION
// =============================================================================

export interface WorkersAIClientOptions {
  /**
   * The AI binding from Cloudflare Workers runtime
   */
  ai: Ai;

  /**
   * Model to use for inference.
   * @default "@cf/meta/llama-3.1-8b-instruct"
   */
  model?: string;
}

/**
 * Available Workers AI models for text generation.
 *
 * Recommended for structured output:
 * - @cf/meta/llama-3.1-8b-instruct (best balance of speed/quality)
 * - @cf/meta/llama-3.1-70b-instruct (higher quality, slower)
 * - @cf/mistral/mistral-7b-instruct-v0.1 (fast, good for simple tasks)
 */
export const WORKERS_AI_MODELS = {
  LLAMA_3_1_8B: "@cf/meta/llama-3.1-8b-instruct",
  LLAMA_3_1_70B: "@cf/meta/llama-3.1-70b-instruct",
  MISTRAL_7B: "@cf/mistral/mistral-7b-instruct-v0.1",
} as const;

/**
 * Create a Workers AI LLM client compatible with the LLMClient interface.
 *
 * @example
 * ```typescript
 * const client = createWorkersAIClient({
 *   ai: c.env.AI,
 * });
 *
 * const context = await inferJobContext(client, jobPosting);
 * ```
 */
export function createWorkersAIClient(options: WorkersAIClientOptions): LLMClient {
  const { ai, model = WORKERS_AI_MODELS.LLAMA_3_1_8B } = options;

  return {
    async complete(params) {
      const { system, user, temperature = 0, maxTokens = 1024 } = params;

      // Workers AI uses a messages array similar to OpenAI format
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: system },
        { role: "user", content: user },
      ];

      const response = await ai.run(model as Parameters<Ai["run"]>[0], {
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      // Workers AI returns { response: string } for text generation
      const textResponse = response as WorkersAITextResponse;

      if (!textResponse.response) {
        throw new Error("No response from Workers AI");
      }

      return textResponse.response;
    },
  };
}
