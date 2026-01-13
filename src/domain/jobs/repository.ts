/**
 * Zehire Job Repository
 * =====================
 * Data access layer for jobs table using Drizzle ORM.
 *
 * All D1 queries are encapsulated here for:
 * - Single source of truth for SQL
 * - Easier testing and mocking
 * - Type-safe query results
 */

import type { D1Database } from "@cloudflare/workers-types";
import { and, count, desc, eq, lt, or, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import {
  billingEvents,
  createDb,
  jobs,
  orgs,
  withDbRetry,
  type BillingEventType,
  type Database,
  type Job,
  type JobStatus,
  type PipelineStatus,
} from "../../db";
import { extractPlainText, type TiptapDoc } from "../../lib/tiptap";
import type { JobErrorCode } from "../../types/bindings";
import type { PipelineConfig, PipelineRecommendation } from "../pipeline/types";
import type {
  CreateJobInput,
  JobContextOutput,
  JobListItem,
  RenderedQuestionOutput,
  ResolvedArchetypeOutput,
  UpdateJobInput,
} from "./schemas";

// Alphanumeric-only nanoid for IDs (easier to select/copy)
const alphanumericId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  21
);

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Truncate text at word boundary with ellipsis.
 * Replaces newlines with spaces for single-line display.
 */
function truncateAtWordBoundary(text: string | null, maxLength: number): string | null {
  if (!text) return null;

  // Normalize: replace newlines with spaces, collapse multiple spaces
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  // Find last space before maxLength
  const truncated = normalized.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  // If no space found, just cut at maxLength
  const cutPoint = lastSpace > maxLength * 0.5 ? lastSpace : maxLength;

  return normalized.slice(0, cutPoint).trim() + "...";
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

// =============================================================================
// JOB REPOSITORY CLASS
// =============================================================================

export class JobRepository {
  private db: Database;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  // ===========================================================================
  // CREATE
  // ===========================================================================

  /**
   * Create a new job in draft status with questions_status='none'.
   * Returns the created job row.
   */
  async create(input: CreateJobInput, orgId: string): Promise<Job> {
    const id = alphanumericId();
    const now = new Date().toISOString();

    // Serialize Tiptap document and extract plain text
    const descriptionJson = JSON.stringify(input.description);
    const descriptionText = extractPlainText(input.description as TiptapDoc);

    const [result] = await this.db
      .insert(jobs)
      .values({
        id,
        orgId,
        status: "draft",
        questionsStatus: "none",
        title: input.title,
        description: descriptionJson,
        descriptionText,
        companyName: input.companyName ?? null,
        department: input.department ?? null,
        location: input.location ?? null,
        workType: input.workType,
        employmentType: input.employmentType,
        salaryMin: input.salaryMin ?? null,
        salaryMax: input.salaryMax ?? null,
        salaryCurrency: input.salaryCurrency ?? null,
        regenerationCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!result) {
      throw new Error("Failed to create job: no row returned");
    }

    return result;
  }

  // ===========================================================================
  // READ
  // ===========================================================================

  /**
   * Get a job by ID.
   * Returns null if not found.
   */
  async findById(id: string): Promise<Job | null> {
    const result = await withDbRetry(() =>
      this.db.select().from(jobs).where(eq(jobs.id, id)).get()
    );

    return result ?? null;
  }

  /**
   * Get a job by ID and org ID (for authorization).
   * Returns null if not found or not owned by org.
   */
  async findByIdAndOrg(id: string, orgId: string): Promise<Job | null> {
    const result = await this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.orgId, orgId)))
      .get();

    return result ?? null;
  }

  /**
   * Get a job by public slug (for public endpoint).
   * Only returns published jobs.
   */
  async findBySlug(slug: string): Promise<Job | null> {
    const result = await this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.publicSlug, slug), eq(jobs.status, "published")))
      .get();

    return result ?? null;
  }

  /**
   * Check if a slug is already in use.
   */
  async slugExists(slug: string): Promise<boolean> {
    const result = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.publicSlug, slug))
      .get();

    return result !== undefined;
  }

  // ===========================================================================
  // UPDATE CONTENT
  // ===========================================================================

  /**
   * Update a draft job's content.
   * If title or description changed, resets questions and regeneration count.
   *
   * @returns true if content was changed (questions reset), false otherwise
   */
  async update(
    id: string,
    input: UpdateJobInput,
    currentJob: Job
  ): Promise<{ updated: boolean; contentChanged: boolean }> {
    const now = new Date().toISOString();

    // Determine if content changed (title or description)
    const titleChanged = input.title !== undefined && input.title !== currentJob.title;
    // Compare description by serializing to JSON string
    const newDescJson = input.description ? JSON.stringify(input.description) : undefined;
    const descChanged = newDescJson !== undefined && newDescJson !== currentJob.description;
    const contentChanged = titleChanged || descChanged;

    // Build update object
    const updates: Partial<typeof jobs.$inferInsert> = {};

    if (input.title !== undefined) {
      updates.title = input.title;
    }
    if (input.description !== undefined) {
      updates.description = JSON.stringify(input.description);
      updates.descriptionText = extractPlainText(input.description as TiptapDoc);
    }
    if (input.companyName !== undefined) {
      updates.companyName = input.companyName;
    }
    if (input.department !== undefined) {
      updates.department = input.department;
    }
    if (input.location !== undefined) {
      updates.location = input.location;
    }
    if (input.workType !== undefined) {
      updates.workType = input.workType;
    }
    if (input.employmentType !== undefined) {
      updates.employmentType = input.employmentType;
    }
    if (input.salaryMin !== undefined) {
      updates.salaryMin = input.salaryMin;
    }
    if (input.salaryMax !== undefined) {
      updates.salaryMax = input.salaryMax;
    }
    if (input.salaryCurrency !== undefined) {
      updates.salaryCurrency = input.salaryCurrency;
    }

    if (Object.keys(updates).length === 0) {
      return { updated: false, contentChanged: false };
    }

    // If content changed, reset questions and pipeline
    if (contentChanged) {
      // Reset questions
      updates.questionsStatus = "none";
      updates.jobContext = null;
      updates.archetypes = null;
      updates.questions = null;
      updates.errorMessage = null;
      updates.errorCode = null;
      updates.regenerationCount = 0;
      updates.lastRegenerationAt = null;
      updates.processingStartedAt = null;
      updates.processingDurationMs = null;
      updates.completedAt = null;

      // Reset pipeline
      updates.pipelineStatus = "none";
      updates.pipelineRecommendation = null;
      updates.pipeline = null;
      updates.pipelineError = null;
      updates.pipelineErrorCode = null;
      updates.pipelineRegenerationCount = 0;
      updates.pipelineLastRegenerationAt = null;
      updates.pipelineProcessingStartedAt = null;
      updates.pipelineProcessingDurationMs = null;
      updates.pipelineGeneratedAt = null;
    }

    updates.updatedAt = now;

    await this.db
      .update(jobs)
      .set(updates)
      .where(and(eq(jobs.id, id), eq(jobs.status, "draft")));

    return { updated: true, contentChanged };
  }

  // ===========================================================================
  // QUESTIONS STATUS UPDATES
  // ===========================================================================

  /**
   * Mark job's questions as pending (queued for generation).
   */
  async markQuestionsPending(id: string): Promise<void> {
    const now = new Date().toISOString();

    await withDbRetry(() =>
      this.db
        .update(jobs)
        .set({
          questionsStatus: "pending",
          errorMessage: null,
          errorCode: null,
          updatedAt: now,
        })
        .where(and(eq(jobs.id, id), eq(jobs.status, "draft")))
    );
  }

  /**
   * Mark job's questions as processing.
   * Called at the start of the LLM pipeline.
   */
  async markQuestionsProcessing(id: string): Promise<void> {
    const now = new Date().toISOString();

    await withDbRetry(() =>
      this.db
        .update(jobs)
        .set({
          questionsStatus: "processing",
          processingStartedAt: now,
          updatedAt: now,
        })
        .where(and(eq(jobs.id, id), eq(jobs.questionsStatus, "pending")))
    );
  }

  /**
   * Mark job's questions as completed with results.
   * Called after successful LLM pipeline completion.
   */
  async markQuestionsCompleted(
    id: string,
    results: {
      jobContext: JobContextOutput;
      archetypes: ResolvedArchetypeOutput[];
      questions: RenderedQuestionOutput[];
      processingDurationMs: number;
    }
  ): Promise<void> {
    const now = new Date().toISOString();

    await withDbRetry(() =>
      this.db
        .update(jobs)
        .set({
          questionsStatus: "completed",
          jobContext: JSON.stringify(results.jobContext),
          archetypes: JSON.stringify(results.archetypes),
          questions: JSON.stringify(results.questions),
          processingDurationMs: results.processingDurationMs,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(jobs.id, id))
    );
  }

  /**
   * Mark job's questions as failed with error details.
   * Called when LLM pipeline fails with a permanent error.
   */
  async markQuestionsFailed(
    id: string,
    error: {
      message: string;
      code: JobErrorCode;
    }
  ): Promise<void> {
    const now = new Date().toISOString();

    await withDbRetry(() =>
      this.db
        .update(jobs)
        .set({
          questionsStatus: "failed",
          errorMessage: error.message,
          errorCode: error.code,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(jobs.id, id))
    );
  }

  /**
   * Reset job's questions status back to pending for queue retry.
   * Called when LLM pipeline fails with a transient/retryable error.
   * Decrements regeneration_count since the attempt didn't really count.
   */
  async resetQuestionsForRetry(id: string): Promise<void> {
    const now = new Date().toISOString();

    await withDbRetry(() =>
      this.db
        .update(jobs)
        .set({
          questionsStatus: "pending",
          regenerationCount: sql`MAX(0, ${jobs.regenerationCount} - 1)`,
          processingStartedAt: null,
          errorMessage: null,
          errorCode: null,
          updatedAt: now,
        })
        .where(eq(jobs.id, id))
    );
  }

  // ===========================================================================
  // PIPELINE STATUS UPDATES
  // ===========================================================================

  /**
   * Mark job's pipeline as pending (queued for generation).
   */
  async markPipelinePending(id: string): Promise<void> {
    const now = new Date().toISOString();

    await withDbRetry(() =>
      this.db
        .update(jobs)
        .set({
          pipelineStatus: "pending",
          pipelineError: null,
          pipelineErrorCode: null,
          updatedAt: now,
        })
        .where(and(eq(jobs.id, id), eq(jobs.status, "draft")))
    );
  }

  /**
   * Mark job's pipeline as processing.
   * Called at the start of pipeline generation.
   */
  async markPipelineProcessing(id: string): Promise<void> {
    const now = new Date().toISOString();

    await withDbRetry(() =>
      this.db
        .update(jobs)
        .set({
          pipelineStatus: "processing",
          pipelineProcessingStartedAt: now,
          updatedAt: now,
        })
        .where(and(eq(jobs.id, id), eq(jobs.pipelineStatus, "pending")))
    );
  }

  /**
   * Mark job's pipeline as completed with results.
   * Called after successful pipeline generation.
   */
  async markPipelineCompleted(
    id: string,
    results: {
      recommendation: PipelineRecommendation;
      config: PipelineConfig;
      processingDurationMs: number;
    }
  ): Promise<void> {
    const now = new Date().toISOString();

    await withDbRetry(() =>
      this.db
        .update(jobs)
        .set({
          pipelineStatus: "completed",
          pipelineRecommendation: JSON.stringify(results.recommendation),
          pipeline: JSON.stringify(results.config),
          pipelineProcessingDurationMs: results.processingDurationMs,
          pipelineGeneratedAt: now,
          updatedAt: now,
        })
        .where(eq(jobs.id, id))
    );
  }

  /**
   * Mark job's pipeline as failed with error details.
   * Called when pipeline generation fails with a permanent error.
   */
  async markPipelineFailed(
    id: string,
    error: {
      message: string;
      code: JobErrorCode;
    }
  ): Promise<void> {
    const now = new Date().toISOString();

    await withDbRetry(() =>
      this.db
        .update(jobs)
        .set({
          pipelineStatus: "failed",
          pipelineError: error.message,
          pipelineErrorCode: error.code,
          pipelineGeneratedAt: now,
          updatedAt: now,
        })
        .where(eq(jobs.id, id))
    );
  }

  /**
   * Reset job's pipeline status back to pending for queue retry.
   * Called when pipeline generation fails with a transient/retryable error.
   * Decrements pipeline_regeneration_count since the attempt didn't really count.
   */
  async resetPipelineForRetry(id: string): Promise<void> {
    const now = new Date().toISOString();

    await withDbRetry(() =>
      this.db
        .update(jobs)
        .set({
          pipelineStatus: "pending",
          pipelineRegenerationCount: sql`MAX(0, ${jobs.pipelineRegenerationCount} - 1)`,
          pipelineProcessingStartedAt: null,
          pipelineError: null,
          pipelineErrorCode: null,
          updatedAt: now,
        })
        .where(eq(jobs.id, id))
    );
  }

  /**
   * Update pipeline configuration (recruiter edits).
   * Only allowed for draft jobs.
   */
  async updatePipelineConfig(id: string, config: PipelineConfig): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(jobs)
      .set({
        pipeline: JSON.stringify(config),
        updatedAt: now,
      })
      .where(and(eq(jobs.id, id), eq(jobs.status, "draft")));
  }

  // ===========================================================================
  // LIFECYCLE STATUS UPDATES
  // ===========================================================================

  /**
   * Publish a draft job.
   * Requires BOTH questions_status = 'completed' AND pipeline_status = 'completed'.
   */
  async publish(id: string, publicSlug: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(jobs)
      .set({
        status: "published",
        publicSlug,
        publishedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.id, id),
          eq(jobs.status, "draft"),
          eq(jobs.questionsStatus, "completed"),
          eq(jobs.pipelineStatus, "completed")
        )
      );
  }

  /**
   * Pause a published job.
   */
  async pause(id: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(jobs)
      .set({
        status: "paused",
        updatedAt: now,
      })
      .where(and(eq(jobs.id, id), eq(jobs.status, "published")));
  }

  /**
   * Resume a paused job (back to published).
   */
  async resume(id: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(jobs)
      .set({
        status: "published",
        updatedAt: now,
      })
      .where(and(eq(jobs.id, id), eq(jobs.status, "paused")));
  }

  /**
   * Close a job permanently.
   * Can close published or paused jobs.
   */
  async close(id: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(jobs)
      .set({
        status: "closed",
        closedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.id, id),
          or(eq(jobs.status, "published"), eq(jobs.status, "paused"))
        )
      );
  }

  /**
   * Delete a draft job.
   * Only drafts can be deleted.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.status, "draft")))
      .returning({ id: jobs.id });

    return result.length > 0;
  }

  // ===========================================================================
  // LIST (PAGINATED)
  // ===========================================================================

  /**
   * List jobs for an organization with cursor-based pagination.
   *
   * @param orgId - Organization ID
   * @param options - Pagination and filter options
   */
  async list(
    orgId: string,
    options?: { limit?: number; cursor?: string; status?: JobStatus }
  ): Promise<{ jobs: JobListItem[]; nextCursor: string | null }> {
    const limit = Math.min(options?.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);

    // Decode cursor if provided
    let cursorCreatedAt: string | null = null;
    let cursorId: string | null = null;

    if (options?.cursor) {
      try {
        const decoded = JSON.parse(atob(options.cursor)) as { c: string; i: string };
        cursorCreatedAt = decoded.c;
        cursorId = decoded.i;
      } catch {
        // Invalid cursor - start from beginning
      }
    }

    // Build conditions
    const conditions = [eq(jobs.orgId, orgId)];

    if (options?.status) {
      conditions.push(eq(jobs.status, options.status));
    }

    if (cursorCreatedAt && cursorId) {
      conditions.push(
        or(
          lt(jobs.createdAt, cursorCreatedAt),
          and(eq(jobs.createdAt, cursorCreatedAt), lt(jobs.id, cursorId))
        )!
      );
    }

    const rows = await this.db
      .select({
        id: jobs.id,
        title: jobs.title,
        status: jobs.status,
        questionsStatus: jobs.questionsStatus,
        pipelineStatus: jobs.pipelineStatus,
        publicSlug: jobs.publicSlug,
        companyName: jobs.companyName,
        workType: jobs.workType,
        employmentType: jobs.employmentType,
        department: jobs.department,
        location: jobs.location,
        salaryMin: jobs.salaryMin,
        salaryMax: jobs.salaryMax,
        salaryCurrency: jobs.salaryCurrency,
        descriptionText: jobs.descriptionText,
        createdAt: jobs.createdAt,
        publishedAt: jobs.publishedAt,
      })
      .from(jobs)
      .where(and(...conditions))
      .orderBy(desc(jobs.createdAt), desc(jobs.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    // Build next cursor
    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1];
      if (lastRow) {
        nextCursor = btoa(JSON.stringify({ c: lastRow.createdAt, i: lastRow.id }));
      }
    }

    // Transform to API format
    const jobList: JobListItem[] = pageRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      questionsStatus: row.questionsStatus,
      pipelineStatus: (row.pipelineStatus ?? "none") as PipelineStatus,
      publicSlug: row.publicSlug,
      companyName: row.companyName,
      workType: row.workType,
      employmentType: row.employmentType,
      department: row.department,
      location: row.location,
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      salaryCurrency: row.salaryCurrency,
      descriptionPreview: truncateAtWordBoundary(row.descriptionText, 150),
      createdAt: row.createdAt,
      publishedAt: row.publishedAt,
    }));

    return { jobs: jobList, nextCursor };
  }

  // ===========================================================================
  // ADMIN/MONITORING QUERIES
  // ===========================================================================

  /**
   * Get job counts by visibility status.
   */
  async getStatusCounts(): Promise<Record<JobStatus, number>> {
    const result = await this.db
      .select({
        status: jobs.status,
        count: count(),
      })
      .from(jobs)
      .groupBy(jobs.status);

    const counts: Record<JobStatus, number> = {
      draft: 0,
      published: 0,
      paused: 0,
      closed: 0,
    };

    for (const row of result) {
      counts[row.status] = row.count;
    }

    return counts;
  }

  /**
   * Get stuck jobs (questions processing for too long).
   */
  async findStuckJobs(maxProcessingMinutes: number = 5): Promise<Job[]> {
    const cutoffTime = new Date(Date.now() - maxProcessingMinutes * 60 * 1000).toISOString();

    const result = await this.db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.questionsStatus, "processing"),
          lt(jobs.processingStartedAt, cutoffTime)
        )
      )
      .orderBy(jobs.processingStartedAt);

    return result;
  }

  /**
   * Get stuck pipeline jobs (pipeline processing for too long).
   */
  async findStuckPipelineJobs(maxProcessingMinutes: number = 5): Promise<Job[]> {
    const cutoffTime = new Date(Date.now() - maxProcessingMinutes * 60 * 1000).toISOString();

    const result = await this.db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.pipelineStatus, "processing"),
          lt(jobs.pipelineProcessingStartedAt, cutoffTime)
        )
      )
      .orderBy(jobs.pipelineProcessingStartedAt);

    return result;
  }
}

// =============================================================================
// ORG REPOSITORY
// =============================================================================

// =============================================================================
// CAPACITY TYPES
// =============================================================================

/**
 * Organization capacity and billing info.
 */
export interface OrgCapacityInfo {
  activeRoleCapacity: number;
  billingWaived: boolean;
  billingWaivedReason: string | null;
  billingWaivedUntil: string | null;
}

/**
 * Capacity status (computed, not stored).
 * Used for UI warnings and enforcement.
 */
export interface CapacityStatus {
  /** Current count of published + paused jobs */
  activeRoles: number;
  /** Max allowed from org.active_role_capacity */
  capacity: number;
  /** activeRoles > capacity (soft state, no enforcement) */
  isOverCapacity: boolean;
  /** activeRoles < capacity (can publish/resume) */
  canActivate: boolean;
}

// =============================================================================
// ORG REPOSITORY
// =============================================================================

/**
 * Organization repository for capacity and cache operations.
 */
export class OrgRepository {
  private db: Database;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  // ===========================================================================
  // CACHE VERSIONING
  // ===========================================================================

  /**
   * Get jobs_list_version for an organization.
   */
  async getJobsListVersion(orgId: string): Promise<number> {
    const result = await this.db
      .select({ jobsListVersion: orgs.jobsListVersion })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .get();

    return result?.jobsListVersion ?? 1;
  }

  /**
   * Increment jobs_list_version for an organization.
   */
  async incrementJobsListVersion(orgId: string): Promise<void> {
    await this.db
      .update(orgs)
      .set({
        jobsListVersion: sql`${orgs.jobsListVersion} + 1`,
        updatedAt: sql`strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
      })
      .where(eq(orgs.id, orgId));
  }

  // ===========================================================================
  // CAPACITY MANAGEMENT
  // ===========================================================================

  /**
   * Get organization capacity and billing info.
   */
  async getCapacityInfo(orgId: string): Promise<OrgCapacityInfo | null> {
    const result = await this.db
      .select({
        activeRoleCapacity: orgs.activeRoleCapacity,
        billingWaived: orgs.billingWaived,
        billingWaivedReason: orgs.billingWaivedReason,
        billingWaivedUntil: orgs.billingWaivedUntil,
      })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .get();

    if (!result) return null;

    return {
      activeRoleCapacity: result.activeRoleCapacity,
      billingWaived: result.billingWaived === 1,
      billingWaivedReason: result.billingWaivedReason,
      billingWaivedUntil: result.billingWaivedUntil,
    };
  }

  /**
   * Get count of active roles (published + paused) for an organization.
   * Active role = Zehire is "on the hook" for evaluative work.
   */
  async getActiveRoleCount(orgId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(jobs)
      .where(
        and(
          eq(jobs.orgId, orgId),
          or(eq(jobs.status, "published"), eq(jobs.status, "paused"))
        )
      )
      .get();

    return result?.count ?? 0;
  }

  /**
   * Get full capacity status for an organization.
   * Combines capacity info and active role count.
   */
  async getCapacityStatus(orgId: string): Promise<CapacityStatus> {
    // Run both queries in parallel
    const [capacityInfo, activeRoles] = await Promise.all([
      this.getCapacityInfo(orgId),
      this.getActiveRoleCount(orgId),
    ]);

    const capacity = capacityInfo?.activeRoleCapacity ?? 3;

    return {
      activeRoles,
      capacity,
      isOverCapacity: activeRoles > capacity,
      canActivate: activeRoles < capacity,
    };
  }

  /**
   * Update organization's active role capacity.
   * Used for sales upsell.
   */
  async updateCapacity(orgId: string, newCapacity: number): Promise<void> {
    await this.db
      .update(orgs)
      .set({
        activeRoleCapacity: newCapacity,
        updatedAt: sql`strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
      })
      .where(eq(orgs.id, orgId));
  }

  /**
   * Set billing waiver for an organization.
   * Used for founding access.
   */
  async setBillingWaiver(
    orgId: string,
    waived: boolean,
    reason?: string,
    until?: string
  ): Promise<void> {
    await this.db
      .update(orgs)
      .set({
        billingWaived: waived ? 1 : 0,
        billingWaivedReason: reason ?? null,
        billingWaivedUntil: until ?? null,
        updatedAt: sql`strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
      })
      .where(eq(orgs.id, orgId));
  }
}

// =============================================================================
// BILLING EVENT TYPES
// =============================================================================

/**
 * Billing event types.
 *
 * - activated: Job first published (billing starts)
 * - paused: Job paused (audit only, still active for billing)
 * - resumed: Job resumed from pause (audit only)
 * - deactivated: Job closed (billing ends)
 */
export const BILLING_EVENT_TYPES = [
  "activated",
  "paused",
  "resumed",
  "deactivated",
] as const;

/**
 * Billing event record (API format).
 */
export interface BillingEventRecord {
  id: string;
  orgId: string;
  jobId: string;
  eventType: BillingEventType;
  occurredAt: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Input for recording a billing event.
 */
export interface RecordBillingEventInput {
  orgId: string;
  jobId: string;
  eventType: BillingEventType;
  occurredAt?: string; // Defaults to now
  metadata?: Record<string, unknown>;
}

// =============================================================================
// BILLING EVENT REPOSITORY
// =============================================================================

/**
 * Repository for billing event operations.
 * Events are immutable - insert only, no updates or deletes.
 */
export class BillingEventRepository {
  private db: Database;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  /**
   * Record a billing event.
   */
  async record(input: RecordBillingEventInput): Promise<BillingEventRecord> {
    const id = `evt${alphanumericId()}`;
    const occurredAt =
      input.occurredAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const metadata = input.metadata ? JSON.stringify(input.metadata) : null;
    const now = new Date().toISOString();

    await this.db.insert(billingEvents).values({
      id,
      orgId: input.orgId,
      jobId: input.jobId,
      eventType: input.eventType,
      occurredAt,
      metadata,
      createdAt: now,
    });

    return {
      id,
      orgId: input.orgId,
      jobId: input.jobId,
      eventType: input.eventType,
      occurredAt,
      metadata: input.metadata ?? null,
      createdAt: now,
    };
  }

  /**
   * Get all billing events for a job.
   */
  async getByJobId(jobId: string): Promise<BillingEventRecord[]> {
    const result = await this.db
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.jobId, jobId))
      .orderBy(billingEvents.occurredAt);

    return result.map((row) => ({
      id: row.id,
      orgId: row.orgId,
      jobId: row.jobId,
      eventType: row.eventType,
      occurredAt: row.occurredAt,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Get billing events for an org within a time range.
   * Used for billing period calculation.
   */
  async getByOrgInRange(
    orgId: string,
    startDate: string,
    endDate: string
  ): Promise<BillingEventRecord[]> {
    const result = await this.db
      .select()
      .from(billingEvents)
      .where(
        and(
          eq(billingEvents.orgId, orgId),
          sql`${billingEvents.occurredAt} >= ${startDate}`,
          sql`${billingEvents.occurredAt} < ${endDate}`
        )
      )
      .orderBy(billingEvents.occurredAt);

    return result.map((row) => ({
      id: row.id,
      orgId: row.orgId,
      jobId: row.jobId,
      eventType: row.eventType,
      occurredAt: row.occurredAt,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Get the most recent event for a job.
   * Useful for determining current billing state.
   */
  async getLatestByJobId(jobId: string): Promise<BillingEventRecord | null> {
    const result = await this.db
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.jobId, jobId))
      .orderBy(desc(billingEvents.occurredAt))
      .limit(1)
      .get();

    if (!result) return null;

    return {
      id: result.id,
      orgId: result.orgId,
      jobId: result.jobId,
      eventType: result.eventType,
      occurredAt: result.occurredAt,
      metadata: result.metadata ? JSON.parse(result.metadata) : null,
      createdAt: result.createdAt,
    };
  }
}
