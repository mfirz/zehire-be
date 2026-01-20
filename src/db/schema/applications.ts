/**
 * Applications Schema
 * ===================
 * Job applications, answers, and drafts for candidate tracking.
 */

import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { jobs } from "./jobs";
import { users } from "./users";

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

export const triageStatuses = ["SHORTLIST", "MAYBE", "WEAK"] as const;
export type TriageStatus = (typeof triageStatuses)[number];

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

    // Candidate contact info
    candidateEmail: text("candidate_email").notNull(),
    candidateName: text("candidate_name").notNull(),
    preferredName: text("preferred_name"), // For personalization: "Hi {preferredName}!"
    phone: text("phone"),

    // Auto-detected from Cloudflare request
    detectedCountry: text("detected_country"), // ISO 3166-1 alpha-2: "US", "ID", "DE"
    detectedTimezone: text("detected_timezone"), // IANA timezone: "Asia/Jakarta"

    // CV/Resume storage (R2)
    cvPath: text("cv_path"), // R2 key: "cvs/{appId}/{filename}"
    cvFilename: text("cv_filename"), // Original filename: "resume.pdf"
    cvUploadedAt: text("cv_uploaded_at"), // ISO timestamp

    // CV processing (Phase 8)
    cvRawText: text("cv_raw_text"), // Extracted text from CV
    cvSummaryJson: text("cv_summary_json"), // Full LLM output backup
    cvExtractionStatus: text("cv_extraction_status").default("pending"), // 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
    cvContradictions: text("cv_contradictions"), // JSON array of contradiction objects
    totalYearsExperience: integer("total_years_experience"),
    hasManagementExperience: integer("has_management_experience", { mode: "boolean" }).default(false),

    // Application status
    status: text("status", { enum: applicationStatuses }).notNull().default("pending"),
    signalsStatus: text("signals_status", { enum: signalsStatuses }).notNull().default("pending"),
    signalEvaluations: text("signal_evaluations"), // JSON: SignalStateResult
    decisionPosture: text("decision_posture"), // JSON: PostureResult
    signalsErrorMessage: text("signals_error_message"),
    signalsErrorCode: text("signals_error_code"),

    // Triage status for quick decisions
    triageStatus: text("triage_status", { enum: triageStatuses }),

    // Custom questions screening (Phase 8)
    hasScreeningFailure: integer("has_screening_failure", { mode: "boolean" }).default(false),

    // Source tracking (organic, referral, etc.)
    source: text("source").default("organic"),

    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    signalsComputedAt: text("signals_computed_at"),
  },
  (table) => [
    index("idx_applications_job_id").on(table.jobId),
    index("idx_applications_status").on(table.status),
    index("idx_applications_signals_status").on(table.signalsStatus),
    index("idx_applications_triage_status").on(table.triageStatus),
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

    // Candidate contact info
    candidateEmail: text("candidate_email").notNull(),
    candidateName: text("candidate_name").notNull(),
    preferredName: text("preferred_name"),
    phone: text("phone"),

    // Draft data
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

/**
 * Application Notes
 * Recruiter notes for collaboration on applications.
 */
export const applicationNotes = sqliteTable(
  "application_notes",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    authorName: text("author_name").notNull(),
    content: text("content").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_application_notes_application_id").on(table.applicationId),
  ]
);

/**
 * Event types for timeline.
 */
export const eventTypes = [
  "status_change",
  "triage_change",
  "note_added",
  "note_deleted",
  "signals_started",
  "signals_completed",
  "signals_failed",
  "cv_uploaded",
] as const;
export type EventType = (typeof eventTypes)[number];

/**
 * Application Events
 * Activity timeline for audit trail.
 */
export const applicationEvents = sqliteTable(
  "application_events",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    eventType: text("event_type", { enum: eventTypes }).notNull(),
    actorId: text("actor_id").references(() => users.id),
    actorName: text("actor_name"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    metadata: text("metadata"), // JSON for additional data
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_application_events_application_id").on(table.applicationId),
    index("idx_application_events_created_at").on(table.createdAt),
  ]
);

// Inferred types
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type Answer = typeof answers.$inferSelect;
export type NewAnswer = typeof answers.$inferInsert;
export type ApplicationDraft = typeof applicationDrafts.$inferSelect;
export type NewApplicationDraft = typeof applicationDrafts.$inferInsert;
export type ApplicationNote = typeof applicationNotes.$inferSelect;
export type NewApplicationNote = typeof applicationNotes.$inferInsert;
export type ApplicationEvent = typeof applicationEvents.$inferSelect;
export type NewApplicationEvent = typeof applicationEvents.$inferInsert;
