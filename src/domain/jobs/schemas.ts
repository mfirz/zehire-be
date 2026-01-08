/**
 * Zehire Job Schemas
 * ==================
 * Zod schemas for job-related validation and type safety.
 *
 * All external inputs are validated through these schemas.
 * Internal types are derived from schemas for DRY type safety.
 */

import { z } from "zod";
import { JOB_ERROR_CODES, JOB_STATUSES, QUESTIONS_STATUSES } from "../../types/bindings";
import {
  COLLABORATION_LEVELS,
  DECISION_IMPACTS,
  EXPERIENCE_LEVELS,
  JOB_DOMAINS,
  RISK_LEVELS,
  SIGNAL_IDS,
} from "./archetypes/types";

// =============================================================================
// INPUT SCHEMAS
// =============================================================================

/**
 * Schema for creating a new job.
 * Validates POST /v1/jobs request body.
 */
export const CreateJobInputSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must be at most 200 characters")
    .trim(),

  description: z
    .string()
    .min(50, "Description must be at least 50 characters")
    .max(50000, "Description must be at most 50,000 characters")
    .trim(),

  companyName: z
    .string()
    .max(200, "Company name must be at most 200 characters")
    .trim()
    .optional()
    .nullable(),

  department: z
    .string()
    .max(100, "Department must be at most 100 characters")
    .trim()
    .optional()
    .nullable(),

  location: z
    .string()
    .max(200, "Location must be at most 200 characters")
    .trim()
    .optional()
    .nullable(),
});

export type CreateJobInput = z.infer<typeof CreateJobInputSchema>;

// =============================================================================
// DATABASE ROW SCHEMAS
// =============================================================================

/**
 * Schema for job context (LLM inference output).
 * Stored as JSON in the job_context column.
 */
export const JobContextSchema = z.object({
  domain: z.enum(JOB_DOMAINS),
  specialization: z.string().nullable().optional(),
  riskLevel: z.enum(RISK_LEVELS),
  decisionImpact: z.enum(DECISION_IMPACTS),
  primarySignals: z.array(z.enum(SIGNAL_IDS)).min(1).max(5),
  collaborationRequired: z.enum(COLLABORATION_LEVELS),
  customerFacing: z.boolean(),
  peopleManagement: z.boolean(),
  regulatedEnvironment: z.boolean(),
  experienceLevel: z.enum(EXPERIENCE_LEVELS),
});

export type JobContextOutput = z.infer<typeof JobContextSchema>;

/**
 * Schema for a rendered question.
 * Stored as JSON array in the questions column.
 */
export const RenderedQuestionSchema = z.object({
  archetypeId: z.string(),
  questionText: z.string(),
  signals: z.array(z.enum(SIGNAL_IDS)),
  minAnswerWords: z.number().optional(),
  metadata: z.object({
    category: z.string(),
    formats: z.array(z.string()),
    renderingConstraints: z.object({
      requiresRealExample: z.boolean().optional(),
      forbidYesNo: z.boolean().optional(),
      singleQuestion: z.boolean().optional(),
      minAnswerWords: z.number().optional(),
      forbidPureTheory: z.boolean().optional(),
      maxQuestionLength: z.number().optional(),
    }),
  }),
});

export type RenderedQuestionOutput = z.infer<typeof RenderedQuestionSchema>;

/**
 * Schema for resolved archetype (subset stored in DB).
 */
export const ResolvedArchetypeSchema = z.object({
  id: z.string(),
  category: z.string(),
  description: z.string(),
  signals: z.array(z.enum(SIGNAL_IDS)),
  selectionReason: z.string(),
});

export type ResolvedArchetypeOutput = z.infer<typeof ResolvedArchetypeSchema>;

/**
 * Schema for a job row from the database.
 */
export const JobRowSchema = z.object({
  id: z.string(),
  org_id: z.string().nullable(),

  // Visibility/billing lifecycle status
  status: z.enum(JOB_STATUSES),

  // Question generation status
  questions_status: z.enum(QUESTIONS_STATUSES),

  // Job content
  title: z.string(),
  description: z.string(),
  company_name: z.string().nullable(),
  department: z.string().nullable(),
  location: z.string().nullable(),

  // Public access
  public_slug: z.string().nullable(),

  // Question generation results (JSON strings)
  job_context: z.string().nullable(),
  archetypes: z.string().nullable(),
  questions: z.string().nullable(),

  // Error details (for failed question generation)
  error_message: z.string().nullable(),
  error_code: z.enum(JOB_ERROR_CODES).nullable(),

  // Regeneration rate limiting
  regeneration_count: z.number(),
  last_regeneration_at: z.string().nullable(),

  // Processing timestamps
  processing_started_at: z.string().nullable(),
  processing_duration_ms: z.number().nullable(),

  // Lifecycle timestamps
  created_at: z.string(),
  updated_at: z.string(),
  published_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  completed_at: z.string().nullable(), // When questions completed
});

export type JobRow = z.infer<typeof JobRowSchema>;

/**
 * Schema for a job list item (minimal data for listing).
 */
export const JobListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(JOB_STATUSES),
  questionsStatus: z.enum(QUESTIONS_STATUSES),
  publicSlug: z.string().nullable(),
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
});

export type JobListItem = z.infer<typeof JobListItemSchema>;

/**
 * Schema for paginated job list response.
 */
export const JobListResponseSchema = z.object({
  data: z.array(JobListItemSchema),
  page: z.object({
    nextCursor: z.string().nullable(),
  }),
});

export type JobListResponse = z.infer<typeof JobListResponseSchema>;

// =============================================================================
// API RESPONSE SCHEMAS
// =============================================================================

/**
 * Schema for job creation response.
 * Returned immediately from POST /v1/jobs.
 */
export const CreateJobResponseSchema = z.object({
  id: z.string(),
  status: z.enum(JOB_STATUSES),
  questionsStatus: z.enum(QUESTIONS_STATUSES),
  createdAt: z.string(),
});

export type CreateJobResponse = z.infer<typeof CreateJobResponseSchema>;

/**
 * Schema for job status response (polling).
 * Returned from GET /v1/jobs/:id.
 *
 * Response varies by visibility status (draft/published/paused/closed)
 * and questions generation status.
 */
export const JobStatusResponseSchema = z.discriminatedUnion("status", [
  // Draft state - may or may not have questions
  z.object({
    id: z.string(),
    status: z.literal("draft"),
    questionsStatus: z.enum(QUESTIONS_STATUSES),
    title: z.string(),
    description: z.string(),
    companyName: z.string().nullable(),
    department: z.string().nullable(),
    location: z.string().nullable(),
    // Questions (if generated)
    jobContext: JobContextSchema.nullable(),
    archetypes: z.array(ResolvedArchetypeSchema).nullable(),
    questions: z.array(RenderedQuestionSchema).nullable(),
    // Error (if question generation failed)
    errorMessage: z.string().nullable(),
    errorCode: z.enum(JOB_ERROR_CODES).nullable(),
    // Regeneration info
    regenerationCount: z.number(),
    lastRegenerationAt: z.string().nullable(),
    // Timestamps
    createdAt: z.string(),
    updatedAt: z.string(),
    processingStartedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
  }),

  // Published state - has questions, is live
  z.object({
    id: z.string(),
    status: z.literal("published"),
    questionsStatus: z.literal("completed"), // Always completed when published
    title: z.string(),
    description: z.string(),
    companyName: z.string().nullable(),
    department: z.string().nullable(),
    location: z.string().nullable(),
    publicSlug: z.string(),
    // Questions (always present)
    jobContext: JobContextSchema,
    archetypes: z.array(ResolvedArchetypeSchema),
    questions: z.array(RenderedQuestionSchema),
    processingDurationMs: z.number(),
    // Timestamps
    createdAt: z.string(),
    updatedAt: z.string(),
    publishedAt: z.string(),
    completedAt: z.string(),
  }),

  // Paused state - was published, now paused
  z.object({
    id: z.string(),
    status: z.literal("paused"),
    questionsStatus: z.literal("completed"),
    title: z.string(),
    description: z.string(),
    companyName: z.string().nullable(),
    department: z.string().nullable(),
    location: z.string().nullable(),
    publicSlug: z.string(),
    // Questions
    jobContext: JobContextSchema,
    archetypes: z.array(ResolvedArchetypeSchema),
    questions: z.array(RenderedQuestionSchema),
    processingDurationMs: z.number(),
    // Timestamps
    createdAt: z.string(),
    updatedAt: z.string(),
    publishedAt: z.string(),
    completedAt: z.string(),
  }),

  // Closed state - permanently closed
  z.object({
    id: z.string(),
    status: z.literal("closed"),
    questionsStatus: z.literal("completed"),
    title: z.string(),
    description: z.string(),
    companyName: z.string().nullable(),
    department: z.string().nullable(),
    location: z.string().nullable(),
    publicSlug: z.string().nullable(), // May or may not have been published
    // Questions
    jobContext: JobContextSchema,
    archetypes: z.array(ResolvedArchetypeSchema),
    questions: z.array(RenderedQuestionSchema),
    processingDurationMs: z.number(),
    // Timestamps
    createdAt: z.string(),
    updatedAt: z.string(),
    publishedAt: z.string().nullable(),
    closedAt: z.string(),
    completedAt: z.string(),
  }),
]);

export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;

/**
 * Schema for public job view (for candidates, no auth).
 */
export const PublicJobResponseSchema = z.object({
  title: z.string(),
  companyName: z.string().nullable(),
  department: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string(),
  questions: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      minWords: z.number().optional(),
    })
  ),
});

export type PublicJobResponse = z.infer<typeof PublicJobResponseSchema>;

/**
 * Schema for job update input.
 * Used for PATCH /v1/jobs/:id.
 */
export const UpdateJobInputSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must be at most 200 characters")
    .trim()
    .optional(),

  description: z
    .string()
    .min(50, "Description must be at least 50 characters")
    .max(50000, "Description must be at most 50,000 characters")
    .trim()
    .optional(),

  companyName: z
    .string()
    .max(200, "Company name must be at most 200 characters")
    .trim()
    .optional()
    .nullable(),

  department: z
    .string()
    .max(100, "Department must be at most 100 characters")
    .trim()
    .optional()
    .nullable(),

  location: z
    .string()
    .max(200, "Location must be at most 200 characters")
    .trim()
    .optional()
    .nullable(),
});

export type UpdateJobInput = z.infer<typeof UpdateJobInputSchema>;
