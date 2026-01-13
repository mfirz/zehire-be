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

// Re-export Drizzle types for database records (camelCase)
export type {
  Application,
  Answer,
  ApplicationDraft,
} from "../../db";

// =============================================================================
// RECRUITER API SCHEMAS (Phase 0B)
// =============================================================================

/**
 * Schema for updating application status.
 */
export const UpdateApplicationSchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
});

export type UpdateApplicationInput = z.infer<typeof UpdateApplicationSchema>;

/**
 * Application summary for list view.
 * Includes computed posture but not full signal details.
 */
export const ApplicationSummarySchema = z.object({
  id: z.string(),
  candidateEmail: z.string(),
  candidateName: z.string().nullable(),
  status: z.string(),
  signalsStatus: z.string(),
  decisionPosture: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ApplicationSummary = z.infer<typeof ApplicationSummarySchema>;

/**
 * Full application detail including answers and signals.
 */
export const ApplicationDetailSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  candidateEmail: z.string(),
  candidateName: z.string().nullable(),
  status: z.string(),
  signalsStatus: z.string(),
  decisionPosture: z.string().nullable(),
  signalEvaluations: z.unknown().nullable(), // Parsed JSON
  signalsErrorMessage: z.string().nullable(),
  signalsErrorCode: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  signalsComputedAt: z.string().nullable(),
  answers: z.array(
    z.object({
      id: z.string(),
      archetypeId: z.string(),
      questionText: z.string(),
      answerText: z.string().nullable(),
      extractedSignals: z.unknown().nullable(), // Parsed JSON
      extractionStatus: z.string(),
      answeredAt: z.string().nullable(),
      extractedAt: z.string().nullable(),
    })
  ),
});

export type ApplicationDetail = z.infer<typeof ApplicationDetailSchema>;

/**
 * Query parameters for listing applications.
 */
export const ListApplicationsQuerySchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  signalsStatus: z.enum(SIGNALS_STATUSES).optional(),
  posture: z.enum(["LOW_REGRET_RISK", "SOME_UNCERTAINTY", "HIGH_UNCERTAINTY"]).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sort: z.enum(["createdAt", "updatedAt", "candidateName"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type ListApplicationsQuery = z.infer<typeof ListApplicationsQuerySchema>;
