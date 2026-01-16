/**
 * Groq LLM Client
 * ===============
 * Edge-compatible Groq client for Cloudflare Workers.
 *
 * Uses fetch directly with OpenAI-compatible API format.
 * Groq provides extremely fast inference with Llama models.
 *
 * Pricing (as of Jan 2025):
 * - Llama 3.3 70B: $0.59/$0.79 per 1M tokens (input/output)
 * - Llama 3.1 8B:  $0.05/$0.08 per 1M tokens (input/output)
 */

import type { LLMClient } from "../../domain/jobs/archetypes/inference";

// =============================================================================
// TYPES
// =============================================================================

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GroqResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: "stop" | "length" | "tool_calls";
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface GroqErrorResponse {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

// =============================================================================
// MODELS
// =============================================================================

/**
 * Available Groq models.
 *
 * - llama-3.3-70b-versatile: Best quality, recommended for signal extraction
 * - llama-3.1-8b-instant: Fastest and cheapest, good for simple tasks
 */
export const GROQ_MODELS = {
  /** Best quality - recommended for signal extraction and complex reasoning */
  "llama-3.3-70b": "llama-3.3-70b-versatile",
  /** Fast and cheap - good for simple tasks */
  "llama-3.1-8b": "llama-3.1-8b-instant",
} as const;

export type GroqModel = keyof typeof GROQ_MODELS;

// =============================================================================
// CLIENT IMPLEMENTATION
// =============================================================================

export interface GroqClientOptions {
  apiKey: string;
  model?: GroqModel;
  baseUrl?: string;
}

/**
 * Create a Groq LLM client compatible with the LLMClient interface.
 *
 * @example
 * ```typescript
 * const client = createGroqClient({
 *   apiKey: c.env.GROQ_API_KEY,
 *   model: "llama-3.3-70b", // or "llama-3.1-8b" for faster/cheaper
 * });
 *
 * const context = await inferJobContext(client, jobPosting);
 * ```
 */
export function createGroqClient(options: GroqClientOptions): LLMClient {
  const {
    apiKey,
    model = "llama-3.3-70b",
    baseUrl = "https://api.groq.com/openai",
  } = options;

  const modelId = GROQ_MODELS[model];

  return {
    async complete(params) {
      const { system, user, temperature = 0, maxTokens = 2048 } = params;

      const messages: GroqMessage[] = [
        { role: "system", content: system },
        { role: "user", content: user },
      ];

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;

        try {
          const errorBody: GroqErrorResponse = await response.json();
          errorMessage = errorBody.error?.message ?? errorMessage;
        } catch {
          // Ignore JSON parse errors
        }

        // Check for rate limiting
        if (response.status === 429) {
          throw new Error(`Groq rate limit exceeded: ${errorMessage}`);
        }

        throw new Error(`Groq API error: ${errorMessage}`);
      }

      const data: GroqResponse = await response.json();

      // Extract text from response
      const choice = data.choices[0];
      const content = choice?.message?.content ?? "";

      if (!content) {
        throw new Error("No content in Groq response");
      }

      // Check if response was truncated
      if (choice?.finish_reason === "length") {
        console.warn(`[Groq] Response truncated at ${data.usage?.completion_tokens} tokens. Consider increasing maxTokens.`);
      }

      return content;
    },
  };
}
