/**
 * Stage Configuration Repository
 * ==============================
 * Data access layer for interview stage configuration and interviewer assignments.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { and, eq, inArray } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import {
  createDb,
  interviewStageConfig,
  interviewStageInterviewers,
  interviewers,
  type Database,
  type InterviewStageConfigRecord,
  type NewInterviewStageConfig,
  type InterviewStageInterviewer,
  type NewInterviewStageInterviewer,
  type Interviewer,
} from "../../db";

// Alphanumeric-only nanoid for IDs
const alphanumericId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  21
);

export interface StageConfigWithInterviewers extends InterviewStageConfigRecord {
  interviewers: Array<{
    id: string;
    email: string;
    name: string | null;
    calendarConnected: boolean | null;
  }>;
}

export class StageConfigRepository {
  private db: Database;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  // ===========================================================================
  // STAGE CONFIG
  // ===========================================================================

  /**
   * Get stage configuration.
   * Returns null if no config exists (use defaults).
   */
  async getConfig(jobId: string, stageId: string): Promise<InterviewStageConfigRecord | null> {
    const result = await this.db
      .select()
      .from(interviewStageConfig)
      .where(
        and(
          eq(interviewStageConfig.jobId, jobId),
          eq(interviewStageConfig.stageId, stageId)
        )
      )
      .get();

    return result ?? null;
  }

  /**
   * Get stage configuration with assigned interviewers.
   */
  async getConfigWithInterviewers(
    jobId: string,
    stageId: string
  ): Promise<StageConfigWithInterviewers | null> {
    const config = await this.getConfig(jobId, stageId);

    // Get assigned interviewers
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
      if (!config) {
        return null;
      }
      return {
        ...config,
        interviewers: [],
      };
    }

    // Fetch interviewer details
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

    // Use defaults if no config exists
    const configData = config ?? {
      id: "",
      jobId,
      stageId,
      mode: "any_one" as const,
      durationMinutes: 45,
      bufferMinutes: 15,
      createdAt: "",
      updatedAt: "",
    };

    return {
      ...configData,
      interviewers: interviewerRecords,
    };
  }

  /**
   * Create or update stage configuration.
   */
  async upsertConfig(
    jobId: string,
    stageId: string,
    updates: {
      mode?: "any_one" | "all_required" | undefined;
      durationMinutes?: number | undefined;
      bufferMinutes?: number | undefined;
    }
  ): Promise<InterviewStageConfigRecord> {
    const now = new Date().toISOString();
    const existing = await this.getConfig(jobId, stageId);

    if (existing) {
      // Update existing
      await this.db
        .update(interviewStageConfig)
        .set({
          mode: updates.mode ?? existing.mode,
          durationMinutes: updates.durationMinutes ?? existing.durationMinutes,
          bufferMinutes: updates.bufferMinutes ?? existing.bufferMinutes,
          updatedAt: now,
        })
        .where(eq(interviewStageConfig.id, existing.id));

      return (await this.getConfig(jobId, stageId))!;
    }

    // Create new
    const newConfig: NewInterviewStageConfig = {
      id: alphanumericId(),
      jobId,
      stageId,
      mode: updates.mode ?? "any_one",
      durationMinutes: updates.durationMinutes ?? 45,
      bufferMinutes: updates.bufferMinutes ?? 15,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(interviewStageConfig).values(newConfig);

    return newConfig as InterviewStageConfigRecord;
  }

  // ===========================================================================
  // INTERVIEWER ASSIGNMENTS
  // ===========================================================================

  /**
   * Get assigned interviewers for a stage.
   */
  async getAssignedInterviewers(
    jobId: string,
    stageId: string
  ): Promise<InterviewStageInterviewer[]> {
    return this.db
      .select()
      .from(interviewStageInterviewers)
      .where(
        and(
          eq(interviewStageInterviewers.jobId, jobId),
          eq(interviewStageInterviewers.stageId, stageId)
        )
      )
      .all();
  }

  /**
   * Get assigned interviewer details for a stage.
   */
  async getAssignedInterviewerDetails(
    jobId: string,
    stageId: string
  ): Promise<Interviewer[]> {
    const assignments = await this.getAssignedInterviewers(jobId, stageId);

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
   * Remove interviewer assignment by assignment ID.
   */
  async removeAssignment(assignmentId: string): Promise<boolean> {
    const result = await this.db
      .delete(interviewStageInterviewers)
      .where(eq(interviewStageInterviewers.id, assignmentId))
      .returning();

    return result.length > 0;
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
      .where(
        and(
          eq(interviewers.id, interviewerId),
          eq(interviewers.orgId, orgId)
        )
      )
      .get();

    return result ?? null;
  }

  // ===========================================================================
  // BULK OPERATIONS
  // ===========================================================================

  /**
   * Get all stage configurations for a job.
   * Returns a map of stageId -> config.
   */
  async getAllConfigsForJob(
    jobId: string
  ): Promise<Map<string, { mode: "any_one" | "all_required"; durationMinutes: number; bufferMinutes: number; interviewerCount: number }>> {
    // Get all configs for this job
    const configs = await this.db
      .select()
      .from(interviewStageConfig)
      .where(eq(interviewStageConfig.jobId, jobId))
      .all();

    // Get interviewer counts per stage
    const assignments = await this.db
      .select()
      .from(interviewStageInterviewers)
      .where(eq(interviewStageInterviewers.jobId, jobId))
      .all();

    // Count interviewers per stage
    const interviewerCounts = new Map<string, number>();
    for (const a of assignments) {
      interviewerCounts.set(a.stageId, (interviewerCounts.get(a.stageId) ?? 0) + 1);
    }

    // Build result map
    const result = new Map<string, { mode: "any_one" | "all_required"; durationMinutes: number; bufferMinutes: number; interviewerCount: number }>();
    for (const config of configs) {
      result.set(config.stageId, {
        mode: (config.mode ?? "any_one") as "any_one" | "all_required",
        durationMinutes: config.durationMinutes ?? 45,
        bufferMinutes: config.bufferMinutes ?? 15,
        interviewerCount: interviewerCounts.get(config.stageId) ?? 0,
      });
    }

    return result;
  }
}
