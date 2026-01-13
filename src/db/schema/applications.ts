/**
 * Applications Schema
 * ===================
 * Job applications, answers, and drafts for candidate tracking.
 */

import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { jobs } from "./jobs";

// Enums
export const applicationStatuses = [
  "pending",
  "screening",
  "assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof applicationStatuses)[number];

export const signalsStatuses = ["pending", "processing", "completed", "failed"] as const;
export type SignalsStatus = (typeof signalsStatuses)[number];

export const extractionStatuses = ["pending", "processing", "completed", "failed"] as const;
export type ExtractionStatus = (typeof extractionStatuses)[number];

/**
 * Applications
 * Candidate applications with signal extraction status and posture.
 */
export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    candidateEmail: text("candidate_email").notNull(),
    candidateName: text("candidate_name").notNull(),
    status: text("status", { enum: applicationStatuses }).notNull().default("pending"),
    signalsStatus: text("signals_status", { enum: signalsStatuses }).notNull().default("pending"),
    signalEvaluations: text("signal_evaluations"), // JSON: SignalStateResult
    decisionPosture: text("decision_posture"), // JSON: PostureResult
    signalsErrorMessage: text("signals_error_message"),
    signalsErrorCode: text("signals_error_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    signalsComputedAt: text("signals_computed_at"),
  },
  (table) => [
    index("idx_applications_job_id").on(table.jobId),
    index("idx_applications_status").on(table.status),
    index("idx_applications_signals_status").on(table.signalsStatus),
    index("idx_applications_candidate_email").on(table.candidateEmail),
    uniqueIndex("idx_applications_unique_candidate").on(table.jobId, table.candidateEmail),
  ]
);

/**
 * Answers
 * Individual question answers with signal extraction results.
 */
export const answers = sqliteTable(
  "answers",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    archetypeId: text("archetype_id").notNull(),
    questionText: text("question_text").notNull(),
    answerText: text("answer_text").notNull(),
    extractedSignals: text("extracted_signals"), // JSON: ExtractedSignal[]
    extractionStatus: text("extraction_status", { enum: extractionStatuses })
      .notNull()
      .default("pending"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    answeredAt: text("answered_at").notNull(),
    extractedAt: text("extracted_at"),
  },
  (table) => [
    index("idx_answers_application_id").on(table.applicationId),
    index("idx_answers_extraction_status").on(table.extractionStatus),
    uniqueIndex("idx_answers_unique").on(table.applicationId, table.archetypeId),
  ]
);

/**
 * Application Drafts
 * Save & continue functionality for partially completed applications.
 */
export const applicationDrafts = sqliteTable(
  "application_drafts",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    candidateEmail: text("candidate_email").notNull(),
    candidateName: text("candidate_name").notNull(),
    answers: text("answers").notNull().default("[]"), // JSON array
    resumeTokenHash: text("resume_token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_drafts_job_id").on(table.jobId),
    index("idx_drafts_email").on(table.candidateEmail),
    index("idx_drafts_expires").on(table.expiresAt),
    uniqueIndex("idx_drafts_unique_candidate").on(table.jobId, table.candidateEmail),
  ]
);

// Inferred types
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type Answer = typeof answers.$inferSelect;
export type NewAnswer = typeof answers.$inferInsert;
export type ApplicationDraft = typeof applicationDrafts.$inferSelect;
export type NewApplicationDraft = typeof applicationDrafts.$inferInsert;
