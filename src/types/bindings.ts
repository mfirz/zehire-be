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

  // ==========================================================================
  // AUTH CONFIGURATION
  // ==========================================================================

  /**
   * Base URL of the application (for magic link generation).
   * Example: "https://app.zehire.com" or "http://localhost:8787"
   */
  APP_BASE_URL: string;

  /**
   * Magic link token TTL in minutes.
   * Default: 15 minutes
   */
  AUTH_TOKEN_TTL_MINUTES: string;

  /**
   * Session TTL in minutes.
   * Default: 1440 (24 hours)
   */
  AUTH_SESSION_TTL_MINUTES?: string;

  /**
   * Secret key for signing JWTs.
   * Set via: wrangler secret put AUTH_JWT_SECRET
   */
  AUTH_JWT_SECRET: string;

  // ==========================================================================
  // AWS SES CONFIGURATION
  // ==========================================================================

  /**
   * AWS Access Key ID for SES.
   * Set via: wrangler secret put AWS_ACCESS_KEY_ID
   */
  AWS_ACCESS_KEY_ID?: string;

  /**
   * AWS Secret Access Key for SES.
   * Set via: wrangler secret put AWS_SECRET_ACCESS_KEY
   */
  AWS_SECRET_ACCESS_KEY?: string;

  /**
   * AWS Region for SES (e.g., "us-east-1").
   */
  AWS_REGION?: string;

  /**
   * Verified sender email address for SES.
   */
  SES_FROM_EMAIL?: string;

  /**
   * Optional SES configuration set name.
   */
  SES_CONFIGURATION_SET?: string;
}

// =============================================================================
// HONO APP TYPE
// =============================================================================

import type { Hono } from "hono";
import type { UserClaims } from "../modules/auth/auth.types";

/**
 * Variables available in the Hono context for authenticated routes.
 */
export interface AuthVariables {
  /** Authenticated user claims extracted from JWT */
  user: UserClaims;
}

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

/**
 * Type-safe Hono app with Zehire bindings and authenticated user context.
 * Use this type for routes that require authentication.
 *
 * @example
 * ```typescript
 * import type { AuthenticatedAppType } from "@/types/bindings";
 *
 * const app: AuthenticatedAppType = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
 *
 * app.get("/jobs/:id", async (c) => {
 *   const user = c.get("user");  // Type-safe user claims
 *   const db = c.env.DB;
 *   // ...
 * });
 * ```
 */
export type AuthenticatedAppType = Hono<{ Bindings: Env; Variables: AuthVariables }>;

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
 * Job visibility/billing lifecycle status.
 * - draft: Not published, no billing
 * - published: Live, accepting applications, billing active
 * - paused: Temporarily inactive, billing stopped
 * - closed: Permanently closed, billing stopped
 */
export const JOB_STATUSES = ["draft", "published", "paused", "closed"] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * Question generation processing status.
 * - none: Questions not yet generated
 * - pending: Queued for generation
 * - processing: Currently being generated by LLM
 * - completed: Questions generated successfully
 * - failed: Question generation failed
 */
export const QUESTIONS_STATUSES = ["none", "pending", "processing", "completed", "failed"] as const;

export type QuestionsStatus = (typeof QUESTIONS_STATUSES)[number];

/**
 * Pipeline generation processing status.
 * Same values as questions - follows the exact same pattern.
 * - none: Pipeline not yet generated
 * - pending: Queued for generation
 * - processing: Currently being generated by LLM
 * - completed: Pipeline generated successfully
 * - failed: Pipeline generation failed
 */
export const PIPELINE_STATUSES = ["none", "pending", "processing", "completed", "failed"] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

/**
 * Error codes for failed jobs.
 * Machine-readable codes for client-side handling.
 */
export const JOB_ERROR_CODES = [
  // Question generation errors
  "INFERENCE_FAILED", // LLM inference step failed
  "ARCHETYPE_RESOLUTION_FAILED", // Archetype resolution step failed
  "QUESTION_RENDERING_FAILED", // Question rendering step failed
  // Pipeline generation errors
  "PIPELINE_GENERATION_FAILED", // Pipeline advisor LLM call failed
  // Shared errors
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
 * Type of job processing to perform.
 * - questions: Generate interview questions (default)
 * - pipeline: Generate hiring pipeline recommendation
 */
export type JobQueueType = "questions" | "pipeline";

/**
 * Message payload for job processing queue.
 * Keep this small - full job data is in D1.
 */
export interface JobQueueMessage {
  /** Job ID to process */
  jobId: string;

  /** Timestamp when message was created (for debugging) */
  createdAt: string;

  /** Type of processing to perform (defaults to 'questions' for backwards compatibility) */
  type?: JobQueueType;
}

// =============================================================================
// BILLING TYPES
// =============================================================================

/**
 * Billing event types for job lifecycle tracking.
 * Used for accurate billing calculation.
 */
export const BILLING_EVENT_TYPES = ["activated", "paused", "resumed", "closed"] as const;

export type BillingEventType = (typeof BILLING_EVENT_TYPES)[number];

/**
 * Billing period status.
 */
export const BILLING_PERIOD_STATUSES = ["pending", "invoiced", "paid", "failed"] as const;

export type BillingPeriodStatus = (typeof BILLING_PERIOD_STATUSES)[number];

// =============================================================================
// REGENERATION LIMITS (configurable)
// =============================================================================

/**
 * Maximum number of question regenerations per job.
 * Prevents abuse and controls LLM costs.
 */
export const MAX_REGENERATIONS_PER_JOB = 20;

/**
 * Cooldown period between regenerations in minutes.
 * Prevents rapid-fire regeneration requests.
 */
export const REGENERATION_COOLDOWN_MINUTES = 10;
