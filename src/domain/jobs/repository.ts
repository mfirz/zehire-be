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

import type { D1Database } from "@cloudflare/workers-types";
import { nanoid } from "nanoid";
import type { JobErrorCode, JobStatus } from "../../types/bindings";
import type {
  CreateJobInput,
  JobContextOutput,
  JobRow,
  RenderedQuestionOutput,
  ResolvedArchetypeOutput,
} from "./schemas";

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
  async create(input: CreateJobInput): Promise<JobRow> {
    const id = nanoid(21); // 21 chars = ~1 billion years before 1% collision probability
    const now = new Date().toISOString();

    const result = await this.db
      .prepare(
        `
        INSERT INTO jobs (
          id, status, title, description, company_name, department, location,
          created_at, updated_at
        )
        VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
        `
      )
      .bind(
        id,
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
}
