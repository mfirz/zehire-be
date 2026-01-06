/**
 * Cloudflare Workers Bindings
 * ===========================
 * Type-safe bindings for all Cloudflare resources.
 *
 * These types are used throughout the application to ensure
 * type safety when accessing Workers runtime bindings.
 */

/**
 * Environment bindings available in the Workers runtime.
 * Configured in wrangler.toml and accessed via c.env in Hono.
 */
export interface Env {
  // ==========================================================================
  // DATABASE BINDINGS
  // ==========================================================================

  /**
   * D1 database for persistent storage.
   * Contains: jobs, (future: candidates, interviews, etc.)
   */
  DB: D1Database;

  // ==========================================================================
  // AI BINDINGS
  // ==========================================================================

  /**
   * Cloudflare Workers AI binding for free LLM inference.
   * Free tier: 10,000 neurons/day
   */
  AI: Ai;

  // ==========================================================================
  // QUEUE BINDINGS
  // ==========================================================================

  /**
   * Job processing queue for durable async job processing.
   * Free tier: 1 million operations/month
   */
  JOB_QUEUE: Queue<JobQueueMessage>;

  // ==========================================================================
  // KV BINDINGS (Future)
  // ==========================================================================

  // /**
  //  * KV namespace for caching and configuration.
  //  * Use cases: rate limiting, feature flags, cached LLM responses
  //  */
  // CACHE: KVNamespace;

  // ==========================================================================
  // SECRETS
  // ==========================================================================

  /**
   * Anthropic API key for LLM inference.
   * Set via: wrangler secret put ANTHROPIC_API_KEY
   * Optional when using Workers AI provider.
   */
  ANTHROPIC_API_KEY?: string;

  /**
   * API key for client authentication.
   * Set via: wrangler secret put API_KEY
   */
  API_KEY: string;

  // ==========================================================================
  // ENVIRONMENT VARIABLES
  // ==========================================================================

  /**
   * Current environment (development, staging, production).
   * Used for conditional behavior and logging.
   */
  ENVIRONMENT?: "development" | "staging" | "production";

  /**
   * Log level for structured logging.
   */
  LOG_LEVEL?: "debug" | "info" | "warn" | "error";

  /**
   * LLM provider to use for inference.
   * - "workers-ai": Free Cloudflare Workers AI (Llama 3.1 8B)
   * - "anthropic": Paid Anthropic Claude (requires ANTHROPIC_API_KEY)
   */
  LLM_PROVIDER?: "workers-ai" | "anthropic";
}

// =============================================================================
// HONO APP TYPE
// =============================================================================

import type { Hono } from "hono";

/**
 * Type-safe Hono app with Zehire bindings.
 * Use this type when creating route handlers.
 *
 * @example
 * ```typescript
 * import type { AppType } from "@/types/bindings";
 *
 * const app: AppType = new Hono<{ Bindings: Env }>();
 *
 * app.get("/jobs/:id", async (c) => {
 *   const db = c.env.DB;  // Type-safe D1 binding
 *   // ...
 * });
 * ```
 */
export type AppType = Hono<{ Bindings: Env }>;

// =============================================================================
// D1 TYPE HELPERS
// =============================================================================

/**
 * Helper type for D1 query results.
 * Use when typing raw SQL query results.
 */
export type D1Result<T> = {
  results: T[];
  success: boolean;
  meta: {
    duration: number;
    changes: number;
    last_row_id: number;
    served_by: string;
  };
};

// =============================================================================
// JOB STATUS TYPES
// =============================================================================

/**
 * Job processing status as stored in the database.
 * Uses discriminated union pattern for type safety.
 */
export const JOB_STATUSES = ["pending", "processing", "completed", "failed"] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * Error codes for failed jobs.
 * Machine-readable codes for client-side handling.
 */
export const JOB_ERROR_CODES = [
  "INFERENCE_FAILED", // LLM inference step failed
  "ARCHETYPE_RESOLUTION_FAILED", // Archetype resolution step failed
  "QUESTION_RENDERING_FAILED", // Question rendering step failed
  "LLM_RATE_LIMITED", // LLM API rate limited
  "LLM_TIMEOUT", // LLM API timed out
  "VALIDATION_ERROR", // Input or output validation failed
  "INTERNAL_ERROR", // Unexpected internal error
] as const;

export type JobErrorCode = (typeof JOB_ERROR_CODES)[number];

// =============================================================================
// LLM PROVIDER TYPES
// =============================================================================

export const LLM_PROVIDERS = ["workers-ai", "anthropic"] as const;

export type LLMProvider = (typeof LLM_PROVIDERS)[number];

// =============================================================================
// QUEUE MESSAGE TYPES
// =============================================================================

/**
 * Message payload for job processing queue.
 * Keep this small - full job data is in D1.
 */
export interface JobQueueMessage {
  /** Job ID to process */
  jobId: string;

  /** Timestamp when message was created (for debugging) */
  createdAt: string;
}
