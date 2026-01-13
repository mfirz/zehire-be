/**
 * Zehire Job Schemas
 * ==================
 * Zod schemas for job-related validation and type safety.
 *
 * All external inputs are validated through these schemas.
 * Internal types are derived from schemas for DRY type safety.
 */

import { z } from "zod";
import { JobDescriptionSchema, TiptapDocSchema } from "../../lib/tiptap";
import { JOB_ERROR_CODES, JOB_STATUSES, PIPELINE_STATUSES, QUESTIONS_STATUSES } from "../../types/bindings";
import {
  PipelineConfigSchema,
  PipelineRecommendationSchema,
} from "../pipeline/types";
import {
  COLLABORATION_LEVELS,
  DECISION_IMPACTS,
  EXPERIENCE_LEVELS,
  JOB_DOMAINS,
  RISK_LEVELS,
  SIGNAL_IDS,
} from "./archetypes/types";

// =============================================================================
// JOB FIELD CONSTANTS
// =============================================================================

export const WORK_TYPES = ["remote", "hybrid", "onsite"] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const EMPLOYMENT_TYPES = ["fulltime", "parttime", "contract", "internship"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const SALARY_CURRENCIES = ["USD", "EUR", "GBP", "SGD", "IDR"] as const;
export type SalaryCurrency = (typeof SALARY_CURRENCIES)[number];

// =============================================================================
// INPUT SCHEMAS
// =============================================================================

/**
 * Schema for creating a new job.
 * Validates POST /v1/jobs request body.
 */
export const CreateJobInputSchema = z
  .object({
    title: z
      .string()
      .min(3, "Title must be at least 3 characters")
      .max(200, "Title must be at most 200 characters")
      .trim(),

    // Tiptap JSON document with content validation
    description: JobDescriptionSchema,

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

    // Required job type fields
    workType: z.enum(WORK_TYPES, {
      required_error: "Work type is required",
      invalid_type_error: "Work type must be 'remote', 'hybrid', or 'onsite'",
    }),

    employmentType: z.enum(EMPLOYMENT_TYPES, {
      required_error: "Employment type is required",
      invalid_type_error: "Employment type must be 'fulltime', 'parttime', 'contract', or 'internship'",
    }),

    // Optional salary fields
    salaryMin: z.number().min(0, "Salary minimum must be non-negative").optional().nullable(),
    salaryMax: z.number().min(0, "Salary maximum must be non-negative").optional().nullable(),
    salaryCurrency: z.enum(SALARY_CURRENCIES).optional().nullable(),
  })
  .refine(
    (data) => {
      // If both salaryMin and salaryMax are provided, max must be >= min
      if (data.salaryMin != null && data.salaryMax != null) {
        return data.salaryMax >= data.salaryMin;
      }
      return true;
    },
    {
      message: "Salary maximum must be greater than or equal to salary minimum",
      path: ["salaryMax"],
    }
  );

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
 * Uses camelCase to match Drizzle ORM output.
 */
export const JobRowSchema = z.object({
  id: z.string(),
  orgId: z.string().nullable(),

  // Visibility/billing lifecycle status
  status: z.enum(JOB_STATUSES),

  // Question generation status
  questionsStatus: z.enum(QUESTIONS_STATUSES),

  // Pipeline generation status
  pipelineStatus: z.enum(PIPELINE_STATUSES).nullable().default("none"),

  // Job content
  title: z.string(),
  description: z.string(), // Tiptap JSON stored as string
  descriptionText: z.string().nullable(), // Plain text extracted for LLM
  companyName: z.string().nullable(),
  department: z.string().nullable(),
  location: z.string().nullable(),

  // Job type fields
  workType: z.enum(WORK_TYPES),
  employmentType: z.enum(EMPLOYMENT_TYPES),

  // Salary fields
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  salaryCurrency: z.enum(SALARY_CURRENCIES).nullable(),

  // Public access
  publicSlug: z.string().nullable(),

  // Question generation results (JSON strings)
  jobContext: z.string().nullable(),
  archetypes: z.string().nullable(),
  questions: z.string().nullable(),

  // Pipeline generation results (JSON strings)
  pipelineRecommendation: z.string().nullable(),
  pipeline: z.string().nullable(),

  // Error details (for failed question generation)
  errorMessage: z.string().nullable(),
  errorCode: z.enum(JOB_ERROR_CODES).nullable(),

  // Pipeline error details
  pipelineError: z.string().nullable(),
  pipelineErrorCode: z.enum(JOB_ERROR_CODES).nullable(),

  // Regeneration rate limiting (questions)
  regenerationCount: z.number(),
  lastRegenerationAt: z.string().nullable(),

  // Regeneration rate limiting (pipeline)
  pipelineRegenerationCount: z.number().nullable().default(0),
  pipelineLastRegenerationAt: z.string().nullable(),

  // Processing timestamps (questions)
  processingStartedAt: z.string().nullable(),
  processingDurationMs: z.number().nullable(),

  // Processing timestamps (pipeline)
  pipelineProcessingStartedAt: z.string().nullable(),
  pipelineProcessingDurationMs: z.number().nullable(),
  pipelineGeneratedAt: z.string().nullable(),

  // Lifecycle timestamps
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  completedAt: z.string().nullable(), // When questions completed
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
  pipelineStatus: z.enum(PIPELINE_STATUSES),
  publicSlug: z.string().nullable(),
  companyName: z.string().nullable(),
  workType: z.enum(WORK_TYPES),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  department: z.string().nullable(),
  location: z.string().nullable(),
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  salaryCurrency: z.enum(SALARY_CURRENCIES).nullable(),
  descriptionPreview: z.string().nullable(),
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
});

export type JobListItem = z.infer<typeof JobListItemSchema>;

/**
 * Schema for capacity status (used by GET /v1/capacity).
 */
export const CapacityStatusSchema = z.object({
  /** Current count of published + paused jobs */
  activeRoles: z.number(),
  /** Max allowed from org.active_role_capacity */
  capacity: z.number(),
  /** activeRoles > capacity (soft state, no enforcement) */
  isOverCapacity: z.boolean(),
  /** activeRoles < capacity (can publish new roles) */
  canActivate: z.boolean(),
});

export type CapacityStatus = z.infer<typeof CapacityStatusSchema>;

/**
 * Schema for GET /v1/capacity response.
 * Contains capacity status for various resources.
 */
export const CapacityResponseSchema = z.object({
  /** Jobs (active roles) capacity */
  jobs: CapacityStatusSchema,
  // Future: users, candidates, etc.
});

export type CapacityResponse = z.infer<typeof CapacityResponseSchema>;

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
 * and questions/pipeline generation status.
 */
export const JobStatusResponseSchema = z.discriminatedUnion("status", [
  // Draft state - may or may not have questions/pipeline
  // Returns description as Tiptap JSON for editing
  z.object({
    id: z.string(),
    status: z.literal("draft"),
    questionsStatus: z.enum(QUESTIONS_STATUSES),
    pipelineStatus: z.enum(PIPELINE_STATUSES),
    title: z.string(),
    description: TiptapDocSchema, // JSON for Tiptap editor
    companyName: z.string().nullable(),
    department: z.string().nullable(),
    location: z.string().nullable(),
    // Job type fields
    workType: z.enum(WORK_TYPES),
    employmentType: z.enum(EMPLOYMENT_TYPES),
    // Salary fields
    salaryMin: z.number().nullable(),
    salaryMax: z.number().nullable(),
    salaryCurrency: z.enum(SALARY_CURRENCIES).nullable(),
    // Questions (if generated)
    jobContext: JobContextSchema.nullable(),
    archetypes: z.array(ResolvedArchetypeSchema).nullable(),
    questions: z.array(RenderedQuestionSchema).nullable(),
    // Pipeline (if generated)
    pipelineRecommendation: PipelineRecommendationSchema.nullable(),
    pipeline: PipelineConfigSchema.nullable(),
    // Error (if question generation failed)
    errorMessage: z.string().nullable(),
    errorCode: z.enum(JOB_ERROR_CODES).nullable(),
    // Pipeline error (if pipeline generation failed)
    pipelineError: z.string().nullable(),
    pipelineErrorCode: z.enum(JOB_ERROR_CODES).nullable(),
    // Regeneration info (questions)
    regenerationCount: z.number(),
    lastRegenerationAt: z.string().nullable(),
    // Regeneration info (pipeline)
    pipelineRegenerationCount: z.number(),
    pipelineLastRegenerationAt: z.string().nullable(),
    // Timestamps
    createdAt: z.string(),
    updatedAt: z.string(),
    processingStartedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    pipelineGeneratedAt: z.string().nullable(),
  }),

  // Published state - has questions and pipeline, is live
  // Returns description as pre-rendered HTML (read-only)
  z.object({
    id: z.string(),
    status: z.literal("published"),
    questionsStatus: z.literal("completed"), // Always completed when published
    pipelineStatus: z.literal("completed"), // Always completed when published
    title: z.string(),
    descriptionHtml: z.string(), // Pre-rendered HTML for display
    companyName: z.string().nullable(),
    department: z.string().nullable(),
    location: z.string().nullable(),
    publicSlug: z.string(),
    // Job type fields
    workType: z.enum(WORK_TYPES),
    employmentType: z.enum(EMPLOYMENT_TYPES),
    // Salary fields
    salaryMin: z.number().nullable(),
    salaryMax: z.number().nullable(),
    salaryCurrency: z.enum(SALARY_CURRENCIES).nullable(),
    // Questions (always present)
    jobContext: JobContextSchema,
    archetypes: z.array(ResolvedArchetypeSchema),
    questions: z.array(RenderedQuestionSchema),
    processingDurationMs: z.number(),
    // Pipeline (always present)
    pipelineRecommendation: PipelineRecommendationSchema,
    pipeline: PipelineConfigSchema,
    // Timestamps
    createdAt: z.string(),
    updatedAt: z.string(),
    publishedAt: z.string(),
    completedAt: z.string(),
    pipelineGeneratedAt: z.string(),
  }),

  // Paused state - was published, now paused
  // Returns description as pre-rendered HTML (read-only)
  z.object({
    id: z.string(),
    status: z.literal("paused"),
    questionsStatus: z.literal("completed"),
    pipelineStatus: z.literal("completed"),
    title: z.string(),
    descriptionHtml: z.string(), // Pre-rendered HTML for display
    companyName: z.string().nullable(),
    department: z.string().nullable(),
    location: z.string().nullable(),
    publicSlug: z.string(),
    // Job type fields
    workType: z.enum(WORK_TYPES),
    employmentType: z.enum(EMPLOYMENT_TYPES),
    // Salary fields
    salaryMin: z.number().nullable(),
    salaryMax: z.number().nullable(),
    salaryCurrency: z.enum(SALARY_CURRENCIES).nullable(),
    // Questions
    jobContext: JobContextSchema,
    archetypes: z.array(ResolvedArchetypeSchema),
    questions: z.array(RenderedQuestionSchema),
    processingDurationMs: z.number(),
    // Pipeline
    pipelineRecommendation: PipelineRecommendationSchema,
    pipeline: PipelineConfigSchema,
    // Timestamps
    createdAt: z.string(),
    updatedAt: z.string(),
    publishedAt: z.string(),
    completedAt: z.string(),
    pipelineGeneratedAt: z.string(),
  }),

  // Closed state - permanently closed
  // Returns description as pre-rendered HTML (read-only)
  z.object({
    id: z.string(),
    status: z.literal("closed"),
    questionsStatus: z.literal("completed"),
    pipelineStatus: z.literal("completed"),
    title: z.string(),
    descriptionHtml: z.string(), // Pre-rendered HTML for display
    companyName: z.string().nullable(),
    department: z.string().nullable(),
    location: z.string().nullable(),
    publicSlug: z.string().nullable(), // May or may not have been published
    // Job type fields
    workType: z.enum(WORK_TYPES),
    employmentType: z.enum(EMPLOYMENT_TYPES),
    // Salary fields
    salaryMin: z.number().nullable(),
    salaryMax: z.number().nullable(),
    salaryCurrency: z.enum(SALARY_CURRENCIES).nullable(),
    // Questions
    jobContext: JobContextSchema,
    archetypes: z.array(ResolvedArchetypeSchema),
    questions: z.array(RenderedQuestionSchema),
    processingDurationMs: z.number(),
    // Pipeline
    pipelineRecommendation: PipelineRecommendationSchema,
    pipeline: PipelineConfigSchema,
    // Timestamps
    createdAt: z.string(),
    updatedAt: z.string(),
    publishedAt: z.string().nullable(),
    closedAt: z.string(),
    completedAt: z.string(),
    pipelineGeneratedAt: z.string(),
  }),
]);

export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;

/**
 * Schema for public job view (for candidates, no auth).
 * Returns pre-rendered HTML for SSR/SEO.
 */
export const PublicJobResponseSchema = z.object({
  title: z.string(),
  companyName: z.string().nullable(),
  department: z.string().nullable(),
  location: z.string().nullable(),
  // Job type fields
  workType: z.enum(WORK_TYPES),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  // Salary fields
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  salaryCurrency: z.enum(SALARY_CURRENCIES).nullable(),
  // Content - pre-rendered HTML for SSR
  descriptionHtml: z.string(),
  questions: z.array(
    z.object({
      archetypeId: z.string(),
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
export const UpdateJobInputSchema = z
  .object({
    title: z
      .string()
      .min(3, "Title must be at least 3 characters")
      .max(200, "Title must be at most 200 characters")
      .trim()
      .optional(),

    // Tiptap JSON document with content validation (optional for updates)
    description: JobDescriptionSchema.optional(),

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

    // Job type fields (optional for updates)
    workType: z.enum(WORK_TYPES).optional(),
    employmentType: z.enum(EMPLOYMENT_TYPES).optional(),

    // Salary fields (optional for updates)
    salaryMin: z.number().min(0, "Salary minimum must be non-negative").optional().nullable(),
    salaryMax: z.number().min(0, "Salary maximum must be non-negative").optional().nullable(),
    salaryCurrency: z.enum(SALARY_CURRENCIES).optional().nullable(),
  })
  .refine(
    (data) => {
      // If both salaryMin and salaryMax are provided, max must be >= min
      if (data.salaryMin != null && data.salaryMax != null) {
        return data.salaryMax >= data.salaryMin;
      }
      return true;
    },
    {
      message: "Salary maximum must be greater than or equal to salary minimum",
      path: ["salaryMax"],
    }
  );

export type UpdateJobInput = z.infer<typeof UpdateJobInputSchema>;
