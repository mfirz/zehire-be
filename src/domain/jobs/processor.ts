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

import type { D1Database } from "@cloudflare/workers-types";

import type { JobErrorCode } from "../../types/bindings";
import { InterviewStagesRepository } from "../interview-stages";
import { generatePipelineRecommendation } from "../pipeline/advisor";
import type { LLMClient } from "./archetypes/inference";
import { generateQuestionsForJob } from "./archetypes/renderer";
import { JobRepository, OrgRepository } from "./repository";
import type { JobContextOutput, RenderedQuestionOutput, ResolvedArchetypeOutput } from "./schemas";

// =============================================================================
// PROCESSOR CLASS
// =============================================================================

export class JobProcessor {
  private readonly interviewStagesRepository: InterviewStagesRepository;

  constructor(
    private readonly repository: JobRepository,
    private readonly orgRepository: OrgRepository,
    private readonly llmClient: LLMClient,
    d1: D1Database
  ) {
    this.interviewStagesRepository = new InterviewStagesRepository(d1);
  }

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
    if (job.questionsStatus === "completed" || job.questionsStatus === "failed") {
      console.log(`[Processor] Job ${jobId} questions already ${job.questionsStatus}, skipping`);
      return;
    }

    // Only process jobs that are pending question generation
    if (job.questionsStatus !== "pending") {
      console.log(
        `[Processor] Job ${jobId} questions_status is ${job.questionsStatus}, not pending - skipping`
      );
      return;
    }

    try {
      // Mark questions as processing
      await this.repository.markQuestionsProcessing(jobId);

      // Run the full LLM pipeline (use plain text for LLM)
      const result = await generateQuestionsForJob(this.llmClient, {
        title: job.title,
        description: job.descriptionText!,
        ...(job.companyName && { companyName: job.companyName }),
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
      if (job.orgId) {
        await this.orgRepository.incrementJobsListVersion(job.orgId);
      }

      console.log(`[Processor] Job ${jobId} questions completed in ${processingDurationMs}ms`);
    } catch (error) {
      const { code, message, retryable } = this.categorizeError(error);

      if (retryable) {
        // For transient errors, try to reset to pending so queue can retry
        try {
          await this.repository.resetQuestionsForRetry(jobId);

          console.log(
            `[Processor] Job ${jobId} hit transient error (${code}), reset for retry: ${message}`
          );

          // Re-throw for queue retry mechanism
          throw error;
        } catch (resetError) {
          // If reset fails (e.g., persistent DB lock), fallback to marking as failed
          console.log(
            `[Processor] Job ${jobId} reset failed, falling back to failed status: ${resetError}`
          );

          try {
            await this.repository.markQuestionsFailed(jobId, {
              message: `${message} (reset also failed: ${resetError instanceof Error ? resetError.message : "unknown"})`,
              code,
            });

            if (job.orgId) {
              await this.orgRepository.incrementJobsListVersion(job.orgId);
            }

            console.log(`[Processor] Job ${jobId} marked as failed after reset failure`);
          } catch (failError) {
            // Last resort: log and let it go to DLQ
            console.error(
              `[Processor] Job ${jobId} could not be marked as failed: ${failError}`
            );
          }

          // Don't re-throw - we've handled it (either marked failed or gave up)
          return;
        }
      }

      // For permanent errors, mark as failed
      await this.repository.markQuestionsFailed(jobId, {
        message,
        code,
      });

      // Invalidate job list cache for this org
      if (job.orgId) {
        await this.orgRepository.incrementJobsListVersion(job.orgId);
      }

      console.log(`[Processor] Job ${jobId} failed permanently (${code}): ${message}`);

      // Re-throw for visibility
      throw error;
    }
  }

  /**
   * Process pipeline generation for a job by ID.
   *
   * Fetches the job from D1, runs the LLM pipeline advisor, and updates pipeline status.
   * Throws if processing fails (for queue retry mechanism).
   */
  async processPipelineJob(jobId: string): Promise<void> {
    const startTime = Date.now();

    // Fetch job from database
    const job = await this.repository.findById(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Skip if pipeline already processed (terminal state for pipeline generation)
    if (job.pipelineStatus === "completed" || job.pipelineStatus === "failed") {
      console.log(`[Processor] Job ${jobId} pipeline already ${job.pipelineStatus}, skipping`);
      return;
    }

    // Only process jobs that are pending pipeline generation
    if (job.pipelineStatus !== "pending") {
      console.log(
        `[Processor] Job ${jobId} pipeline_status is ${job.pipelineStatus}, not pending - skipping`
      );
      return;
    }

    try {
      // Mark pipeline as processing
      await this.repository.markPipelineProcessing(jobId);

      // Run the pipeline advisor LLM (use plain text for LLM)
      const result = await generatePipelineRecommendation(this.llmClient, {
        title: job.title,
        description: job.descriptionText!,
        ...(job.companyName && { companyName: job.companyName }),
      });

      const processingDurationMs = Date.now() - startTime;

      // Delete any existing stages first (idempotent - handles retries safely)
      await this.interviewStagesRepository.deleteAllStagesForJob(jobId);

      // Create interview stages in the database table (source of truth)
      await this.interviewStagesRepository.createStagesFromRecommendation(
        jobId,
        result.recommendation.interviewPanel.rounds.map((round) => ({
          name: round.name,
          duration: round.duration,
          focus: round.focus,
        }))
      );

      // Mark pipeline as completed with results
      // Note: config JSON is kept for assessment config only
      await this.repository.markPipelineCompleted(jobId, {
        recommendation: result.recommendation,
        config: result.config,
        processingDurationMs,
      });

      // Invalidate job list cache for this org
      if (job.orgId) {
        await this.orgRepository.incrementJobsListVersion(job.orgId);
      }

      console.log(`[Processor] Job ${jobId} pipeline completed in ${processingDurationMs}ms`);
    } catch (error) {
      const { code, message, retryable } = this.categorizePipelineError(error);

      if (retryable) {
        // For transient errors, try to reset to pending so queue can retry
        try {
          await this.repository.resetPipelineForRetry(jobId);

          console.log(
            `[Processor] Job ${jobId} pipeline hit transient error (${code}), reset for retry: ${message}`
          );

          // Re-throw for queue retry mechanism
          throw error;
        } catch (resetError) {
          // If reset fails (e.g., persistent DB lock), fallback to marking as failed
          console.log(
            `[Processor] Job ${jobId} pipeline reset failed, falling back to failed status: ${resetError}`
          );

          try {
            await this.repository.markPipelineFailed(jobId, {
              message: `${message} (reset also failed: ${resetError instanceof Error ? resetError.message : "unknown"})`,
              code,
            });

            if (job.orgId) {
              await this.orgRepository.incrementJobsListVersion(job.orgId);
            }

            console.log(`[Processor] Job ${jobId} pipeline marked as failed after reset failure`);
          } catch (failError) {
            // Last resort: log and let it go to DLQ
            console.error(
              `[Processor] Job ${jobId} pipeline could not be marked as failed: ${failError}`
            );
          }

          // Don't re-throw - we've handled it (either marked failed or gave up)
          return;
        }
      }

      // For permanent errors, mark as failed
      await this.repository.markPipelineFailed(jobId, {
        message,
        code,
      });

      // Invalidate job list cache for this org
      if (job.orgId) {
        await this.orgRepository.incrementJobsListVersion(job.orgId);
      }

      console.log(`[Processor] Job ${jobId} pipeline failed permanently (${code}): ${message}`);

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

    // D1/SQLite database lock errors (concurrent writes)
    if (
      message.includes("1031") ||
      message.includes("SQLITE_BUSY") ||
      message.includes("database is locked")
    ) {
      return { code: "LLM_TIMEOUT", message: "Database busy, will retry", retryable: true };
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

  /**
   * Categorize a pipeline error into a machine-readable code.
   * Also determines if the error is retryable (transient) or permanent.
   */
  private categorizePipelineError(error: unknown): {
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

    // D1/SQLite database lock errors (concurrent writes)
    if (
      message.includes("1031") ||
      message.includes("SQLITE_BUSY") ||
      message.includes("database is locked")
    ) {
      return { code: "LLM_TIMEOUT", message: "Database busy, will retry", retryable: true };
    }

    // ==========================================================================
    // PERMANENT ERRORS (should not retry - mark as failed)
    // ==========================================================================

    if (message.includes("Invalid JSON") || message.includes("Validation failed")) {
      return { code: "VALIDATION_ERROR", message, retryable: false };
    }

    if (message.includes("Invalid pipeline")) {
      return { code: "PIPELINE_GENERATION_FAILED", message, retryable: false };
    }

    // Unknown errors are NOT retryable by default to prevent infinite loops
    return { code: "PIPELINE_GENERATION_FAILED", message, retryable: false };
  }
}
