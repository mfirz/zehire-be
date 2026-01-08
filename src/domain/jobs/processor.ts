/**
 * Job Processor
 * =============
 * Handles the actual LLM processing pipeline for jobs.
 *
 * This processor:
 * 1. Fetches job from D1
 * 2. Runs LLM inference (inferJobContext)
 * 3. Resolves archetypes
 * 4. Renders questions
 * 5. Updates job status in D1
 * 6. Invalidates job list cache (increments version)
 *
 * Used by both:
 * - Queue consumer (production)
 * - Direct processing via waitUntil (fallback/testing)
 */

import type { JobErrorCode } from "../../types/bindings";
import type { LLMClient } from "./archetypes/inference";
import { generateQuestionsForJob } from "./archetypes/renderer";
import { JobRepository, OrgRepository } from "./repository";
import type { JobContextOutput, RenderedQuestionOutput, ResolvedArchetypeOutput } from "./schemas";

// =============================================================================
// PROCESSOR CLASS
// =============================================================================

export class JobProcessor {
  constructor(
    private readonly repository: JobRepository,
    private readonly orgRepository: OrgRepository,
    private readonly llmClient: LLMClient
  ) {}

  /**
   * Process a job by ID.
   *
   * Fetches the job from D1, runs the LLM pipeline, and updates questions status.
   * Throws if processing fails (for queue retry mechanism).
   *
   * Note: This only updates questions_status, NOT the visibility status (draft/published).
   * Jobs remain as drafts until explicitly published.
   */
  async processJob(jobId: string): Promise<void> {
    const startTime = Date.now();

    // Fetch job from database
    const job = await this.repository.findById(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Skip if questions already processed (terminal state for question generation)
    if (job.questions_status === "completed" || job.questions_status === "failed") {
      console.log(`[Processor] Job ${jobId} questions already ${job.questions_status}, skipping`);
      return;
    }

    // Only process jobs that are pending question generation
    if (job.questions_status !== "pending") {
      console.log(
        `[Processor] Job ${jobId} questions_status is ${job.questions_status}, not pending - skipping`
      );
      return;
    }

    try {
      // Mark questions as processing
      await this.repository.markQuestionsProcessing(jobId);

      // Run the full LLM pipeline
      const result = await generateQuestionsForJob(this.llmClient, {
        title: job.title,
        description: job.description,
        ...(job.company_name && { companyName: job.company_name }),
        ...(job.department && { department: job.department }),
        ...(job.location && { location: job.location }),
      });

      const processingDurationMs = Date.now() - startTime;

      // Transform archetypes to storable format (strip functions/complex objects)
      const archetypes: ResolvedArchetypeOutput[] = result.archetypes.map((a) => ({
        id: a.id,
        category: a.category,
        description: a.description,
        signals: a.signals,
        selectionReason: a.selectionReason,
      }));

      // Mark questions as completed with results
      await this.repository.markQuestionsCompleted(jobId, {
        jobContext: result.jobContext as JobContextOutput,
        archetypes,
        questions: result.questions as RenderedQuestionOutput[],
        processingDurationMs,
      });

      // Invalidate job list cache for this org
      if (job.org_id) {
        await this.orgRepository.incrementJobsListVersion(job.org_id);
      }

      console.log(`[Processor] Job ${jobId} questions completed in ${processingDurationMs}ms`);
    } catch (error) {
      const { code, message, retryable } = this.categorizeError(error);

      if (retryable) {
        // For transient errors, reset to pending so queue can retry
        // Also decrements regeneration_count since this attempt doesn't count
        await this.repository.resetQuestionsForRetry(jobId);

        console.log(
          `[Processor] Job ${jobId} hit transient error (${code}), reset for retry: ${message}`
        );

        // Re-throw for queue retry mechanism
        throw error;
      }

      // For permanent errors, mark as failed
      await this.repository.markQuestionsFailed(jobId, {
        message,
        code,
      });

      // Invalidate job list cache for this org
      if (job.org_id) {
        await this.orgRepository.incrementJobsListVersion(job.org_id);
      }

      console.log(`[Processor] Job ${jobId} failed permanently (${code}): ${message}`);

      // Re-throw for visibility
      throw error;
    }
  }

  /**
   * Categorize an error into a machine-readable code.
   * Also determines if the error is retryable (transient) or permanent.
   */
  private categorizeError(error: unknown): {
    code: JobErrorCode;
    message: string;
    retryable: boolean;
  } {
    const message = error instanceof Error ? error.message : "Unknown error occurred";

    // ==========================================================================
    // RETRYABLE ERRORS (transient - queue should retry)
    // ==========================================================================

    // Rate limiting - should retry after backoff
    if (message.includes("rate limit") || message.includes("429")) {
      return { code: "LLM_RATE_LIMITED", message, retryable: true };
    }

    // Timeout - may succeed on retry
    if (message.includes("timeout") || message.includes("ETIMEDOUT")) {
      return { code: "LLM_TIMEOUT", message, retryable: true };
    }

    // Capacity exceeded (Workers AI specific) - should retry
    if (message.includes("Capacity") || message.includes("capacity")) {
      return { code: "LLM_RATE_LIMITED", message, retryable: true };
    }

    // Temporary service errors
    if (message.includes("503") || message.includes("502") || message.includes("temporarily")) {
      return { code: "LLM_TIMEOUT", message, retryable: true };
    }

    // ==========================================================================
    // PERMANENT ERRORS (should not retry - mark as failed)
    // ==========================================================================

    if (message.includes("Invalid JSON") || message.includes("Validation failed")) {
      return { code: "VALIDATION_ERROR", message, retryable: false };
    }

    if (message.includes("inference") || message.includes("JobContext")) {
      return { code: "INFERENCE_FAILED", message, retryable: false };
    }

    if (message.includes("archetype") || message.includes("resolve")) {
      return { code: "ARCHETYPE_RESOLUTION_FAILED", message, retryable: false };
    }

    if (message.includes("render") || message.includes("question")) {
      return { code: "QUESTION_RENDERING_FAILED", message, retryable: false };
    }

    // Unknown errors are NOT retryable by default to prevent infinite loops
    return { code: "INTERNAL_ERROR", message, retryable: false };
  }
}
