/**
 * Zehire Job Service
 * ==================
 * Business logic for job creation and processing.
 *
 * This service orchestrates:
 * - Job creation (sync)
 * - Background processing via ctx.waitUntil()
 * - Status retrieval and formatting
 */

import type { ExecutionContext } from "@cloudflare/workers-types";
import type { JobErrorCode } from "../../types/bindings";
import type { LLMClient } from "./archetypes/inference";
import { generateQuestionsForJob } from "./archetypes/renderer";
import { JobRepository } from "./repository";
import type {
  CreateJobInput,
  CreateJobResponse,
  JobContextOutput,
  JobRow,
  JobStatusResponse,
  RenderedQuestionOutput,
  ResolvedArchetypeOutput,
} from "./schemas";
import { JobContextSchema, RenderedQuestionSchema, ResolvedArchetypeSchema } from "./schemas";

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class JobService {
  constructor(
    private readonly repository: JobRepository,
    private readonly llmClient: LLMClient
  ) {}

  // ===========================================================================
  // CREATE JOB (SYNC)
  // ===========================================================================

  /**
   * Create a new job and schedule background processing.
   *
   * This method:
   * 1. Creates a job record in "pending" status
   * 2. Schedules LLM processing via ctx.waitUntil()
   * 3. Returns immediately with the job ID
   *
   * @param input - Validated job creation input
   * @param ctx - Workers execution context for waitUntil
   * @returns Job ID and status for immediate response
   */
  async createJob(input: CreateJobInput, ctx: ExecutionContext): Promise<CreateJobResponse> {
    // Step 1: Create job in pending status
    const job = await this.repository.create(input);

    // Step 2: Schedule background processing
    // ctx.waitUntil() extends the worker lifetime without blocking the response
    ctx.waitUntil(this.processJob(job.id, input));

    // Step 3: Return immediately
    return {
      id: job.id,
      status: job.status,
      createdAt: job.created_at,
    };
  }

  // ===========================================================================
  // BACKGROUND PROCESSING
  // ===========================================================================

  /**
   * Process a job in the background.
   *
   * This runs via ctx.waitUntil() and:
   * 1. Marks job as "processing"
   * 2. Runs LLM inference (inferJobContext)
   * 3. Resolves archetypes
   * 4. Renders questions
   * 5. Marks job as "completed" or "failed"
   *
   * Errors are caught and stored in the job record.
   */
  private async processJob(jobId: string, input: CreateJobInput): Promise<void> {
    const startTime = Date.now();

    try {
      // Mark as processing
      await this.repository.markProcessing(jobId);

      // Run the full LLM pipeline
      // Note: Convert null to undefined for JobPostingInput compatibility
      const result = await generateQuestionsForJob(this.llmClient, {
        title: input.title,
        description: input.description,
        ...(input.companyName && { companyName: input.companyName }),
        ...(input.department && { department: input.department }),
        ...(input.location && { location: input.location }),
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

      // Mark as completed with results
      await this.repository.markCompleted(jobId, {
        jobContext: result.jobContext as JobContextOutput,
        archetypes,
        questions: result.questions as RenderedQuestionOutput[],
        processingDurationMs,
      });
    } catch (error) {
      // Determine error code based on error type
      const { code, message } = this.categorizeError(error);

      await this.repository.markFailed(jobId, {
        message,
        code,
      });

      // Re-throw for logging (caught by Workers runtime)
      console.error(`Job ${jobId} failed:`, error);
    }
  }

  /**
   * Categorize an error into a machine-readable code.
   */
  private categorizeError(error: unknown): {
    code: JobErrorCode;
    message: string;
  } {
    const message = error instanceof Error ? error.message : "Unknown error occurred";

    // Check for specific error patterns
    if (message.includes("rate limit") || message.includes("429")) {
      return { code: "LLM_RATE_LIMITED", message };
    }

    if (message.includes("timeout") || message.includes("ETIMEDOUT")) {
      return { code: "LLM_TIMEOUT", message };
    }

    if (message.includes("Invalid JSON") || message.includes("Validation failed")) {
      return { code: "VALIDATION_ERROR", message };
    }

    if (message.includes("inference") || message.includes("JobContext")) {
      return { code: "INFERENCE_FAILED", message };
    }

    if (message.includes("archetype") || message.includes("resolve")) {
      return { code: "ARCHETYPE_RESOLUTION_FAILED", message };
    }

    if (message.includes("render") || message.includes("question")) {
      return { code: "QUESTION_RENDERING_FAILED", message };
    }

    return { code: "INTERNAL_ERROR", message };
  }

  // ===========================================================================
  // GET JOB STATUS
  // ===========================================================================

  /**
   * Get job status and results (if completed).
   *
   * This is called by clients polling for job completion.
   * Response shape varies by status (discriminated union).
   */
  async getJobStatus(jobId: string): Promise<JobStatusResponse | null> {
    const job = await this.repository.findById(jobId);

    if (!job) {
      return null;
    }

    return this.formatJobResponse(job);
  }

  /**
   * Format a job row into the appropriate API response.
   * Uses discriminated union based on status.
   */
  private formatJobResponse(job: JobRow): JobStatusResponse {
    switch (job.status) {
      case "pending":
        return {
          id: job.id,
          status: "pending",
          title: job.title,
          createdAt: job.created_at,
          updatedAt: job.updated_at,
        };

      case "processing":
        return {
          id: job.id,
          status: "processing",
          title: job.title,
          createdAt: job.created_at,
          updatedAt: job.updated_at,
          processingStartedAt: job.processing_started_at!,
        };

      case "completed":
        return {
          id: job.id,
          status: "completed",
          title: job.title,
          description: job.description,
          companyName: job.company_name,
          department: job.department,
          location: job.location,
          jobContext: this.parseJson(job.job_context, JobContextSchema),
          archetypes: this.parseJsonArray(job.archetypes, ResolvedArchetypeSchema),
          questions: this.parseJsonArray(job.questions, RenderedQuestionSchema),
          createdAt: job.created_at,
          updatedAt: job.updated_at,
          completedAt: job.completed_at!,
          processingDurationMs: job.processing_duration_ms!,
        };

      case "failed":
        return {
          id: job.id,
          status: "failed",
          title: job.title,
          errorMessage: job.error_message!,
          errorCode: job.error_code!,
          createdAt: job.created_at,
          updatedAt: job.updated_at,
          completedAt: job.completed_at!,
        };
    }
  }

  /**
   * Parse JSON string with Zod validation.
   */
  private parseJson<T>(jsonString: string | null, schema: { parse: (data: unknown) => T }): T {
    if (!jsonString) {
      throw new Error("Expected JSON string but got null");
    }
    return schema.parse(JSON.parse(jsonString));
  }

  /**
   * Parse JSON array string with Zod validation.
   */
  private parseJsonArray<T>(
    jsonString: string | null,
    schema: { parse: (data: unknown) => T }
  ): T[] {
    if (!jsonString) {
      throw new Error("Expected JSON array string but got null");
    }
    const parsed: unknown = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) {
      throw new Error("Expected array but got " + typeof parsed);
    }
    return parsed.map((item: unknown) => schema.parse(item));
  }
}
