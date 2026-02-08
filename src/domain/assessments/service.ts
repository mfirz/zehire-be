/**
 * Assessment Service
 * ==================
 * Business logic for the assessment system.
 *
 * Orchestrates:
 * - Assessment library CRUD (recruiter manages templates)
 * - Job assessment linking (assign template to job)
 * - Candidate assessment lifecycle (invite -> schedule -> submit -> evaluate)
 * - Candidate portal actions (token-based scheduling, file upload, submission)
 * - System integration (snapshots, expiry processing)
 *
 * Lifecycle: invited -> scheduled -> in_progress -> submitted -> evaluated
 * Expiry paths: invited -> schedule_expired, in_progress -> expired
 * Cancellation: any active status -> cancelled
 */

import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

import type {
  AssessmentDefinition,
  AssessmentFile,
  AssessmentPart,
  CandidateAssessment,
  JobAssessment,
} from "../../db/schema/assessments";
import { AssessmentRepository } from "./repository";
import type {
  AssessmentServiceResult,
  CreateAssessmentInput,
  UpdateAssessmentInput,
  ScheduleInput,
  EvaluateInput,
  SchedulingConfig,
} from "./types";
import {
  SchedulingConfigSchema,
  ASSESSMENT_GRACE_PERIOD_MINUTES,
  MAX_FILE_SIZE_BYTES,
  isAllowedFileType,
  isAllowedMimeType,
  isWithinGracePeriod,
} from "./types";

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class AssessmentService {
  private repo: AssessmentRepository;

  constructor(d1: D1Database) {
    this.repo = new AssessmentRepository(d1);
  }

  // ===========================================================================
  // ASSESSMENT LIBRARY (Recruiter CRUD)
  // ===========================================================================

  /**
   * Create a new assessment definition with parts.
   *
   * Parses scheduling config with defaults and delegates to repository.
   */
  async createAssessment(
    orgId: string,
    userId: string,
    input: CreateAssessmentInput
  ): Promise<AssessmentServiceResult<{ definition: AssessmentDefinition; parts: AssessmentPart[] }>> {
    const schedulingConfig = SchedulingConfigSchema.parse(input.scheduling ?? {});

    const result = await this.repo.createDefinition(
      orgId,
      userId,
      input.name,
      schedulingConfig,
      input.parts
    );

    const { parts, ...definition } = result;
    return { success: true, data: { definition, parts } };
  }

  /**
   * Get a single assessment definition by ID.
   *
   * Returns the definition with its parts, parsing schedulingConfig JSON.
   */
  async getAssessment(
    id: string,
    orgId: string
  ): Promise<AssessmentServiceResult<{ definition: AssessmentDefinition; parts: AssessmentPart[] }>> {
    const result = await this.repo.getDefinition(id, orgId);

    if (!result) {
      return {
        success: false,
        error: { code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" },
      };
    }

    // Parse schedulingConfig JSON into object before returning
    const { parts, ...rest } = result;
    const definition = {
      ...rest,
      schedulingConfig: JSON.stringify(
        this.parseSchedulingConfig(rest.schedulingConfig)
      ),
    };

    return { success: true, data: { definition, parts } };
  }

  /**
   * List assessment definitions for an organization.
   *
   * Optionally filtered by status. Parses schedulingConfig JSON for each.
   */
  async listAssessments(
    orgId: string,
    status?: "active" | "archived"
  ): Promise<AssessmentServiceResult<AssessmentDefinition[]>> {
    const definitions = await this.repo.listDefinitions(orgId, status ? { status } : undefined);

    // Parse schedulingConfig JSON for each definition
    const parsed = definitions.map((def) => ({
      ...def,
      schedulingConfig: JSON.stringify(
        this.parseSchedulingConfig(def.schedulingConfig)
      ),
    }));

    return { success: true, data: parsed };
  }

  /**
   * List assessment definitions with part counts (for list view).
   */
  async listAssessmentsWithCounts(
    orgId: string,
    status?: "active" | "archived",
    search?: string
  ): Promise<AssessmentServiceResult<Array<AssessmentDefinition & { partsCount: number }>>> {
    const options: { status?: "active" | "archived"; search?: string } = {};
    if (status) options.status = status;
    if (search) options.search = search;

    const definitions = await this.repo.listDefinitionsWithPartCounts(
      orgId,
      Object.keys(options).length > 0 ? options : undefined
    );

    const parsed = definitions.map((def) => ({
      ...def,
      schedulingConfig: JSON.stringify(
        this.parseSchedulingConfig(def.schedulingConfig)
      ),
    }));

    return { success: true, data: parsed };
  }

  /**
   * Update an existing assessment definition.
   *
   * If input.status === 'archived', archives the definition.
   * Otherwise updates name, parts, and/or scheduling config.
   */
  async updateAssessment(
    id: string,
    orgId: string,
    input: UpdateAssessmentInput
  ): Promise<AssessmentServiceResult<{ definition: AssessmentDefinition; parts: AssessmentPart[] }>> {
    if (input.status === "archived") {
      // Check current status before archiving
      const current = await this.repo.getDefinition(id, orgId);
      if (!current) {
        return {
          success: false,
          error: { code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" },
        };
      }
      if (current.status === "archived") {
        return {
          success: false,
          error: { code: "ALREADY_ARCHIVED", message: "Assessment is already archived" },
        };
      }

      await this.repo.archiveDefinition(id, orgId);

      // Re-fetch after archiving
      const refetched = await this.repo.getDefinition(id, orgId);

      if (!refetched) {
        return {
          success: false,
          error: { code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" },
        };
      }

      const { parts: archivedParts, ...archivedRest } = refetched;
      return { success: true, data: { definition: archivedRest, parts: archivedParts } };
    }

    // Content update — build payload object with only defined keys to satisfy exactOptionalPropertyTypes
    const result = await this.repo.updateDefinition(id, orgId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.parts !== undefined ? { parts: input.parts.map(p => ({
        ...(p.id !== undefined ? { id: p.id } : {}),
        name: p.name,
        instructions: p.instructions,
        evidenceDescription: p.evidenceDescription,
        required: p.required,
      })) } : {}),
      ...(input.scheduling !== undefined ? { schedulingConfig: {
        ...(input.scheduling.scheduleWithinDays !== undefined ? { scheduleWithinDays: input.scheduling.scheduleWithinDays } : {}),
        ...(input.scheduling.completeWithinHours !== undefined ? { completeWithinHours: input.scheduling.completeWithinHours } : {}),
        ...(input.scheduling.maxReschedules !== undefined ? { maxReschedules: input.scheduling.maxReschedules } : {}),
      } } : {}),
    });

    if (!result) {
      return {
        success: false,
        error: { code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" },
      };
    }

    // Parse schedulingConfig JSON before returning
    const { parts: updatedParts, ...updatedRest } = result;
    const definition = {
      ...updatedRest,
      schedulingConfig: JSON.stringify(
        this.parseSchedulingConfig(updatedRest.schedulingConfig)
      ),
    };

    return { success: true, data: { definition, parts: updatedParts } };
  }

  /**
   * Remove assessment from a job.
   *
   * This does not delete the assessment definition itself.
   */
  async deleteAssessment(
    jobId: string
  ): Promise<AssessmentServiceResult<void>> {
    // Verify job has an assessment and belongs to org
    const jobAssessment = await this.repo.getJobAssessment(jobId);

    if (!jobAssessment) {
      return {
        success: false,
        error: { code: "NO_ASSESSMENT", message: "Job does not have an assessment" },
      };
    }

    await this.repo.removeJobAssessment(jobId);

    return { success: true, data: undefined };
  }

  // ===========================================================================
  // JOB ASSESSMENT
  // ===========================================================================

  /**
   * Assign an assessment definition to a job.
   *
   * Validates the assessment exists, belongs to the org, and is active.
   */
  async setJobAssessment(
    jobId: string,
    assessmentId: string,
    orgId: string
  ): Promise<AssessmentServiceResult<JobAssessment>> {
    // Verify assessment exists and belongs to org
    const assessment = await this.repo.getDefinition(assessmentId, orgId);

    if (!assessment) {
      return {
        success: false,
        error: { code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" },
      };
    }

    // Verify assessment is active
    if (assessment.status !== "active") {
      return {
        success: false,
        error: { code: "ASSESSMENT_ARCHIVED", message: "Assessment is archived and cannot be assigned to a job" },
      };
    }

    const jobAssessment = await this.repo.setJobAssessment(jobId, assessmentId);

    return { success: true, data: jobAssessment };
  }

  /**
   * Get the assessment linked to a job.
   *
   * Returns null data if no assessment is linked.
   * Parses snapshot JSON if present, otherwise returns live definition data.
   */
  async getJobAssessment(
    jobId: string
  ): Promise<
    AssessmentServiceResult<{
      definition: AssessmentDefinition;
      parts: AssessmentPart[];
      scheduling: SchedulingConfig;
      isSnapshot: boolean;
      snapshotAt: string | null;
    } | null>
  > {
    const result = await this.repo.getJobAssessmentWithDefinition(jobId);

    if (!result) {
      return { success: true, data: null };
    }

    // If snapshot exists, parse it for immutable published data
    if (result.jobAssessment.snapshot) {
      const snapshot = JSON.parse(result.jobAssessment.snapshot) as {
        definition: AssessmentDefinition;
        parts: AssessmentPart[];
      };
      const scheduling = this.parseSchedulingConfig(snapshot.definition.schedulingConfig);

      return {
        success: true,
        data: {
          definition: snapshot.definition,
          parts: snapshot.parts,
          scheduling,
          isSnapshot: true,
          snapshotAt: result.jobAssessment.snapshotAt,
        },
      };
    }

    // No snapshot, return live definition data
    if (!result.definition) {
      return { success: true, data: null };
    }

    const scheduling = this.parseSchedulingConfig(result.definition.schedulingConfig);

    return {
      success: true,
      data: {
        definition: result.definition,
        parts: result.parts,
        scheduling,
        isSnapshot: false,
        snapshotAt: null,
      },
    };
  }

  /**
   * Remove assessment from a job.
   */
  async removeJobAssessment(
    jobId: string
  ): Promise<AssessmentServiceResult<void>> {
    await this.repo.removeJobAssessment(jobId);

    return { success: true, data: undefined };
  }

  // ===========================================================================
  // CANDIDATE ASSESSMENT (Recruiter Actions)
  // ===========================================================================

  /**
   * Invite a candidate to take an assessment.
   *
   * Creates a candidate assessment record with a secure token and scheduling deadlines.
   */
  async inviteCandidate(
    applicationId: string,
    jobId: string
  ): Promise<AssessmentServiceResult<CandidateAssessment>> {
    // Check if job has an assessment
    const jobAssessmentResult = await this.repo.getJobAssessmentWithDefinition(jobId);

    if (!jobAssessmentResult) {
      return {
        success: false,
        error: { code: "NO_ASSESSMENT", message: "Job does not have an assessment configured" },
      };
    }

    // Check if candidate already has an assessment for this application
    const existing = await this.repo.findByApplicationId(applicationId);

    if (existing) {
      const TERMINAL_STATUSES = ["cancelled", "expired", "schedule_expired"];
      if (!TERMINAL_STATUSES.includes(existing.status)) {
        return {
          success: false,
          error: { code: "ALREADY_INVITED", message: "Candidate has already been invited for this assessment" },
        };
      }
      // Delete old terminal assessment (cascade handles file DB records)
      await this.repo.deleteCandidateAssessment(existing.id);
    }

    // Parse the scheduling config (from snapshot if published, from definition if draft)
    let schedulingConfig: SchedulingConfig;
    if (jobAssessmentResult.jobAssessment.snapshot) {
      const snapshot = JSON.parse(jobAssessmentResult.jobAssessment.snapshot) as {
        definition: AssessmentDefinition;
      };
      schedulingConfig = this.parseSchedulingConfig(snapshot.definition.schedulingConfig);
    } else if (jobAssessmentResult.definition) {
      schedulingConfig = this.parseSchedulingConfig(
        jobAssessmentResult.definition.schedulingConfig
      );
    } else {
      schedulingConfig = SchedulingConfigSchema.parse({});
    }

    const candidateAssessment = await this.repo.createCandidateAssessment(
      applicationId,
      jobId,
      schedulingConfig
    );

    return { success: true, data: candidateAssessment };
  }

  /**
   * Get a candidate's assessment with files.
   *
   * Applies lazy status transitions to ensure accuracy.
   */
  async getCandidateAssessment(
    applicationId: string
  ): Promise<AssessmentServiceResult<{ assessment: CandidateAssessment; files: AssessmentFile[] }>> {
    const assessment = await this.repo.findByApplicationId(applicationId);

    if (!assessment) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Candidate assessment not found" },
      };
    }

    // Apply lazy status transition
    const updated = await this.applyLazyStatusTransition(assessment);

    // Get files for the assessment
    const files = await this.repo.getFilesForAssessment(updated.id);

    return { success: true, data: { assessment: updated, files } };
  }

  /**
   * Evaluate a submitted assessment.
   *
   * Allows initial evaluation and re-evaluation. Records evaluator and timestamps.
   */
  async evaluateAssessment(
    applicationId: string,
    evaluatorId: string,
    input: EvaluateInput
  ): Promise<AssessmentServiceResult<CandidateAssessment>> {
    const assessment = await this.repo.findByApplicationId(applicationId);

    if (!assessment) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Candidate assessment not found" },
      };
    }

    // Must be submitted or already evaluated (for re-evaluation)
    if (assessment.status !== "submitted" && assessment.status !== "evaluated") {
      return {
        success: false,
        error: { code: "NOT_SUBMITTED", message: "Assessment has not been submitted yet" },
      };
    }

    const now = new Date().toISOString();
    const isReEvaluation = assessment.status === "evaluated";

    await this.repo.updateCandidateAssessmentStatus(assessment.id, "evaluated", {
      evaluationSignal: input.signal,
      evaluationNotes: input.notes ?? null,
      evaluatedBy: isReEvaluation ? assessment.evaluatedBy : evaluatorId,
      evaluatedAt: isReEvaluation ? assessment.evaluatedAt : now,
      ...(isReEvaluation
        ? {
            evaluationUpdatedBy: evaluatorId,
            evaluationUpdatedAt: now,
          }
        : {}),
    });

    // Re-fetch the updated record
    const updated = await this.repo.findByApplicationId(applicationId);

    if (!updated) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Candidate assessment not found after update" },
      };
    }

    return { success: true, data: updated };
  }

  /**
   * Cancel a candidate's assessment.
   *
   * Only cancellable statuses: invited, schedule_expired, scheduled, in_progress.
   */
  async cancelAssessment(
    applicationId: string,
    reason?: string
  ): Promise<AssessmentServiceResult<void>> {
    const assessment = await this.repo.findByApplicationId(applicationId);

    if (!assessment) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Candidate assessment not found" },
      };
    }

    if (assessment.status === "cancelled") {
      return {
        success: false,
        error: { code: "ALREADY_CANCELLED", message: "Assessment is already cancelled" },
      };
    }

    if (assessment.status === "submitted" || assessment.status === "evaluated") {
      return {
        success: false,
        error: { code: "ALREADY_SUBMITTED", message: "Cannot cancel a submitted or evaluated assessment" },
      };
    }

    const cancellableStatuses = ["invited", "schedule_expired", "scheduled", "in_progress"];
    if (!cancellableStatuses.includes(assessment.status)) {
      return {
        success: false,
        error: { code: "ALREADY_CANCELLED", message: "Assessment cannot be cancelled in its current state" },
      };
    }

    const now = new Date().toISOString();

    await this.repo.updateCandidateAssessmentStatus(assessment.id, "cancelled", {
      cancelledAt: now,
      cancelReason: reason ?? null,
    });

    return { success: true, data: undefined };
  }

  // ===========================================================================
  // CANDIDATE PORTAL (Token-based actions)
  // ===========================================================================

  /**
   * Get assessment data for the candidate portal using a secure token.
   *
   * Returns everything needed for the portal UI: assessment content,
   * scheduling info, files, and status.
   */
  async getAssessmentByToken(
    token: string
  ): Promise<
    AssessmentServiceResult<{
      assessment: CandidateAssessment;
      definition: AssessmentDefinition;
      parts: AssessmentPart[];
      scheduling: SchedulingConfig;
      files: AssessmentFile[];
    }>
  > {
    const assessment = await this.repo.findByToken(token);

    if (!assessment) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Assessment not found" },
      };
    }

    // Apply lazy status transitions
    const updated = await this.applyLazyStatusTransition(assessment);

    // Get job assessment snapshot data
    const jobAssessmentResult = await this.repo.getJobAssessmentWithDefinition(updated.jobId);

    if (!jobAssessmentResult) {
      return {
        success: false,
        error: { code: "NO_ASSESSMENT", message: "Job assessment configuration not found" },
      };
    }

    let definition: AssessmentDefinition;
    let parts: AssessmentPart[];
    let scheduling: SchedulingConfig;

    if (jobAssessmentResult.jobAssessment.snapshot) {
      const snapshot = JSON.parse(jobAssessmentResult.jobAssessment.snapshot) as {
        definition: AssessmentDefinition;
        parts: AssessmentPart[];
      };
      definition = snapshot.definition;
      parts = snapshot.parts;
      scheduling = this.parseSchedulingConfig(snapshot.definition.schedulingConfig);
    } else if (jobAssessmentResult.definition) {
      definition = jobAssessmentResult.definition;
      parts = jobAssessmentResult.parts;
      scheduling = this.parseSchedulingConfig(jobAssessmentResult.definition.schedulingConfig);
    } else {
      return {
        success: false,
        error: { code: "NO_ASSESSMENT", message: "Assessment definition not found for this job" },
      };
    }

    // Get files already uploaded
    const files = await this.repo.getFilesForAssessment(updated.id);

    // Hide instructions and evidenceDescription before candidate has started
    const hiddenStatuses = ["invited", "scheduled", "schedule_expired", "cancelled"];
    const sanitizedParts = hiddenStatuses.includes(updated.status)
      ? parts.map((p) => ({
          ...p,
          instructions: null as unknown as string,
          evidenceDescription: null as unknown as string,
        }))
      : parts;

    return {
      success: true,
      data: { assessment: updated, definition, parts: sanitizedParts, scheduling, files },
    };
  }

  /**
   * Schedule an assessment for a candidate.
   *
   * Sets the scheduled time and calculates the completion deadline.
   */
  async scheduleAssessment(
    token: string,
    input: ScheduleInput
  ): Promise<AssessmentServiceResult<CandidateAssessment>> {
    const assessment = await this.repo.findByToken(token);

    if (!assessment) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Assessment not found" },
      };
    }

    // Apply lazy status check
    const current = await this.applyLazyStatusTransition(assessment);

    if (current.status !== "invited") {
      if (current.status === "scheduled" || current.status === "in_progress") {
        return {
          success: false,
          error: { code: "ALREADY_SCHEDULED", message: "Assessment is already scheduled" },
        };
      }
      return {
        success: false,
        error: { code: "EXPIRED", message: "Assessment is no longer available for scheduling" },
      };
    }

    // Check schedule deadline hasn't passed
    if (new Date() > new Date(current.scheduleDeadline)) {
      return {
        success: false,
        error: { code: "PAST_SCHEDULE_DEADLINE", message: "The scheduling deadline has passed" },
      };
    }

    // Check scheduledFor is in the future
    if (new Date(input.scheduledFor) <= new Date()) {
      return {
        success: false,
        error: { code: "INVALID_TIME", message: "Scheduled time must be in the future" },
      };
    }

    // Get scheduling config to calculate completion deadline
    const jobAssessmentResult = await this.repo.getJobAssessmentWithDefinition(current.jobId);
    const schedulingConfig = this.getSchedulingConfigFromJobAssessment(jobAssessmentResult);

    // Calculate completionDeadline = scheduledFor + completeWithinHours
    const scheduledForDate = new Date(input.scheduledFor);
    const completionDeadline = new Date(
      scheduledForDate.getTime() + schedulingConfig.completeWithinHours * 60 * 60 * 1000
    );

    await this.repo.updateCandidateAssessmentStatus(current.id, "scheduled", {
      scheduledFor: input.scheduledFor,
      scheduledTimezone: input.timezone,
      completionDeadline: completionDeadline.toISOString(),
    });

    // Re-fetch the updated record
    const updated = await this.repo.findByToken(token);

    if (!updated) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Assessment not found after update" },
      };
    }

    return { success: true, data: updated };
  }

  /**
   * Reschedule an assessment for a candidate.
   *
   * Validates reschedule limits and recalculates the completion deadline.
   */
  async rescheduleAssessment(
    token: string,
    input: ScheduleInput
  ): Promise<AssessmentServiceResult<CandidateAssessment>> {
    const assessment = await this.repo.findByToken(token);

    if (!assessment) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Assessment not found" },
      };
    }

    // Can only reschedule if scheduled (not in_progress)
    if (assessment.status !== "scheduled") {
      return {
        success: false,
        error: { code: "NOT_SCHEDULED", message: "Assessment is not in a scheduled state" },
      };
    }

    // Get scheduling config for reschedule limits
    const jobAssessmentResult = await this.repo.getJobAssessmentWithDefinition(assessment.jobId);
    const schedulingConfig = this.getSchedulingConfigFromJobAssessment(jobAssessmentResult);

    // Check reschedule limit
    if (assessment.rescheduleCount >= schedulingConfig.maxReschedules) {
      return {
        success: false,
        error: {
          code: "NO_RESCHEDULES_LEFT",
          message: `Maximum reschedules (${schedulingConfig.maxReschedules}) reached`,
        },
      };
    }

    // Check schedule deadline hasn't passed
    if (new Date() > new Date(assessment.scheduleDeadline)) {
      return {
        success: false,
        error: { code: "PAST_SCHEDULE_DEADLINE", message: "The scheduling deadline has passed" },
      };
    }

    // Check scheduledFor is in the future
    if (new Date(input.scheduledFor) <= new Date()) {
      return {
        success: false,
        error: { code: "INVALID_TIME", message: "Scheduled time must be in the future" },
      };
    }

    // Recalculate completionDeadline
    const scheduledForDate = new Date(input.scheduledFor);
    const completionDeadline = new Date(
      scheduledForDate.getTime() + schedulingConfig.completeWithinHours * 60 * 60 * 1000
    );

    await this.repo.updateCandidateAssessmentStatus(assessment.id, assessment.status, {
      scheduledFor: input.scheduledFor,
      scheduledTimezone: input.timezone,
      completionDeadline: completionDeadline.toISOString(),
      rescheduleCount: assessment.rescheduleCount + 1,
    });

    // Re-fetch the updated record
    const updated = await this.repo.findByToken(token);

    if (!updated) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Assessment not found after update" },
      };
    }

    return { success: true, data: updated };
  }

  /**
   * Start an assessment.
   *
   * Transitions from scheduled to in_progress.
   * Validates the scheduled time has arrived and deadline hasn't passed.
   */
  async startAssessment(
    token: string
  ): Promise<AssessmentServiceResult<CandidateAssessment>> {
    const assessment = await this.repo.findByToken(token);

    if (!assessment) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Assessment not found" },
      };
    }

    if (assessment.status !== "scheduled") {
      if (assessment.status === "in_progress") {
        return {
          success: false,
          error: { code: "ALREADY_STARTED", message: "Assessment is already in progress" },
        };
      }
      return {
        success: false,
        error: { code: "NOT_SCHEDULED", message: "Assessment is not in a scheduled state" },
      };
    }

    // Check scheduledFor has arrived
    if (assessment.scheduledFor && new Date() < new Date(assessment.scheduledFor)) {
      return {
        success: false,
        error: { code: "INVALID_TIME", message: "Assessment hasn't started yet" },
      };
    }

    // Check completion deadline hasn't passed (with grace period)
    if (assessment.completionDeadline && !isWithinGracePeriod(assessment.completionDeadline)) {
      return {
        success: false,
        error: { code: "EXPIRED", message: "Assessment completion deadline has passed" },
      };
    }

    const now = new Date().toISOString();
    await this.repo.updateCandidateAssessmentStatus(assessment.id, "in_progress", {
      startedAt: now,
    });

    // Re-fetch the updated record
    const updated = await this.repo.findByToken(token);

    if (!updated) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Assessment not found after update" },
      };
    }

    return { success: true, data: updated };
  }

  /**
   * Upload a file for an assessment part.
   *
   * Validates file constraints and uploads to R2 with metadata in DB.
   */
  async uploadFile(
    token: string,
    partId: string,
    file: { name: string; size: number; type: string; stream: ReadableStream },
    r2Bucket: R2Bucket
  ): Promise<AssessmentServiceResult<AssessmentFile>> {
    const assessment = await this.repo.findByToken(token);

    if (!assessment) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Assessment not found" },
      };
    }

    if (assessment.status !== "in_progress") {
      return {
        success: false,
        error: { code: "NOT_IN_PROGRESS", message: "Assessment is not in progress" },
      };
    }

    // Check completion deadline with grace period
    if (assessment.completionDeadline && !isWithinGracePeriod(assessment.completionDeadline)) {
      return {
        success: false,
        error: { code: "EXPIRED", message: "Assessment completion deadline has passed" },
      };
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: {
          code: "FILE_TOO_LARGE",
          message: `File size exceeds maximum of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
        },
      };
    }

    // Validate file type
    if (!isAllowedFileType(file.name) || !isAllowedMimeType(file.type)) {
      return {
        success: false,
        error: { code: "INVALID_FILE_TYPE", message: "File type is not allowed" },
      };
    }

    // Validate partId exists in snapshot
    const jobAssessmentResult = await this.repo.getJobAssessmentWithDefinition(assessment.jobId);

    if (!jobAssessmentResult) {
      return {
        success: false,
        error: { code: "NO_ASSESSMENT", message: "Job assessment configuration not found" },
      };
    }

    let parts: AssessmentPart[];
    if (jobAssessmentResult.jobAssessment.snapshot) {
      const snapshot = JSON.parse(jobAssessmentResult.jobAssessment.snapshot) as {
        parts: AssessmentPart[];
      };
      parts = snapshot.parts;
    } else {
      parts = jobAssessmentResult.parts;
    }

    const partExists = parts.some((p) => p.id === partId);
    if (!partExists) {
      return {
        success: false,
        error: { code: "PART_NOT_FOUND", message: "Assessment part not found" },
      };
    }

    // Generate file ID and R2 key
    const fileId = crypto.randomUUID();
    const r2Key = `assessments/${assessment.id}/${partId}/${fileId}/${file.name}`;

    // Upload to R2
    await r2Bucket.put(r2Key, file.stream, {
      httpMetadata: { contentType: file.type },
    });

    // Create file record in DB
    const assessmentFile = await this.repo.createFile(
      assessment.id,
      partId,
      file.name,
      file.size,
      file.type,
      r2Key
    );

    return { success: true, data: assessmentFile };
  }

  /**
   * Delete a file from an assessment.
   *
   * Removes from both R2 and database.
   */
  async deleteFile(
    token: string,
    partId: string,
    fileId: string,
    r2Bucket: R2Bucket
  ): Promise<AssessmentServiceResult<void>> {
    const assessment = await this.repo.findByToken(token);

    if (!assessment) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Assessment not found" },
      };
    }

    if (assessment.status !== "in_progress") {
      return {
        success: false,
        error: { code: "NOT_IN_PROGRESS", message: "Assessment is not in progress" },
      };
    }

    // Check completion deadline with grace period
    if (assessment.completionDeadline && !isWithinGracePeriod(assessment.completionDeadline)) {
      return {
        success: false,
        error: { code: "EXPIRED", message: "Assessment completion deadline has passed" },
      };
    }

    // Find the file
    const file = await this.repo.getFileById(fileId);

    if (!file) {
      return {
        success: false,
        error: { code: "FILE_NOT_FOUND", message: "File not found" },
      };
    }

    // Verify file belongs to this assessment and part
    if (file.candidateAssessmentId !== assessment.id || file.partId !== partId) {
      return {
        success: false,
        error: { code: "FILE_NOT_FOUND", message: "File not found for this assessment part" },
      };
    }

    // Delete from R2
    await r2Bucket.delete(file.r2Key);

    // Delete from DB
    await this.repo.deleteFile(fileId);

    return { success: true, data: undefined };
  }

  /**
   * Submit an assessment.
   *
   * Validates all required parts have at least one file uploaded.
   */
  async submitAssessment(
    token: string
  ): Promise<AssessmentServiceResult<CandidateAssessment>> {
    const assessment = await this.repo.findByToken(token);

    if (!assessment) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Assessment not found" },
      };
    }

    if (assessment.status !== "in_progress") {
      return {
        success: false,
        error: { code: "NOT_IN_PROGRESS", message: "Assessment is not in progress" },
      };
    }

    // Check completion deadline with grace period
    if (assessment.completionDeadline && !isWithinGracePeriod(assessment.completionDeadline)) {
      return {
        success: false,
        error: { code: "EXPIRED", message: "Assessment completion deadline has passed" },
      };
    }

    // Get assessment parts to check required parts
    const jobAssessmentResult = await this.repo.getJobAssessmentWithDefinition(assessment.jobId);

    if (!jobAssessmentResult) {
      return {
        success: false,
        error: { code: "NO_ASSESSMENT", message: "Job assessment configuration not found" },
      };
    }

    let parts: AssessmentPart[];
    if (jobAssessmentResult.jobAssessment.snapshot) {
      const snapshot = JSON.parse(jobAssessmentResult.jobAssessment.snapshot) as {
        parts: AssessmentPart[];
      };
      parts = snapshot.parts;
    } else {
      parts = jobAssessmentResult.parts;
    }

    // Get all files for this assessment
    const files = await this.repo.getFilesForAssessment(assessment.id);

    // Check required parts have at least one file
    const requiredParts = parts.filter((p) => p.required);
    const partsWithFiles = new Set(files.map((f) => f.partId));
    const missingParts = requiredParts
      .filter((p) => !partsWithFiles.has(p.id))
      .map((p) => p.name);

    if (missingParts.length > 0) {
      return {
        success: false,
        error: {
          code: "MISSING_PARTS",
          message: `Missing evidence for required parts: ${missingParts.join(", ")}`,
          missingParts,
        },
      };
    }

    const now = new Date().toISOString();

    await this.repo.updateCandidateAssessmentStatus(assessment.id, "submitted", {
      submittedAt: now,
    });

    // Re-fetch the updated record
    const updated = await this.repo.findByToken(token);

    if (!updated) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Assessment not found after update" },
      };
    }

    return { success: true, data: updated };
  }

  // ===========================================================================
  // SYSTEM INTEGRATION
  // ===========================================================================

  /**
   * Create a snapshot of the assessment for a job.
   *
   * Called during job publish to create an immutable record of the assessment
   * definition and parts at the time of publishing.
   * No-op if the job has no assessment linked.
   */
  async createSnapshotForJob(jobId: string): Promise<void> {
    await this.repo.createSnapshot(jobId);
  }

  /**
   * Cancel all active assessments for a job.
   *
   * Called when a job is closed. Returns the count of cancelled assessments.
   */
  async cancelAssessmentsForJob(jobId: string): Promise<number> {
    return this.repo.cancelActiveAssessmentsByJobId(jobId);
  }

  /**
   * Process expired schedule deadlines.
   *
   * Called by hourly cron. Transitions invited assessments past their
   * schedule deadline to schedule_expired status.
   *
   * @returns Count of assessments transitioned
   */
  async processExpiredScheduleDeadlines(): Promise<number> {
    const expired = await this.repo.getExpiredScheduleDeadlines();
    let count = 0;

    for (const assessment of expired) {
      await this.repo.updateCandidateAssessmentStatus(assessment.id, "schedule_expired");
      count++;
    }

    return count;
  }

  /**
   * Process expired completion deadlines.
   *
   * Called by hourly cron. Transitions scheduled/in_progress assessments past their
   * completion deadline (with grace period) to expired status.
   *
   * @returns Count of assessments transitioned
   */
  async processExpiredCompletionDeadlines(): Promise<number> {
    const expired = await this.repo.getExpiredCompletionDeadlines(ASSESSMENT_GRACE_PERIOD_MINUTES);
    let count = 0;

    for (const assessment of expired) {
      await this.repo.updateCandidateAssessmentStatus(assessment.id, "expired");
      count++;
    }

    return count;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Apply lazy status transitions based on deadlines.
   *
   * Ensures status is accurate even without the cron having run yet:
   * - invited + scheduleDeadline passed -> schedule_expired
   * - scheduled/in_progress + completionDeadline + grace passed -> expired
   *
   * Writes transitions to DB fire-and-forget so cron doesn't re-process.
   */
  private async applyLazyStatusTransition(
    assessment: CandidateAssessment
  ): Promise<CandidateAssessment> {
    const now = new Date();

    // Check if invited and schedule deadline has passed
    if (assessment.status === "invited") {
      const scheduleDeadline = new Date(assessment.scheduleDeadline);
      if (now > scheduleDeadline) {
        const updatedAt = now.toISOString();
        // Fire-and-forget: write to DB so cron doesn't re-process
        this.repo
          .updateCandidateAssessmentStatus(assessment.id, "schedule_expired")
          .catch((err: unknown) =>
            console.error(`[Assessment] Failed lazy transition to schedule_expired: ${err}`)
          );

        return { ...assessment, status: "schedule_expired", updatedAt };
      }
    }

    // Check if scheduled/in_progress and completion deadline + grace has passed
    if (
      (assessment.status === "scheduled" || assessment.status === "in_progress") &&
      assessment.completionDeadline
    ) {
      const deadlineWithGrace = new Date(
        new Date(assessment.completionDeadline).getTime() +
          ASSESSMENT_GRACE_PERIOD_MINUTES * 60 * 1000
      );

      if (now > deadlineWithGrace) {
        const updatedAt = now.toISOString();
        // Fire-and-forget: write to DB so cron doesn't re-process
        this.repo
          .updateCandidateAssessmentStatus(assessment.id, "expired")
          .catch((err: unknown) =>
            console.error(`[Assessment] Failed lazy transition to expired: ${err}`)
          );

        return { ...assessment, status: "expired", updatedAt };
      }
    }

    return assessment;
  }

  /**
   * Parse scheduling config from JSON string.
   */
  private parseSchedulingConfig(configJson: string): SchedulingConfig {
    try {
      return SchedulingConfigSchema.parse(JSON.parse(configJson));
    } catch {
      // Fallback to defaults if parsing fails
      return SchedulingConfigSchema.parse({});
    }
  }

  /**
   * Extract scheduling config from a job assessment result.
   * Reads from snapshot if present, otherwise from live definition.
   */
  private getSchedulingConfigFromJobAssessment(
    jobAssessmentResult: {
      jobAssessment: JobAssessment;
      definition: AssessmentDefinition | null;
      parts: AssessmentPart[];
    } | null
  ): SchedulingConfig {
    if (!jobAssessmentResult) {
      return SchedulingConfigSchema.parse({});
    }

    if (jobAssessmentResult.jobAssessment.snapshot) {
      const snapshot = JSON.parse(jobAssessmentResult.jobAssessment.snapshot) as {
        definition: AssessmentDefinition;
      };
      return this.parseSchedulingConfig(snapshot.definition.schedulingConfig);
    }

    if (!jobAssessmentResult.definition) {
      return SchedulingConfigSchema.parse({});
    }

    return this.parseSchedulingConfig(jobAssessmentResult.definition.schedulingConfig);
  }
}
