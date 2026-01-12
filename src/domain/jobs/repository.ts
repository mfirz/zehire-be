/**
 * Zehire Job Repository
 * =====================
 * Data access layer for jobs table.
 *
 * All D1 queries are encapsulated here for:
 * - Single source of truth for SQL
 * - Easier testing and mocking
 * - Type-safe query results
 */

import type { D1Database, D1Result } from "@cloudflare/workers-types";
import { customAlphabet } from "nanoid";

import { extractPlainText, type TiptapDoc } from "../../lib/tiptap";
import type { JobErrorCode, JobStatus, PipelineStatus, QuestionsStatus } from "../../types/bindings";

// Alphanumeric-only nanoid for IDs (easier to select/copy)
const alphanumericId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  21
);
import type { PipelineConfig, PipelineRecommendation } from "../pipeline/types";
import type {
  CreateJobInput,
  JobContextOutput,
  JobListItem,
  JobRow,
  RenderedQuestionOutput,
  ResolvedArchetypeOutput,
  UpdateJobInput,
} from "./schemas";

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

/**
 * Check if an error is a D1/SQLite lock error.
 */
function isDbLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("1031") ||
    message.includes("SQLITE_BUSY") ||
    message.includes("database is locked") ||
    message.includes("Database busy")
  );
}

/**
 * Retry a database operation with exponential backoff + jitter.
 * Handles D1 lock contention in local dev and production edge cases.
 *
 * Uses 5 retries with 150ms base delay to handle "cold start" scenarios
 * where DB needs time to wake up after being idle.
 *
 * Adds random jitter (0-50% of delay) to desynchronize concurrent retries,
 * preventing multiple processors from colliding repeatedly.
 */
async function withDbRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 5,
  baseDelayMs = 150
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isDbLockError(error) || attempt === maxRetries - 1) {
        throw error;
      }

      // Exponential backoff with jitter to desynchronize concurrent retries
      const baseDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * baseDelay * 0.5; // 0-50% jitter
      const delay = Math.round(baseDelay + jitter);
      console.log(`[DB] Lock detected, retry ${attempt + 1}/${maxRetries} in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
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
  constructor(private readonly db: D1Database) {}

  // ===========================================================================
  // CREATE
  // ===========================================================================

  /**
   * Create a new job in draft status with questions_status='none'.
   * Returns the created job row.
   */
  async create(input: CreateJobInput, orgId: string): Promise<JobRow> {
    const id = alphanumericId();
    const now = new Date().toISOString();

    // Serialize Tiptap document and extract plain text
    const descriptionJson = JSON.stringify(input.description);
    const descriptionText = extractPlainText(input.description as TiptapDoc);

    const result = await this.db
      .prepare(
        `
        INSERT INTO jobs (
          id, org_id, status, questions_status,
          title, description, description_text, company_name, department, location,
          work_type, employment_type,
          salary_min, salary_max, salary_currency,
          regeneration_count,
          created_at, updated_at
        )
        VALUES (?, ?, 'draft', 'none', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        RETURNING *
        `
      )
      .bind(
        id,
        orgId,
        input.title,
        descriptionJson,
        descriptionText,
        input.companyName ?? null,
        input.department ?? null,
        input.location ?? null,
        input.workType,
        input.employmentType,
        input.salaryMin ?? null,
        input.salaryMax ?? null,
        input.salaryCurrency ?? null,
        now,
        now
      )
      .first<JobRow>();

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
  async findById(id: string): Promise<JobRow | null> {
    const result = await withDbRetry(() =>
      this.db.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first<JobRow>()
    );

    return result ?? null;
  }

  /**
   * Get a job by ID and org ID (for authorization).
   * Returns null if not found or not owned by org.
   */
  async findByIdAndOrg(id: string, orgId: string): Promise<JobRow | null> {
    const result = await this.db
      .prepare("SELECT * FROM jobs WHERE id = ? AND org_id = ?")
      .bind(id, orgId)
      .first<JobRow>();

    return result ?? null;
  }

  /**
   * Get a job by public slug (for public endpoint).
   * Only returns published jobs.
   */
  async findBySlug(slug: string): Promise<JobRow | null> {
    const result = await this.db
      .prepare("SELECT * FROM jobs WHERE public_slug = ? AND status = 'published'")
      .bind(slug)
      .first<JobRow>();

    return result ?? null;
  }

  /**
   * Check if a slug is already in use.
   */
  async slugExists(slug: string): Promise<boolean> {
    const result = await this.db
      .prepare("SELECT 1 FROM jobs WHERE public_slug = ?")
      .bind(slug)
      .first();

    return result !== null;
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
    currentJob: JobRow
  ): Promise<{ updated: boolean; contentChanged: boolean }> {
    const now = new Date().toISOString();

    // Determine if content changed (title or description)
    const titleChanged = input.title !== undefined && input.title !== currentJob.title;
    // Compare description by serializing to JSON string
    const newDescJson = input.description ? JSON.stringify(input.description) : undefined;
    const descChanged = newDescJson !== undefined && newDescJson !== currentJob.description;
    const contentChanged = titleChanged || descChanged;

    // Build update fields
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.title !== undefined) {
      updates.push("title = ?");
      values.push(input.title);
    }
    if (input.description !== undefined) {
      // Serialize Tiptap doc and extract plain text
      const descriptionJson = JSON.stringify(input.description);
      const descriptionText = extractPlainText(input.description as TiptapDoc);
      updates.push("description = ?");
      values.push(descriptionJson);
      updates.push("description_text = ?");
      values.push(descriptionText);
    }
    if (input.companyName !== undefined) {
      updates.push("company_name = ?");
      values.push(input.companyName);
    }
    if (input.department !== undefined) {
      updates.push("department = ?");
      values.push(input.department);
    }
    if (input.location !== undefined) {
      updates.push("location = ?");
      values.push(input.location);
    }
    if (input.workType !== undefined) {
      updates.push("work_type = ?");
      values.push(input.workType);
    }
    if (input.employmentType !== undefined) {
      updates.push("employment_type = ?");
      values.push(input.employmentType);
    }
    if (input.salaryMin !== undefined) {
      updates.push("salary_min = ?");
      values.push(input.salaryMin);
    }
    if (input.salaryMax !== undefined) {
      updates.push("salary_max = ?");
      values.push(input.salaryMax);
    }
    if (input.salaryCurrency !== undefined) {
      updates.push("salary_currency = ?");
      values.push(input.salaryCurrency);
    }

    if (updates.length === 0) {
      return { updated: false, contentChanged: false };
    }

    // If content changed, reset questions and pipeline
    if (contentChanged) {
      // Reset questions
      updates.push("questions_status = 'none'");
      updates.push("job_context = NULL");
      updates.push("archetypes = NULL");
      updates.push("questions = NULL");
      updates.push("error_message = NULL");
      updates.push("error_code = NULL");
      updates.push("regeneration_count = 0");
      updates.push("last_regeneration_at = NULL");
      updates.push("processing_started_at = NULL");
      updates.push("processing_duration_ms = NULL");
      updates.push("completed_at = NULL");

      // Reset pipeline
      updates.push("pipeline_status = 'none'");
      updates.push("pipeline_recommendation = NULL");
      updates.push("pipeline = NULL");
      updates.push("pipeline_error = NULL");
      updates.push("pipeline_error_code = NULL");
      updates.push("pipeline_regeneration_count = 0");
      updates.push("pipeline_last_regeneration_at = NULL");
      updates.push("pipeline_processing_started_at = NULL");
      updates.push("pipeline_processing_duration_ms = NULL");
      updates.push("pipeline_generated_at = NULL");
    }

    updates.push("updated_at = ?");
    values.push(now);

    // Add ID for WHERE clause
    values.push(id);

    await this.db
      .prepare(`UPDATE jobs SET ${updates.join(", ")} WHERE id = ? AND status = 'draft'`)
      .bind(...values)
      .run();

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
        .prepare(
          `
        UPDATE jobs
        SET questions_status = 'pending',
            error_message = NULL,
            error_code = NULL,
            updated_at = ?
        WHERE id = ? AND status = 'draft'
        `
        )
        .bind(now, id)
        .run()
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
        .prepare(
          `
        UPDATE jobs
        SET questions_status = 'processing',
            processing_started_at = ?,
            updated_at = ?
        WHERE id = ? AND questions_status = 'pending'
        `
        )
        .bind(now, now, id)
        .run()
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
        .prepare(
          `
        UPDATE jobs
        SET questions_status = 'completed',
            job_context = ?,
            archetypes = ?,
            questions = ?,
            processing_duration_ms = ?,
            completed_at = ?,
            updated_at = ?
        WHERE id = ?
        `
        )
        .bind(
          JSON.stringify(results.jobContext),
          JSON.stringify(results.archetypes),
          JSON.stringify(results.questions),
          results.processingDurationMs,
          now,
          now,
          id
        )
        .run()
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
        .prepare(
          `
        UPDATE jobs
        SET questions_status = 'failed',
            error_message = ?,
            error_code = ?,
            completed_at = ?,
            updated_at = ?
        WHERE id = ?
        `
        )
        .bind(error.message, error.code, now, now, id)
        .run()
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
        .prepare(
          `
        UPDATE jobs
        SET questions_status = 'pending',
            regeneration_count = MAX(0, regeneration_count - 1),
            processing_started_at = NULL,
            error_message = NULL,
            error_code = NULL,
            updated_at = ?
        WHERE id = ?
        `
        )
        .bind(now, id)
        .run()
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
        .prepare(
          `
        UPDATE jobs
        SET pipeline_status = 'pending',
            pipeline_error = NULL,
            pipeline_error_code = NULL,
            updated_at = ?
        WHERE id = ? AND status = 'draft'
        `
        )
        .bind(now, id)
        .run()
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
        .prepare(
          `
        UPDATE jobs
        SET pipeline_status = 'processing',
            pipeline_processing_started_at = ?,
            updated_at = ?
        WHERE id = ? AND pipeline_status = 'pending'
        `
        )
        .bind(now, now, id)
        .run()
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
        .prepare(
          `
        UPDATE jobs
        SET pipeline_status = 'completed',
            pipeline_recommendation = ?,
            pipeline = ?,
            pipeline_processing_duration_ms = ?,
            pipeline_generated_at = ?,
            updated_at = ?
        WHERE id = ?
        `
        )
        .bind(
          JSON.stringify(results.recommendation),
          JSON.stringify(results.config),
          results.processingDurationMs,
          now,
          now,
          id
        )
        .run()
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
        .prepare(
          `
        UPDATE jobs
        SET pipeline_status = 'failed',
            pipeline_error = ?,
            pipeline_error_code = ?,
            pipeline_generated_at = ?,
            updated_at = ?
        WHERE id = ?
        `
        )
        .bind(error.message, error.code, now, now, id)
        .run()
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
        .prepare(
          `
        UPDATE jobs
        SET pipeline_status = 'pending',
            pipeline_regeneration_count = MAX(0, pipeline_regeneration_count - 1),
            pipeline_processing_started_at = NULL,
            pipeline_error = NULL,
            pipeline_error_code = NULL,
            updated_at = ?
        WHERE id = ?
        `
        )
        .bind(now, id)
        .run()
    );
  }

  /**
   * Update pipeline configuration (recruiter edits).
   * Only allowed for draft jobs.
   */
  async updatePipelineConfig(id: string, config: PipelineConfig): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `
        UPDATE jobs
        SET pipeline = ?,
            updated_at = ?
        WHERE id = ? AND status = 'draft'
        `
      )
      .bind(JSON.stringify(config), now, id)
      .run();
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
      .prepare(
        `
        UPDATE jobs
        SET status = 'published',
            public_slug = ?,
            published_at = ?,
            updated_at = ?
        WHERE id = ? AND status = 'draft' AND questions_status = 'completed' AND pipeline_status = 'completed'
        `
      )
      .bind(publicSlug, now, now, id)
      .run();
  }

  /**
   * Pause a published job.
   */
  async pause(id: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `
        UPDATE jobs
        SET status = 'paused',
            updated_at = ?
        WHERE id = ? AND status = 'published'
        `
      )
      .bind(now, id)
      .run();
  }

  /**
   * Resume a paused job (back to published).
   */
  async resume(id: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `
        UPDATE jobs
        SET status = 'published',
            updated_at = ?
        WHERE id = ? AND status = 'paused'
        `
      )
      .bind(now, id)
      .run();
  }

  /**
   * Close a job permanently.
   * Can close published or paused jobs.
   */
  async close(id: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `
        UPDATE jobs
        SET status = 'closed',
            closed_at = ?,
            updated_at = ?
        WHERE id = ? AND status IN ('published', 'paused')
        `
      )
      .bind(now, now, id)
      .run();
  }

  /**
   * Delete a draft job.
   * Only drafts can be deleted.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .prepare("DELETE FROM jobs WHERE id = ? AND status = 'draft'")
      .bind(id)
      .run();

    return (result.meta?.changes ?? 0) > 0;
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

    // Build query
    type ListRow = {
      id: string;
      title: string;
      status: JobStatus;
      questions_status: QuestionsStatus;
      pipeline_status: PipelineStatus;
      public_slug: string | null;
      company_name: string | null;
      work_type: string;
      employment_type: string;
      department: string | null;
      location: string | null;
      salary_min: number | null;
      salary_max: number | null;
      salary_currency: string | null;
      description_text: string | null;
      created_at: string;
      published_at: string | null;
    };

    let result: D1Result<ListRow>;

    const statusFilter = options?.status ? `AND status = '${options.status}'` : "";

    if (cursorCreatedAt && cursorId) {
      result = await this.db
        .prepare(
          `
          SELECT id, title, status, questions_status, pipeline_status, public_slug,
                 company_name, work_type, employment_type, department, location,
                 salary_min, salary_max, salary_currency,
                 description_text, created_at, published_at
          FROM jobs
          WHERE org_id = ?
            AND (created_at < ? OR (created_at = ? AND id < ?))
            ${statusFilter}
          ORDER BY created_at DESC, id DESC
          LIMIT ?
          `
        )
        .bind(orgId, cursorCreatedAt, cursorCreatedAt, cursorId, limit + 1)
        .all<ListRow>();
    } else {
      result = await this.db
        .prepare(
          `
          SELECT id, title, status, questions_status, pipeline_status, public_slug,
                 company_name, work_type, employment_type, department, location,
                 salary_min, salary_max, salary_currency,
                 description_text, created_at, published_at
          FROM jobs
          WHERE org_id = ? ${statusFilter}
          ORDER BY created_at DESC, id DESC
          LIMIT ?
          `
        )
        .bind(orgId, limit + 1)
        .all<ListRow>();
    }

    const rows = result.results;
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    // Build next cursor
    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1];
      if (lastRow) {
        nextCursor = btoa(JSON.stringify({ c: lastRow.created_at, i: lastRow.id }));
      }
    }

    // Transform to API format
    const jobs = pageRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      questionsStatus: row.questions_status,
      pipelineStatus: row.pipeline_status ?? ("none" as PipelineStatus),
      publicSlug: row.public_slug,
      companyName: row.company_name,
      workType: row.work_type as "remote" | "hybrid" | "onsite",
      employmentType: row.employment_type as "fulltime" | "parttime" | "contract" | "internship",
      department: row.department,
      location: row.location,
      salaryMin: row.salary_min,
      salaryMax: row.salary_max,
      salaryCurrency: row.salary_currency as "USD" | "EUR" | "GBP" | "SGD" | "IDR" | null,
      descriptionPreview: truncateAtWordBoundary(row.description_text, 150),
      createdAt: row.created_at,
      publishedAt: row.published_at,
    }));

    return { jobs, nextCursor };
  }

  // ===========================================================================
  // ADMIN/MONITORING QUERIES
  // ===========================================================================

  /**
   * Get job counts by visibility status.
   */
  async getStatusCounts(): Promise<Record<JobStatus, number>> {
    const result = await this.db
      .prepare(
        `
        SELECT status, COUNT(*) as count
        FROM jobs
        GROUP BY status
        `
      )
      .all<{ status: JobStatus; count: number }>();

    const counts: Record<JobStatus, number> = {
      draft: 0,
      published: 0,
      paused: 0,
      closed: 0,
    };

    for (const row of result.results) {
      counts[row.status] = row.count;
    }

    return counts;
  }

  /**
   * Get stuck jobs (questions processing for too long).
   */
  async findStuckJobs(maxProcessingMinutes: number = 5): Promise<JobRow[]> {
    const cutoffTime = new Date(Date.now() - maxProcessingMinutes * 60 * 1000).toISOString();

    const result = await this.db
      .prepare(
        `
        SELECT * FROM jobs
        WHERE questions_status = 'processing'
          AND processing_started_at < ?
        ORDER BY processing_started_at ASC
        `
      )
      .bind(cutoffTime)
      .all<JobRow>();

    return result.results;
  }

  /**
   * Get stuck pipeline jobs (pipeline processing for too long).
   */
  async findStuckPipelineJobs(maxProcessingMinutes: number = 5): Promise<JobRow[]> {
    const cutoffTime = new Date(Date.now() - maxProcessingMinutes * 60 * 1000).toISOString();

    const result = await this.db
      .prepare(
        `
        SELECT * FROM jobs
        WHERE pipeline_status = 'processing'
          AND pipeline_processing_started_at < ?
        ORDER BY pipeline_processing_started_at ASC
        `
      )
      .bind(cutoffTime)
      .all<JobRow>();

    return result.results;
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
  constructor(private readonly db: D1Database) {}

  // ===========================================================================
  // CACHE VERSIONING
  // ===========================================================================

  /**
   * Get jobs_list_version for an organization.
   */
  async getJobsListVersion(orgId: string): Promise<number> {
    const result = await this.db
      .prepare("SELECT jobs_list_version FROM orgs WHERE id = ?")
      .bind(orgId)
      .first<{ jobs_list_version: number }>();

    return result?.jobs_list_version ?? 1;
  }

  /**
   * Increment jobs_list_version for an organization.
   */
  async incrementJobsListVersion(orgId: string): Promise<void> {
    await this.db
      .prepare(
        `
        UPDATE orgs
        SET jobs_list_version = jobs_list_version + 1,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?
        `
      )
      .bind(orgId)
      .run();
  }

  // ===========================================================================
  // CAPACITY MANAGEMENT
  // ===========================================================================

  /**
   * Get organization capacity and billing info.
   */
  async getCapacityInfo(orgId: string): Promise<OrgCapacityInfo | null> {
    const result = await this.db
      .prepare(
        `
        SELECT
          active_role_capacity,
          billing_waived,
          billing_waived_reason,
          billing_waived_until
        FROM orgs
        WHERE id = ?
        `
      )
      .bind(orgId)
      .first<{
        active_role_capacity: number;
        billing_waived: number;
        billing_waived_reason: string | null;
        billing_waived_until: string | null;
      }>();

    if (!result) return null;

    return {
      activeRoleCapacity: result.active_role_capacity,
      billingWaived: result.billing_waived === 1,
      billingWaivedReason: result.billing_waived_reason,
      billingWaivedUntil: result.billing_waived_until,
    };
  }

  /**
   * Get count of active roles (published + paused) for an organization.
   * Active role = Zehire is "on the hook" for evaluative work.
   */
  async getActiveRoleCount(orgId: string): Promise<number> {
    const result = await this.db
      .prepare(
        `
        SELECT COUNT(*) as count
        FROM jobs
        WHERE org_id = ? AND status IN ('published', 'paused')
        `
      )
      .bind(orgId)
      .first<{ count: number }>();

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
      .prepare(
        `
        UPDATE orgs
        SET active_role_capacity = ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?
        `
      )
      .bind(newCapacity, orgId)
      .run();
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
      .prepare(
        `
        UPDATE orgs
        SET billing_waived = ?,
            billing_waived_reason = ?,
            billing_waived_until = ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?
        `
      )
      .bind(waived ? 1 : 0, reason ?? null, until ?? null, orgId)
      .run();
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

export type BillingEventType = (typeof BILLING_EVENT_TYPES)[number];

/**
 * Billing event record.
 */
export interface BillingEvent {
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
  constructor(private readonly db: D1Database) {}

  /**
   * Record a billing event.
   */
  async record(input: RecordBillingEventInput): Promise<BillingEvent> {
    const id = `evt${alphanumericId()}`;
    const occurredAt =
      input.occurredAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const metadata = input.metadata ? JSON.stringify(input.metadata) : null;

    await this.db
      .prepare(
        `
        INSERT INTO billing_events (id, org_id, job_id, event_type, occurred_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .bind(id, input.orgId, input.jobId, input.eventType, occurredAt, metadata)
      .run();

    return {
      id,
      orgId: input.orgId,
      jobId: input.jobId,
      eventType: input.eventType,
      occurredAt,
      metadata: input.metadata ?? null,
      createdAt: occurredAt,
    };
  }

  /**
   * Get all billing events for a job.
   */
  async getByJobId(jobId: string): Promise<BillingEvent[]> {
    const result = await this.db
      .prepare(
        `
        SELECT id, org_id, job_id, event_type, occurred_at, metadata, created_at
        FROM billing_events
        WHERE job_id = ?
        ORDER BY occurred_at ASC
        `
      )
      .bind(jobId)
      .all<{
        id: string;
        org_id: string;
        job_id: string;
        event_type: string;
        occurred_at: string;
        metadata: string | null;
        created_at: string;
      }>();

    return (result.results ?? []).map((row) => ({
      id: row.id,
      orgId: row.org_id,
      jobId: row.job_id,
      eventType: row.event_type as BillingEventType,
      occurredAt: row.occurred_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.created_at,
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
  ): Promise<BillingEvent[]> {
    const result = await this.db
      .prepare(
        `
        SELECT id, org_id, job_id, event_type, occurred_at, metadata, created_at
        FROM billing_events
        WHERE org_id = ?
          AND occurred_at >= ?
          AND occurred_at < ?
        ORDER BY occurred_at ASC
        `
      )
      .bind(orgId, startDate, endDate)
      .all<{
        id: string;
        org_id: string;
        job_id: string;
        event_type: string;
        occurred_at: string;
        metadata: string | null;
        created_at: string;
      }>();

    return (result.results ?? []).map((row) => ({
      id: row.id,
      orgId: row.org_id,
      jobId: row.job_id,
      eventType: row.event_type as BillingEventType,
      occurredAt: row.occurred_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get the most recent event for a job.
   * Useful for determining current billing state.
   */
  async getLatestByJobId(jobId: string): Promise<BillingEvent | null> {
    const result = await this.db
      .prepare(
        `
        SELECT id, org_id, job_id, event_type, occurred_at, metadata, created_at
        FROM billing_events
        WHERE job_id = ?
        ORDER BY occurred_at DESC
        LIMIT 1
        `
      )
      .bind(jobId)
      .first<{
        id: string;
        org_id: string;
        job_id: string;
        event_type: string;
        occurred_at: string;
        metadata: string | null;
        created_at: string;
      }>();

    if (!result) return null;

    return {
      id: result.id,
      orgId: result.org_id,
      jobId: result.job_id,
      eventType: result.event_type as BillingEventType,
      occurredAt: result.occurred_at,
      metadata: result.metadata ? JSON.parse(result.metadata) : null,
      createdAt: result.created_at,
    };
  }
}
