/**
 * Jobs Schema
 * ===========
 * Job postings with LLM-generated context, questions, and pipeline.
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { orgs } from "./orgs";

// Enums
export const jobStatuses = ["draft", "published", "paused", "closed"] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const questionsStatuses = ["none", "pending", "processing", "completed", "failed"] as const;
export type QuestionsStatus = (typeof questionsStatuses)[number];

export const pipelineStatuses = ["none", "pending", "processing", "completed", "failed"] as const;
export type PipelineStatus = (typeof pipelineStatuses)[number];

export const workTypes = ["remote", "hybrid", "onsite"] as const;
export type WorkType = (typeof workTypes)[number];

export const employmentTypes = ["fulltime", "parttime", "contract", "internship"] as const;
export type EmploymentType = (typeof employmentTypes)[number];

export const salaryCurrencies = ["USD", "EUR", "GBP", "SGD", "IDR"] as const;
export type SalaryCurrency = (typeof salaryCurrencies)[number];

export const jobErrorCodes = [
  "INFERENCE_FAILED",
  "ARCHETYPE_RESOLUTION_FAILED",
  "QUESTION_RENDERING_FAILED",
  "PIPELINE_GENERATION_FAILED",
  "LLM_RATE_LIMITED",
  "LLM_TIMEOUT",
  "VALIDATION_ERROR",
  "INTERNAL_ERROR",
] as const;
export type JobErrorCode = (typeof jobErrorCodes)[number];

/**
 * Application form configuration.
 * Stored as JSON in jobs.application_config.
 */
export interface ApplicationConfig {
  /** Whether phone number is required (default: false) */
  requirePhone?: boolean;
  /** Whether to show CV upload option (default: true) */
  allowCv?: boolean;
  /** Whether CV upload is required (default: false) */
  requireCv?: boolean;
}

export const jobs = sqliteTable(
  "jobs",
  {
    // Primary key
    id: text("id").primaryKey(),
    orgId: text("org_id").references(() => orgs.id),

    // Status fields
    status: text("status", { enum: jobStatuses }).notNull().default("draft"),
    questionsStatus: text("questions_status", { enum: questionsStatuses }).notNull().default("none"),
    pipelineStatus: text("pipeline_status", { enum: pipelineStatuses }).default("none"),

    // Content fields
    title: text("title").notNull(),
    description: text("description").notNull(),
    descriptionText: text("description_text"),
    companyName: text("company_name"),
    department: text("department"),
    location: text("location"),

    // Job details
    workType: text("work_type", { enum: workTypes }).notNull().default("remote"),
    employmentType: text("employment_type", { enum: employmentTypes }).notNull().default("fulltime"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency", { enum: salaryCurrencies }),

    // LLM results (JSON stored as text)
    jobContext: text("job_context"),
    archetypes: text("archetypes"),
    questions: text("questions"),

    // Questions generation error tracking
    errorMessage: text("error_message"),
    errorCode: text("error_code", { enum: jobErrorCodes }),

    // Questions rate limiting
    regenerationCount: integer("regeneration_count").notNull().default(0),
    lastRegenerationAt: text("last_regeneration_at"),

    // Questions processing metadata
    processingStartedAt: text("processing_started_at"),
    processingDurationMs: integer("processing_duration_ms"),

    // Pipeline fields
    pipelineRecommendation: text("pipeline_recommendation"),
    pipeline: text("pipeline"), // DEPRECATED: Use interview_stages table + assessmentConfig
    assessmentConfig: text("assessment_config"), // JSON: { enabled, providerId, config }
    pipelineGeneratedAt: text("pipeline_generated_at"),
    pipelineError: text("pipeline_error"),
    pipelineErrorCode: text("pipeline_error_code", { enum: jobErrorCodes }),
    pipelineRegenerationCount: integer("pipeline_regeneration_count").default(0),
    pipelineLastRegenerationAt: text("pipeline_last_regeneration_at"),
    pipelineProcessingStartedAt: text("pipeline_processing_started_at"),
    pipelineProcessingDurationMs: integer("pipeline_processing_duration_ms"),

    // Public access
    publicSlug: text("public_slug"),

    // Application form configuration (JSON)
    applicationConfig: text("application_config", { mode: "json" }).$type<ApplicationConfig>(),

    // Timestamps
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
    publishedAt: text("published_at"),
    closedAt: text("closed_at"),
  },
  (table) => [
    index("idx_jobs_org_created").on(table.orgId, table.createdAt),
    index("idx_jobs_status_v2").on(table.orgId, table.status, table.createdAt),
    index("idx_jobs_public_slug").on(table.publicSlug),
    index("idx_jobs_questions_status").on(table.questionsStatus),
    index("idx_jobs_pipeline_status").on(table.orgId, table.pipelineStatus, table.createdAt),
  ]
);

// Inferred types
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
