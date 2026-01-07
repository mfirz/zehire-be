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
import { nanoid } from "nanoid";
import type { JobErrorCode, JobStatus } from "../../types/bindings";
import type {
  CreateJobInput,
  JobContextOutput,
  JobListItem,
  JobRow,
  RenderedQuestionOutput,
  ResolvedArchetypeOutput,
} from "./schemas";

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

// =============================================================================
// REPOSITORY CLASS
// =============================================================================

export class JobRepository {
  constructor(private readonly db: D1Database) {}

  // ===========================================================================
  // CREATE
  // ===========================================================================

  /**
   * Create a new job in pending status.
   * Returns the created job row.
   */
  async create(input: CreateJobInput, orgId: string): Promise<JobRow> {
    const id = nanoid(21); // 21 chars = ~1 billion years before 1% collision probability
    const now = new Date().toISOString();

    const result = await this.db
      .prepare(
        `
        INSERT INTO jobs (
          id, org_id, status, title, description, company_name, department, location,
          created_at, updated_at
        )
        VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
        `
      )
      .bind(
        id,
        orgId,
        input.title,
        input.description,
        input.companyName ?? null,
        input.department ?? null,
        input.location ?? null,
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
    const result = await this.db
      .prepare("SELECT * FROM jobs WHERE id = ?")
      .bind(id)
      .first<JobRow>();

    return result ?? null;
  }

  /**
   * Get multiple jobs by status.
   * Useful for monitoring and admin dashboards.
   */
  async findByStatus(
    status: JobStatus,
    options?: { limit?: number; offset?: number }
  ): Promise<JobRow[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const result = await this.db
      .prepare(
        `
        SELECT * FROM jobs
        WHERE status = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        `
      )
      .bind(status, limit, offset)
      .all<JobRow>();

    return result.results;
  }

  // ===========================================================================
  // UPDATE STATUS
  // ===========================================================================

  /**
   * Mark job as processing.
   * Called at the start of the LLM pipeline.
   */
  async markProcessing(id: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `
        UPDATE jobs
        SET status = 'processing',
            processing_started_at = ?,
            updated_at = ?
        WHERE id = ? AND status = 'pending'
        `
      )
      .bind(now, now, id)
      .run();
  }

  /**
   * Mark job as completed with results.
   * Called after successful LLM pipeline completion.
   */
  async markCompleted(
    id: string,
    results: {
      jobContext: JobContextOutput;
      archetypes: ResolvedArchetypeOutput[];
      questions: RenderedQuestionOutput[];
      processingDurationMs: number;
    }
  ): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `
        UPDATE jobs
        SET status = 'completed',
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
      .run();
  }

  /**
   * Mark job as failed with error details.
   * Called when LLM pipeline fails.
   */
  async markFailed(
    id: string,
    error: {
      message: string;
      code: JobErrorCode;
    }
  ): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `
        UPDATE jobs
        SET status = 'failed',
            error_message = ?,
            error_code = ?,
            completed_at = ?,
            updated_at = ?
        WHERE id = ?
        `
      )
      .bind(error.message, error.code, now, now, id)
      .run();
  }

  // ===========================================================================
  // ADMIN/MONITORING QUERIES
  // ===========================================================================

  /**
   * Get job counts by status.
   * Useful for monitoring dashboards.
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
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    for (const row of result.results) {
      counts[row.status] = row.count;
    }

    return counts;
  }

  /**
   * Get stuck jobs (processing for too long).
   * Useful for monitoring and cleanup.
   */
  async findStuckJobs(maxProcessingMinutes: number = 5): Promise<JobRow[]> {
    const cutoffTime = new Date(Date.now() - maxProcessingMinutes * 60 * 1000).toISOString();

    const result = await this.db
      .prepare(
        `
        SELECT * FROM jobs
        WHERE status = 'processing'
          AND processing_started_at < ?
        ORDER BY processing_started_at ASC
        `
      )
      .bind(cutoffTime)
      .all<JobRow>();

    return result.results;
  }

  // ===========================================================================
  // LIST (PAGINATED)
  // ===========================================================================

  /**
   * List jobs for an organization with cursor-based pagination.
   *
   * Ordering: created_at DESC, id DESC (deterministic)
   * Cursor: opaque base64-encoded JSON of (created_at, id)
   *
   * @param orgId - Organization ID
   * @param options - Pagination options
   * @returns Jobs and next cursor
   */
  async list(
    orgId: string,
    options?: { limit?: number; cursor?: string }
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

    // Build query based on cursor
    let result: D1Result<{ id: string; title: string; status: JobStatus; created_at: string }>;

    if (cursorCreatedAt && cursorId) {
      // Cursor-based pagination: get rows after cursor position
      result = await this.db
        .prepare(
          `
          SELECT id, title, status, created_at FROM jobs
          WHERE org_id = ?
            AND (created_at < ? OR (created_at = ? AND id < ?))
          ORDER BY created_at DESC, id DESC
          LIMIT ?
          `
        )
        .bind(orgId, cursorCreatedAt, cursorCreatedAt, cursorId, limit + 1)
        .all<{ id: string; title: string; status: JobStatus; created_at: string }>();
    } else {
      // First page
      result = await this.db
        .prepare(
          `
          SELECT id, title, status, created_at FROM jobs
          WHERE org_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT ?
          `
        )
        .bind(orgId, limit + 1)
        .all<{ id: string; title: string; status: JobStatus; created_at: string }>();
    }

    const rows = result.results;

    // Check if there are more results
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    // Build next cursor from last item
    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1];
      if (lastRow) {
        nextCursor = btoa(JSON.stringify({ c: lastRow.created_at, i: lastRow.id }));
      }
    }

    // Transform to API format
    const jobs: JobListItem[] = pageRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
    }));

    return { jobs, nextCursor };
  }
}

// =============================================================================
// ORG REPOSITORY
// =============================================================================

/**
 * Organization repository for cache versioning operations.
 */
export class OrgRepository {
  constructor(private readonly db: D1Database) {}

  /**
   * Get jobs_list_version for an organization.
   * Returns 1 if org not found (safe default).
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
   * Called after creating/modifying jobs to invalidate caches.
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
}
