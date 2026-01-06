/**
 * Anthropic LLM Client
 * ====================
 * Edge-compatible Anthropic client for Cloudflare Workers.
 *
 * Uses fetch directly instead of the SDK to avoid Node.js dependencies.
 */

import type { LLMClient } from "../../domain/jobs/archetypes/inference";

// =============================================================================
// TYPES
// =============================================================================

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<{
    type: "text";
    text: string;
  }>;
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence";
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicErrorResponse {
  type: "error";
  error: {
    type: string;
    message: string;
  };
}

// =============================================================================
// CLIENT IMPLEMENTATION
// =============================================================================

export interface AnthropicClientOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

/**
 * Create an Anthropic LLM client compatible with the LLMClient interface.
 *
 * @example
 * ```typescript
 * const client = createAnthropicClient({
 *   apiKey: c.env.ANTHROPIC_API_KEY,
 * });
 *
 * const context = await inferJobContext(client, jobPosting);
 * ```
 */
export function createAnthropicClient(options: AnthropicClientOptions): LLMClient {
  const {
    apiKey,
    model = "claude-sonnet-4-20250514",
    baseUrl = "https://api.anthropic.com",
  } = options;

  return {
    async complete(params) {
      const { system, user, temperature = 0, maxTokens = 1024 } = params;

      const messages: AnthropicMessage[] = [{ role: "user", content: user }];

      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          system,
          messages,
        }),
      });

      if (!response.ok) {
        const errorBody: AnthropicErrorResponse = await response.json();
        const errorMessage = errorBody.error?.message ?? `HTTP ${response.status}`;

        // Check for rate limiting
        if (response.status === 429) {
          throw new Error(`Anthropic rate limit exceeded: ${errorMessage}`);
        }

        throw new Error(`Anthropic API error: ${errorMessage}`);
      }

      const data: AnthropicResponse = await response.json();

      // Extract text from response
      const textContent = data.content.find((c) => c.type === "text");
      if (!textContent) {
        throw new Error("No text content in Anthropic response");
      }

      return textContent.text;
    },
  };
}
