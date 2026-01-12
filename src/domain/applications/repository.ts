/**
 * Application Repository
 * ======================
 * Data access layer for applications, answers, and drafts.
 *
 * Handles:
 * - Application creation with answers
 * - Draft save/resume (Save & Continue feature)
 * - Duplicate prevention
 */

import type { D1Database } from "@cloudflare/workers-types";
import { customAlphabet } from "nanoid";

import {
  DRAFT_EXPIRY_DAYS,
  type Application,
  type ApplicationDraft,
  type ApplicationDraftRow,
  type ApplicationRow,
  type Answer,
  type AnswerRow,
  type PublicApplyInput,
  type SaveDraftInput,
} from "./schemas";

// Alphanumeric-only nanoid for IDs
const alphanumericId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  21
);

// =============================================================================
// CRYPTO HELPERS
// =============================================================================

/**
 * Hash a token for secure storage.
 * Using Web Crypto API (available in Cloudflare Workers).
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a secure random token.
 */
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// =============================================================================
// REPOSITORY CLASS
// =============================================================================

export class ApplicationRepository {
  constructor(private readonly db: D1Database) {}

  // ===========================================================================
  // APPLICATIONS
  // ===========================================================================

  /**
   * Create a new application with answers.
   * All questions must be answered - this is enforced at the schema level.
   */
  async createApplication(
    jobId: string,
    input: PublicApplyInput,
    questions: Array<{ archetypeId: string; questionText: string }>
  ): Promise<{ applicationId: string; answerIds: string[] }> {
    const applicationId = alphanumericId();
    const now = new Date().toISOString();
    const answerIds: string[] = [];

    // Create a map of archetypeId -> answerText
    const answersMap = new Map(input.answers.map((a) => [a.archetypeId, a.answerText]));

    // Validate all questions have answers
    for (const q of questions) {
      if (!answersMap.has(q.archetypeId)) {
        throw new Error(`Missing answer for question: ${q.archetypeId}`);
      }
    }

    // Use a batch for atomic insertion
    const statements: D1PreparedStatement[] = [];

    // Insert application
    statements.push(
      this.db
        .prepare(
          `
        INSERT INTO applications (
          id, job_id, candidate_email, candidate_name,
          status, signals_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', 'pending', ?, ?)
        `
        )
        .bind(applicationId, jobId, input.email, input.name, now, now)
    );

    // Insert answers (all required)
    for (const question of questions) {
      const answerId = alphanumericId();
      answerIds.push(answerId);
      const answerText = answersMap.get(question.archetypeId)!;

      statements.push(
        this.db
          .prepare(
            `
          INSERT INTO answers (
            id, application_id, archetype_id, question_text,
            answer_text, extraction_status, created_at, updated_at, answered_at
          ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
          `
          )
          .bind(
            answerId,
            applicationId,
            question.archetypeId,
            question.questionText,
            answerText,
            now,
            now,
            now
          )
      );
    }

    // Execute batch
    await this.db.batch(statements);

    return { applicationId, answerIds };
  }

  /**
   * Check if an application already exists for this email + job.
   */
  async findExistingApplication(jobId: string, email: string): Promise<{ id: string } | null> {
    const result = await this.db
      .prepare(
        `
        SELECT id FROM applications
        WHERE job_id = ? AND candidate_email = ?
        LIMIT 1
        `
      )
      .bind(jobId, email)
      .first<{ id: string }>();

    return result ?? null;
  }

  /**
   * Get application by ID.
   */
  async findById(id: string): Promise<Application | null> {
    const result = await this.db
      .prepare(`SELECT * FROM applications WHERE id = ?`)
      .bind(id)
      .first<ApplicationRow>();

    if (!result) return null;
    return this.mapApplication(result);
  }

  /**
   * Get answers for an application.
   */
  async getAnswers(applicationId: string): Promise<Answer[]> {
    const result = await this.db
      .prepare(
        `
        SELECT * FROM answers
        WHERE application_id = ?
        ORDER BY created_at ASC
        `
      )
      .bind(applicationId)
      .all<AnswerRow>();

    return result.results.map((row) => this.mapAnswer(row));
  }

  /**
   * Update application signals status.
   */
  async updateSignalsStatus(
    id: string,
    status: "processing" | "completed" | "failed",
    error?: { message: string; code: string }
  ): Promise<void> {
    const now = new Date().toISOString();

    if (status === "failed" && error) {
      await this.db
        .prepare(
          `
          UPDATE applications
          SET signals_status = ?,
              signals_error_message = ?,
              signals_error_code = ?,
              updated_at = ?
          WHERE id = ?
          `
        )
        .bind(status, error.message, error.code, now, id)
        .run();
    } else if (status === "completed") {
      await this.db
        .prepare(
          `
          UPDATE applications
          SET signals_status = ?,
              signals_computed_at = ?,
              updated_at = ?
          WHERE id = ?
          `
        )
        .bind(status, now, now, id)
        .run();
    } else {
      await this.db
        .prepare(
          `
          UPDATE applications
          SET signals_status = ?,
              updated_at = ?
          WHERE id = ?
          `
        )
        .bind(status, now, id)
        .run();
    }
  }

  // ===========================================================================
  // DRAFTS (Save & Continue)
  // ===========================================================================

  /**
   * Save or update a draft.
   * Returns the draft ID and a resume token.
   */
  async saveDraft(
    jobId: string,
    input: SaveDraftInput
  ): Promise<{ draftId: string; resumeToken: string; expiresAt: string }> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const resumeToken = generateToken();
    const resumeTokenHash = await hashToken(resumeToken);

    // Check if draft already exists for this email + job
    const existing = await this.db
      .prepare(
        `
        SELECT id FROM application_drafts
        WHERE job_id = ? AND candidate_email = ?
        LIMIT 1
        `
      )
      .bind(jobId, input.email)
      .first<{ id: string }>();

    if (existing) {
      // Update existing draft
      await this.db
        .prepare(
          `
          UPDATE application_drafts
          SET candidate_name = ?,
              answers = ?,
              resume_token_hash = ?,
              expires_at = ?,
              updated_at = ?
          WHERE id = ?
          `
        )
        .bind(
          input.name,
          JSON.stringify(input.answers),
          resumeTokenHash,
          expiresAt.toISOString(),
          now.toISOString(),
          existing.id
        )
        .run();

      return {
        draftId: existing.id,
        resumeToken,
        expiresAt: expiresAt.toISOString(),
      };
    }

    // Create new draft
    const draftId = alphanumericId();

    await this.db
      .prepare(
        `
        INSERT INTO application_drafts (
          id, job_id, candidate_email, candidate_name,
          answers, resume_token_hash, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .bind(
        draftId,
        jobId,
        input.email,
        input.name,
        JSON.stringify(input.answers),
        resumeTokenHash,
        expiresAt.toISOString(),
        now.toISOString(),
        now.toISOString()
      )
      .run();

    return {
      draftId,
      resumeToken,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Get a draft by ID and resume token.
   * Validates the token and checks expiry.
   */
  async getDraftByToken(draftId: string, resumeToken: string): Promise<ApplicationDraft | null> {
    const tokenHash = await hashToken(resumeToken);

    const result = await this.db
      .prepare(
        `
        SELECT * FROM application_drafts
        WHERE id = ?
          AND resume_token_hash = ?
          AND expires_at > datetime('now')
        LIMIT 1
        `
      )
      .bind(draftId, tokenHash)
      .first<ApplicationDraftRow>();

    if (!result) return null;
    return this.mapDraft(result);
  }

  /**
   * Get a draft by job ID and email (for checking existence).
   */
  async getDraftByEmail(jobId: string, email: string): Promise<ApplicationDraft | null> {
    const result = await this.db
      .prepare(
        `
        SELECT * FROM application_drafts
        WHERE job_id = ?
          AND candidate_email = ?
          AND expires_at > datetime('now')
        LIMIT 1
        `
      )
      .bind(jobId, email)
      .first<ApplicationDraftRow>();

    if (!result) return null;
    return this.mapDraft(result);
  }

  /**
   * Delete a draft (after successful application submission).
   */
  async deleteDraft(draftId: string): Promise<void> {
    await this.db.prepare(`DELETE FROM application_drafts WHERE id = ?`).bind(draftId).run();
  }

  /**
   * Delete expired drafts (cleanup job).
   */
  async deleteExpiredDrafts(): Promise<number> {
    const result = await this.db
      .prepare(
        `
        DELETE FROM application_drafts
        WHERE expires_at < datetime('now')
        `
      )
      .run();

    return result.meta.changes ?? 0;
  }

  // ===========================================================================
  // MAPPERS
  // ===========================================================================

  private mapApplication(row: ApplicationRow): Application {
    return {
      id: row.id,
      jobId: row.job_id,
      candidateEmail: row.candidate_email,
      candidateName: row.candidate_name,
      status: row.status,
      signalsStatus: row.signals_status,
      signalEvaluations: row.signal_evaluations,
      decisionPosture: row.decision_posture,
      signalsErrorMessage: row.signals_error_message,
      signalsErrorCode: row.signals_error_code,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      signalsComputedAt: row.signals_computed_at,
    };
  }

  private mapAnswer(row: AnswerRow): Answer {
    return {
      id: row.id,
      applicationId: row.application_id,
      archetypeId: row.archetype_id,
      questionText: row.question_text,
      answerText: row.answer_text,
      extractedSignals: row.extracted_signals,
      extractionStatus: row.extraction_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      answeredAt: row.answered_at,
      extractedAt: row.extracted_at,
    };
  }

  private mapDraft(row: ApplicationDraftRow): ApplicationDraft {
    return {
      id: row.id,
      jobId: row.job_id,
      candidateEmail: row.candidate_email,
      candidateName: row.candidate_name,
      answers: row.answers,
      resumeTokenHash: row.resume_token_hash,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
