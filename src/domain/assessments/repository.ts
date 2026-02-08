/**
 * Assessment Repository
 * =====================
 * Data access layer for assessment definitions, job assessments,
 * candidate assessments, and assessment files.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { and, eq, inArray, like, lt, desc, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import {
  createDb,
  assessmentDefinitions,
  assessmentParts,
  jobAssessments,
  candidateAssessments,
  assessmentFiles,
  applications,
  jobs,
  type Database,
  type AssessmentDefinition,
  type NewAssessmentDefinition,
  type AssessmentPart,
  type NewAssessmentPart,
  type JobAssessment,
  type NewJobAssessment,
  type CandidateAssessment,
  type NewCandidateAssessment,
  type AssessmentFile,
  type NewAssessmentFile,
} from "../../db";

import type { SchedulingConfig } from "./types";

// Alphanumeric-only nanoid for IDs
const alphanumericId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  21
);

// URL-safe token for candidate assessment links
const urlSafeToken = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  32
);

// =============================================================================
// EXPORTED INTERFACES
// =============================================================================

export interface DefinitionWithParts extends AssessmentDefinition {
  parts: AssessmentPart[];
}

export interface JobAssessmentWithDefinition {
  jobAssessment: JobAssessment;
  definition: AssessmentDefinition | null;
  parts: AssessmentPart[];
}

export interface CandidateAssessmentWithDetails extends CandidateAssessment {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
}

// =============================================================================
// REPOSITORY
// =============================================================================

export class AssessmentRepository {
  private db: Database;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  // ===========================================================================
  // ASSESSMENT DEFINITIONS (Library CRUD)
  // ===========================================================================

  /**
   * Create a new assessment definition with parts.
   */
  async createDefinition(
    orgId: string,
    createdBy: string,
    name: string,
    schedulingConfig: SchedulingConfig,
    parts: Array<{
      name: string;
      instructions: string;
      evidenceDescription: string;
      required: boolean;
    }>
  ): Promise<DefinitionWithParts> {
    const now = new Date().toISOString();
    const definitionId = `assess_${alphanumericId()}`;

    const definition: NewAssessmentDefinition = {
      id: definitionId,
      orgId,
      name,
      schedulingConfig: JSON.stringify(schedulingConfig),
      status: "active",
      createdBy,
      createdAt: now,
      updatedAt: now,
    };

    const partRecords: NewAssessmentPart[] = parts.map((part, index) => ({
      id: `part_${alphanumericId()}`,
      assessmentDefinitionId: definitionId,
      name: part.name,
      instructions: part.instructions,
      evidenceDescription: part.evidenceDescription,
      required: part.required,
      orderIndex: index,
      createdAt: now,
      updatedAt: now,
    }));

    await this.db.batch([
      this.db.insert(assessmentDefinitions).values(definition),
      ...partRecords.map((p) => this.db.insert(assessmentParts).values(p)),
    ]);

    return {
      ...(definition as AssessmentDefinition),
      parts: partRecords as AssessmentPart[],
    };
  }

  /**
   * Get an assessment definition with its parts.
   */
  async getDefinition(
    id: string,
    orgId: string
  ): Promise<DefinitionWithParts | null> {
    const definition = await this.db
      .select()
      .from(assessmentDefinitions)
      .where(
        and(
          eq(assessmentDefinitions.id, id),
          eq(assessmentDefinitions.orgId, orgId)
        )
      )
      .get();

    if (!definition) {
      return null;
    }

    const parts = await this.db
      .select()
      .from(assessmentParts)
      .where(eq(assessmentParts.assessmentDefinitionId, id))
      .orderBy(assessmentParts.orderIndex)
      .all();

    return { ...definition, parts };
  }

  /**
   * List assessment definitions for an organization.
   */
  async listDefinitions(
    orgId: string,
    options?: { status?: "active" | "archived" }
  ): Promise<AssessmentDefinition[]> {
    const conditions = [eq(assessmentDefinitions.orgId, orgId)];

    if (options?.status) {
      conditions.push(eq(assessmentDefinitions.status, options.status));
    }

    return this.db
      .select()
      .from(assessmentDefinitions)
      .where(and(...conditions))
      .orderBy(desc(assessmentDefinitions.createdAt))
      .all();
  }

  /**
   * List assessment definitions with part counts (avoids N+1 for list view).
   */
  async listDefinitionsWithPartCounts(
    orgId: string,
    options?: { status?: "active" | "archived"; search?: string }
  ): Promise<Array<AssessmentDefinition & { partsCount: number }>> {
    const conditions = [eq(assessmentDefinitions.orgId, orgId)];

    if (options?.status) {
      conditions.push(eq(assessmentDefinitions.status, options.status));
    }

    if (options?.search) {
      conditions.push(like(assessmentDefinitions.name, `%${options.search}%`));
    }

    return this.db
      .select({
        id: assessmentDefinitions.id,
        orgId: assessmentDefinitions.orgId,
        name: assessmentDefinitions.name,
        schedulingConfig: assessmentDefinitions.schedulingConfig,
        status: assessmentDefinitions.status,
        createdBy: assessmentDefinitions.createdBy,
        createdAt: assessmentDefinitions.createdAt,
        updatedAt: assessmentDefinitions.updatedAt,
        partsCount: sql<number>`(SELECT COUNT(*) FROM assessment_parts WHERE assessment_definition_id = ${assessmentDefinitions.id})`,
      })
      .from(assessmentDefinitions)
      .where(and(...conditions))
      .orderBy(desc(assessmentDefinitions.createdAt))
      .all();
  }

  /**
   * Update an assessment definition and optionally sync its parts.
   */
  async updateDefinition(
    id: string,
    orgId: string,
    updates: {
      name?: string;
      schedulingConfig?: Partial<SchedulingConfig>;
      parts?: Array<{
        id?: string;
        name: string;
        instructions: string;
        evidenceDescription: string;
        required: boolean;
      }>;
    }
  ): Promise<DefinitionWithParts | null> {
    const now = new Date().toISOString();

    // Fetch existing definition
    const existing = await this.getDefinition(id, orgId);
    if (!existing) {
      return null;
    }

    // Build definition update fields
    const definitionUpdate: Record<string, unknown> = { updatedAt: now };

    if (updates.name !== undefined) {
      definitionUpdate.name = updates.name;
    }

    if (updates.schedulingConfig !== undefined) {
      const existingConfig: SchedulingConfig = JSON.parse(
        existing.schedulingConfig
      );
      const mergedConfig = { ...existingConfig, ...updates.schedulingConfig };
      definitionUpdate.schedulingConfig = JSON.stringify(mergedConfig);
    }

    // Update definition
    await this.db
      .update(assessmentDefinitions)
      .set(definitionUpdate)
      .where(eq(assessmentDefinitions.id, id));

    // Sync parts if provided
    if (updates.parts !== undefined) {
      const existingPartIds = new Set(existing.parts.map((p) => p.id));
      const incomingPartIds = new Set(
        updates.parts.filter((p) => p.id).map((p) => p.id!)
      );

      // Parts to delete: exist in DB but not in incoming array
      const toDelete = existing.parts.filter(
        (p) => !incomingPartIds.has(p.id)
      );

      // Parts to update: have an id that exists in DB
      const toUpdate = updates.parts.filter(
        (p) => p.id && existingPartIds.has(p.id)
      );

      // Parts to create: no id
      const toCreate = updates.parts.filter((p) => !p.id);

      const batchOps = [];

      // Delete removed parts
      for (const part of toDelete) {
        batchOps.push(
          this.db
            .delete(assessmentParts)
            .where(eq(assessmentParts.id, part.id))
        );
      }

      // Update existing parts
      for (const part of toUpdate) {
        const orderIndex = updates.parts.indexOf(part);
        batchOps.push(
          this.db
            .update(assessmentParts)
            .set({
              name: part.name,
              instructions: part.instructions,
              evidenceDescription: part.evidenceDescription,
              required: part.required,
              orderIndex,
              updatedAt: now,
            })
            .where(eq(assessmentParts.id, part.id!))
        );
      }

      // Create new parts
      for (const part of toCreate) {
        const orderIndex = updates.parts.indexOf(part);
        batchOps.push(
          this.db.insert(assessmentParts).values({
            id: `part_${alphanumericId()}`,
            assessmentDefinitionId: id,
            name: part.name,
            instructions: part.instructions,
            evidenceDescription: part.evidenceDescription,
            required: part.required,
            orderIndex,
            createdAt: now,
            updatedAt: now,
          })
        );
      }

      if (batchOps.length > 0) {
        await this.db.batch(batchOps as any);
      }
    }

    // Return refreshed definition
    return this.getDefinition(id, orgId);
  }

  /**
   * Archive an assessment definition.
   */
  async archiveDefinition(id: string, orgId: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(assessmentDefinitions)
      .set({ status: "archived", updatedAt: now })
      .where(
        and(
          eq(assessmentDefinitions.id, id),
          eq(assessmentDefinitions.orgId, orgId)
        )
      );
  }

  /**
   * Check if a definition is used by any published or paused jobs.
   */
  async isDefinitionUsedByPublishedJobs(id: string): Promise<boolean> {
    const rows = await this.db
      .select({ jobId: jobAssessments.jobId })
      .from(jobAssessments)
      .innerJoin(jobs, eq(jobAssessments.jobId, jobs.id))
      .where(
        and(
          eq(jobAssessments.assessmentDefinitionId, id),
          inArray(jobs.status, ["published", "paused"])
        )
      )
      .limit(1)
      .all();

    return rows.length > 0;
  }

  // ===========================================================================
  // JOB ASSESSMENTS
  // ===========================================================================

  /**
   * Set (upsert) the assessment for a job.
   */
  async setJobAssessment(
    jobId: string,
    assessmentDefinitionId: string
  ): Promise<JobAssessment> {
    const now = new Date().toISOString();

    // Check if job already has an assessment
    const existing = await this.db
      .select()
      .from(jobAssessments)
      .where(eq(jobAssessments.jobId, jobId))
      .get();

    if (existing) {
      // Replace: update the existing row
      await this.db
        .update(jobAssessments)
        .set({
          assessmentDefinitionId,
          snapshot: null,
          snapshotAt: null,
          updatedAt: now,
        })
        .where(eq(jobAssessments.jobId, jobId));

      return {
        ...existing,
        assessmentDefinitionId,
        snapshot: null,
        snapshotAt: null,
        updatedAt: now,
      };
    }

    // Create new
    const record: NewJobAssessment = {
      id: `ja_${alphanumericId()}`,
      jobId,
      assessmentDefinitionId,
      snapshot: null,
      snapshotAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(jobAssessments).values(record);

    return record as JobAssessment;
  }

  /**
   * Get the assessment linked to a job.
   */
  async getJobAssessment(jobId: string): Promise<JobAssessment | null> {
    const result = await this.db
      .select()
      .from(jobAssessments)
      .where(eq(jobAssessments.jobId, jobId))
      .get();

    return result ?? null;
  }

  /**
   * Get job assessment with definition and parts.
   * If a snapshot exists, returns snapshot data instead of live definition.
   */
  async getJobAssessmentWithDefinition(
    jobId: string
  ): Promise<JobAssessmentWithDefinition | null> {
    const ja = await this.getJobAssessment(jobId);
    if (!ja) {
      return null;
    }

    // If snapshot exists, use snapshot data
    if (ja.snapshot) {
      const snapshotData = JSON.parse(ja.snapshot) as {
        definition: AssessmentDefinition;
        parts: AssessmentPart[];
      };
      return {
        jobAssessment: ja,
        definition: snapshotData.definition,
        parts: snapshotData.parts,
      };
    }

    // Otherwise fetch live definition and parts
    const definition = await this.db
      .select()
      .from(assessmentDefinitions)
      .where(eq(assessmentDefinitions.id, ja.assessmentDefinitionId))
      .get();

    const parts = definition
      ? await this.db
          .select()
          .from(assessmentParts)
          .where(
            eq(assessmentParts.assessmentDefinitionId, definition.id)
          )
          .orderBy(assessmentParts.orderIndex)
          .all()
      : [];

    return {
      jobAssessment: ja,
      definition: definition ?? null,
      parts,
    };
  }

  /**
   * Remove the assessment from a job.
   */
  async removeJobAssessment(jobId: string): Promise<void> {
    await this.db
      .delete(jobAssessments)
      .where(eq(jobAssessments.jobId, jobId));
  }

  /**
   * Create a snapshot of the current definition + parts for a job's assessment.
   * Called when a job is published, to freeze the assessment content.
   */
  async createSnapshot(jobId: string): Promise<void> {
    const now = new Date().toISOString();

    const ja = await this.getJobAssessment(jobId);
    if (!ja) {
      return;
    }

    // Fetch current definition and parts
    const definition = await this.db
      .select()
      .from(assessmentDefinitions)
      .where(eq(assessmentDefinitions.id, ja.assessmentDefinitionId))
      .get();

    if (!definition) {
      return;
    }

    const parts = await this.db
      .select()
      .from(assessmentParts)
      .where(eq(assessmentParts.assessmentDefinitionId, definition.id))
      .orderBy(assessmentParts.orderIndex)
      .all();

    const snapshot = JSON.stringify({ definition, parts });

    await this.db
      .update(jobAssessments)
      .set({ snapshot, snapshotAt: now, updatedAt: now })
      .where(eq(jobAssessments.jobId, jobId));
  }

  // ===========================================================================
  // CANDIDATE ASSESSMENTS
  // ===========================================================================

  /**
   * Create a candidate assessment invitation.
   */
  async createCandidateAssessment(
    applicationId: string,
    jobId: string,
    schedulingConfig: SchedulingConfig
  ): Promise<CandidateAssessment> {
    const now = new Date();
    const nowStr = now.toISOString();

    const scheduleDeadline = new Date(now);
    scheduleDeadline.setDate(
      scheduleDeadline.getDate() + schedulingConfig.scheduleWithinDays
    );

    const record: NewCandidateAssessment = {
      id: `ca_${alphanumericId()}`,
      applicationId,
      jobId,
      status: "invited",
      token: urlSafeToken(),
      tokenExpiresAt: scheduleDeadline.toISOString(),
      invitedAt: nowStr,
      scheduleDeadline: scheduleDeadline.toISOString(),
      createdAt: nowStr,
      updatedAt: nowStr,
    };

    await this.db.insert(candidateAssessments).values(record);

    return record as CandidateAssessment;
  }

  /**
   * Find a candidate assessment by its access token.
   */
  async findByToken(token: string): Promise<CandidateAssessment | null> {
    const result = await this.db
      .select()
      .from(candidateAssessments)
      .where(eq(candidateAssessments.token, token))
      .get();

    return result ?? null;
  }

  /**
   * Find a candidate assessment by application ID.
   */
  async findByApplicationId(
    applicationId: string
  ): Promise<CandidateAssessment | null> {
    const result = await this.db
      .select()
      .from(candidateAssessments)
      .where(eq(candidateAssessments.applicationId, applicationId))
      .get();

    return result ?? null;
  }

  /**
   * Find candidate assessments by job and statuses.
   */
  async findByJobAndStatus(
    jobId: string,
    statuses: string[]
  ): Promise<CandidateAssessment[]> {
    if (statuses.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(candidateAssessments)
      .where(
        and(
          eq(candidateAssessments.jobId, jobId),
          inArray(candidateAssessments.status, statuses as any)
        )
      )
      .all();
  }

  /**
   * Get a candidate assessment with application and job details.
   */
  async getCandidateAssessmentWithDetails(
    id: string
  ): Promise<CandidateAssessmentWithDetails | null> {
    const result = await this.db
      .select({
        assessment: candidateAssessments,
        candidateName: applications.candidateName,
        candidateEmail: applications.candidateEmail,
        jobTitle: jobs.title,
      })
      .from(candidateAssessments)
      .innerJoin(
        applications,
        eq(candidateAssessments.applicationId, applications.id)
      )
      .innerJoin(jobs, eq(candidateAssessments.jobId, jobs.id))
      .where(eq(candidateAssessments.id, id))
      .get();

    if (!result) {
      return null;
    }

    return {
      ...result.assessment,
      candidateName: result.candidateName,
      candidateEmail: result.candidateEmail,
      jobTitle: result.jobTitle,
    };
  }

  /**
   * Update a candidate assessment's status and optional additional fields.
   */
  async updateCandidateAssessmentStatus(
    id: string,
    status: string,
    additionalFields?: Partial<CandidateAssessment>
  ): Promise<void> {
    const now = new Date().toISOString();

    // Strip id from additional fields to avoid unnecessary FK checks
    const { id: _id, ...fields } = additionalFields ?? {};

    await this.db
      .update(candidateAssessments)
      .set({
        ...fields,
        status: status as any,
        updatedAt: now,
      })
      .where(eq(candidateAssessments.id, id));
  }

  /**
   * Delete a candidate assessment record.
   * The onDelete: "cascade" on assessmentFiles handles file DB record cleanup.
   */
  async deleteCandidateAssessment(id: string): Promise<void> {
    await this.db
      .delete(candidateAssessments)
      .where(eq(candidateAssessments.id, id));
  }

  /**
   * Find candidate assessments with expired schedule deadlines.
   * Used by cron to transition status from 'invited' to 'schedule_expired'.
   */
  async getExpiredScheduleDeadlines(): Promise<CandidateAssessment[]> {
    const now = new Date().toISOString();

    return this.db
      .select()
      .from(candidateAssessments)
      .where(
        and(
          eq(candidateAssessments.status, "invited"),
          lt(candidateAssessments.scheduleDeadline, now)
        )
      )
      .all();
  }

  /**
   * Find candidate assessments with expired completion deadlines.
   * Includes a grace period in minutes. Used by cron for 'scheduled'/'in_progress' -> 'expired'.
   */
  async getExpiredCompletionDeadlines(
    graceMinutes: number
  ): Promise<CandidateAssessment[]> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - graceMinutes * 60 * 1000);
    const cutoffStr = cutoff.toISOString();

    return this.db
      .select()
      .from(candidateAssessments)
      .where(
        and(
          inArray(candidateAssessments.status, ["scheduled", "in_progress"]),
          lt(candidateAssessments.completionDeadline, cutoffStr)
        )
      )
      .all();
  }

  /**
   * Cancel all active assessments for a job (e.g., when job is closed).
   * Returns the count of cancelled assessments.
   */
  async cancelActiveAssessmentsByJobId(jobId: string): Promise<number> {
    const now = new Date().toISOString();

    // Find active assessments first
    const active = await this.db
      .select({ id: candidateAssessments.id })
      .from(candidateAssessments)
      .where(
        and(
          eq(candidateAssessments.jobId, jobId),
          inArray(candidateAssessments.status, [
            "invited",
            "scheduled",
            "in_progress",
          ])
        )
      )
      .all();

    if (active.length === 0) {
      return 0;
    }

    const ids = active.map((a) => a.id);

    await this.db
      .update(candidateAssessments)
      .set({
        status: "cancelled",
        cancelReason: "Job closed",
        cancelledAt: now,
        updatedAt: now,
      })
      .where(inArray(candidateAssessments.id, ids));

    return active.length;
  }

  // ===========================================================================
  // ASSESSMENT FILES
  // ===========================================================================

  /**
   * Create an assessment file record.
   */
  async createFile(
    candidateAssessmentId: string,
    partId: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
    r2Key: string
  ): Promise<AssessmentFile> {
    const now = new Date().toISOString();

    const record: NewAssessmentFile = {
      id: `af_${alphanumericId()}`,
      candidateAssessmentId,
      partId,
      fileName,
      fileSize,
      mimeType,
      r2Key,
      uploadedAt: now,
    };

    await this.db.insert(assessmentFiles).values(record);

    return record as AssessmentFile;
  }

  /**
   * Get all files for a candidate assessment, ordered by part and upload time.
   */
  async getFilesForAssessment(
    candidateAssessmentId: string
  ): Promise<AssessmentFile[]> {
    return this.db
      .select()
      .from(assessmentFiles)
      .where(
        eq(assessmentFiles.candidateAssessmentId, candidateAssessmentId)
      )
      .orderBy(assessmentFiles.partId, assessmentFiles.uploadedAt)
      .all();
  }

  /**
   * Get files for a specific part of a candidate assessment.
   */
  async getFilesForPart(
    candidateAssessmentId: string,
    partId: string
  ): Promise<AssessmentFile[]> {
    return this.db
      .select()
      .from(assessmentFiles)
      .where(
        and(
          eq(assessmentFiles.candidateAssessmentId, candidateAssessmentId),
          eq(assessmentFiles.partId, partId)
        )
      )
      .all();
  }

  /**
   * Get a single file by ID.
   */
  async getFileById(fileId: string): Promise<AssessmentFile | null> {
    const result = await this.db
      .select()
      .from(assessmentFiles)
      .where(eq(assessmentFiles.id, fileId))
      .get();

    return result ?? null;
  }

  /**
   * Delete a file and return its R2 key for storage cleanup.
   */
  async deleteFile(fileId: string): Promise<{ r2Key: string } | null> {
    const file = await this.getFileById(fileId);
    if (!file) {
      return null;
    }

    await this.db
      .delete(assessmentFiles)
      .where(eq(assessmentFiles.id, fileId));

    return { r2Key: file.r2Key };
  }

  /**
   * Delete all files for a candidate assessment and return R2 keys for cleanup.
   */
  async deleteFilesByAssessmentId(
    candidateAssessmentId: string
  ): Promise<{ r2Keys: string[] }> {
    const files = await this.getFilesForAssessment(candidateAssessmentId);
    const r2Keys = files.map((f) => f.r2Key);

    if (files.length > 0) {
      await this.db
        .delete(assessmentFiles)
        .where(
          eq(assessmentFiles.candidateAssessmentId, candidateAssessmentId)
        );
    }

    return { r2Keys };
  }
}
