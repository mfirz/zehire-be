/**
 * Interview Stages Repository
 * ===========================
 * Data access layer for interview stages and interviewer assignments.
 *
 * This repository consolidates stage management that was previously split between:
 * - jobs.pipeline JSON (stage names, focus, duration)
 * - interview_stage_config table (mode, duration)
 * - interview_stage_interviewers table (interviewer assignments)
 *
 * Now all stage data is managed through relational tables.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { and, eq, inArray } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import {
  createDb,
  interviewStageConfig,
  interviewStageInterviewers,
  interviewers,
  scheduledInterviews,
  type Database,
  type InterviewStageRecord,
  type NewInterviewStage,
  type InterviewStageInterviewer,
  type NewInterviewStageInterviewer,
  type Interviewer,
  type InterviewMode,
} from "../../db";

// Alphanumeric-only nanoid for IDs
const alphanumericId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  21
);

// =============================================================================
// TYPES
// =============================================================================

/**
 * Stage with assigned interviewers.
 */
export interface StageWithInterviewers extends InterviewStageRecord {
  interviewers: Array<{
    id: string;
    email: string;
    name: string | null;
    calendarConnected: boolean | null;
  }>;
}

/**
 * Input for creating/updating a stage.
 */
export interface StageInput {
  id?: string; // If missing, create new
  name: string;
  focus: string;
  duration: number;
  mode?: InterviewMode;
  interviewerIds?: string[];
}

/**
 * Input for creating stages from pipeline recommendation.
 */
export interface RecommendationRound {
  name: string;
  duration: number;
  focus: string;
}

/**
 * Result of stage update operation.
 */
export type UpdateStagesResult =
  | { success: true; stages: StageWithInterviewers[] }
  | { success: false; error: { code: string; message: string; stageIds?: string[] } };

// =============================================================================
// REPOSITORY
// =============================================================================

export class InterviewStagesRepository {
  private db: Database;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  // ===========================================================================
  // READ OPERATIONS
  // ===========================================================================

  /**
   * Get all stages for a job with their assigned interviewers.
   * Stages are ordered by orderIndex.
   */
  async getStagesForJob(jobId: string): Promise<StageWithInterviewers[]> {
    // Get all stages for this job
    const stages = await this.db
      .select()
      .from(interviewStageConfig)
      .where(eq(interviewStageConfig.jobId, jobId))
      .orderBy(interviewStageConfig.orderIndex)
      .all();

    if (stages.length === 0) {
      return [];
    }

    // Get all interviewer assignments for this job
    const assignments = await this.db
      .select()
      .from(interviewStageInterviewers)
      .where(eq(interviewStageInterviewers.jobId, jobId))
      .all();

    // Get interviewer details
    const interviewerIds = [...new Set(assignments.map((a) => a.interviewerId))];
    const interviewerRecords =
      interviewerIds.length > 0
        ? await this.db
            .select({
              id: interviewers.id,
              email: interviewers.email,
              name: interviewers.name,
              calendarConnected: interviewers.calendarConnected,
            })
            .from(interviewers)
            .where(inArray(interviewers.id, interviewerIds))
            .all()
        : [];

    // Build map of interviewerId -> details
    const interviewerMap = new Map(interviewerRecords.map((i) => [i.id, i]));

    // Build map of stageId -> interviewers
    const stageInterviewersMap = new Map<
      string,
      Array<{ id: string; email: string; name: string | null; calendarConnected: boolean | null }>
    >();
    for (const assignment of assignments) {
      const interviewer = interviewerMap.get(assignment.interviewerId);
      if (interviewer) {
        const existing = stageInterviewersMap.get(assignment.stageId) ?? [];
        existing.push(interviewer);
        stageInterviewersMap.set(assignment.stageId, existing);
      }
    }

    // Combine stages with interviewers
    return stages.map((stage) => ({
      ...stage,
      interviewers: stageInterviewersMap.get(stage.stageId) ?? [],
    }));
  }

  /**
   * Get a single stage by ID with interviewers.
   */
  async getStageById(stageId: string): Promise<StageWithInterviewers | null> {
    const stage = await this.db
      .select()
      .from(interviewStageConfig)
      .where(eq(interviewStageConfig.id, stageId))
      .get();

    if (!stage) {
      return null;
    }

    // Get interviewer assignments
    const assignments = await this.db
      .select()
      .from(interviewStageInterviewers)
      .where(eq(interviewStageInterviewers.stageId, stage.stageId))
      .all();

    if (assignments.length === 0) {
      return { ...stage, interviewers: [] };
    }

    // Get interviewer details
    const interviewerIds = assignments.map((a) => a.interviewerId);
    const interviewerRecords = await this.db
      .select({
        id: interviewers.id,
        email: interviewers.email,
        name: interviewers.name,
        calendarConnected: interviewers.calendarConnected,
      })
      .from(interviewers)
      .where(inArray(interviewers.id, interviewerIds))
      .all();

    return { ...stage, interviewers: interviewerRecords };
  }

  /**
   * Get stage by job ID and stage ID (legacy lookup by stageId string).
   */
  async getStageByJobAndStageId(
    jobId: string,
    stageId: string
  ): Promise<StageWithInterviewers | null> {
    const stage = await this.db
      .select()
      .from(interviewStageConfig)
      .where(
        and(eq(interviewStageConfig.jobId, jobId), eq(interviewStageConfig.stageId, stageId))
      )
      .get();

    if (!stage) {
      return null;
    }

    // Get interviewer assignments
    const assignments = await this.db
      .select()
      .from(interviewStageInterviewers)
      .where(
        and(
          eq(interviewStageInterviewers.jobId, jobId),
          eq(interviewStageInterviewers.stageId, stageId)
        )
      )
      .all();

    if (assignments.length === 0) {
      return { ...stage, interviewers: [] };
    }

    // Get interviewer details
    const interviewerIds = assignments.map((a) => a.interviewerId);
    const interviewerRecords = await this.db
      .select({
        id: interviewers.id,
        email: interviewers.email,
        name: interviewers.name,
        calendarConnected: interviewers.calendarConnected,
      })
      .from(interviewers)
      .where(inArray(interviewers.id, interviewerIds))
      .all();

    return { ...stage, interviewers: interviewerRecords };
  }

  // ===========================================================================
  // CREATE OPERATIONS
  // ===========================================================================

  /**
   * Create stages from pipeline recommendation.
   * Called when pipeline is first generated.
   */
  async createStagesFromRecommendation(
    jobId: string,
    rounds: RecommendationRound[]
  ): Promise<InterviewStageRecord[]> {
    const now = new Date().toISOString();
    const stages: NewInterviewStage[] = rounds.map((round, index) => {
      const id = alphanumericId();
      return {
        id,
        jobId,
        stageId: id, // stageId same as id for new stages
        name: round.name,
        focus: round.focus,
        durationMinutes: round.duration,
        mode: "any_one" as const,
        orderIndex: index,
        createdAt: now,
        updatedAt: now,
      };
    });

    if (stages.length === 0) {
      return [];
    }

    await this.db.insert(interviewStageConfig).values(stages);

    return stages as InterviewStageRecord[];
  }

  // ===========================================================================
  // UPDATE OPERATIONS
  // ===========================================================================

  /**
   * Update stages for a job.
   * Handles create, update, and delete based on input.
   *
   * - Stages with id that exists: update
   * - Stages without id or with new id: create
   * - Existing stages not in input: delete (blocked if active interviews exist)
   */
  async updateStages(
    jobId: string,
    stageInputs: StageInput[]
  ): Promise<UpdateStagesResult> {
    const now = new Date().toISOString();

    // Get existing stages
    const existingStages = await this.db
      .select()
      .from(interviewStageConfig)
      .where(eq(interviewStageConfig.jobId, jobId))
      .all();

    const existingMap = new Map(existingStages.map((s) => [s.id, s]));
    const inputIds = new Set(stageInputs.filter((s) => s.id).map((s) => s.id!));

    // Determine operations
    const toUpdate: Array<{ stage: InterviewStageRecord; input: StageInput }> = [];
    const toCreate: StageInput[] = [];
    const toDelete: string[] = [];

    // Find stages to update or create
    for (const input of stageInputs) {
      if (input.id && existingMap.has(input.id)) {
        toUpdate.push({ stage: existingMap.get(input.id)!, input });
      } else {
        toCreate.push(input);
      }
    }

    // Find stages to delete (existing but not in input)
    for (const existing of existingStages) {
      if (!inputIds.has(existing.id)) {
        toDelete.push(existing.id);
      }
    }

    // Check for active interviews on stages being deleted
    if (toDelete.length > 0) {
      const stagesWithActiveInterviews = await this.getStagesWithActiveInterviews(
        jobId,
        toDelete
      );

      if (stagesWithActiveInterviews.length > 0) {
        const stageNames = stagesWithActiveInterviews
          .map((s) => `"${s.name}"`)
          .join(", ");
        return {
          success: false,
          error: {
            code: "ACTIVE_INTERVIEWS_EXIST",
            message: `Cannot delete stages with scheduled interviews. Please cancel the interviews first or wait for them to complete: ${stageNames}`,
            stageIds: stagesWithActiveInterviews.map((s) => s.id),
          },
        };
      }
    }

    // Execute operations
    const operations: Promise<unknown>[] = [];

    // Delete removed stages
    if (toDelete.length > 0) {
      operations.push(
        this.db
          .delete(interviewStageConfig)
          .where(inArray(interviewStageConfig.id, toDelete))
      );
      // Also delete interviewer assignments
      operations.push(
        this.db
          .delete(interviewStageInterviewers)
          .where(
            and(
              eq(interviewStageInterviewers.jobId, jobId),
              inArray(interviewStageInterviewers.stageId, toDelete)
            )
          )
      );
    }

    // Update existing stages
    for (let i = 0; i < toUpdate.length; i++) {
      const { stage, input } = toUpdate[i]!;
      operations.push(
        this.db
          .update(interviewStageConfig)
          .set({
            name: input.name,
            focus: input.focus,
            durationMinutes: input.duration,
            mode: input.mode ?? stage.mode,
            orderIndex: stageInputs.findIndex((s) => s.id === stage.id),
            updatedAt: now,
          })
          .where(eq(interviewStageConfig.id, stage.id))
      );
    }

    // Create new stages
    if (toCreate.length > 0) {
      const newStages: NewInterviewStage[] = toCreate.map((input, i) => {
        const id = alphanumericId();
        const orderIndex =
          stageInputs.findIndex((s) => s === input) !== -1
            ? stageInputs.findIndex((s) => s === input)
            : existingStages.length + i;
        return {
          id,
          jobId,
          stageId: id,
          name: input.name,
          focus: input.focus,
          durationMinutes: input.duration,
          mode: input.mode ?? ("any_one" as const),
          orderIndex,
          createdAt: now,
          updatedAt: now,
        };
      });
      operations.push(this.db.insert(interviewStageConfig).values(newStages));
    }

    await Promise.all(operations);

    // Handle interviewer assignments
    await this.syncInterviewerAssignments(jobId, stageInputs);

    // Return updated stages
    return { success: true, stages: await this.getStagesForJob(jobId) };
  }

  /**
   * Check which stages have active (scheduled) interviews.
   * Returns stage info for stages that cannot be deleted.
   */
  private async getStagesWithActiveInterviews(
    jobId: string,
    stageIds: string[]
  ): Promise<Array<{ id: string; name: string }>> {
    // Get stages with their names
    const stages = await this.db
      .select({ id: interviewStageConfig.id, name: interviewStageConfig.name, stageId: interviewStageConfig.stageId })
      .from(interviewStageConfig)
      .where(
        and(
          eq(interviewStageConfig.jobId, jobId),
          inArray(interviewStageConfig.id, stageIds)
        )
      )
      .all();

    if (stages.length === 0) {
      return [];
    }

    // Check for active interviews (status = 'scheduled')
    const stageIdStrings = stages.map((s) => s.stageId);
    const activeInterviews = await this.db
      .select({ stageId: scheduledInterviews.stageId })
      .from(scheduledInterviews)
      .where(
        and(
          eq(scheduledInterviews.jobId, jobId),
          inArray(scheduledInterviews.stageId, stageIdStrings),
          eq(scheduledInterviews.status, "scheduled")
        )
      )
      .all();

    const stagesWithInterviews = new Set(activeInterviews.map((i) => i.stageId));

    return stages
      .filter((s) => stagesWithInterviews.has(s.stageId))
      .map((s) => ({ id: s.id, name: s.name }));
  }

  /**
   * Sync interviewer assignments for stages.
   * Adds missing assignments and removes extra ones.
   */
  private async syncInterviewerAssignments(
    jobId: string,
    stageInputs: StageInput[]
  ): Promise<void> {
    const now = new Date().toISOString();

    // Get current stages to map stageId
    const stages = await this.db
      .select({ id: interviewStageConfig.id, stageId: interviewStageConfig.stageId })
      .from(interviewStageConfig)
      .where(eq(interviewStageConfig.jobId, jobId))
      .all();

    const stageIdMap = new Map(stages.map((s) => [s.id, s.stageId]));

    // Process each stage input
    for (const input of stageInputs) {
      if (!input.id || !input.interviewerIds) continue;

      const stageId = stageIdMap.get(input.id);
      if (!stageId) continue;

      // Get current assignments
      const currentAssignments = await this.db
        .select()
        .from(interviewStageInterviewers)
        .where(
          and(
            eq(interviewStageInterviewers.jobId, jobId),
            eq(interviewStageInterviewers.stageId, stageId)
          )
        )
        .all();

      const currentIds = new Set(currentAssignments.map((a) => a.interviewerId));
      const desiredIds = new Set(input.interviewerIds);

      // Find assignments to add and remove
      const toAdd = input.interviewerIds.filter((id) => !currentIds.has(id));
      const toRemove = currentAssignments
        .filter((a) => !desiredIds.has(a.interviewerId))
        .map((a) => a.id);

      const operations: Promise<unknown>[] = [];

      // Remove extra assignments
      if (toRemove.length > 0) {
        operations.push(
          this.db
            .delete(interviewStageInterviewers)
            .where(inArray(interviewStageInterviewers.id, toRemove))
        );
      }

      // Add missing assignments
      if (toAdd.length > 0) {
        const newAssignments: NewInterviewStageInterviewer[] = toAdd.map((interviewerId) => ({
          id: alphanumericId(),
          jobId,
          stageId,
          interviewerId,
          createdAt: now,
        }));
        operations.push(this.db.insert(interviewStageInterviewers).values(newAssignments));
      }

      await Promise.all(operations);
    }
  }

  /**
   * Update only operational fields for stages (interviewerIds, mode).
   * Used for published/paused jobs where structure is locked.
   */
  async updateOperationalFields(
    jobId: string,
    updates: Array<{
      id: string;
      interviewerIds?: string[];
      mode?: InterviewMode;
    }>
  ): Promise<void> {
    const now = new Date().toISOString();

    // Get current stages to map id -> stageId
    const stages = await this.db
      .select({ id: interviewStageConfig.id, stageId: interviewStageConfig.stageId })
      .from(interviewStageConfig)
      .where(eq(interviewStageConfig.jobId, jobId))
      .all();

    const stageIdMap = new Map(stages.map((s) => [s.id, s.stageId]));

    for (const update of updates) {
      const stageId = stageIdMap.get(update.id);
      if (!stageId) continue;

      // Update mode if provided
      if (update.mode) {
        await this.db
          .update(interviewStageConfig)
          .set({ mode: update.mode, updatedAt: now })
          .where(eq(interviewStageConfig.id, update.id));
      }

      // Update interviewer assignments if provided
      if (update.interviewerIds !== undefined) {
        // Get current assignments
        const currentAssignments = await this.db
          .select()
          .from(interviewStageInterviewers)
          .where(
            and(
              eq(interviewStageInterviewers.jobId, jobId),
              eq(interviewStageInterviewers.stageId, stageId)
            )
          )
          .all();

        const currentIds = new Set(currentAssignments.map((a) => a.interviewerId));
        const desiredIds = new Set(update.interviewerIds);

        // Find assignments to add and remove
        const toAdd = update.interviewerIds.filter((id) => !currentIds.has(id));
        const toRemove = currentAssignments
          .filter((a) => !desiredIds.has(a.interviewerId))
          .map((a) => a.id);

        const operations: Promise<unknown>[] = [];

        // Remove extra assignments
        if (toRemove.length > 0) {
          operations.push(
            this.db
              .delete(interviewStageInterviewers)
              .where(inArray(interviewStageInterviewers.id, toRemove))
          );
        }

        // Add missing assignments
        if (toAdd.length > 0) {
          const newAssignments: NewInterviewStageInterviewer[] = toAdd.map((interviewerId) => ({
            id: alphanumericId(),
            jobId,
            stageId,
            interviewerId,
            createdAt: now,
          }));
          operations.push(this.db.insert(interviewStageInterviewers).values(newAssignments));
        }

        await Promise.all(operations);
      }
    }
  }

  // ===========================================================================
  // DELETE OPERATIONS
  // ===========================================================================

  /**
   * Delete a stage and its interviewer assignments.
   */
  async deleteStage(stageId: string): Promise<boolean> {
    // Get the stage first to find jobId and stageId string
    const stage = await this.db
      .select()
      .from(interviewStageConfig)
      .where(eq(interviewStageConfig.id, stageId))
      .get();

    if (!stage) {
      return false;
    }

    // Delete interviewer assignments first (cascade should handle this, but be explicit)
    await this.db
      .delete(interviewStageInterviewers)
      .where(
        and(
          eq(interviewStageInterviewers.jobId, stage.jobId),
          eq(interviewStageInterviewers.stageId, stage.stageId)
        )
      );

    // Delete the stage
    const result = await this.db
      .delete(interviewStageConfig)
      .where(eq(interviewStageConfig.id, stageId))
      .returning();

    return result.length > 0;
  }

  /**
   * Delete all stages for a job.
   */
  async deleteAllStagesForJob(jobId: string): Promise<void> {
    await this.db
      .delete(interviewStageInterviewers)
      .where(eq(interviewStageInterviewers.jobId, jobId));

    await this.db
      .delete(interviewStageConfig)
      .where(eq(interviewStageConfig.jobId, jobId));
  }

  // ===========================================================================
  // INTERVIEWER OPERATIONS
  // ===========================================================================

  /**
   * Assign an interviewer to a stage.
   */
  async assignInterviewer(
    jobId: string,
    stageId: string,
    interviewerId: string
  ): Promise<InterviewStageInterviewer> {
    const now = new Date().toISOString();

    // Check if already assigned
    const existing = await this.db
      .select()
      .from(interviewStageInterviewers)
      .where(
        and(
          eq(interviewStageInterviewers.jobId, jobId),
          eq(interviewStageInterviewers.stageId, stageId),
          eq(interviewStageInterviewers.interviewerId, interviewerId)
        )
      )
      .get();

    if (existing) {
      return existing;
    }

    const assignment: NewInterviewStageInterviewer = {
      id: alphanumericId(),
      jobId,
      stageId,
      interviewerId,
      createdAt: now,
    };

    await this.db.insert(interviewStageInterviewers).values(assignment);

    return assignment as InterviewStageInterviewer;
  }

  /**
   * Remove an interviewer from a stage.
   */
  async removeInterviewer(
    jobId: string,
    stageId: string,
    interviewerId: string
  ): Promise<boolean> {
    const result = await this.db
      .delete(interviewStageInterviewers)
      .where(
        and(
          eq(interviewStageInterviewers.jobId, jobId),
          eq(interviewStageInterviewers.stageId, stageId),
          eq(interviewStageInterviewers.interviewerId, interviewerId)
        )
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Get assigned interviewer details for a stage.
   */
  async getAssignedInterviewerDetails(
    jobId: string,
    stageId: string
  ): Promise<Interviewer[]> {
    const assignments = await this.db
      .select()
      .from(interviewStageInterviewers)
      .where(
        and(
          eq(interviewStageInterviewers.jobId, jobId),
          eq(interviewStageInterviewers.stageId, stageId)
        )
      )
      .all();

    if (assignments.length === 0) {
      return [];
    }

    const interviewerIds = assignments.map((a) => a.interviewerId);
    return this.db
      .select()
      .from(interviewers)
      .where(inArray(interviewers.id, interviewerIds))
      .all();
  }

  /**
   * Check if an interviewer exists and belongs to the organization.
   */
  async validateInterviewer(
    interviewerId: string,
    orgId: string
  ): Promise<Interviewer | null> {
    const result = await this.db
      .select()
      .from(interviewers)
      .where(and(eq(interviewers.id, interviewerId), eq(interviewers.orgId, orgId)))
      .get();

    return result ?? null;
  }
}
