/**
 * Application Repository
 * ======================
 * Data access layer for applications, answers, and drafts using Drizzle ORM.
 *
 * Handles:
 * - Application creation with answers
 * - Draft save/resume (Save & Continue feature)
 * - Duplicate prevention
 */

import type { D1Database } from "@cloudflare/workers-types";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import {
  answers,
  applicationDrafts,
  applications,
  createDb,
  type Answer,
  type Application,
  type ApplicationDraft,
  type Database,
  type ExtractionStatus,
  type SignalsStatus,
} from "../../db";
import type {
  ApplicationDetail,
  ApplicationSummary,
  ListApplicationsQuery,
  PublicApplyInput,
  SaveDraftInput,
} from "./schemas";

// Alphanumeric-only nanoid for IDs
const alphanumericId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  21
);

import { DRAFT_EXPIRY_DAYS } from "./schemas";

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
  private db: Database;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

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

    // Insert application
    await this.db.insert(applications).values({
      id: applicationId,
      jobId,
      candidateEmail: input.email,
      candidateName: input.name,
      status: "pending",
      signalsStatus: "pending",
      createdAt: now,
      updatedAt: now,
    });

    // Insert answers (all required)
    const answerValues = questions.map((question) => {
      const answerId = alphanumericId();
      answerIds.push(answerId);
      return {
        id: answerId,
        applicationId,
        archetypeId: question.archetypeId,
        questionText: question.questionText,
        answerText: answersMap.get(question.archetypeId)!,
        extractionStatus: "pending" as const,
        createdAt: now,
        updatedAt: now,
        answeredAt: now,
      };
    });

    if (answerValues.length > 0) {
      await this.db.insert(answers).values(answerValues);
    }

    return { applicationId, answerIds };
  }

  /**
   * Check if an application already exists for this email + job.
   */
  async findExistingApplication(jobId: string, email: string): Promise<{ id: string } | null> {
    const result = await this.db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.jobId, jobId), eq(applications.candidateEmail, email)))
      .get();

    return result ?? null;
  }

  /**
   * Get application by ID.
   */
  async findById(id: string): Promise<Application | null> {
    const result = await this.db
      .select()
      .from(applications)
      .where(eq(applications.id, id))
      .get();

    return result ?? null;
  }

  /**
   * Get answers for an application.
   */
  async getAnswers(applicationId: string): Promise<Answer[]> {
    const result = await this.db
      .select()
      .from(answers)
      .where(eq(answers.applicationId, applicationId))
      .orderBy(answers.createdAt);

    return result;
  }

  /**
   * Update application signals status.
   */
  async updateSignalsStatus(
    id: string,
    status: SignalsStatus,
    error?: { message: string; code: string }
  ): Promise<void> {
    const now = new Date().toISOString();

    if (status === "failed" && error) {
      await this.db
        .update(applications)
        .set({
          signalsStatus: status,
          signalsErrorMessage: error.message,
          signalsErrorCode: error.code,
          updatedAt: now,
        })
        .where(eq(applications.id, id));
    } else if (status === "completed") {
      await this.db
        .update(applications)
        .set({
          signalsStatus: status,
          signalsComputedAt: now,
          updatedAt: now,
        })
        .where(eq(applications.id, id));
    } else {
      await this.db
        .update(applications)
        .set({
          signalsStatus: status,
          updatedAt: now,
        })
        .where(eq(applications.id, id));
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
      .select({ id: applicationDrafts.id })
      .from(applicationDrafts)
      .where(and(eq(applicationDrafts.jobId, jobId), eq(applicationDrafts.candidateEmail, input.email)))
      .get();

    if (existing) {
      // Update existing draft
      await this.db
        .update(applicationDrafts)
        .set({
          candidateName: input.name,
          answers: JSON.stringify(input.answers),
          resumeTokenHash,
          expiresAt: expiresAt.toISOString(),
          updatedAt: now.toISOString(),
        })
        .where(eq(applicationDrafts.id, existing.id));

      return {
        draftId: existing.id,
        resumeToken,
        expiresAt: expiresAt.toISOString(),
      };
    }

    // Create new draft
    const draftId = alphanumericId();

    await this.db.insert(applicationDrafts).values({
      id: draftId,
      jobId,
      candidateEmail: input.email,
      candidateName: input.name,
      answers: JSON.stringify(input.answers),
      resumeTokenHash,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

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
    const now = new Date().toISOString();

    const result = await this.db
      .select()
      .from(applicationDrafts)
      .where(
        and(
          eq(applicationDrafts.id, draftId),
          eq(applicationDrafts.resumeTokenHash, tokenHash),
          gt(applicationDrafts.expiresAt, now)
        )
      )
      .get();

    return result ?? null;
  }

  /**
   * Get a draft by job ID and email (for checking existence).
   */
  async getDraftByEmail(jobId: string, email: string): Promise<ApplicationDraft | null> {
    const now = new Date().toISOString();

    const result = await this.db
      .select()
      .from(applicationDrafts)
      .where(
        and(
          eq(applicationDrafts.jobId, jobId),
          eq(applicationDrafts.candidateEmail, email),
          gt(applicationDrafts.expiresAt, now)
        )
      )
      .get();

    return result ?? null;
  }

  /**
   * Delete a draft (after successful application submission).
   */
  async deleteDraft(draftId: string): Promise<void> {
    await this.db.delete(applicationDrafts).where(eq(applicationDrafts.id, draftId));
  }

  /**
   * Delete expired drafts (cleanup job).
   */
  async deleteExpiredDrafts(): Promise<number> {
    const now = new Date().toISOString();

    // Count before delete (D1/Drizzle doesn't return count from delete)
    const countResult = await this.db
      .select({ count: count() })
      .from(applicationDrafts)
      .where(sql`${applicationDrafts.expiresAt} < ${now}`)
      .get();

    const toDelete = countResult?.count ?? 0;

    if (toDelete > 0) {
      await this.db
        .delete(applicationDrafts)
        .where(sql`${applicationDrafts.expiresAt} < ${now}`);
    }

    return toDelete;
  }

  // ===========================================================================
  // RECRUITER API (Phase 0B)
  // ===========================================================================

  /**
   * List applications for a job with optional filtering.
   */
  async listByJobId(
    jobId: string,
    query: ListApplicationsQuery
  ): Promise<{ applications: ApplicationSummary[]; total: number }> {
    // Build conditions
    const conditions = [eq(applications.jobId, jobId)];

    if (query.status) {
      conditions.push(eq(applications.status, query.status));
    }

    if (query.signalsStatus) {
      conditions.push(eq(applications.signalsStatus, query.signalsStatus));
    }

    if (query.posture) {
      conditions.push(eq(applications.decisionPosture, query.posture));
    }

    const whereClause = and(...conditions);

    // Get total count
    const countResult = await this.db
      .select({ count: count() })
      .from(applications)
      .where(whereClause)
      .get();

    const total = countResult?.count ?? 0;

    // Map sort column
    const sortColumn = {
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
      candidateName: applications.candidateName,
    }[query.sort];

    // Get paginated results
    const results = await this.db
      .select({
        id: applications.id,
        candidateEmail: applications.candidateEmail,
        candidateName: applications.candidateName,
        status: applications.status,
        signalsStatus: applications.signalsStatus,
        decisionPosture: applications.decisionPosture,
        createdAt: applications.createdAt,
        updatedAt: applications.updatedAt,
      })
      .from(applications)
      .where(whereClause)
      .orderBy(query.order === "desc" ? desc(sortColumn) : sortColumn)
      .limit(query.limit)
      .offset(query.offset);

    const applicationsList: ApplicationSummary[] = results.map((row) => ({
      id: row.id,
      candidateEmail: row.candidateEmail,
      candidateName: row.candidateName,
      status: row.status,
      signalsStatus: row.signalsStatus,
      decisionPosture: row.decisionPosture,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    return { applications: applicationsList, total };
  }

  /**
   * Get full application details including answers.
   */
  async getDetailById(id: string): Promise<ApplicationDetail | null> {
    const application = await this.findById(id);
    if (!application) return null;

    const answersList = await this.getAnswers(id);

    return {
      id: application.id,
      jobId: application.jobId,
      candidateEmail: application.candidateEmail,
      candidateName: application.candidateName,
      status: application.status,
      signalsStatus: application.signalsStatus,
      decisionPosture: application.decisionPosture,
      signalEvaluations: application.signalEvaluations
        ? JSON.parse(application.signalEvaluations)
        : null,
      signalsErrorMessage: application.signalsErrorMessage,
      signalsErrorCode: application.signalsErrorCode,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      signalsComputedAt: application.signalsComputedAt,
      answers: answersList.map((a) => ({
        id: a.id,
        archetypeId: a.archetypeId,
        questionText: a.questionText,
        answerText: a.answerText,
        extractedSignals: a.extractedSignals ? JSON.parse(a.extractedSignals) : null,
        extractionStatus: a.extractionStatus,
        answeredAt: a.answeredAt,
        extractedAt: a.extractedAt,
      })),
    };
  }

  /**
   * Update application status.
   */
  async updateStatus(id: string, status: string): Promise<Application | null> {
    const now = new Date().toISOString();

    await this.db
      .update(applications)
      .set({
        status: status as Application["status"],
        updatedAt: now,
      })
      .where(eq(applications.id, id));

    return this.findById(id);
  }

  /**
   * Get the job_id for an application.
   * Used for authorization checks.
   */
  async getJobId(applicationId: string): Promise<string | null> {
    const result = await this.db
      .select({ jobId: applications.jobId })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .get();

    return result?.jobId ?? null;
  }

  // ===========================================================================
  // SIGNAL EXTRACTION (Phase 1)
  // ===========================================================================

  /**
   * Save extracted signals for an answer.
   */
  async saveExtractedSignals(
    answerId: string,
    signals: unknown,
    _responseQuality: string
  ): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(answers)
      .set({
        extractedSignals: JSON.stringify(signals),
        extractionStatus: "completed",
        extractedAt: now,
        updatedAt: now,
      })
      .where(eq(answers.id, answerId));
  }

  /**
   * Update answer extraction status.
   */
  async updateAnswerExtractionStatus(answerId: string, status: ExtractionStatus): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(answers)
      .set({
        extractionStatus: status,
        updatedAt: now,
      })
      .where(eq(answers.id, answerId));
  }

  /**
   * Save aggregated signal evaluations and decision posture for an application.
   */
  async saveSignalEvaluations(
    applicationId: string,
    evaluations: unknown,
    posture: string
  ): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(applications)
      .set({
        signalEvaluations: JSON.stringify(evaluations),
        decisionPosture: posture,
        signalsStatus: "completed",
        signalsComputedAt: now,
        updatedAt: now,
      })
      .where(eq(applications.id, applicationId));
  }

  /**
   * Get application with job context for signal extraction.
   */
  async getApplicationForExtraction(
    applicationId: string
  ): Promise<{ application: Application; jobId: string } | null> {
    const application = await this.findById(applicationId);
    if (!application) return null;

    return {
      application,
      jobId: application.jobId,
    };
  }

  /**
   * Save computed signal state for an application.
   * Computes decision posture from critical analysis.
   */
  async saveSignalState(
    applicationId: string,
    signalState: {
      aggregated: unknown;
      criticalAnalysis: { hasCriticalGap: boolean; gaps: Array<{ status: string }> };
      conflicts: unknown[];
      computedAt: string;
    }
  ): Promise<void> {
    // Compute decision posture from critical analysis
    let posture: string;
    const { hasCriticalGap, gaps } = signalState.criticalAnalysis;

    if (!hasCriticalGap) {
      posture = "LOW_REGRET_RISK";
    } else {
      // Count severity of gaps
      const missingCount = gaps.filter((g) => g.status === "missing").length;
      const partialCount = gaps.filter((g) => g.status === "partial").length;

      if (missingCount >= 2 || signalState.conflicts.length > 0) {
        posture = "HIGH_UNCERTAINTY";
      } else if (missingCount >= 1 || partialCount >= 2) {
        posture = "SOME_UNCERTAINTY";
      } else {
        posture = "LOW_REGRET_RISK";
      }
    }

    await this.db
      .update(applications)
      .set({
        signalEvaluations: JSON.stringify(signalState),
        decisionPosture: posture,
        signalsStatus: "completed",
        signalsComputedAt: signalState.computedAt,
        updatedAt: signalState.computedAt,
      })
      .where(eq(applications.id, applicationId));
  }

  /**
   * Retrieve parsed signal state for an application.
   */
  async getSignalState<T>(applicationId: string): Promise<T | null> {
    const result = await this.db
      .select({ signalEvaluations: applications.signalEvaluations })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .get();

    if (!result?.signalEvaluations) return null;
    return JSON.parse(result.signalEvaluations) as T;
  }

  /**
   * Save posture result for an application.
   */
  async savePostureResult(
    applicationId: string,
    posture: {
      posture: string;
      primaryReason: string;
      reasons: unknown[];
      signalState: unknown;
      suggestedActions: string[];
      computedAt: string;
    }
  ): Promise<void> {
    await this.db
      .update(applications)
      .set({
        decisionPosture: posture.posture,
        signalEvaluations: JSON.stringify(posture),
        signalsStatus: "completed",
        signalsComputedAt: posture.computedAt,
        updatedAt: posture.computedAt,
      })
      .where(eq(applications.id, applicationId));
  }

  /**
   * Get posture result for an application.
   */
  async getPostureResult<T>(applicationId: string): Promise<T | null> {
    const result = await this.db
      .select({ signalEvaluations: applications.signalEvaluations })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .get();

    if (!result?.signalEvaluations) return null;
    return JSON.parse(result.signalEvaluations) as T;
  }
}
