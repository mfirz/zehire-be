/**
 * Assessments Schema
 * ==================
 * Assessment definitions, parts, job linkage, candidate progress, and file uploads.
 * Supports a take-home assessment workflow with scheduling, submission, and evaluation.
 */

import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { orgs } from "./orgs";
import { jobs } from "./jobs";
import { applications } from "./applications";

// =============================================================================
// ENUMS
// =============================================================================

export const assessmentDefinitionStatuses = ["active", "archived"] as const;
export type AssessmentDefinitionStatus = (typeof assessmentDefinitionStatuses)[number];

export const candidateAssessmentStatuses = [
  "invited",
  "schedule_expired",
  "scheduled",
  "in_progress",
  "expired",
  "submitted",
  "evaluated",
  "cancelled",
] as const;
export type CandidateAssessmentStatus = (typeof candidateAssessmentStatuses)[number];

export const evaluationSignals = ["clear_evidence", "some_gaps", "insufficient_evidence"] as const;
export type EvaluationSignal = (typeof evaluationSignals)[number];

// =============================================================================
// ASSESSMENT DEFINITIONS
// =============================================================================

/**
 * Assessment Definitions
 * Library of reusable assessments owned by an organization.
 * Each definition has a scheduling config and one or more parts.
 */
export const assessmentDefinitions = sqliteTable(
  "assessment_definitions",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),

    // JSON: { scheduleWithinDays, completeWithinHours, maxReschedules }
    schedulingConfig: text("scheduling_config").notNull(),

    status: text("status", { enum: assessmentDefinitionStatuses }).notNull().default("active"),
    createdBy: text("created_by").notNull(),

    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_assessment_defs_org_status").on(table.orgId, table.status),
    index("idx_assessment_defs_org_created").on(table.orgId, table.createdAt),
  ]
);

export type AssessmentDefinition = typeof assessmentDefinitions.$inferSelect;
export type NewAssessmentDefinition = typeof assessmentDefinitions.$inferInsert;

// =============================================================================
// ASSESSMENT PARTS
// =============================================================================

/**
 * Assessment Parts
 * Individual sections of an assessment definition.
 * Each part has instructions and describes what evidence the candidate should provide.
 */
export const assessmentParts = sqliteTable(
  "assessment_parts",
  {
    id: text("id").primaryKey(),
    assessmentDefinitionId: text("assessment_definition_id")
      .notNull()
      .references(() => assessmentDefinitions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    instructions: text("instructions").notNull(),
    evidenceDescription: text("evidence_description").notNull(),
    required: integer("required", { mode: "boolean" }).notNull().default(true),
    orderIndex: integer("order_index").notNull().default(0),

    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_assessment_parts_def_order").on(table.assessmentDefinitionId, table.orderIndex),
  ]
);

export type AssessmentPart = typeof assessmentParts.$inferSelect;
export type NewAssessmentPart = typeof assessmentParts.$inferInsert;

// =============================================================================
// JOB ASSESSMENTS
// =============================================================================

/**
 * Job Assessments
 * Links a job to an assessment definition (one assessment per job).
 * When published, a snapshot of the definition is stored for immutability.
 */
export const jobAssessments = sqliteTable(
  "job_assessments",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    assessmentDefinitionId: text("assessment_definition_id")
      .notNull()
      .references(() => assessmentDefinitions.id),
    snapshot: text("snapshot"), // JSON blob, null for draft, populated on publish
    snapshotAt: text("snapshot_at"),

    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_job_assessments_job").on(table.jobId),
  ]
);

export type JobAssessment = typeof jobAssessments.$inferSelect;
export type NewJobAssessment = typeof jobAssessments.$inferInsert;

// =============================================================================
// CANDIDATE ASSESSMENTS
// =============================================================================

/**
 * Candidate Assessments
 * Tracks a candidate's assessment lifecycle: invite -> schedule -> submit -> evaluate.
 * One assessment per application.
 */
export const candidateAssessments = sqliteTable(
  "candidate_assessments",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),

    // Status
    status: text("status", { enum: candidateAssessmentStatuses }).notNull().default("invited"),

    // Candidate access token
    token: text("token").unique().notNull(),
    tokenExpiresAt: text("token_expires_at").notNull(),

    // Scheduling
    invitedAt: text("invited_at").notNull(),
    scheduleDeadline: text("schedule_deadline").notNull(),
    scheduledFor: text("scheduled_for"), // UTC datetime
    scheduledTimezone: text("scheduled_timezone"), // IANA timezone string
    completionDeadline: text("completion_deadline"), // UTC datetime
    startedAt: text("started_at"), // UTC datetime, set when candidate starts (in_progress)
    submittedAt: text("submitted_at"),
    rescheduleCount: integer("reschedule_count").notNull().default(0),

    // Evaluation
    evaluationSignal: text("evaluation_signal", { enum: evaluationSignals }),
    evaluationNotes: text("evaluation_notes"),
    evaluatedBy: text("evaluated_by"),
    evaluatedAt: text("evaluated_at"),
    evaluationUpdatedBy: text("evaluation_updated_by"),
    evaluationUpdatedAt: text("evaluation_updated_at"),

    // Cancellation
    cancelledAt: text("cancelled_at"),
    cancelReason: text("cancel_reason"),

    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_candidate_assessments_job_status").on(table.jobId, table.status),
    index("idx_candidate_assessments_application").on(table.applicationId),
    uniqueIndex("idx_candidate_assessments_unique_app").on(table.applicationId),
    index("idx_candidate_assessments_schedule_expiry").on(table.status, table.scheduleDeadline),
    index("idx_candidate_assessments_completion_expiry").on(table.status, table.completionDeadline),
  ]
);

export type CandidateAssessment = typeof candidateAssessments.$inferSelect;
export type NewCandidateAssessment = typeof candidateAssessments.$inferInsert;

// =============================================================================
// ASSESSMENT FILES
// =============================================================================

/**
 * Assessment Files
 * Files uploaded by candidates for specific assessment parts.
 * Stored in R2 with metadata tracked here.
 */
export const assessmentFiles = sqliteTable(
  "assessment_files",
  {
    id: text("id").primaryKey(),
    candidateAssessmentId: text("candidate_assessment_id")
      .notNull()
      .references(() => candidateAssessments.id, { onDelete: "cascade" }),
    partId: text("part_id").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: text("mime_type").notNull(),
    r2Key: text("r2_key").notNull(),
    uploadedAt: text("uploaded_at").notNull(),
  },
  (table) => [
    index("idx_assessment_files_candidate_part").on(table.candidateAssessmentId, table.partId),
  ]
);

export type AssessmentFile = typeof assessmentFiles.$inferSelect;
export type NewAssessmentFile = typeof assessmentFiles.$inferInsert;
