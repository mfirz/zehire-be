/**
 * Zehire Job Service
 * ==================
 * Business logic for job creation and status retrieval.
 *
 * This service orchestrates:
 * - Job creation (sync) with queue-based processing
 * - Status retrieval and formatting
 *
 * Processing is handled asynchronously via Cloudflare Queue.
 */

import type { Env } from "../../types/bindings";
import { JobRepository } from "./repository";
import type {
  CreateJobInput,
  CreateJobResponse,
  JobRow,
  JobStatusResponse,
} from "./schemas";
import { JobContextSchema, RenderedQuestionSchema, ResolvedArchetypeSchema } from "./schemas";

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class JobService {
  constructor(
    private readonly repository: JobRepository,
    private readonly queue: Env["JOB_QUEUE"]
  ) {}

  // ===========================================================================
  // CREATE JOB (SYNC)
  // ===========================================================================

  /**
   * Create a new job and queue it for processing.
   *
   * This method:
   * 1. Creates a job record in "pending" status
   * 2. Sends job ID to Cloudflare Queue for processing
   * 3. Returns immediately with the job ID
   *
   * @param input - Validated job creation input
   * @returns Job ID and status for immediate response
   */
  async createJob(input: CreateJobInput): Promise<CreateJobResponse> {
    // Step 1: Create job in pending status
    const job = await this.repository.create(input);

    // Step 2: Send to queue for processing
    await this.queue.send({
      jobId: job.id,
      createdAt: new Date().toISOString(),
    });

    console.log(`[Service] Job ${job.id} created and queued for processing`);

    // Step 3: Return immediately
    return {
      id: job.id,
      status: job.status,
      createdAt: job.created_at,
    };
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
