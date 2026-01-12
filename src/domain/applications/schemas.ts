/**
 * Application Schemas
 * ===================
 * Zod schemas and types for candidate applications.
 *
 * Design: All Required + Smart Design
 * - 3 questions max (hard cap)
 * - All answers required for submission
 * - Save & Continue for 7 days
 */

import { z } from "zod";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Application status enum.
 */
export const APPLICATION_STATUSES = [
  "pending", // Just submitted, awaiting review
  "screening", // Under initial review
  "assessment", // In assessment phase
  "interview", // Interview scheduled/in progress
  "offer", // Offer extended
  "rejected", // Rejected by recruiter
  "withdrawn", // Withdrawn by candidate
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * Signal extraction status.
 */
export const SIGNALS_STATUSES = ["pending", "processing", "completed", "failed"] as const;

export type SignalsStatus = (typeof SIGNALS_STATUSES)[number];

/**
 * Answer extraction status.
 */
export const EXTRACTION_STATUSES = ["pending", "processing", "completed", "failed"] as const;

export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

/**
 * Draft expiry duration in days.
 */
export const DRAFT_EXPIRY_DAYS = 7;

/**
 * Minimum answer length in characters.
 */
export const MIN_ANSWER_LENGTH = 50;

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
  answerText: z
    .string()
    .min(MIN_ANSWER_LENGTH, `Please provide a more detailed answer (at least ${MIN_ANSWER_LENGTH} characters)`),
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

export type DraftAnswer = z.infer<typeof DraftAnswerSchema>;

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
  progress: z.object({
    answered: z.number(),
    total: z.number(),
  }),
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
export interface ApplicationRow {
  id: string;
  job_id: string;
  candidate_email: string;
  candidate_name: string;
  status: ApplicationStatus;
  signals_status: SignalsStatus;
  signal_evaluations: string | null;
  decision_posture: string | null;
  signals_error_message: string | null;
  signals_error_code: string | null;
  created_at: string;
  updated_at: string;
  signals_computed_at: string | null;
}

/**
 * Application record (camelCase for API).
 */
export interface Application {
  id: string;
  jobId: string;
  candidateEmail: string;
  candidateName: string;
  status: ApplicationStatus;
  signalsStatus: SignalsStatus;
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
export interface AnswerRow {
  id: string;
  application_id: string;
  archetype_id: string;
  question_text: string;
  answer_text: string;
  extracted_signals: string | null;
  extraction_status: ExtractionStatus;
  created_at: string;
  updated_at: string;
  answered_at: string;
  extracted_at: string | null;
}

/**
 * Answer record (camelCase for API).
 */
export interface Answer {
  id: string;
  applicationId: string;
  archetypeId: string;
  questionText: string;
  answerText: string;
  extractedSignals: string | null;
  extractionStatus: ExtractionStatus;
  createdAt: string;
  updatedAt: string;
  answeredAt: string;
  extractedAt: string | null;
}

/**
 * Draft record as stored in database.
 */
export interface ApplicationDraftRow {
  id: string;
  job_id: string;
  candidate_email: string;
  candidate_name: string;
  answers: string; // JSON
  resume_token_hash: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Draft record (camelCase for API).
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
