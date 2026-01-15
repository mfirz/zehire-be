# Phase 0A: Public Apply API

**Repository:** `zehire-be`

## Context

This phase creates the public endpoint for candidates to apply to jobs. It must be implemented **before Phase 1** because Phase 1's signal extraction depends on applications and answers existing in the database.

### Design Philosophy: All Required + Smart Design

This implementation follows the "All Required + Smart Design" approach:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DESIGN PRINCIPLES                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. LIMIT TO 3 QUESTIONS (Hard Cap)                                        │
│     └── 3 questions = ~10 min to complete                                  │
│     └── Respects candidate time                                            │
│     └── Covers critical signals                                            │
│                                                                             │
│  2. ALL 3 REQUIRED                                                         │
│     └── Maintains signal integrity                                         │
│     └── Self-selects serious candidates                                    │
│     └── Clean data for posture computation                                 │
│                                                                             │
│  3. SAVE & CONTINUE LATER                                                  │
│     └── Candidate can return within 7 days                                 │
│     └── Handles interruptions (meetings, calls)                            │
│     └── Reduces abandonment                                                │
│                                                                             │
│  4. PROGRESS INDICATOR                                                     │
│     └── "Question 2 of 3"                                                  │
│     └── Creates completion momentum                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Hiring Flow Position

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [YOU ARE HERE]                                                             │
│                                                                             │
│  Candidate visits job page                                                  │
│       │                                                                     │
│       ▼                                                                     │
│  GET /public/jobs/:slug ────► Shows job details + 3 questions              │
│       │                                                                     │
│       ▼                                                                     │
│  Candidate starts application                                               │
│       │                                                                     │
│       ├──► POST /public/jobs/:slug/apply/draft ◄─── Save progress          │
│       │         │                                                           │
│       │         ▼                                                           │
│       │    Returns draftId + resumeToken                                   │
│       │         │                                                           │
│       │         ▼                                                           │
│       │    GET /public/jobs/:slug/apply/draft/:draftId ◄─── Resume         │
│       │                                                                     │
│       ▼                                                                     │
│  POST /public/jobs/:slug/apply ◄─── Final submission (all 3 answered)      │
│       │                                                                     │
│       ├── Creates application record                                        │
│       ├── Creates answer records (one per question)                         │
│       ├── Deletes draft (if exists)                                        │
│       └── Queues signal extraction job                                      │
│                │                                                            │
│                ▼                                                            │
│        Phase 1: Signal Extraction (processes queue)                         │
│                │                                                            │
│                ▼                                                            │
│        Phase 2-3: Aggregation & Posture                                     │
│                │                                                            │
│                ▼                                                            │
│        Recruiter reviews via Phase 0B APIs                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Prerequisites

- Job with `status = 'published'` and `questions_status = 'completed'`
- The `applications`, `answers`, and `application_drafts` tables must exist

---

## Your Task

### 1. Create Database Migration

Create `migrations/0011_applications.sql`:

```sql
-- Migration: 0011_applications
-- Description: Create applications, answers, and drafts tables for candidate tracking
-- Created: 2024-01-15

-- =============================================================================
-- APPLICATIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY NOT NULL,  -- nanoid
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- Candidate info
  candidate_email TEXT NOT NULL,
  candidate_name TEXT NOT NULL,

  -- Application status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'screening', 'assessment', 'interview', 'offer', 'rejected', 'withdrawn')),

  -- Signal extraction status
  signals_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (signals_status IN ('pending', 'processing', 'completed', 'failed')),

  -- Aggregated signal evaluations (JSON, computed after all answers evaluated)
  signal_evaluations TEXT,  -- JSON: SignalStateResult

  -- Decision posture (computed from signal_evaluations)
  decision_posture TEXT,  -- JSON: PostureResult

  -- Error tracking
  signals_error_message TEXT,
  signals_error_code TEXT,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  signals_computed_at TEXT
);

-- =============================================================================
-- ANSWERS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY NOT NULL,  -- nanoid
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,

  -- Link to the question
  archetype_id TEXT NOT NULL,
  question_text TEXT NOT NULL,

  -- Candidate's answer (always required in final submission)
  answer_text TEXT NOT NULL,

  -- Signal extraction results (JSON)
  extracted_signals TEXT,  -- JSON: ExtractedSignal[]
  extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed')),

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  answered_at TEXT NOT NULL,
  extracted_at TEXT
);

-- =============================================================================
-- APPLICATION DRAFTS TABLE (Save & Continue)
-- =============================================================================

CREATE TABLE IF NOT EXISTS application_drafts (
  id TEXT PRIMARY KEY NOT NULL,  -- nanoid
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- Candidate info (captured upfront)
  candidate_email TEXT NOT NULL,
  candidate_name TEXT NOT NULL,

  -- Saved answers (JSON array, may be partial)
  -- Format: [{ archetypeId: string, answerText: string | null }]
  answers TEXT NOT NULL DEFAULT '[]',

  -- Resume token for secure access (hashed)
  resume_token_hash TEXT NOT NULL,

  -- Expiry (7 days from creation)
  expires_at TEXT NOT NULL,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Applications
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_signals_status ON applications(signals_status);
CREATE INDEX IF NOT EXISTS idx_applications_candidate_email ON applications(candidate_email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_unique_candidate ON applications(job_id, candidate_email);

-- Answers
CREATE INDEX IF NOT EXISTS idx_answers_application_id ON answers(application_id);
CREATE INDEX IF NOT EXISTS idx_answers_extraction_status ON answers(extraction_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_answers_unique ON answers(application_id, archetype_id);

-- Drafts
CREATE INDEX IF NOT EXISTS idx_drafts_job_id ON application_drafts(job_id);
CREATE INDEX IF NOT EXISTS idx_drafts_email ON application_drafts(candidate_email);
CREATE INDEX IF NOT EXISTS idx_drafts_expires ON application_drafts(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_drafts_unique_candidate ON application_drafts(job_id, candidate_email);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS trg_applications_updated_at
  AFTER UPDATE ON applications
  FOR EACH ROW
  WHEN OLD.updated_at = NEW.updated_at
BEGIN
  UPDATE applications SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_answers_updated_at
  AFTER UPDATE ON answers
  FOR EACH ROW
  WHEN OLD.updated_at = NEW.updated_at
BEGIN
  UPDATE answers SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_drafts_updated_at
  AFTER UPDATE ON application_drafts
  FOR EACH ROW
  WHEN OLD.updated_at = NEW.updated_at
BEGIN
  UPDATE application_drafts SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE id = NEW.id;
END;
```

---

### 2. Create Application Schemas

Create `src/domain/applications/schemas.ts`:

```typescript
import { z } from "zod";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Application status enum.
 */
export const APPLICATION_STATUSES = [
  "pending",      // Just submitted, awaiting review
  "screening",    // Under initial review
  "assessment",   // In assessment phase
  "interview",    // Interview scheduled/in progress
  "offer",        // Offer extended
  "rejected",     // Rejected by recruiter
  "withdrawn",    // Withdrawn by candidate
] as const;

export type ApplicationStatus = typeof APPLICATION_STATUSES[number];

/**
 * Draft expiry duration in days.
 */
export const DRAFT_EXPIRY_DAYS = 7;

// =============================================================================
// INPUT SCHEMAS
// =============================================================================

/**
 * Schema for a single answer in the application.
 * All answers are required for final submission.
 */
export const AnswerInputSchema = z.object({
  /** The archetype ID of the question being answered */
  archetypeId: z.string().min(1),

  /** The candidate's answer text - required, minimum 50 characters for quality */
  answerText: z.string().min(50, "Please provide a more detailed answer (at least 50 characters)"),
});

export type AnswerInput = z.infer<typeof AnswerInputSchema>;

/**
 * Schema for public job application submission.
 * All questions must be answered.
 */
export const PublicApplySchema = z.object({
  /** Candidate's email address */
  email: z.string().email("Valid email is required"),

  /** Candidate's full name */
  name: z.string().min(1, "Name is required").max(200),

  /** Answers to ALL questions (required) */
  answers: z.array(AnswerInputSchema).min(1, "All questions must be answered"),

  /** Optional draft ID (if resuming from saved progress) */
  draftId: z.string().optional(),
});

export type PublicApplyInput = z.infer<typeof PublicApplySchema>;

/**
 * Schema for a single answer in a draft (can be empty).
 */
export const DraftAnswerSchema = z.object({
  archetypeId: z.string().min(1),
  answerText: z.string(), // Can be empty for drafts
});

/**
 * Schema for saving application draft.
 */
export const SaveDraftSchema = z.object({
  /** Candidate's email address */
  email: z.string().email("Valid email is required"),

  /** Candidate's full name */
  name: z.string().min(1, "Name is required").max(200),

  /** Partial answers (may be incomplete) */
  answers: z.array(DraftAnswerSchema),
});

export type SaveDraftInput = z.infer<typeof SaveDraftSchema>;

/**
 * Schema for resuming a draft.
 */
export const ResumeDraftSchema = z.object({
  /** Resume token sent to candidate's email or returned on save */
  resumeToken: z.string().min(1),
});

export type ResumeDraftInput = z.infer<typeof ResumeDraftSchema>;

// =============================================================================
// RESPONSE SCHEMAS
// =============================================================================

/**
 * Response after successful application.
 */
export const PublicApplyResponseSchema = z.object({
  success: z.literal(true),
  applicationId: z.string(),
  message: z.string(),
});

export type PublicApplyResponse = z.infer<typeof PublicApplyResponseSchema>;

/**
 * Response after saving draft.
 */
export const SaveDraftResponseSchema = z.object({
  success: z.literal(true),
  draftId: z.string(),
  resumeToken: z.string(),
  expiresAt: z.string(),
  message: z.string(),
});

export type SaveDraftResponse = z.infer<typeof SaveDraftResponseSchema>;

/**
 * Response when resuming a draft.
 */
export const ResumeDraftResponseSchema = z.object({
  draftId: z.string(),
  candidateEmail: z.string(),
  candidateName: z.string(),
  answers: z.array(DraftAnswerSchema),
  expiresAt: z.string(),
  progress: z.object({
    answered: z.number(),
    total: z.number(),
  }),
});

export type ResumeDraftResponse = z.infer<typeof ResumeDraftResponseSchema>;

// =============================================================================
// DATABASE RECORD TYPES
// =============================================================================

/**
 * Application record as stored in database.
 */
export interface Application {
  id: string;
  jobId: string;
  candidateEmail: string;
  candidateName: string;
  status: ApplicationStatus;
  signalsStatus: string;
  signalEvaluations: string | null;
  decisionPosture: string | null;
  signalsErrorMessage: string | null;
  signalsErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
  signalsComputedAt: string | null;
}

/**
 * Answer record as stored in database.
 */
export interface Answer {
  id: string;
  applicationId: string;
  archetypeId: string;
  questionText: string;
  answerText: string;
  extractedSignals: string | null;
  extractionStatus: string;
  createdAt: string;
  updatedAt: string;
  answeredAt: string;
  extractedAt: string | null;
}

/**
 * Draft record as stored in database.
 */
export interface ApplicationDraft {
  id: string;
  jobId: string;
  candidateEmail: string;
  candidateName: string;
  answers: string; // JSON
  resumeTokenHash: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}
```

---

### 3. Create Application Repository

Create `src/domain/applications/repository.ts`:

```typescript
import { nanoid } from "nanoid";
import type { D1Database } from "@cloudflare/workers-types";
import type {
  Application,
  Answer,
  ApplicationDraft,
  PublicApplyInput,
  SaveDraftInput,
  DraftAnswerSchema,
} from "./schemas";
import { DRAFT_EXPIRY_DAYS } from "./schemas";

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

export class ApplicationRepository {
  constructor(private db: D1Database) {}

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
    const applicationId = nanoid();
    const now = new Date().toISOString();
    const answerIds: string[] = [];

    // Create a map of archetypeId -> answerText
    const answersMap = new Map(
      input.answers.map((a) => [a.archetypeId, a.answerText])
    );

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
      this.db.prepare(`
        INSERT INTO applications (
          id, job_id, candidate_email, candidate_name,
          status, signals_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', 'pending', ?, ?)
      `).bind(
        applicationId,
        jobId,
        input.email,
        input.name,
        now,
        now
      )
    );

    // Insert answers (all required)
    for (const question of questions) {
      const answerId = nanoid();
      answerIds.push(answerId);
      const answerText = answersMap.get(question.archetypeId)!;

      statements.push(
        this.db.prepare(`
          INSERT INTO answers (
            id, application_id, archetype_id, question_text,
            answer_text, extraction_status, created_at, updated_at, answered_at
          ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        `).bind(
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
  async findExistingApplication(
    jobId: string,
    email: string
  ): Promise<{ id: string } | null> {
    const result = await this.db
      .prepare(`
        SELECT id FROM applications
        WHERE job_id = ? AND candidate_email = ?
        LIMIT 1
      `)
      .bind(jobId, email)
      .first<{ id: string }>();

    return result ?? null;
  }

  /**
   * Get application by ID.
   */
  async getById(id: string): Promise<Application | null> {
    const result = await this.db
      .prepare(`SELECT * FROM applications WHERE id = ?`)
      .bind(id)
      .first();

    if (!result) return null;
    return this.mapApplication(result);
  }

  /**
   * Get answers for an application.
   */
  async getAnswers(applicationId: string): Promise<Answer[]> {
    const result = await this.db
      .prepare(`
        SELECT * FROM answers
        WHERE application_id = ?
        ORDER BY created_at ASC
      `)
      .bind(applicationId)
      .all();

    return result.results.map(this.mapAnswer);
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
      .prepare(`
        SELECT id FROM application_drafts
        WHERE job_id = ? AND candidate_email = ?
        LIMIT 1
      `)
      .bind(jobId, input.email)
      .first<{ id: string }>();

    if (existing) {
      // Update existing draft
      await this.db
        .prepare(`
          UPDATE application_drafts
          SET candidate_name = ?,
              answers = ?,
              resume_token_hash = ?,
              expires_at = ?,
              updated_at = ?
          WHERE id = ?
        `)
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
    const draftId = nanoid();

    await this.db
      .prepare(`
        INSERT INTO application_drafts (
          id, job_id, candidate_email, candidate_name,
          answers, resume_token_hash, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
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
  async getDraftByToken(
    draftId: string,
    resumeToken: string
  ): Promise<ApplicationDraft | null> {
    const tokenHash = await hashToken(resumeToken);

    const result = await this.db
      .prepare(`
        SELECT * FROM application_drafts
        WHERE id = ?
          AND resume_token_hash = ?
          AND expires_at > datetime('now')
        LIMIT 1
      `)
      .bind(draftId, tokenHash)
      .first();

    if (!result) return null;
    return this.mapDraft(result);
  }

  /**
   * Get a draft by job ID and email (for checking existence).
   */
  async getDraftByEmail(
    jobId: string,
    email: string
  ): Promise<ApplicationDraft | null> {
    const result = await this.db
      .prepare(`
        SELECT * FROM application_drafts
        WHERE job_id = ?
          AND candidate_email = ?
          AND expires_at > datetime('now')
        LIMIT 1
      `)
      .bind(jobId, email)
      .first();

    if (!result) return null;
    return this.mapDraft(result);
  }

  /**
   * Delete a draft (after successful application submission).
   */
  async deleteDraft(draftId: string): Promise<void> {
    await this.db
      .prepare(`DELETE FROM application_drafts WHERE id = ?`)
      .bind(draftId)
      .run();
  }

  /**
   * Delete expired drafts (cleanup job).
   */
  async deleteExpiredDrafts(): Promise<number> {
    const result = await this.db
      .prepare(`
        DELETE FROM application_drafts
        WHERE expires_at < datetime('now')
      `)
      .run();

    return result.meta.changes ?? 0;
  }

  // ===========================================================================
  // MAPPERS
  // ===========================================================================

  private mapApplication(row: Record<string, unknown>): Application {
    return {
      id: row.id as string,
      jobId: row.job_id as string,
      candidateEmail: row.candidate_email as string,
      candidateName: row.candidate_name as string,
      status: row.status as Application["status"],
      signalsStatus: row.signals_status as string,
      signalEvaluations: row.signal_evaluations as string | null,
      decisionPosture: row.decision_posture as string | null,
      signalsErrorMessage: row.signals_error_message as string | null,
      signalsErrorCode: row.signals_error_code as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      signalsComputedAt: row.signals_computed_at as string | null,
    };
  }

  private mapAnswer(row: Record<string, unknown>): Answer {
    return {
      id: row.id as string,
      applicationId: row.application_id as string,
      archetypeId: row.archetype_id as string,
      questionText: row.question_text as string,
      answerText: row.answer_text as string,
      extractedSignals: row.extracted_signals as string | null,
      extractionStatus: row.extraction_status as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      answeredAt: row.answered_at as string,
      extractedAt: row.extracted_at as string | null,
    };
  }

  private mapDraft(row: Record<string, unknown>): ApplicationDraft {
    return {
      id: row.id as string,
      jobId: row.job_id as string,
      candidateEmail: row.candidate_email as string,
      candidateName: row.candidate_name as string,
      answers: row.answers as string,
      resumeTokenHash: row.resume_token_hash as string,
      expiresAt: row.expires_at as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
```

---

### 4. Create Public Apply Routes

Create `src/routes/public/jobs/apply.ts`:

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ApplicationRepository } from "../../../domain/applications/repository";
import { JobsRepository } from "../../../domain/jobs/repository";
import {
  PublicApplySchema,
  SaveDraftSchema,
  ResumeDraftSchema,
} from "../../../domain/applications/schemas";
import type { Env } from "../../../types/bindings";

const applyRoute = new Hono<{ Bindings: Env }>();

// =============================================================================
// FINAL SUBMISSION
// =============================================================================

/**
 * POST /public/jobs/:slug/apply
 *
 * Submit a complete job application.
 * All questions must be answered.
 */
applyRoute.post(
  "/:slug/apply",
  zValidator("json", PublicApplySchema),
  async (c) => {
    const { slug } = c.req.param();
    const input = c.req.valid("json");

    const jobsRepository = new JobsRepository(c.env.DB);
    const applicationRepository = new ApplicationRepository(c.env.DB);

    // 1. Find the job by slug
    const job = await jobsRepository.getBySlug(slug);

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    // 2. Verify job is published and has questions
    if (job.status !== "published") {
      return c.json({ error: "This job is not accepting applications" }, 400);
    }

    if (job.questionsStatus !== "completed" || !job.questions) {
      return c.json({ error: "This job is not ready for applications" }, 400);
    }

    // 3. Check for existing application (prevent duplicates)
    const existing = await applicationRepository.findExistingApplication(
      job.id,
      input.email
    );

    if (existing) {
      return c.json(
        {
          error: "You have already applied to this job",
          applicationId: existing.id,
        },
        409
      );
    }

    // 4. Parse questions from job
    const questions: Array<{ archetypeId: string; questionText: string }> =
      JSON.parse(job.questions);

    // 5. Validate all questions have answers
    const questionArchetypeIds = new Set(questions.map((q) => q.archetypeId));
    const answerArchetypeIds = new Set(input.answers.map((a) => a.archetypeId));

    // Check for missing answers
    const missingAnswers: string[] = [];
    for (const archetypeId of questionArchetypeIds) {
      if (!answerArchetypeIds.has(archetypeId)) {
        missingAnswers.push(archetypeId);
      }
    }

    if (missingAnswers.length > 0) {
      return c.json(
        {
          error: "All questions must be answered",
          missingQuestions: missingAnswers,
          message: `Please answer all ${questions.length} questions to submit your application`,
        },
        400
      );
    }

    // Check for extra answers (questions not in the job)
    for (const archetypeId of answerArchetypeIds) {
      if (!questionArchetypeIds.has(archetypeId)) {
        return c.json(
          { error: `Unknown question: ${archetypeId}` },
          400
        );
      }
    }

    // 6. Create application with answers
    const { applicationId } = await applicationRepository.createApplication(
      job.id,
      input,
      questions
    );

    // 7. Delete draft if exists (user might have saved progress)
    if (input.draftId) {
      await applicationRepository.deleteDraft(input.draftId);
    } else {
      // Also try to delete by email (in case draftId wasn't passed)
      const existingDraft = await applicationRepository.getDraftByEmail(
        job.id,
        input.email
      );
      if (existingDraft) {
        await applicationRepository.deleteDraft(existingDraft.id);
      }
    }

    // 8. Queue signal extraction job
    await c.env.JOBS_QUEUE.send({
      type: "evaluate_application",
      applicationId,
      jobId: job.id,
    });

    // 9. Return success
    return c.json(
      {
        success: true,
        applicationId,
        message: "Your application has been submitted successfully",
      },
      201
    );
  }
);

// =============================================================================
// SAVE DRAFT (Save & Continue)
// =============================================================================

/**
 * POST /public/jobs/:slug/apply/draft
 *
 * Save application progress for later.
 * Returns a resume token that can be used to continue.
 */
applyRoute.post(
  "/:slug/apply/draft",
  zValidator("json", SaveDraftSchema),
  async (c) => {
    const { slug } = c.req.param();
    const input = c.req.valid("json");

    const jobsRepository = new JobsRepository(c.env.DB);
    const applicationRepository = new ApplicationRepository(c.env.DB);

    // 1. Find the job by slug
    const job = await jobsRepository.getBySlug(slug);

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    // 2. Verify job is published
    if (job.status !== "published") {
      return c.json({ error: "This job is not accepting applications" }, 400);
    }

    // 3. Check if already applied
    const existing = await applicationRepository.findExistingApplication(
      job.id,
      input.email
    );

    if (existing) {
      return c.json(
        {
          error: "You have already applied to this job",
          applicationId: existing.id,
        },
        409
      );
    }

    // 4. Save or update draft
    const { draftId, resumeToken, expiresAt } = await applicationRepository.saveDraft(
      job.id,
      input
    );

    // 5. Calculate progress
    const questions: Array<{ archetypeId: string }> = JSON.parse(job.questions);
    const answeredCount = input.answers.filter((a) => a.answerText.trim().length > 0).length;

    return c.json(
      {
        success: true,
        draftId,
        resumeToken,
        expiresAt,
        progress: {
          answered: answeredCount,
          total: questions.length,
        },
        message: `Progress saved! You have ${7} days to complete your application.`,
      },
      200
    );
  }
);

// =============================================================================
// RESUME DRAFT
// =============================================================================

/**
 * GET /public/jobs/:slug/apply/draft/:draftId
 *
 * Resume a saved application draft.
 * Requires resume token in query param or header.
 */
applyRoute.get(
  "/:slug/apply/draft/:draftId",
  async (c) => {
    const { slug, draftId } = c.req.param();
    const resumeToken = c.req.query("token") ?? c.req.header("X-Resume-Token");

    if (!resumeToken) {
      return c.json({ error: "Resume token is required" }, 400);
    }

    const jobsRepository = new JobsRepository(c.env.DB);
    const applicationRepository = new ApplicationRepository(c.env.DB);

    // 1. Find the job
    const job = await jobsRepository.getBySlug(slug);

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    // 2. Get draft with token validation
    const draft = await applicationRepository.getDraftByToken(draftId, resumeToken);

    if (!draft) {
      return c.json(
        {
          error: "Draft not found or expired",
          message: "Your saved progress may have expired. Please start a new application.",
        },
        404
      );
    }

    // 3. Verify draft is for this job
    if (draft.jobId !== job.id) {
      return c.json({ error: "Draft not found" }, 404);
    }

    // 4. Check if already applied (race condition protection)
    const existing = await applicationRepository.findExistingApplication(
      job.id,
      draft.candidateEmail
    );

    if (existing) {
      // Clean up the draft
      await applicationRepository.deleteDraft(draftId);
      return c.json(
        {
          error: "You have already applied to this job",
          applicationId: existing.id,
        },
        409
      );
    }

    // 5. Parse saved answers
    const savedAnswers = JSON.parse(draft.answers);
    const questions: Array<{ archetypeId: string }> = JSON.parse(job.questions);
    const answeredCount = savedAnswers.filter(
      (a: { answerText: string }) => a.answerText?.trim().length > 0
    ).length;

    return c.json({
      draftId: draft.id,
      candidateEmail: draft.candidateEmail,
      candidateName: draft.candidateName,
      answers: savedAnswers,
      expiresAt: draft.expiresAt,
      progress: {
        answered: answeredCount,
        total: questions.length,
      },
    });
  }
);

export default applyRoute;
```

---

### 5. Create Queue Consumer for Evaluation

Update `src/queues/jobs.ts` to handle application evaluation:

```typescript
// Add to existing queue consumer

interface EvaluateApplicationMessage {
  type: "evaluate_application";
  applicationId: string;
  jobId: string;
}

// In the queue handler, add this case:
case "evaluate_application": {
  const { applicationId, jobId } = message as EvaluateApplicationMessage;

  try {
    // Import the evaluation pipeline from Phase 3
    const { evaluateApplication } = await import("../domain/signals/pipeline");

    await evaluateApplication({
      applicationId,
      db: env.DB,
      client: createLLMClient(env),
    });

    console.log(`Application ${applicationId} evaluated successfully`);
  } catch (error) {
    console.error(`Failed to evaluate application ${applicationId}:`, error);

    // Update application status to failed
    await env.DB.prepare(`
      UPDATE applications
      SET signals_status = 'failed',
          signals_error_message = ?,
          signals_error_code = 'EVALUATION_FAILED'
      WHERE id = ?
    `).bind(
      error instanceof Error ? error.message : "Unknown error",
      applicationId
    ).run();

    // Re-throw to trigger retry based on queue config
    throw error;
  }
  break;
}
```

---

### 6. Register Route

Update `src/routes/public/jobs/index.ts`:

```typescript
import { Hono } from "hono";
import getRoute from "./get";
import applyRoute from "./apply";
import type { Env } from "../../../types/bindings";

const publicJobsRoute = new Hono<{ Bindings: Env }>();

publicJobsRoute.route("/", getRoute);
publicJobsRoute.route("/", applyRoute);

export default publicJobsRoute;
```

---

### 7. Update Jobs Repository

Add `getBySlug` method to `src/domain/jobs/repository.ts` if it doesn't exist:

```typescript
/**
 * Get a published job by its slug.
 * Used for public job pages and applications.
 */
async getBySlug(slug: string): Promise<Job | null> {
  const result = await this.db
    .prepare(`
      SELECT * FROM jobs
      WHERE slug = ?
      LIMIT 1
    `)
    .bind(slug)
    .first();

  if (!result) return null;

  return this.mapJob(result);
}
```

Note: Removed `AND status = 'published'` filter so we can provide better error messages for unpublished jobs.

---

### 8. Create Index Export

Create `src/domain/applications/index.ts`:

```typescript
// Schemas
export {
  APPLICATION_STATUSES,
  DRAFT_EXPIRY_DAYS,
  PublicApplySchema,
  PublicApplyResponseSchema,
  AnswerInputSchema,
  SaveDraftSchema,
  SaveDraftResponseSchema,
  ResumeDraftSchema,
  ResumeDraftResponseSchema,
} from "./schemas";

export type {
  ApplicationStatus,
  PublicApplyInput,
  PublicApplyResponse,
  Application,
  Answer,
  ApplicationDraft,
  SaveDraftInput,
  SaveDraftResponse,
  ResumeDraftResponse,
} from "./schemas";

// Repository
export { ApplicationRepository } from "./repository";
```

---

### 9. Add Scheduled Draft Cleanup (Optional)

Add to `wrangler.toml`:

```toml
[triggers]
crons = ["0 0 * * *"]  # Run daily at midnight
```

Create `src/scheduled/cleanup.ts`:

```typescript
import { ApplicationRepository } from "../domain/applications/repository";

export async function handleScheduled(env: Env): Promise<void> {
  const repository = new ApplicationRepository(env.DB);

  const deletedCount = await repository.deleteExpiredDrafts();

  console.log(`Cleaned up ${deletedCount} expired drafts`);
}
```

---

## API Specification

### `POST /public/jobs/:slug/apply`

**Description:** Submit a complete job application. All questions must be answered.

**Authentication:** None (public endpoint)

**Rate Limiting:** Recommended 5 requests per IP per minute

**Path Parameters:**
- `slug` (string): The job's URL slug

**Request Body:**
```json
{
  "email": "candidate@example.com",
  "name": "Jane Doe",
  "answers": [
    {
      "archetypeId": "situational_uncertainty_story",
      "answerText": "When I was working at Company X, I faced a situation where..."
    },
    {
      "archetypeId": "ownership_of_outcome",
      "answerText": "In my previous role, I took full responsibility for..."
    },
    {
      "archetypeId": "failure_and_learning",
      "answerText": "A significant failure I experienced was when..."
    }
  ],
  "draftId": "optional-draft-id-if-resuming"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "applicationId": "abc123xyz",
  "message": "Your application has been submitted successfully"
}
```

**Error Responses:**

| Status | Scenario | Response |
|--------|----------|----------|
| 400 | Missing answers | `{ "error": "All questions must be answered", "missingQuestions": [...] }` |
| 400 | Job not published | `{ "error": "This job is not accepting applications" }` |
| 404 | Job not found | `{ "error": "Job not found" }` |
| 409 | Already applied | `{ "error": "You have already applied", "applicationId": "..." }` |
| 422 | Validation error | `{ "error": { "issues": [...] } }` |

---

### `POST /public/jobs/:slug/apply/draft`

**Description:** Save application progress for later completion.

**Request Body:**
```json
{
  "email": "candidate@example.com",
  "name": "Jane Doe",
  "answers": [
    {
      "archetypeId": "situational_uncertainty_story",
      "answerText": "When I was working at Company X..."
    },
    {
      "archetypeId": "ownership_of_outcome",
      "answerText": ""
    },
    {
      "archetypeId": "failure_and_learning",
      "answerText": ""
    }
  ]
}
```

**Success Response (200):**
```json
{
  "success": true,
  "draftId": "draft123",
  "resumeToken": "secure-random-token",
  "expiresAt": "2024-01-22T10:00:00Z",
  "progress": {
    "answered": 1,
    "total": 3
  },
  "message": "Progress saved! You have 7 days to complete your application."
}
```

---

### `GET /public/jobs/:slug/apply/draft/:draftId`

**Description:** Resume a saved application draft.

**Query Parameters:**
- `token` (string): Resume token from save response

**Headers (alternative):**
- `X-Resume-Token`: Resume token

**Success Response (200):**
```json
{
  "draftId": "draft123",
  "candidateEmail": "candidate@example.com",
  "candidateName": "Jane Doe",
  "answers": [
    { "archetypeId": "situational_uncertainty_story", "answerText": "When I was..." },
    { "archetypeId": "ownership_of_outcome", "answerText": "" },
    { "archetypeId": "failure_and_learning", "answerText": "" }
  ],
  "expiresAt": "2024-01-22T10:00:00Z",
  "progress": {
    "answered": 1,
    "total": 3
  }
}
```

---

## File Structure

```
src/domain/applications/
├── index.ts           # Exports
├── schemas.ts         # Zod schemas and types
└── repository.ts      # Database operations

src/routes/public/jobs/
├── index.ts           # Route registration (updated)
├── get.ts             # Existing GET endpoint
└── apply.ts           # NEW: Apply + Draft endpoints

migrations/
└── 0011_applications.sql  # NEW: Tables for applications, answers, drafts
```

---

## Testing Checklist

### Final Submission

1. **Happy path:** Submit valid application with all 3 answers
2. **Duplicate prevention:** Same email + job should return 409
3. **Validation:**
   - Missing email → 422
   - Missing name → 422
   - Answer too short (<50 chars) → 422
   - Missing any answer → 400 with list of missing questions
4. **Job state checks:**
   - Non-published job → 400
   - Job without questions → 400
   - Non-existent job → 404
5. **Queue integration:**
   - Application created → message queued

### Save & Continue

1. **Save draft:** Partial answers saved successfully
2. **Resume draft:** Correct answers returned with valid token
3. **Update draft:** Same email updates existing draft
4. **Expired draft:** Returns 404 after 7 days
5. **Invalid token:** Returns 404
6. **Already applied:** Returns 409 with application ID
7. **Draft cleanup:** Deleted on successful submission

### Progress Tracking

1. **Progress indicator:** Correct count of answered vs total
2. **All required:** Cannot submit until all 3 answered
