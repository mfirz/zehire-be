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

import { renderToHtml, type TiptapDoc } from "../../lib/tiptap";
import type { Env } from "../../types/bindings";
import { CustomQuestionsRepository } from "../custom-questions/repository";
import { InterviewStagesRepository, type StageInput } from "../interview-stages";
import { generateInitialConfig } from "../pipeline/advisor";
import { PipelineRecommendationSchema } from "../pipeline/types";
import type { PipelineConfig, PipelineUpdate } from "../pipeline/types";
import { BillingEventRepository, JobRepository, OrgRepository } from "./repository";
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

// Note: Regeneration is not allowed. Questions/pipeline can only be generated once.
// To get different results, edit the job content (which resets status to 'none').

// =============================================================================
// ERROR TYPES
// =============================================================================

export type JobServiceError =
  | { code: "NOT_FOUND"; message: string }
  | { code: "FORBIDDEN"; message: string }
  | { code: "INVALID_STATE"; message: string }
  | { code: "ALREADY_GENERATED"; message: string }
  | { code: "ALREADY_PROCESSING"; message: string }
  | { code: "QUESTIONS_NOT_READY"; message: string }
  | { code: "PIPELINE_NOT_READY"; message: string }
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
  private readonly billingEventRepository: BillingEventRepository;
  private readonly customQuestionsRepository: CustomQuestionsRepository;
  private readonly interviewStagesRepository: InterviewStagesRepository;

  constructor(
    private readonly repository: JobRepository,
    private readonly orgRepository: OrgRepository,
    private readonly queue: Env["JOB_QUEUE"],
    db: D1Database
  ) {
    this.billingEventRepository = new BillingEventRepository(db);
    this.customQuestionsRepository = new CustomQuestionsRepository(db);
    this.interviewStagesRepository = new InterviewStagesRepository(db);
  }

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
      questionsStatus: job.questionsStatus,
      createdAt: job.createdAt,
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
      return { success: true, data: await this.formatJobResponse(job) };
    }

    // Fetch updated job
    const updatedJob = await this.repository.findById(jobId);
    if (!updatedJob) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Job not found after update" },
      };
    }

    // Invalidate list cache when any field is updated
    if (result.updated && job.orgId) {
      await this.orgRepository.incrementJobsListVersion(job.orgId);
    }

    return { success: true, data: await this.formatJobResponse(updatedJob) };
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

    // Check if already generated - no regeneration allowed
    if (job.questionsStatus === "completed") {
      return {
        success: false,
        error: {
          code: "ALREADY_GENERATED",
          message:
            "Questions already generated. Edit the job title or description to generate new questions.",
        },
      };
    }

    // Check if already in progress
    if (job.questionsStatus === "pending" || job.questionsStatus === "processing") {
      return {
        success: false,
        error: {
          code: "ALREADY_PROCESSING",
          message: "Question generation is already in progress",
        },
      };
    }

    // Mark as pending
    await this.repository.markQuestionsPending(jobId);

    // Queue for processing
    await this.queue.send({
      jobId: jobId,
      createdAt: new Date().toISOString(),
    });

    // Invalidate cache
    if (job.orgId) {
      await this.orgRepository.incrementJobsListVersion(job.orgId);
    }

    console.log(`[Service] Job ${jobId} queued for question generation`);

    return { success: true, data: { queued: true } };
  }

  // ===========================================================================
  // GENERATE PIPELINE
  // ===========================================================================

  /**
   * Queue job for pipeline generation.
   *
   * Rate limited per job to prevent abuse (same limits as questions):
   * - Maximum 20 regenerations per job
   * - 1 minute cooldown between regenerations
   *
   * @param jobId - Job ID
   * @param orgId - Organization ID for authorization
   * @returns Success or error with rate limit info
   */
  async generatePipeline(
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
        error: { code: "INVALID_STATE", message: "Only draft jobs can generate pipeline" },
      };
    }

    // Check if already generated - no regeneration allowed
    if (job.pipelineStatus === "completed") {
      return {
        success: false,
        error: {
          code: "ALREADY_GENERATED",
          message:
            "Pipeline already generated. Edit the job title or description to generate a new pipeline.",
        },
      };
    }

    // Check if already in progress
    if (job.pipelineStatus === "pending" || job.pipelineStatus === "processing") {
      return {
        success: false,
        error: {
          code: "ALREADY_PROCESSING",
          message: "Pipeline generation is already in progress",
        },
      };
    }

    // Mark as pending
    await this.repository.markPipelinePending(jobId);

    // Queue for processing with pipeline type
    await this.queue.send({
      jobId: jobId,
      createdAt: new Date().toISOString(),
      type: "pipeline",
    });

    // Invalidate cache
    if (job.orgId) {
      await this.orgRepository.incrementJobsListVersion(job.orgId);
    }

    console.log(`[Service] Job ${jobId} queued for pipeline generation`);

    return { success: true, data: { queued: true } };
  }

  // ===========================================================================
  // UPDATE PIPELINE CONFIG
  // ===========================================================================

  /**
   * Update pipeline configuration (recruiter edits).
   *
   * Access control:
   * - Draft/Published/Paused jobs: All changes allowed
   * - Closed jobs: No changes allowed
   *
   * Updates both the JSON column (for backwards compatibility) and
   * the interview_stages table (source of truth).
   *
   * @param jobId - Job ID
   * @param orgId - Organization ID for authorization
   * @param update - Pipeline update (partial)
   * @returns Updated job status or error
   */
  async updatePipelineConfig(
    jobId: string,
    orgId: string,
    update: PipelineUpdate
  ): Promise<JobServiceResult<JobStatusResponse>> {
    const job = await this.repository.findByIdAndOrg(jobId, orgId);

    if (!job) {
      return { success: false, error: { code: "NOT_FOUND", message: "Job not found" } };
    }

    // Closed jobs cannot be edited
    if (job.status === "closed") {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: "Closed jobs cannot be edited" },
      };
    }

    if (job.pipelineStatus !== "completed") {
      return {
        success: false,
        error: {
          code: "PIPELINE_NOT_READY",
          message: "Pipeline must be generated before editing",
        },
      };
    }

    const isDraft = job.status === "draft";

    // ==========================================================================
    // DRAFT: Structure only (assessment, stages) - NO interviewerIds, NO mode
    // ==========================================================================
    if (isDraft) {
      // Block interviewerIds and mode in draft
      if (update.interviewRounds) {
        const hasInterviewerIds = update.interviewRounds.some(
          (r) => r.interviewerIds && r.interviewerIds.length > 0
        );
        const hasMode = update.interviewRounds.some((r) => r.mode !== undefined);

        if (hasInterviewerIds) {
          return {
            success: false,
            error: {
              code: "INVALID_STATE",
              message:
                "Cannot assign interviewers in draft state. Publish the job first, then assign interviewers.",
            },
          };
        }

        if (hasMode) {
          return {
            success: false,
            error: {
              code: "INVALID_STATE",
              message:
                "Cannot set interview mode in draft state. Publish the job first, then configure mode.",
            },
          };
        }
      }

      // Update assessment config
      if (update.assessment) {
        const updatedConfig: PipelineConfig = {
          assessment: update.assessment,
          interviewRounds: [], // Not used for assessment update
        };
        await this.repository.updateAssessmentConfig(jobId, updatedConfig);
      }

      // Update stage structure (name, duration, focus) - no interviewers, no mode
      if (update.interviewRounds) {
        const stageInputs: StageInput[] = update.interviewRounds.map((round) => ({
          id: round.id,
          name: round.name,
          focus: round.focus,
          duration: round.duration,
          // interviewerIds and mode intentionally omitted for draft
        }));

        const stageResult = await this.interviewStagesRepository.updateStages(jobId, stageInputs);

        if (!stageResult.success) {
          return {
            success: false,
            error: {
              code: stageResult.error.code as "INVALID_STATE",
              message: stageResult.error.message,
            },
          };
        }
      }
    }

    // ==========================================================================
    // PUBLISHED/PAUSED: Operations only (interviewerIds, mode) - NO structure
    // ==========================================================================
    if (!isDraft) {
      // Block assessment changes
      if (update.assessment) {
        return {
          success: false,
          error: {
            code: "INVALID_STATE",
            message: "Cannot modify assessment after publishing. Only interviewer assignments can be changed.",
          },
        };
      }

      // Block structural changes to stages
      if (update.interviewRounds) {
        const currentStages = await this.interviewStagesRepository.getStagesForJob(jobId);
        const currentStageIds = new Set(currentStages.map((s) => s.id));

        // Check for new stages or removed stages
        const updateStageIds = new Set(update.interviewRounds.map((r) => r.id));
        const hasNewStages = update.interviewRounds.some((r) => !r.id || !currentStageIds.has(r.id));
        const hasRemovedStages = currentStages.some((s) => !updateStageIds.has(s.id));

        if (hasNewStages || hasRemovedStages) {
          return {
            success: false,
            error: {
              code: "INVALID_STATE",
              message: "Cannot add or remove stages after publishing. Only interviewer assignments can be changed.",
            },
          };
        }

        // Check for structural changes (name, duration, focus)
        for (const round of update.interviewRounds) {
          const currentStage = currentStages.find((s) => s.id === round.id);
          if (currentStage) {
            if (
              round.name !== currentStage.name ||
              round.duration !== currentStage.durationMinutes ||
              round.focus !== currentStage.focus
            ) {
              return {
                success: false,
                error: {
                  code: "INVALID_STATE",
                  message: "Cannot modify stage structure after publishing. Only interviewer assignments and mode can be changed.",
                },
              };
            }
          }
        }

        // Only update operational fields (interviewerIds, mode)
        const operationalUpdates: Array<{
          id: string;
          interviewerIds?: string[];
          mode?: "any_one" | "all_required";
        }> = update.interviewRounds
          .filter((r) => r.id && (r.interviewerIds !== undefined || r.mode !== undefined))
          .map((r) => {
            const update: { id: string; interviewerIds?: string[]; mode?: "any_one" | "all_required" } = {
              id: r.id!,
            };
            if (r.interviewerIds !== undefined) {
              update.interviewerIds = r.interviewerIds;
            }
            if (r.mode !== undefined) {
              update.mode = r.mode;
            }
            return update;
          });

        if (operationalUpdates.length > 0) {
          await this.interviewStagesRepository.updateOperationalFields(jobId, operationalUpdates);
        }
      }
    }

    // Invalidate cache
    if (job.orgId) {
      await this.orgRepository.incrementJobsListVersion(job.orgId);
    }

    // Fetch updated job
    const updatedJob = await this.repository.findById(jobId);
    if (!updatedJob) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Job not found after update" },
      };
    }

    console.log(`[Service] Job ${jobId} pipeline config updated`);

    return { success: true, data: await this.formatJobResponse(updatedJob) };
  }

  // ===========================================================================
  // RESET PIPELINE CONFIG
  // ===========================================================================

  /**
   * Reset pipeline configuration to AI recommendation.
   *
   * This regenerates the initial config from the existing recommendation
   * without calling the LLM again. Useful when recruiter wants to undo
   * their customizations.
   *
   * @param jobId - Job ID
   * @param orgId - Organization ID for authorization
   * @returns Reset job status or error
   */
  async resetPipelineConfig(
    jobId: string,
    orgId: string
  ): Promise<JobServiceResult<JobStatusResponse>> {
    const job = await this.repository.findByIdAndOrg(jobId, orgId);

    if (!job) {
      return { success: false, error: { code: "NOT_FOUND", message: "Job not found" } };
    }

    if (job.status !== "draft") {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: "Only draft jobs can reset pipeline" },
      };
    }

    if (job.pipelineStatus !== "completed" || !job.pipelineRecommendation) {
      return {
        success: false,
        error: {
          code: "PIPELINE_NOT_READY",
          message: "Pipeline must be generated before resetting",
        },
      };
    }

    // Parse existing recommendation
    const recommendation = PipelineRecommendationSchema.parse(
      JSON.parse(job.pipelineRecommendation)
    );

    // Regenerate initial config from recommendation (no LLM call)
    const resetConfig = generateInitialConfig(recommendation);

    // Save reset assessment config to dedicated column
    await this.repository.updateAssessmentConfig(jobId, resetConfig);

    // Also reset interview_stages table
    // Delete existing stages and create fresh ones from recommendation
    await this.interviewStagesRepository.deleteAllStagesForJob(jobId);
    await this.interviewStagesRepository.createStagesFromRecommendation(
      jobId,
      recommendation.interviewPanel.rounds.map((round) => ({
        name: round.name,
        duration: round.duration,
        focus: round.focus,
      }))
    );

    // Invalidate cache
    if (job.orgId) {
      await this.orgRepository.incrementJobsListVersion(job.orgId);
    }

    // Fetch updated job
    const updatedJob = await this.repository.findById(jobId);
    if (!updatedJob) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Job not found after reset" },
      };
    }

    console.log(`[Service] Job ${jobId} pipeline config reset to recommendation`);

    return { success: true, data: await this.formatJobResponse(updatedJob) };
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

    if (job.questionsStatus !== "completed") {
      return {
        success: false,
        error: {
          code: "QUESTIONS_NOT_READY",
          message: "Questions must be completed before publishing",
        },
      };
    }

    if (job.pipelineStatus !== "completed") {
      return {
        success: false,
        error: {
          code: "PIPELINE_NOT_READY",
          message: "Pipeline must be completed before publishing",
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
    const slug = await generateUniqueSlug(this.repository, job.companyName, job.title);

    // Publish the job
    await this.repository.publish(jobId, slug);

    // Record billing event: job is now active (billing starts)
    await this.billingEventRepository.record({
      orgId,
      jobId,
      eventType: "activated",
      metadata: { previousStatus: "draft", newStatus: "published", slug },
    });

    // Invalidate cache
    if (job.orgId) {
      await this.orgRepository.incrementJobsListVersion(job.orgId);
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

    return { success: true, data: await this.formatJobResponse(publishedJob) };
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

    // Record billing event: paused (for audit, still active for billing)
    await this.billingEventRepository.record({
      orgId,
      jobId,
      eventType: "paused",
      metadata: { previousStatus: "published", newStatus: "paused" },
    });

    // Invalidate jobs list cache
    if (job.orgId) {
      await this.orgRepository.incrementJobsListVersion(job.orgId);
    }

    // Fetch updated job
    const pausedJob = await this.repository.findById(jobId);
    if (!pausedJob) {
      return { success: false, error: { code: "NOT_FOUND", message: "Job not found after pause" } };
    }

    console.log(`[Service] Job ${jobId} paused`);

    return { success: true, data: await this.formatJobResponse(pausedJob) };
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

    // Record billing event: resumed (for audit, still active for billing)
    await this.billingEventRepository.record({
      orgId,
      jobId,
      eventType: "resumed",
      metadata: { previousStatus: "paused", newStatus: "published" },
    });

    // Invalidate jobs list cache
    if (job.orgId) {
      await this.orgRepository.incrementJobsListVersion(job.orgId);
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

    return { success: true, data: await this.formatJobResponse(resumedJob) };
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

    // Record billing event: deactivated (billing ends)
    await this.billingEventRepository.record({
      orgId,
      jobId,
      eventType: "deactivated",
      metadata: { previousStatus: job.status, newStatus: "closed" },
    });

    // Invalidate jobs list cache
    if (job.orgId) {
      await this.orgRepository.incrementJobsListVersion(job.orgId);
    }

    // Fetch updated job
    const closedJob = await this.repository.findById(jobId);
    if (!closedJob) {
      return { success: false, error: { code: "NOT_FOUND", message: "Job not found after close" } };
    }

    console.log(`[Service] Job ${jobId} closed`);

    return { success: true, data: await this.formatJobResponse(closedJob) };
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
    if (job.orgId) {
      await this.orgRepository.incrementJobsListVersion(job.orgId);
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

    return await this.formatJobResponse(job);
  }

  // ===========================================================================
  // GET PUBLIC JOB
  // ===========================================================================

  /**
   * Get a job by public slug for candidates (no auth required).
   *
   * Only returns published jobs.
   * Returns a limited public view with questions, custom questions, and CV requirement.
   *
   * @param slug - Public URL slug
   */
  async getPublicJob(slug: string): Promise<PublicJobResponse | null> {
    const job = await this.repository.findBySlug(slug);

    if (!job) {
      return null;
    }

    // Parse archetype questions
    const questions = this.parseJsonArray(job.questions, RenderedQuestionSchema);

    // Fetch custom questions for this job
    const customQuestionsRaw = await this.customQuestionsRepository.listByJobId(job.id);
    const customQuestions = customQuestionsRaw.map((q) => ({
      id: q.id,
      category: q.category,
      answerType: q.answerType,
      questionText: q.questionText,
      required: q.required,
      orderIndex: q.orderIndex,
      options: q.options ? JSON.parse(q.options) : null,
      minValue: q.minValue,
      maxValue: q.maxValue,
    }));

    // Get CV requirement from application config
    const applicationConfig = job.applicationConfig;
    const cvRequired = applicationConfig?.requireCv ?? false;

    // Render description to HTML for SSR
    const descriptionDoc = JSON.parse(job.description) as TiptapDoc;
    const descriptionHtml = renderToHtml(descriptionDoc);

    return {
      title: job.title,
      companyName: job.companyName,
      department: job.department,
      location: job.location,
      // Job type fields
      workType: job.workType,
      employmentType: job.employmentType,
      // Salary fields
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      // Content - pre-rendered HTML for SSR
      descriptionHtml,
      // Archetype questions
      questions: questions.map((q) => ({
        archetypeId: q.archetypeId,
        text: q.questionText,
        ...(q.minAnswerWords && { minWords: q.minAnswerWords }),
      })),
      // Custom questions (Phase 8)
      customQuestions,
      // CV requirement (Phase 8)
      cvRequired,
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Format a job row into the appropriate API response.
   * Uses discriminated union based on status.
   * Builds pipeline from interview_stages table.
   */
  private async formatJobResponse(job: JobRow): Promise<JobStatusResponse> {
    // Build pipeline from interview_stages table
    const stages = await this.interviewStagesRepository.getStagesForJob(job.id);

    // Build pipeline config from interview_stages table (source of truth)
    // Assessment config comes from dedicated assessmentConfig column
    const pipelineFromStages: PipelineConfig | null =
      stages.length > 0
        ? {
            assessment: job.assessmentConfig
              ? JSON.parse(job.assessmentConfig)
              : { enabled: false, providerId: null, config: null },
            interviewRounds: stages.map((stage) => ({
              id: stage.id,
              name: stage.name,
              duration: stage.durationMinutes,
              interviewerIds: stage.interviewers.map((i) => i.id),
              focus: stage.focus,
              mode: stage.mode,
            })),
          }
        : null; // No stages = pipeline not generated yet
    switch (job.status) {
      case "draft":
        return {
          id: job.id,
          status: "draft",
          questionsStatus: job.questionsStatus,
          pipelineStatus: job.pipelineStatus ?? "none",
          title: job.title,
          // Parse description JSON for Tiptap editor
          description: JSON.parse(job.description) as TiptapDoc,
          companyName: job.companyName,
          department: job.department,
          location: job.location,
          // Job type fields
          workType: job.workType,
          employmentType: job.employmentType,
          // Salary fields
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          salaryCurrency: job.salaryCurrency,
          // Questions (if generated)
          jobContext: job.jobContext ? this.parseJson(job.jobContext, JobContextSchema) : null,
          archetypes: job.archetypes
            ? this.parseJsonArray(job.archetypes, ResolvedArchetypeSchema)
            : null,
          questions: job.questions
            ? this.parseJsonArray(job.questions, RenderedQuestionSchema)
            : null,
          // Pipeline (built from interview_stages table)
          pipelineRecommendation: job.pipelineRecommendation
            ? this.parseJson(job.pipelineRecommendation, PipelineRecommendationSchema)
            : null,
          pipeline: pipelineFromStages,
          // Error (if failed)
          errorMessage: job.errorMessage,
          errorCode: job.errorCode,
          // Pipeline error (if failed)
          pipelineError: job.pipelineError,
          pipelineErrorCode: job.pipelineErrorCode,
          // Regeneration info (questions)
          regenerationCount: job.regenerationCount,
          lastRegenerationAt: job.lastRegenerationAt,
          // Regeneration info (pipeline)
          pipelineRegenerationCount: job.pipelineRegenerationCount ?? 0,
          pipelineLastRegenerationAt: job.pipelineLastRegenerationAt,
          // Timestamps
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          processingStartedAt: job.processingStartedAt,
          completedAt: job.completedAt,
          pipelineGeneratedAt: job.pipelineGeneratedAt,
        };

      case "published":
        return {
          id: job.id,
          status: "published",
          questionsStatus: "completed", // Always completed when published
          pipelineStatus: "completed", // Always completed when published
          title: job.title,
          // Render description to HTML (read-only)
          descriptionHtml: renderToHtml(JSON.parse(job.description) as TiptapDoc),
          companyName: job.companyName,
          department: job.department,
          location: job.location,
          publicSlug: job.publicSlug!,
          // Job type fields
          workType: job.workType,
          employmentType: job.employmentType,
          // Salary fields
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          salaryCurrency: job.salaryCurrency,
          // Questions (always present)
          jobContext: this.parseJson(job.jobContext!, JobContextSchema),
          archetypes: this.parseJsonArray(job.archetypes!, ResolvedArchetypeSchema),
          questions: this.parseJsonArray(job.questions!, RenderedQuestionSchema),
          processingDurationMs: job.processingDurationMs!,
          // Pipeline (built from interview_stages table)
          pipelineRecommendation: this.parseJson(
            job.pipelineRecommendation!,
            PipelineRecommendationSchema
          ),
          pipeline: pipelineFromStages!,
          // Timestamps
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          publishedAt: job.publishedAt!,
          completedAt: job.completedAt!,
          pipelineGeneratedAt: job.pipelineGeneratedAt!,
        };

      case "paused":
        return {
          id: job.id,
          status: "paused",
          questionsStatus: "completed",
          pipelineStatus: "completed",
          title: job.title,
          // Render description to HTML (read-only)
          descriptionHtml: renderToHtml(JSON.parse(job.description) as TiptapDoc),
          companyName: job.companyName,
          department: job.department,
          location: job.location,
          publicSlug: job.publicSlug!,
          // Job type fields
          workType: job.workType,
          employmentType: job.employmentType,
          // Salary fields
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          salaryCurrency: job.salaryCurrency,
          // Questions
          jobContext: this.parseJson(job.jobContext!, JobContextSchema),
          archetypes: this.parseJsonArray(job.archetypes!, ResolvedArchetypeSchema),
          questions: this.parseJsonArray(job.questions!, RenderedQuestionSchema),
          processingDurationMs: job.processingDurationMs!,
          // Pipeline (built from interview_stages table)
          pipelineRecommendation: this.parseJson(
            job.pipelineRecommendation!,
            PipelineRecommendationSchema
          ),
          pipeline: pipelineFromStages!,
          // Timestamps
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          publishedAt: job.publishedAt!,
          completedAt: job.completedAt!,
          pipelineGeneratedAt: job.pipelineGeneratedAt!,
        };

      case "closed":
        return {
          id: job.id,
          status: "closed",
          questionsStatus: "completed",
          pipelineStatus: "completed",
          title: job.title,
          // Render description to HTML (read-only)
          descriptionHtml: renderToHtml(JSON.parse(job.description) as TiptapDoc),
          companyName: job.companyName,
          department: job.department,
          location: job.location,
          publicSlug: job.publicSlug,
          // Job type fields
          workType: job.workType,
          employmentType: job.employmentType,
          // Salary fields
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          salaryCurrency: job.salaryCurrency,
          // Questions
          jobContext: this.parseJson(job.jobContext!, JobContextSchema),
          archetypes: this.parseJsonArray(job.archetypes!, ResolvedArchetypeSchema),
          questions: this.parseJsonArray(job.questions!, RenderedQuestionSchema),
          processingDurationMs: job.processingDurationMs!,
          // Pipeline (built from interview_stages table)
          pipelineRecommendation: this.parseJson(
            job.pipelineRecommendation!,
            PipelineRecommendationSchema
          ),
          pipeline: pipelineFromStages!,
          // Timestamps
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          publishedAt: job.publishedAt,
          closedAt: job.closedAt!,
          completedAt: job.completedAt!,
          pipelineGeneratedAt: job.pipelineGeneratedAt!,
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
