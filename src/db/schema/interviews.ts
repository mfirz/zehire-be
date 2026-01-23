/**
 * Interview Scheduling Schema
 * ===========================
 * Tables for interviewer management, availability, and scheduling.
 */

import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { orgs } from "./orgs";
import { jobs } from "./jobs";
import { applications } from "./applications";

// =============================================================================
// ENUMS
// =============================================================================

export const interviewerStatuses = ["invited", "active", "inactive"] as const;
export type InterviewerStatus = (typeof interviewerStatuses)[number];

export const calendarProviders = ["google", "outlook", "apple"] as const;
export type CalendarProvider = (typeof calendarProviders)[number];

export const interviewModes = ["any_one", "all_required"] as const;
export type InterviewMode = (typeof interviewModes)[number];

export const interviewStatuses = ["scheduled", "completed", "cancelled", "rescheduled", "no_show"] as const;
export type InterviewStatus = (typeof interviewStatuses)[number];

export const feedbackStatuses = ["pending", "submitted"] as const;
export type FeedbackStatus = (typeof feedbackStatuses)[number];

export const videoCallProviders = ["google_meet", "zoom", "teams", "other"] as const;
export type VideoCallProvider = (typeof videoCallProviders)[number];

// =============================================================================
// INTERVIEWERS
// =============================================================================

/**
 * Interviewers
 * Team members who can conduct interviews.
 */
export const interviewers = sqliteTable(
  "interviewers",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),

    // Magic link access
    magicToken: text("magic_token").unique().notNull(),
    magicTokenExpiresAt: text("magic_token_expires_at"),

    // Calendar integration (provider-agnostic)
    calendarProvider: text("calendar_provider", { enum: calendarProviders }), // "google", "outlook", "apple"
    calendarConnected: integer("calendar_connected", { mode: "boolean" }).default(false),
    calendarTokens: text("calendar_tokens"), // Encrypted JSON: { accessToken, refreshToken, expiresAt, ... }
    calendarId: text("calendar_id"), // Primary calendar ID (provider-specific format)

    // Timezone (for availability windows)
    timezone: text("timezone").default("UTC"),

    // Status
    status: text("status", { enum: interviewerStatuses }).default("invited"),
    invitedAt: text("invited_at"),
    connectedAt: text("connected_at"),

    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_interviewers_org").on(table.orgId),
    index("idx_interviewers_magic_token").on(table.magicToken),
    uniqueIndex("idx_interviewers_org_email").on(table.orgId, table.email),
  ]
);

export type Interviewer = typeof interviewers.$inferSelect;
export type NewInterviewer = typeof interviewers.$inferInsert;

// =============================================================================
// INTERVIEWER AVAILABILITY
// =============================================================================

/**
 * Interviewer Availability Windows
 * Recurring weekly preferences for when interviewers are willing to interview.
 */
export const interviewerAvailability = sqliteTable(
  "interviewer_availability",
  {
    id: text("id").primaryKey(),
    interviewerId: text("interviewer_id")
      .notNull()
      .references(() => interviewers.id, { onDelete: "cascade" }),

    dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 1=Monday, etc.
    startTime: text("start_time").notNull(), // "09:00" (24h format)
    endTime: text("end_time").notNull(), // "17:00"

    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_availability_interviewer").on(table.interviewerId)]
);

export type InterviewerAvailabilityRecord = typeof interviewerAvailability.$inferSelect;
export type NewInterviewerAvailability = typeof interviewerAvailability.$inferInsert;

// =============================================================================
// INTERVIEWER BLOCKED DATES
// =============================================================================

/**
 * Interviewer Blocked Dates
 * One-off unavailability (vacations, sick days, etc.)
 */
export const interviewerBlockedDates = sqliteTable(
  "interviewer_blocked_dates",
  {
    id: text("id").primaryKey(),
    interviewerId: text("interviewer_id")
      .notNull()
      .references(() => interviewers.id, { onDelete: "cascade" }),

    blockedDate: text("blocked_date").notNull(), // "2025-01-15"
    reason: text("reason"), // "Vacation", "Sick", etc.

    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_blocked_dates_interviewer").on(table.interviewerId),
    index("idx_blocked_dates_date").on(table.blockedDate),
  ]
);

export type InterviewerBlockedDate = typeof interviewerBlockedDates.$inferSelect;
export type NewInterviewerBlockedDate = typeof interviewerBlockedDates.$inferInsert;

// =============================================================================
// INTERVIEW STAGE CONFIG
// =============================================================================

/**
 * Interview Stage Configuration
 * Settings for each interview stage in a job's pipeline.
 */
export const interviewStageConfig = sqliteTable(
  "interview_stage_config",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    stageId: text("stage_id").notNull(),

    mode: text("mode", { enum: interviewModes }).default("any_one"),
    durationMinutes: integer("duration_minutes").default(45),
    bufferMinutes: integer("buffer_minutes").default(15),

    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("idx_stage_config_job_stage").on(table.jobId, table.stageId)]
);

export type InterviewStageConfigRecord = typeof interviewStageConfig.$inferSelect;
export type NewInterviewStageConfig = typeof interviewStageConfig.$inferInsert;

// =============================================================================
// INTERVIEW STAGE INTERVIEWERS
// =============================================================================

/**
 * Interview Stage Interviewers
 * Which interviewers are assigned to which stage.
 */
export const interviewStageInterviewers = sqliteTable(
  "interview_stage_interviewers",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    stageId: text("stage_id").notNull(),
    interviewerId: text("interviewer_id")
      .notNull()
      .references(() => interviewers.id, { onDelete: "cascade" }),

    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_stage_interviewers_job").on(table.jobId),
    index("idx_stage_interviewers_stage").on(table.stageId),
    uniqueIndex("idx_stage_interviewers_unique").on(table.jobId, table.stageId, table.interviewerId),
  ]
);

export type InterviewStageInterviewer = typeof interviewStageInterviewers.$inferSelect;
export type NewInterviewStageInterviewer = typeof interviewStageInterviewers.$inferInsert;

// =============================================================================
// SCHEDULED INTERVIEWS
// =============================================================================

/**
 * Scheduled Interviews
 * Actual booked interviews between candidates and interviewers.
 */
export const scheduledInterviews = sqliteTable(
  "scheduled_interviews",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    stageId: text("stage_id").notNull(),

    // Scheduling
    scheduledAt: text("scheduled_at").notNull(), // ISO datetime
    durationMinutes: integer("duration_minutes").notNull(),
    timezone: text("timezone").notNull(),

    // Video call
    videoCallLink: text("video_call_link"),
    videoCallProvider: text("video_call_provider", { enum: videoCallProviders }),

    // Status
    status: text("status", { enum: interviewStatuses }).default("scheduled"),
    cancelledReason: text("cancelled_reason"),
    rescheduledFromId: text("rescheduled_from_id"), // References previous interview

    // Calendar events
    candidateCalendarEventId: text("candidate_calendar_event_id"),

    // Reminders
    reminderSentAt: text("reminder_sent_at"), // ISO datetime, null until 24h reminder sent

    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_scheduled_interviews_application").on(table.applicationId),
    index("idx_scheduled_interviews_job").on(table.jobId),
    index("idx_scheduled_interviews_status").on(table.status),
    index("idx_scheduled_interviews_date").on(table.scheduledAt),
  ]
);

export type ScheduledInterview = typeof scheduledInterviews.$inferSelect;
export type NewScheduledInterview = typeof scheduledInterviews.$inferInsert;

// =============================================================================
// INTERVIEW PARTICIPANTS
// =============================================================================

/**
 * Interview Participants
 * Interviewers assigned to a specific scheduled interview.
 */
export const interviewParticipants = sqliteTable(
  "interview_participants",
  {
    id: text("id").primaryKey(),
    interviewId: text("interview_id")
      .notNull()
      .references(() => scheduledInterviews.id, { onDelete: "cascade" }),
    interviewerId: text("interviewer_id")
      .notNull()
      .references(() => interviewers.id, { onDelete: "cascade" }),

    // Calendar event on interviewer's calendar
    calendarEventId: text("calendar_event_id"),

    // Feedback
    feedbackStatus: text("feedback_status", { enum: feedbackStatuses }).default("pending"),
    feedbackSubmittedAt: text("feedback_submitted_at"),
    feedbackContent: text("feedback_content"), // JSON or text

    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_participants_interview").on(table.interviewId),
    index("idx_participants_interviewer").on(table.interviewerId),
    uniqueIndex("idx_participants_unique").on(table.interviewId, table.interviewerId),
  ]
);

export type InterviewParticipant = typeof interviewParticipants.$inferSelect;
export type NewInterviewParticipant = typeof interviewParticipants.$inferInsert;

// =============================================================================
// SCHEDULING TOKENS
// =============================================================================

/**
 * Scheduling Tokens
 * Magic links for candidates to self-schedule interviews.
 */
export const schedulingTokens = sqliteTable(
  "scheduling_tokens",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    stageId: text("stage_id").notNull(),

    token: text("token").unique().notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"), // NULL until used

    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_scheduling_tokens_token").on(table.token),
    index("idx_scheduling_tokens_application").on(table.applicationId),
  ]
);

export type SchedulingToken = typeof schedulingTokens.$inferSelect;
export type NewSchedulingToken = typeof schedulingTokens.$inferInsert;
