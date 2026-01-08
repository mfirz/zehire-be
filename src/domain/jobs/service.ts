/**
 * Zehire Job Service
 * ==================
 * Business logic for job lifecycle management.
 *
 * This service orchestrates:
 * - Job creation (as draft)
 * - Job content updates
 * - Question generation (queue-based)
 * - Job publishing, pausing, resuming, closing
 * - Status retrieval and formatting
 *
 * Lifecycle: draft → published → paused → closed
 * Question generation: none → pending → processing → completed/failed
 */

import type { Env } from "../../types/bindings";
import { JobRepository, OrgRepository } from "./repository";
import type {
  CreateJobInput,
  CreateJobResponse,
  JobRow,
  JobStatusResponse,
  PublicJobResponse,
  UpdateJobInput,
} from "./schemas";
import { JobContextSchema, RenderedQuestionSchema, ResolvedArchetypeSchema } from "./schemas";
import { generateUniqueSlug } from "./slug";

// =============================================================================
// CONSTANTS (imported from bindings but defined locally for reference)
// =============================================================================

const MAX_REGENERATIONS = 20; // MAX_REGENERATIONS_PER_JOB
const COOLDOWN_MS = 1 * 60 * 1000; // REGENERATION_COOLDOWN_MINUTES * 60 * 1000

// =============================================================================
// ERROR TYPES
// =============================================================================

export type JobServiceError =
  | { code: "NOT_FOUND"; message: string }
  | { code: "FORBIDDEN"; message: string }
  | { code: "INVALID_STATE"; message: string }
  | { code: "REGENERATION_LIMIT_REACHED"; message: string }
  | { code: "REGENERATION_COOLDOWN"; message: string; retryAfter: number }
  | { code: "QUESTIONS_NOT_READY"; message: string }
  | {
      code: "CAPACITY_EXCEEDED";
      message: string;
      activeRoles: number;
      capacity: number;
    };

export type JobServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: JobServiceError };

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class JobService {
  constructor(
    private readonly repository: JobRepository,
    private readonly orgRepository: OrgRepository,
    private readonly queue: Env["JOB_QUEUE"]
  ) {}

  // ===========================================================================
  // CREATE JOB (SYNC - NO QUEUE)
  // ===========================================================================

  /**
   * Create a new job as a draft.
   *
   * Unlike the old API, this does NOT automatically queue for processing.
   * The job is created with questionsStatus='none' and must be explicitly
   * queued via generateQuestions().
   *
   * @param input - Validated job creation input
   * @param orgId - Organization ID from authenticated user
   * @returns Job ID and status for immediate response
   */
  async createJob(input: CreateJobInput, orgId: string): Promise<CreateJobResponse> {
    const job = await this.repository.create(input, orgId);

    console.log(`[Service] Job ${job.id} created as draft`);

    return {
      id: job.id,
      status: job.status,
      questionsStatus: job.questions_status,
      createdAt: job.created_at,
    };
  }

  // ===========================================================================
  // UPDATE JOB
  // ===========================================================================

  /**
   * Update a draft job's content.
   *
   * If title or description changes, questions are reset to 'none'
   * and must be regenerated.
   *
   * @param jobId - Job ID
   * @param orgId - Organization ID for authorization
   * @param input - Fields to update
   * @returns Updated job status or error
   */
  async updateJob(
    jobId: string,
    orgId: string,
    input: UpdateJobInput
  ): Promise<JobServiceResult<JobStatusResponse>> {
    const job = await this.repository.findByIdAndOrg(jobId, orgId);

    if (!job) {
      return { success: false, error: { code: "NOT_FOUND", message: "Job not found" } };
    }

    if (job.status !== "draft") {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: "Only draft jobs can be updated" },
      };
    }

    const result = await this.repository.update(jobId, input, job);

    if (!result.updated) {
      // No changes made
      return { success: true, data: this.formatJobResponse(job) };
    }

    // Fetch updated job
    const updatedJob = await this.repository.findById(jobId);
    if (!updatedJob) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Job not found after update" },
      };
    }

    // Invalidate cache if content changed (questions were reset)
    if (result.contentChanged && job.org_id) {
      await this.orgRepository.incrementJobsListVersion(job.org_id);
    }

    return { success: true, data: this.formatJobResponse(updatedJob) };
  }

  // ===========================================================================
  // GENERATE QUESTIONS
  // ===========================================================================

  /**
   * Queue job for question generation.
   *
   * Rate limited per job to prevent abuse:
   * - Maximum 20 regenerations per job
   * - 10 minute cooldown between regenerations
   *
   * @param jobId - Job ID
   * @param orgId - Organization ID for authorization
   * @returns Success or error with rate limit info
   */
  async generateQuestions(
    jobId: string,
    orgId: string
  ): Promise<JobServiceResult<{ queued: true }>> {
    const job = await this.repository.findByIdAndOrg(jobId, orgId);

    if (!job) {
      return { success: false, error: { code: "NOT_FOUND", message: "Job not found" } };
    }

    if (job.status !== "draft") {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: "Only draft jobs can generate questions" },
      };
    }

    // Check regeneration limit
    if (job.regeneration_count >= MAX_REGENERATIONS) {
      return {
        success: false,
        error: {
          code: "REGENERATION_LIMIT_REACHED",
          message: `Maximum ${MAX_REGENERATIONS} regenerations per job reached`,
        },
      };
    }

    // Check cooldown
    if (job.last_regeneration_at) {
      const lastRegen = new Date(job.last_regeneration_at).getTime();
      const cooldownEnd = lastRegen + COOLDOWN_MS;
      const now = Date.now();

      if (now < cooldownEnd) {
        const retryAfter = Math.ceil((cooldownEnd - now) / 1000);
        return {
          success: false,
          error: {
            code: "REGENERATION_COOLDOWN",
            message: `Please wait before regenerating questions`,
            retryAfter,
          },
        };
      }
    }

    // Mark as pending (this increments regeneration_count and sets last_regeneration_at)
    await this.repository.markQuestionsPending(jobId);

    // Queue for processing
    await this.queue.send({
      jobId: jobId,
      createdAt: new Date().toISOString(),
    });

    // Invalidate cache
    if (job.org_id) {
      await this.orgRepository.incrementJobsListVersion(job.org_id);
    }

    console.log(
      `[Service] Job ${jobId} queued for question generation (attempt ${job.regeneration_count + 1})`
    );

    return { success: true, data: { queued: true } };
  }

  // ===========================================================================
  // PUBLISH JOB
  // ===========================================================================

  /**
   * Publish a draft job.
   *
   * Requirements:
   * - Job must be in draft status
   * - Questions must be completed
   *
   * Generates a unique public slug for the job.
   *
   * @param jobId - Job ID
   * @param orgId - Organization ID for authorization
   * @returns Published job status or error
   */
  async publishJob(jobId: string, orgId: string): Promise<JobServiceResult<JobStatusResponse>> {
    const job = await this.repository.findByIdAndOrg(jobId, orgId);

    if (!job) {
      return { success: false, error: { code: "NOT_FOUND", message: "Job not found" } };
    }

    if (job.status !== "draft") {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: "Only draft jobs can be published" },
      };
    }

    if (job.questions_status !== "completed") {
      return {
        success: false,
        error: {
          code: "QUESTIONS_NOT_READY",
          message: "Questions must be completed before publishing",
        },
      };
    }

    // Check capacity before publishing
    const capacityStatus = await this.orgRepository.getCapacityStatus(orgId);
    if (!capacityStatus.canActivate) {
      return {
        success: false,
        error: {
          code: "CAPACITY_EXCEEDED",
          message: `Your organization has reached its active role capacity (${capacityStatus.activeRoles}/${capacityStatus.capacity}). To publish a new role, close an existing one. Note: Pausing does not free up capacity.`,
          activeRoles: capacityStatus.activeRoles,
          capacity: capacityStatus.capacity,
        },
      };
    }

    // Generate unique slug
    const slug = await generateUniqueSlug(this.repository, job.company_name, job.title);

    // Publish the job
    await this.repository.publish(jobId, slug);

    // TODO: Record billing event (activated)

    // Invalidate cache
    if (job.org_id) {
      await this.orgRepository.incrementJobsListVersion(job.org_id);
    }

    // Fetch updated job
    const publishedJob = await this.repository.findById(jobId);
    if (!publishedJob) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Job not found after publish" },
      };
    }

    console.log(`[Service] Job ${jobId} published with slug: ${slug}`);

    return { success: true, data: this.formatJobResponse(publishedJob) };
  }

  // ===========================================================================
  // PAUSE JOB
  // ===========================================================================

  /**
   * Pause a published job.
   *
   * Stops billing and hides from public.
   *
   * @param jobId - Job ID
   * @param orgId - Organization ID for authorization
   */
  async pauseJob(jobId: string, orgId: string): Promise<JobServiceResult<JobStatusResponse>> {
    const job = await this.repository.findByIdAndOrg(jobId, orgId);

    if (!job) {
      return { success: false, error: { code: "NOT_FOUND", message: "Job not found" } };
    }

    if (job.status !== "published") {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: "Only published jobs can be paused" },
      };
    }

    await this.repository.pause(jobId);

    // TODO: Record billing event (paused)

    // Invalidate cache
    if (job.org_id) {
      await this.orgRepository.incrementJobsListVersion(job.org_id);
    }

    // Fetch updated job
    const pausedJob = await this.repository.findById(jobId);
    if (!pausedJob) {
      return { success: false, error: { code: "NOT_FOUND", message: "Job not found after pause" } };
    }

    console.log(`[Service] Job ${jobId} paused`);

    return { success: true, data: this.formatJobResponse(pausedJob) };
  }

  // ===========================================================================
  // RESUME JOB
  // ===========================================================================

  /**
   * Resume a paused job.
   *
   * Restarts billing and makes public again.
   *
   * Note: No capacity check needed because paused jobs already count against
   * capacity (they're "active" in terms of responsibility). Resume only
   * changes visibility, not the active role count.
   *
   * @param jobId - Job ID
   * @param orgId - Organization ID for authorization
   */
  async resumeJob(jobId: string, orgId: string): Promise<JobServiceResult<JobStatusResponse>> {
    const job = await this.repository.findByIdAndOrg(jobId, orgId);

    if (!job) {
      return { success: false, error: { code: "NOT_FOUND", message: "Job not found" } };
    }

    if (job.status !== "paused") {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: "Only paused jobs can be resumed" },
      };
    }

    await this.repository.resume(jobId);

    // TODO: Record billing event (resumed)

    // Invalidate cache
    if (job.org_id) {
      await this.orgRepository.incrementJobsListVersion(job.org_id);
    }

    // Fetch updated job
    const resumedJob = await this.repository.findById(jobId);
    if (!resumedJob) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Job not found after resume" },
      };
    }

    console.log(`[Service] Job ${jobId} resumed`);

    return { success: true, data: this.formatJobResponse(resumedJob) };
  }

  // ===========================================================================
  // CLOSE JOB
  // ===========================================================================

  /**
   * Close a job permanently.
   *
   * Can close published or paused jobs.
   * Stops billing permanently.
   *
   * @param jobId - Job ID
   * @param orgId - Organization ID for authorization
   */
  async closeJob(jobId: string, orgId: string): Promise<JobServiceResult<JobStatusResponse>> {
    const job = await this.repository.findByIdAndOrg(jobId, orgId);

    if (!job) {
      return { success: false, error: { code: "NOT_FOUND", message: "Job not found" } };
    }

    if (job.status !== "published" && job.status !== "paused") {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: "Only published or paused jobs can be closed" },
      };
    }

    await this.repository.close(jobId);

    // TODO: Record billing event (closed)

    // Invalidate cache
    if (job.org_id) {
      await this.orgRepository.incrementJobsListVersion(job.org_id);
    }

    // Fetch updated job
    const closedJob = await this.repository.findById(jobId);
    if (!closedJob) {
      return { success: false, error: { code: "NOT_FOUND", message: "Job not found after close" } };
    }

    console.log(`[Service] Job ${jobId} closed`);

    return { success: true, data: this.formatJobResponse(closedJob) };
  }

  // ===========================================================================
  // DELETE JOB
  // ===========================================================================

  /**
   * Delete a draft job.
   *
   * Only drafts can be deleted. Published/paused/closed jobs
   * must be closed first (and remain in closed state for records).
   *
   * @param jobId - Job ID
   * @param orgId - Organization ID for authorization
   */
  async deleteJob(jobId: string, orgId: string): Promise<JobServiceResult<{ deleted: true }>> {
    const job = await this.repository.findByIdAndOrg(jobId, orgId);

    if (!job) {
      return { success: false, error: { code: "NOT_FOUND", message: "Job not found" } };
    }

    if (job.status !== "draft") {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: "Only draft jobs can be deleted" },
      };
    }

    const deleted = await this.repository.delete(jobId);

    if (!deleted) {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: "Job could not be deleted" },
      };
    }

    // Invalidate cache
    if (job.org_id) {
      await this.orgRepository.incrementJobsListVersion(job.org_id);
    }

    console.log(`[Service] Job ${jobId} deleted`);

    return { success: true, data: { deleted: true } };
  }

  // ===========================================================================
  // GET JOB STATUS
  // ===========================================================================

  /**
   * Get job status and results (if completed).
   *
   * This is called by clients polling for job completion.
   * Response shape varies by status (discriminated union).
   *
   * @param jobId - Job ID
   * @param orgId - Organization ID for authorization (optional for internal use)
   */
  async getJobStatus(jobId: string, orgId?: string): Promise<JobStatusResponse | null> {
    const job = orgId
      ? await this.repository.findByIdAndOrg(jobId, orgId)
      : await this.repository.findById(jobId);

    if (!job) {
      return null;
    }

    return this.formatJobResponse(job);
  }

  // ===========================================================================
  // GET PUBLIC JOB
  // ===========================================================================

  /**
   * Get a job by public slug for candidates (no auth required).
   *
   * Only returns published jobs.
   * Returns a limited public view with just questions.
   *
   * @param slug - Public URL slug
   */
  async getPublicJob(slug: string): Promise<PublicJobResponse | null> {
    const job = await this.repository.findBySlug(slug);

    if (!job) {
      return null;
    }

    // Parse questions
    const questions = this.parseJsonArray(job.questions, RenderedQuestionSchema);

    return {
      title: job.title,
      companyName: job.company_name,
      department: job.department,
      location: job.location,
      description: job.description,
      questions: questions.map((q, index) => ({
        id: `q${index + 1}`,
        text: q.questionText,
        ...(q.minAnswerWords && { minWords: q.minAnswerWords }),
      })),
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Format a job row into the appropriate API response.
   * Uses discriminated union based on status.
   */
  private formatJobResponse(job: JobRow): JobStatusResponse {
    switch (job.status) {
      case "draft":
        return {
          id: job.id,
          status: "draft",
          questionsStatus: job.questions_status,
          title: job.title,
          description: job.description,
          companyName: job.company_name,
          department: job.department,
          location: job.location,
          // Questions (if generated)
          jobContext: job.job_context ? this.parseJson(job.job_context, JobContextSchema) : null,
          archetypes: job.archetypes
            ? this.parseJsonArray(job.archetypes, ResolvedArchetypeSchema)
            : null,
          questions: job.questions
            ? this.parseJsonArray(job.questions, RenderedQuestionSchema)
            : null,
          // Error (if failed)
          errorMessage: job.error_message,
          errorCode: job.error_code,
          // Regeneration info
          regenerationCount: job.regeneration_count,
          lastRegenerationAt: job.last_regeneration_at,
          // Timestamps
          createdAt: job.created_at,
          updatedAt: job.updated_at,
          processingStartedAt: job.processing_started_at,
          completedAt: job.completed_at,
        };

      case "published":
        return {
          id: job.id,
          status: "published",
          questionsStatus: "completed", // Always completed when published
          title: job.title,
          description: job.description,
          companyName: job.company_name,
          department: job.department,
          location: job.location,
          publicSlug: job.public_slug!,
          // Questions (always present)
          jobContext: this.parseJson(job.job_context!, JobContextSchema),
          archetypes: this.parseJsonArray(job.archetypes!, ResolvedArchetypeSchema),
          questions: this.parseJsonArray(job.questions!, RenderedQuestionSchema),
          processingDurationMs: job.processing_duration_ms!,
          // Timestamps
          createdAt: job.created_at,
          updatedAt: job.updated_at,
          publishedAt: job.published_at!,
          completedAt: job.completed_at!,
        };

      case "paused":
        return {
          id: job.id,
          status: "paused",
          questionsStatus: "completed",
          title: job.title,
          description: job.description,
          companyName: job.company_name,
          department: job.department,
          location: job.location,
          publicSlug: job.public_slug!,
          // Questions
          jobContext: this.parseJson(job.job_context!, JobContextSchema),
          archetypes: this.parseJsonArray(job.archetypes!, ResolvedArchetypeSchema),
          questions: this.parseJsonArray(job.questions!, RenderedQuestionSchema),
          processingDurationMs: job.processing_duration_ms!,
          // Timestamps
          createdAt: job.created_at,
          updatedAt: job.updated_at,
          publishedAt: job.published_at!,
          completedAt: job.completed_at!,
        };

      case "closed":
        return {
          id: job.id,
          status: "closed",
          questionsStatus: "completed",
          title: job.title,
          description: job.description,
          companyName: job.company_name,
          department: job.department,
          location: job.location,
          publicSlug: job.public_slug,
          // Questions
          jobContext: this.parseJson(job.job_context!, JobContextSchema),
          archetypes: this.parseJsonArray(job.archetypes!, ResolvedArchetypeSchema),
          questions: this.parseJsonArray(job.questions!, RenderedQuestionSchema),
          processingDurationMs: job.processing_duration_ms!,
          // Timestamps
          createdAt: job.created_at,
          updatedAt: job.updated_at,
          publishedAt: job.published_at,
          closedAt: job.closed_at!,
          completedAt: job.completed_at!,
        };
    }
  }

  /**
   * Parse JSON string with Zod validation.
   */
  private parseJson<T>(jsonString: string, schema: { parse: (data: unknown) => T }): T {
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
      return [];
    }
    const parsed: unknown = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) {
      throw new Error("Expected array but got " + typeof parsed);
    }
    return parsed.map((item: unknown) => schema.parse(item));
  }
}
