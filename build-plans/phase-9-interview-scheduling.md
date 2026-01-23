# Phase 9: Interview Scheduling & Self-Service Booking

## Overview

Enable candidate self-scheduling for interviews with interviewer availability management and calendar integration.

**Core Philosophy:**
- Automation-first, not admin-heavy
- Recruiters don't manually schedule each interview
- Interviewers set availability once
- Candidates self-schedule after passing assessment
- Calendar sync handles real-time conflicts
- **Provider-agnostic**: Supports Google Calendar, Outlook, and future providers via abstraction layer

---

## User Roles & Access Model

| Role | Access Method | What They Do |
|------|---------------|--------------|
| Recruiter | Full account (email + password) | Add interviewers, create jobs, assign to stages |
| Interviewer | Magic link (no password) | Connect calendar, set availability, conduct interviews, add notes |
| Candidate | Magic link (no password) | Apply, complete assessment, self-schedule interview |

---

## UX Flows

### Flow 1: Recruiter Adds Interviewers (Onboarding)

```
Recruiter signs up
    ↓
Welcome screen (skippable):
┌─────────────────────────────────────────────────────┐
│  Welcome to Zehire 👋                               │
│                                                     │
│  To enable candidate self-scheduling,               │
│  invite your interview team.                        │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ sarah@company.com                        [+] │   │
│  │ tom@company.com                          [+] │   │
│  │ Add another...                               │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [Send invites & continue]    [Skip for now]       │
└─────────────────────────────────────────────────────┘
    ↓
If skipped → Reminder when assigning interviewers to job pipeline
```

### Flow 2: Interviewer Connects Calendar

```
Interviewer receives email:
┌─────────────────────────────────────────────────────┐
│  Subject: You've been added as an interviewer       │
│                                                     │
│  Hi Sarah,                                          │
│                                                     │
│  [Recruiter] added you as an interviewer at [Co].   │
│                                                     │
│  Connect your calendar so candidates can book:      │
│                                                     │
│  [Set up my calendar]                               │
│                                                     │
│  Takes 30 seconds. One-time setup.                  │
└─────────────────────────────────────────────────────┘
    ↓
Clicks link → Calendar provider selection:
┌─────────────────────────────────────────────────────┐
│  Connect your calendar                              │
│                                                     │
│  Choose your calendar provider:                     │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🔵 Google Calendar                          │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🔷 Microsoft Outlook                        │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🍎 Apple Calendar (coming soon)             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
    ↓
Selects provider → OAuth flow for that provider
    ↓
Set availability windows:
┌─────────────────────────────────────────────────────┐
│  ✅ Calendar connected                              │
│                                                     │
│  When are you available for interviews?             │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │ ☐ Mon    [ 9:00 AM ▾] - [ 5:00 PM ▾]          │ │
│  │ ☑ Tue    [ 1:00 PM ▾] - [ 4:00 PM ▾]          │ │
│  │ ☐ Wed                                          │ │
│  │ ☑ Thu    [ 1:00 PM ▾] - [ 4:00 PM ▾]          │ │
│  │ ☐ Fri                                          │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  Timezone: Asia/Jakarta (GMT+7) [Change]            │
│                                                     │
│  ℹ️ We'll only show candidates times when you're    │
│     actually free on your calendar.                 │
│                                                     │
│  [Save & done]                                      │
└─────────────────────────────────────────────────────┘
    ↓
Done. Can close tab.
```

### Flow 3: Recruiter Assigns Interviewers to Pipeline

```
Job creation → Pipeline generated by LLM
    ↓
Assign interviewers to each stage:
┌─────────────────────────────────────────────────────┐
│  Technical Interview                                │
│                                                     │
│  Interview mode:                                    │
│  ○ Any one available (first-come scheduling)        │
│  ● All required (panel interview)                   │
│                                                     │
│  Assign interviewers:                               │
│  ┌─────────────────────────────────────────────┐   │
│  │ ✅ Sarah Chen                                │   │
│  │    Tue/Thu 1-4pm · 12 slots/week            │   │
│  │                                              │   │
│  │ ✅ Tom Wilson                                │   │
│  │    Mon-Wed 2-5pm · 18 slots/week            │   │
│  │                                              │   │
│  │ ⚠️ Diana Lee — calendar not connected        │   │
│  │    [Resend invite]                           │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Combined availability: 8 slots/week                │
│  (intersection of all required interviewers)        │
│                                                     │
│  Duration: [45 min ▾]                               │
│  Buffer between interviews: [15 min ▾]              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Flow 4: Candidate Self-Schedules

```
Candidate passes assessment
    ↓
Email sent:
┌─────────────────────────────────────────────────────┐
│  Subject: Schedule your interview at [Company]      │
│                                                     │
│  Hi Ahmad,                                          │
│                                                     │
│  Great news! You've passed the assessment for       │
│  Senior Frontend Engineer.                          │
│                                                     │
│  Next step: Schedule your technical interview.      │
│                                                     │
│  [Choose a time that works for you]                 │
│                                                     │
│  This link expires in 7 days.                       │
└─────────────────────────────────────────────────────┘
    ↓
Clicks link → Scheduling page:
┌─────────────────────────────────────────────────────┐
│  Schedule your Technical Interview                  │
│  Senior Frontend Engineer at TechCorp               │
│                                                     │
│  Duration: 45 minutes                               │
│  Your timezone: Asia/Jakarta (GMT+7) [Change]       │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │     January 2025                            │   │
│  │  Su  Mo  Tu  We  Th  Fr  Sa                 │   │
│  │              1   2   3   4                  │   │
│  │   5   6  [7]  8  [9] 10  11                 │   │
│  │  12  13 [14] 15 [16] 17  18                 │   │
│  │  19  20 [21] 22 [23] 24  25                 │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Tuesday, Jan 7                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │ 1:00 PM │ │ 2:00 PM │ │ 3:00 PM │              │
│  └─────────┘ └─────────┘ └─────────┘              │
│                                                     │
│  [Confirm 2:00 PM on Tuesday, Jan 7]               │
└─────────────────────────────────────────────────────┘
    ↓
Confirmation:
┌─────────────────────────────────────────────────────┐
│  ✅ Interview scheduled!                            │
│                                                     │
│  Technical Interview                                │
│  Tuesday, January 7, 2025                           │
│  2:00 PM - 2:45 PM (Asia/Jakarta)                   │
│                                                     │
│  You'll interview with: Sarah Chen, Tom Wilson      │
│                                                     │
│  📅 Add to calendar: [Google] [Outlook] [iCal]      │
│                                                     │
│  A confirmation email has been sent.                │
│  You'll receive a reminder 24 hours before.         │
└─────────────────────────────────────────────────────┘
```

### Flow 5: Interviewer Dashboard (Magic Link Access)

```
Interviewer clicks magic link from email/calendar
    ↓
┌─────────────────────────────────────────────────────┐
│  Hi Sarah 👋                    [Edit availability] │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ [I'm unavailable today]                     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Upcoming interviews                                │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ TODAY · Tue, Jan 7 · 2:00 PM                │   │
│  │ Ahmad Rizky — Senior Frontend Engineer       │   │
│  │ Technical Interview · 45 min                 │   │
│  │                                              │   │
│  │ [View interview guide]  [Join video call]   │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Thu, Jan 9 · 1:00 PM                        │   │
│  │ Diana Chen — Product Designer                │   │
│  │ Culture Fit Interview · 30 min               │   │
│  │                                              │   │
│  │ [View interview guide]  [Join video call]   │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ────────────────────────────────────────────────  │
│  ⚠️ Feedback needed (2)                            │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Mon, Jan 6 · Ahmad Rizky                    │   │
│  │ [Add feedback]                              │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Flow 6: Post-Booking Conflict Resolution

```
Scenario: Interviewer marks unavailable after booking
    ↓
System detects conflict:
┌─────────────────────────────────────────────────────┐
│  ⚠️ You have 2 interviews during this time:        │
│                                                     │
│  • Tue 2pm — Ahmad Rizky (Frontend role)           │
│  • Tue 3pm — Sarah Lee (Backend role)              │
│                                                     │
│  [Auto-reassign to available interviewers]         │
│  [Notify candidates to reschedule]                 │
│  [Cancel - keep my availability]                   │
└─────────────────────────────────────────────────────┘

If "Any one" mode:
    → Auto-reassign to another available interviewer
    → Notify candidate: "You'll meet with [New Person]"

If "All required" mode (or no backup):
    → Email candidate with reschedule link
    → "Your interviewer is unavailable. Pick a new time."
```

---

## Database Schema (Drizzle ORM)

### Updates to Existing Tables

```typescript
// In src/db/schema/organizations.ts - add field:
videoCallProvider: text("video_call_provider", {
  enum: ["calendar_native", "zoom", "google_meet", "teams"]
}).default("calendar_native"),

// In src/db/schema/applications.ts - add fields:
currentStageId: text("current_stage_id"),
stageUpdatedAt: text("stage_updated_at"),
```

### New File: `src/db/schema/interviews.ts`

```typescript
/**
 * Interview Scheduling Schema
 * ===========================
 * Tables for interviewer management, availability, and scheduling.
 */

import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organizations } from "./organizations";
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
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),

    // Magic link access
    magicToken: text("magic_token").unique().notNull(),
    magicTokenExpiresAt: text("magic_token_expires_at"),

    // Calendar integration (provider-agnostic)
    calendarProvider: text("calendar_provider", { enum: calendarProviders }), // "google", "outlook", "apple"
    calendarConnected: integer("calendar_connected", { mode: "boolean" }).default(false),
    calendarTokens: text("calendar_tokens"),     // Encrypted JSON: { accessToken, refreshToken, expiresAt, ... }
    calendarId: text("calendar_id"),             // Primary calendar ID (provider-specific format)

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
    startTime: text("start_time").notNull(),     // "09:00" (24h format)
    endTime: text("end_time").notNull(),         // "17:00"

    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_availability_interviewer").on(table.interviewerId),
  ]
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
    reason: text("reason"),                       // "Vacation", "Sick", etc.

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
  (table) => [
    uniqueIndex("idx_stage_config_job_stage").on(table.jobId, table.stageId),
  ]
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
    scheduledAt: text("scheduled_at").notNull(),     // ISO datetime
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
    reminderSentAt: text("reminder_sent_at"),  // ISO datetime, null until 24h reminder sent

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
```

### Update `src/db/schema/index.ts`

```typescript
// Add to existing exports
export * from "./interviews";
```

---

## API Endpoints

### Interviewer Management (Recruiter)

```
POST   /v1/interviewers                    Create/invite interviewer
GET    /v1/interviewers                    List org's interviewers
GET    /v1/interviewers/:id                Get interviewer details
PATCH  /v1/interviewers/:id                Update interviewer
DELETE /v1/interviewers/:id                Remove interviewer
POST   /v1/interviewers/:id/resend-invite  Resend invite email
```

### Interviewer Self-Service (Magic Link)

```
GET    /i/:token                           Interviewer dashboard (magic link)
GET    /i/:token/interviews                List interviewer's interviews
GET    /i/:token/availability              Get availability windows
PUT    /i/:token/availability              Update availability windows
POST   /i/:token/block-date                Block a date
DELETE /i/:token/block-date/:dateId        Unblock a date
POST   /i/:token/unavailable-today         Quick "I'm out today"
```

### Calendar Provider OAuth (Provider-Agnostic)

```
GET    /auth/calendar/:provider/callback   OAuth callback (google, outlook, apple)
GET    /i/:token/connect/:provider         Start OAuth flow for provider
POST   /i/:token/disconnect                Disconnect calendar (for switching providers or cleanup)
GET    /i/:token/calendar-status           Check calendar connection status
```

**Note on disconnect**: When an interviewer disconnects their calendar:
- Their OAuth tokens are deleted
- They stop appearing as "available" for new bookings
- Existing scheduled interviews remain (recruiter is notified)
- They can reconnect with same or different provider

### Interview Stage Configuration (Recruiter)

```
GET    /v1/jobs/:jobId/stages/:stageId/config           Get stage config
PUT    /v1/jobs/:jobId/stages/:stageId/config           Update stage config
GET    /v1/jobs/:jobId/stages/:stageId/interviewers     List assigned interviewers
POST   /v1/jobs/:jobId/stages/:stageId/interviewers     Assign interviewer
DELETE /v1/jobs/:jobId/stages/:stageId/interviewers/:id Remove interviewer
GET    /v1/jobs/:jobId/stages/:stageId/availability     Preview available slots
```

### Candidate Scheduling (Public, Token-Protected)

```
GET    /schedule/:token                    Get scheduling page data
GET    /schedule/:token/slots              Get available time slots
POST   /schedule/:token/book               Book a slot
GET    /schedule/:token/confirmation       Get booking confirmation
POST   /schedule/:token/reschedule         Reschedule (if allowed)
POST   /schedule/:token/cancel             Cancel interview
```

### Scheduled Interviews (Recruiter)

```
GET    /v1/interviews                      List all scheduled interviews
GET    /v1/interviews/:id                  Get interview details
PATCH  /v1/interviews/:id                  Update interview (reschedule, cancel)
GET    /v1/applications/:id/interviews     List interviews for application
```

---

## API Details

### POST /v1/interviewers

Create/invite an interviewer.

**Request:**
```json
{
  "email": "sarah@company.com",
  "name": "Sarah Chen"
}
```

**Response (201):**
```json
{
  "id": "int_abc123",
  "email": "sarah@company.com",
  "name": "Sarah Chen",
  "status": "invited",
  "calendarConnected": false,
  "calendarProvider": null,
  "invitedAt": "2025-01-22T10:00:00Z",
  "magicLinkUrl": "https://zehire.com/i/xyz789token"
}
```

### GET /i/:token

Interviewer dashboard via magic link.

**Response (200):**
```json
{
  "interviewer": {
    "id": "int_abc123",
    "email": "sarah@company.com",
    "name": "Sarah Chen",
    "calendarConnected": true,
    "calendarProvider": "google",
    "timezone": "Asia/Jakarta"
  },
  "availability": [
    { "dayOfWeek": 2, "startTime": "13:00", "endTime": "16:00" },
    { "dayOfWeek": 4, "startTime": "13:00", "endTime": "16:00" }
  ],
  "upcomingInterviews": [
    {
      "id": "sch_xyz789",
      "candidateName": "Ahmad Rizky",
      "jobTitle": "Senior Frontend Engineer",
      "stageName": "Technical Interview",
      "scheduledAt": "2025-01-28T14:00:00+07:00",
      "durationMinutes": 45,
      "videoCallLink": "https://meet.google.com/abc-xyz",
      "interviewGuideUrl": "/i/xyz789token/interviews/sch_xyz789/guide"
    }
  ],
  "pendingFeedback": [
    {
      "interviewId": "sch_abc456",
      "candidateName": "Diana Lee",
      "completedAt": "2025-01-27T15:00:00+07:00"
    }
  ]
}
```

### PUT /i/:token/availability

Update availability windows.

**Request:**
```json
{
  "timezone": "Asia/Jakarta",
  "windows": [
    { "dayOfWeek": 1, "startTime": "14:00", "endTime": "17:00" },
    { "dayOfWeek": 2, "startTime": "13:00", "endTime": "16:00" },
    { "dayOfWeek": 4, "startTime": "13:00", "endTime": "16:00" }
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "availability": [
    { "dayOfWeek": 1, "startTime": "14:00", "endTime": "17:00" },
    { "dayOfWeek": 2, "startTime": "13:00", "endTime": "16:00" },
    { "dayOfWeek": 4, "startTime": "13:00", "endTime": "16:00" }
  ],
  "slotsPerWeek": 9
}
```

### GET /schedule/:token/slots

Get available slots for candidate scheduling.

**Query params:**
- `startDate` - Start of date range (default: today)
- `endDate` - End of date range (default: +14 days)
- `timezone` - Candidate's timezone

**Response (200):**
```json
{
  "job": {
    "title": "Senior Frontend Engineer",
    "company": "TechCorp"
  },
  "stage": {
    "name": "Technical Interview",
    "durationMinutes": 45
  },
  "interviewers": [
    { "name": "Sarah Chen" },
    { "name": "Tom Wilson" }
  ],
  "timezone": "Asia/Jakarta",
  "slots": [
    {
      "date": "2025-01-28",
      "times": ["13:00", "14:00", "15:00"]
    },
    {
      "date": "2025-01-30",
      "times": ["13:00", "14:00"]
    }
  ]
}
```

### POST /schedule/:token/book

Book an interview slot.

**Request:**
```json
{
  "date": "2025-01-28",
  "time": "14:00",
  "timezone": "Asia/Jakarta"
}
```

**Response (201):**
```json
{
  "success": true,
  "interview": {
    "id": "sch_xyz789",
    "scheduledAt": "2025-01-28T14:00:00+07:00",
    "durationMinutes": 45,
    "videoCallLink": "https://meet.google.com/abc-xyz",
    "interviewers": ["Sarah Chen", "Tom Wilson"],
    "addToCalendar": {
      "google": "https://calendar.google.com/...",
      "outlook": "https://outlook.live.com/...",
      "ical": "/schedule/xyz789/calendar.ics"
    }
  },
  "message": "Interview scheduled! You'll receive a confirmation email."
}
```

### PUT /v1/jobs/:jobId/stages/:stageId/config

Configure interview stage.

**Request:**
```json
{
  "mode": "all_required",
  "durationMinutes": 45,
  "bufferMinutes": 15
}
```

**Response (200):**
```json
{
  "stageId": "stage_tech_interview",
  "mode": "all_required",
  "durationMinutes": 45,
  "bufferMinutes": 15,
  "interviewers": [
    {
      "id": "int_abc123",
      "name": "Sarah Chen",
      "connected": true,
      "slotsPerWeek": 6
    },
    {
      "id": "int_def456",
      "name": "Tom Wilson",
      "connected": true,
      "slotsPerWeek": 9
    }
  ],
  "combinedSlotsPerWeek": 4
}
```

---

## Calendar Provider Abstraction

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     CalendarService                              │
│  (Orchestrates availability checks, event creation, etc.)        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CalendarProvider Interface                     │
│  getFreeBusy(), createEvent(), deleteEvent(), refreshToken()     │
└─────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ GoogleCalendar  │  │ OutlookCalendar │  │  AppleCalendar  │
│    Provider     │  │    Provider     │  │    Provider     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### CalendarProvider Interface

```typescript
// src/domain/calendar/types.ts

export type CalendarProviderType = "google" | "outlook" | "apple";

export interface BusyPeriod {
  start: string;  // ISO datetime
  end: string;    // ISO datetime
}

export interface CalendarTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;  // ISO datetime
  // Provider-specific fields stored here
  [key: string]: unknown;
}

export interface CalendarEventInput {
  summary: string;
  description: string;
  startTime: string;      // ISO datetime
  endTime: string;        // ISO datetime
  timezone: string;
  attendees: Array<{ email: string; name?: string }>;
  createVideoCall?: boolean;
}

export interface CalendarEvent {
  id: string;
  link: string;           // Calendar event link
  videoCallLink?: string; // Video call link if created
}

export interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  redirectUri: string;
}
```

### CalendarProvider Interface

```typescript
// src/domain/calendar/provider.ts

export interface CalendarProvider {
  readonly type: CalendarProviderType;

  /**
   * Get OAuth configuration for this provider.
   */
  getOAuthConfig(): OAuthConfig;

  /**
   * Build the OAuth authorization URL.
   */
  getAuthorizationUrl(state: string): string;

  /**
   * Exchange authorization code for tokens.
   */
  exchangeCodeForTokens(code: string): Promise<CalendarTokens>;

  /**
   * Refresh expired access token.
   */
  refreshAccessToken(tokens: CalendarTokens): Promise<CalendarTokens>;

  /**
   * Check if tokens need refresh.
   */
  needsRefresh(tokens: CalendarTokens): boolean;

  /**
   * Get free/busy information for a date range.
   */
  getFreeBusy(
    tokens: CalendarTokens,
    calendarId: string,
    startDate: Date,
    endDate: Date
  ): Promise<BusyPeriod[]>;

  /**
   * Create a calendar event.
   */
  createEvent(
    tokens: CalendarTokens,
    calendarId: string,
    event: CalendarEventInput
  ): Promise<CalendarEvent>;

  /**
   * Delete a calendar event.
   */
  deleteEvent(
    tokens: CalendarTokens,
    calendarId: string,
    eventId: string
  ): Promise<void>;

  /**
   * Update a calendar event.
   */
  updateEvent(
    tokens: CalendarTokens,
    calendarId: string,
    eventId: string,
    event: Partial<CalendarEventInput>
  ): Promise<CalendarEvent>;
}
```

### Google Calendar Provider Implementation

```typescript
// src/domain/calendar/providers/google.ts

import type { CalendarProvider, CalendarTokens, BusyPeriod, CalendarEventInput, CalendarEvent } from "../types";

export class GoogleCalendarProvider implements CalendarProvider {
  readonly type = "google" as const;

  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(env: { GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; GOOGLE_REDIRECT_URI: string }) {
    this.clientId = env.GOOGLE_CLIENT_ID;
    this.clientSecret = env.GOOGLE_CLIENT_SECRET;
    this.redirectUri = env.GOOGLE_REDIRECT_URI;
  }

  getOAuthConfig() {
    return {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      scopes: [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
      ],
      redirectUri: this.redirectUri,
    };
  }

  getAuthorizationUrl(state: string): string {
    const config = this.getOAuthConfig();
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: config.scopes.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `${config.authUrl}?${params}`;
  }

  async exchangeCodeForTokens(code: string): Promise<CalendarTokens> {
    const config = this.getOAuthConfig();
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }

  async refreshAccessToken(tokens: CalendarTokens): Promise<CalendarTokens> {
    const config = this.getOAuthConfig();
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: tokens.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
      }),
    });

    const data = await response.json();
    return {
      ...tokens,
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }

  needsRefresh(tokens: CalendarTokens): boolean {
    const expiresAt = new Date(tokens.expiresAt);
    const now = new Date();
    // Refresh if expires in less than 5 minutes
    return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
  }

  async getFreeBusy(
    tokens: CalendarTokens,
    calendarId: string,
    startDate: Date,
    endDate: Date
  ): Promise<BusyPeriod[]> {
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          items: [{ id: calendarId || "primary" }],
        }),
      }
    );

    const data = await response.json();
    return data.calendars[calendarId || "primary"].busy;
  }

  async createEvent(
    tokens: CalendarTokens,
    calendarId: string,
    event: CalendarEventInput
  ): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startTime, timeZone: event.timezone },
      end: { dateTime: event.endTime, timeZone: event.timezone },
      attendees: event.attendees.map((a) => ({ email: a.email })),
    };

    if (event.createVideoCall) {
      body.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calendarId || "primary"}/events`);
    if (event.createVideoCall) {
      url.searchParams.set("conferenceDataVersion", "1");
    }

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return {
      id: data.id,
      link: data.htmlLink,
      videoCallLink: data.conferenceData?.entryPoints?.[0]?.uri,
    };
  }

  async deleteEvent(tokens: CalendarTokens, calendarId: string, eventId: string): Promise<void> {
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId || "primary"}/events/${eventId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      }
    );
  }

  async updateEvent(
    tokens: CalendarTokens,
    calendarId: string,
    eventId: string,
    event: Partial<CalendarEventInput>
  ): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {};
    if (event.summary) body.summary = event.summary;
    if (event.description) body.description = event.description;
    if (event.startTime && event.timezone) {
      body.start = { dateTime: event.startTime, timeZone: event.timezone };
    }
    if (event.endTime && event.timezone) {
      body.end = { dateTime: event.endTime, timeZone: event.timezone };
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId || "primary"}/events/${eventId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();
    return {
      id: data.id,
      link: data.htmlLink,
      videoCallLink: data.conferenceData?.entryPoints?.[0]?.uri,
    };
  }
}
```

### Outlook Calendar Provider Implementation

```typescript
// src/domain/calendar/providers/outlook.ts

import type { CalendarProvider, CalendarTokens, BusyPeriod, CalendarEventInput, CalendarEvent } from "../types";

export class OutlookCalendarProvider implements CalendarProvider {
  readonly type = "outlook" as const;

  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(env: { OUTLOOK_CLIENT_ID: string; OUTLOOK_CLIENT_SECRET: string; OUTLOOK_REDIRECT_URI: string }) {
    this.clientId = env.OUTLOOK_CLIENT_ID;
    this.clientSecret = env.OUTLOOK_CLIENT_SECRET;
    this.redirectUri = env.OUTLOOK_REDIRECT_URI;
  }

  getOAuthConfig() {
    return {
      authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      scopes: [
        "Calendars.ReadWrite",
        "OnlineMeetings.ReadWrite",
        "offline_access",
      ],
      redirectUri: this.redirectUri,
    };
  }

  getAuthorizationUrl(state: string): string {
    const config = this.getOAuthConfig();
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: config.scopes.join(" "),
      state,
    });
    return `${config.authUrl}?${params}`;
  }

  async exchangeCodeForTokens(code: string): Promise<CalendarTokens> {
    const config = this.getOAuthConfig();
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }

  async refreshAccessToken(tokens: CalendarTokens): Promise<CalendarTokens> {
    const config = this.getOAuthConfig();
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: tokens.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
      }),
    });

    const data = await response.json();
    return {
      ...tokens,
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }

  needsRefresh(tokens: CalendarTokens): boolean {
    const expiresAt = new Date(tokens.expiresAt);
    const now = new Date();
    return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
  }

  async getFreeBusy(
    tokens: CalendarTokens,
    calendarId: string,
    startDate: Date,
    endDate: Date
  ): Promise<BusyPeriod[]> {
    // Microsoft Graph API uses different endpoint
    const response = await fetch(
      "https://graph.microsoft.com/v1.0/me/calendar/getSchedule",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schedules: [calendarId || "me"],
          startTime: { dateTime: startDate.toISOString(), timeZone: "UTC" },
          endTime: { dateTime: endDate.toISOString(), timeZone: "UTC" },
        }),
      }
    );

    const data = await response.json();
    const schedule = data.value?.[0]?.scheduleItems || [];
    return schedule.map((item: { start: { dateTime: string }; end: { dateTime: string } }) => ({
      start: item.start.dateTime,
      end: item.end.dateTime,
    }));
  }

  async createEvent(
    tokens: CalendarTokens,
    calendarId: string,
    event: CalendarEventInput
  ): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {
      subject: event.summary,
      body: { contentType: "text", content: event.description },
      start: { dateTime: event.startTime, timeZone: event.timezone },
      end: { dateTime: event.endTime, timeZone: event.timezone },
      attendees: event.attendees.map((a) => ({
        emailAddress: { address: a.email, name: a.name },
        type: "required",
      })),
    };

    if (event.createVideoCall) {
      body.isOnlineMeeting = true;
      body.onlineMeetingProvider = "teamsForBusiness";
    }

    const response = await fetch(
      "https://graph.microsoft.com/v1.0/me/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();
    return {
      id: data.id,
      link: data.webLink,
      videoCallLink: data.onlineMeeting?.joinUrl,
    };
  }

  async deleteEvent(tokens: CalendarTokens, calendarId: string, eventId: string): Promise<void> {
    await fetch(
      `https://graph.microsoft.com/v1.0/me/events/${eventId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      }
    );
  }

  async updateEvent(
    tokens: CalendarTokens,
    calendarId: string,
    eventId: string,
    event: Partial<CalendarEventInput>
  ): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {};
    if (event.summary) body.subject = event.summary;
    if (event.description) body.body = { contentType: "text", content: event.description };
    if (event.startTime && event.timezone) {
      body.start = { dateTime: event.startTime, timeZone: event.timezone };
    }
    if (event.endTime && event.timezone) {
      body.end = { dateTime: event.endTime, timeZone: event.timezone };
    }

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/events/${eventId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();
    return {
      id: data.id,
      link: data.webLink,
      videoCallLink: data.onlineMeeting?.joinUrl,
    };
  }
}
```

### Calendar Provider Factory

```typescript
// src/domain/calendar/factory.ts

import type { CalendarProvider, CalendarProviderType } from "./types";
import { GoogleCalendarProvider } from "./providers/google";
import { OutlookCalendarProvider } from "./providers/outlook";

export function createCalendarProvider(
  type: CalendarProviderType,
  env: Record<string, string>
): CalendarProvider {
  switch (type) {
    case "google":
      return new GoogleCalendarProvider({
        GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI: env.GOOGLE_REDIRECT_URI,
      });
    case "outlook":
      return new OutlookCalendarProvider({
        OUTLOOK_CLIENT_ID: env.OUTLOOK_CLIENT_ID,
        OUTLOOK_CLIENT_SECRET: env.OUTLOOK_CLIENT_SECRET,
        OUTLOOK_REDIRECT_URI: env.OUTLOOK_REDIRECT_URI,
      });
    case "apple":
      throw new Error("Apple Calendar provider not yet implemented");
    default:
      throw new Error(`Unknown calendar provider: ${type}`);
  }
}
```

### Calendar Service (Orchestration Layer)

```typescript
// src/domain/calendar/service.ts

import type { CalendarProvider, CalendarTokens, BusyPeriod, CalendarEventInput, CalendarEvent } from "./types";
import { createCalendarProvider } from "./factory";
import type { Interviewer } from "../../db/schema";

export class CalendarService {
  private env: Record<string, string>;

  constructor(env: Record<string, string>) {
    this.env = env;
  }

  /**
   * Get provider for an interviewer.
   */
  private getProvider(interviewer: Interviewer): CalendarProvider {
    if (!interviewer.calendarProvider) {
      throw new Error("Interviewer has no calendar connected");
    }
    return createCalendarProvider(interviewer.calendarProvider, this.env);
  }

  /**
   * Get tokens, refreshing if needed.
   */
  private async getValidTokens(
    interviewer: Interviewer,
    provider: CalendarProvider,
    updateTokens: (tokens: CalendarTokens) => Promise<void>
  ): Promise<CalendarTokens> {
    const tokens: CalendarTokens = JSON.parse(interviewer.calendarTokens || "{}");

    if (provider.needsRefresh(tokens)) {
      const newTokens = await provider.refreshAccessToken(tokens);
      await updateTokens(newTokens);
      return newTokens;
    }

    return tokens;
  }

  /**
   * Get free/busy for multiple interviewers (handles different providers).
   */
  async getFreeBusy(
    interviewers: Interviewer[],
    startDate: Date,
    endDate: Date,
    updateTokens: (interviewerId: string, tokens: CalendarTokens) => Promise<void>
  ): Promise<Map<string, BusyPeriod[]>> {
    const results = new Map<string, BusyPeriod[]>();

    await Promise.all(
      interviewers.map(async (interviewer) => {
        if (!interviewer.calendarConnected || !interviewer.calendarProvider) {
          results.set(interviewer.id, []);
          return;
        }

        try {
          const provider = this.getProvider(interviewer);
          const tokens = await this.getValidTokens(
            interviewer,
            provider,
            (t) => updateTokens(interviewer.id, t)
          );
          const busy = await provider.getFreeBusy(
            tokens,
            interviewer.calendarId || "primary",
            startDate,
            endDate
          );
          results.set(interviewer.id, busy);
        } catch (error) {
          console.error(`Failed to get free/busy for ${interviewer.id}:`, error);
          results.set(interviewer.id, []);
        }
      })
    );

    return results;
  }

  /**
   * Create calendar events for all participants.
   */
  async createEvents(
    interviewers: Interviewer[],
    event: CalendarEventInput,
    updateTokens: (interviewerId: string, tokens: CalendarTokens) => Promise<void>
  ): Promise<Map<string, CalendarEvent>> {
    const results = new Map<string, CalendarEvent>();

    // Create on primary interviewer's calendar first (with video call)
    const primaryInterviewer = interviewers[0];
    if (primaryInterviewer.calendarConnected && primaryInterviewer.calendarProvider) {
      const provider = this.getProvider(primaryInterviewer);
      const tokens = await this.getValidTokens(
        primaryInterviewer,
        provider,
        (t) => updateTokens(primaryInterviewer.id, t)
      );
      const calendarEvent = await provider.createEvent(
        tokens,
        primaryInterviewer.calendarId || "primary",
        { ...event, createVideoCall: true }
      );
      results.set(primaryInterviewer.id, calendarEvent);

      // Update event for other interviewers to include video call link
      const eventWithVideo = { ...event, description: `${event.description}\n\nVideo Call: ${calendarEvent.videoCallLink}` };

      // Create on other interviewers' calendars (no new video call)
      await Promise.all(
        interviewers.slice(1).map(async (interviewer) => {
          if (!interviewer.calendarConnected || !interviewer.calendarProvider) return;

          try {
            const p = this.getProvider(interviewer);
            const t = await this.getValidTokens(interviewer, p, (tk) => updateTokens(interviewer.id, tk));
            const evt = await p.createEvent(t, interviewer.calendarId || "primary", eventWithVideo);
            results.set(interviewer.id, evt);
          } catch (error) {
            console.error(`Failed to create event for ${interviewer.id}:`, error);
          }
        })
      );
    }

    return results;
  }
}
```

### OAuth Flow (Provider-Agnostic)

```
1. Interviewer selects provider (Google, Outlook, etc.)
    ↓
2. Redirect to provider's OAuth:
   GET /i/:token/connect/:provider
    ↓
   System calls provider.getAuthorizationUrl(state)
    ↓
   Redirects to provider's consent screen
    ↓
3. User grants permission
    ↓
4. Callback receives code:
   GET /auth/calendar/:provider/callback?code={CODE}&state={interviewer_token}
    ↓
5. Exchange code for tokens:
   provider.exchangeCodeForTokens(code)
    ↓
6. Store encrypted tokens + provider type in interviewer record
    ↓
7. Redirect to availability setup page
```

---

## Slot Calculation Logic

```typescript
interface TimeSlot {
  date: string;        // "2025-01-28"
  time: string;        // "14:00"
  interviewerIds: string[];
}

function calculateSlots(
  windows: AvailabilityWindow[],
  blockedDates: BlockedDate[],
  freeBusy: FreeBusyResult[],
  durationMinutes: number,
  bufferMinutes: number,
  mode: 'any_one' | 'all_required'
): TimeSlot[] {

  const slots: TimeSlot[] = [];
  const slotDuration = durationMinutes + bufferMinutes;

  // For each day in the range
  for (const day of dateRange) {
    const dayOfWeek = day.getDay();

    // Get windows for this day of week, per interviewer
    const dayWindows = groupBy(
      windows.filter(w => w.dayOfWeek === dayOfWeek),
      'interviewerId'
    );

    // Skip if day is blocked for any required interviewer
    const blockedForDay = blockedDates.filter(b => b.date === day);

    if (mode === 'all_required') {
      // ALL interviewers must be available
      // Find intersection of all windows
      const intersectedWindows = intersectWindows(dayWindows);

      for (const window of intersectedWindows) {
        // Generate slots within window
        const windowSlots = generateSlotsInWindow(window, slotDuration);

        // Filter out busy times (all must be free)
        const availableSlots = windowSlots.filter(slot =>
          freeBusy.every(fb => !isOverlapping(slot, fb.busy))
        );

        slots.push(...availableSlots);
      }
    } else {
      // ANY ONE interviewer available
      // Union of all windows, track which interviewer(s) available
      for (const [interviewerId, interviewerWindows] of Object.entries(dayWindows)) {
        for (const window of interviewerWindows) {
          const windowSlots = generateSlotsInWindow(window, slotDuration);

          const interviewerFreeBusy = freeBusy.find(fb => fb.interviewerId === interviewerId);
          const availableSlots = windowSlots.filter(slot =>
            !isOverlapping(slot, interviewerFreeBusy?.busy || [])
          );

          // Add slots, merging if same time exists
          for (const slot of availableSlots) {
            const existing = slots.find(s => s.date === slot.date && s.time === slot.time);
            if (existing) {
              existing.interviewerIds.push(interviewerId);
            } else {
              slots.push({ ...slot, interviewerIds: [interviewerId] });
            }
          }
        }
      }
    }
  }

  return slots;
}
```

---

## Edge Cases & Error Handling

### Race Condition: Double Booking

```typescript
async function bookSlot(token: string, date: string, time: string) {
  // 1. Verify slot is still available (real-time check)
  const isAvailable = await checkSlotAvailable(token, date, time);

  if (!isAvailable) {
    throw new ConflictError(
      'SLOT_TAKEN',
      'This slot was just booked. Please choose another time.'
    );
  }

  // 2. Use database transaction with optimistic locking
  await db.transaction(async (tx) => {
    // Double-check within transaction
    const existingBooking = await tx.query(`
      SELECT id FROM scheduled_interviews
      WHERE job_id = ? AND stage_id = ?
      AND scheduled_at = ? AND status = 'scheduled'
      FOR UPDATE
    `);

    if (existingBooking) {
      throw new ConflictError('SLOT_TAKEN', '...');
    }

    // Create booking
    await tx.insert(scheduledInterviews).values({...});
  });
}
```

### Token Expiry

```typescript
// Scheduling token expires after 7 days
const SCHEDULING_TOKEN_EXPIRY_DAYS = 7;

// On token access
async function validateSchedulingToken(token: string) {
  const record = await db.query(`
    SELECT * FROM scheduling_tokens WHERE token = ?
  `).get(token);

  if (!record) {
    throw new NotFoundError('INVALID_TOKEN', 'This scheduling link is invalid.');
  }

  if (record.usedAt) {
    throw new ConflictError('ALREADY_BOOKED', 'You have already scheduled this interview.');
  }

  if (new Date(record.expiresAt) < new Date()) {
    throw new GoneError('TOKEN_EXPIRED', 'This scheduling link has expired. Please contact the recruiter.');
  }

  return record;
}
```

### Interviewer Disconnects Calendar

```typescript
// When interviewer disconnects Google Calendar
async function handleCalendarDisconnect(interviewerId: string) {
  // 1. Mark as disconnected
  await db.update(interviewers)
    .set({ googleCalendarConnected: false })
    .where(eq(interviewers.id, interviewerId));

  // 2. Check for upcoming interviews
  const upcomingInterviews = await db.query(`
    SELECT si.* FROM scheduled_interviews si
    JOIN interview_participants ip ON ip.interview_id = si.id
    WHERE ip.interviewer_id = ?
    AND si.scheduled_at > datetime('now')
    AND si.status = 'scheduled'
  `).all(interviewerId);

  // 3. Alert recruiter if there are upcoming interviews
  if (upcomingInterviews.length > 0) {
    await notifyRecruiter({
      type: 'interviewer_calendar_disconnected',
      interviewerId,
      affectedInterviews: upcomingInterviews.length
    });
  }

  // 4. Exclude from new bookings until reconnected
  // (handled by slot calculation - no calendar = no free/busy = no slots)
}
```

---

## Timezone Handling

Accurate timezone handling is critical for interview scheduling. Different sources are used depending on the context:

| User | Context | Timezone Source | Why |
|------|---------|-----------------|-----|
| **Candidate** | Applying for job | Cloudflare `cf-timezone` header | Informational only, no booking involved |
| **Candidate** | Scheduling interview | Browser `Intl.DateTimeFormat()` + user confirmation | Accuracy matters, user can correct |
| **Interviewer** | Setting availability | Browser `Intl.DateTimeFormat()` + user confirmation | Accuracy matters, stored in DB |

### Frontend Detection

```typescript
// Frontend detects timezone via browser API (more accurate than IP-based)
const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
// Returns: "Asia/Jakarta", "America/New_York", etc.
```

### Why Not Cloudflare Everywhere?

Cloudflare's `cf-timezone` is based on IP geolocation, which can be inaccurate when:
- User is on VPN
- User is traveling
- IP geolocation database is outdated

For interview scheduling, a missed timezone = missed interview. We use browser detection + explicit user confirmation.

### Storage

- Interviewer timezone stored in `interviewers.timezone` column
- Set during first availability setup, can be changed later
- All availability windows interpreted in interviewer's timezone
- Candidate timezone passed with booking request, used for confirmation emails

---

## Email Requirements

Phase 9 requires several new email types. The existing `EmailGateway` abstraction supports this - we just need to add new methods.

### Existing Infrastructure

```typescript
// src/modules/email/email.gateway.ts
export interface EmailGateway {
  sendMagicLink(input: SendMagicLinkInput): Promise<void>;
  // ... new methods to be added
}

// Implementations:
// - ConsoleEmailGateway (development - logs to console)
// - SesEmailGateway (production - AWS SES)
```

### New Email Types for Phase 9

| Email Type | Recipient | Trigger | Content |
|------------|-----------|---------|---------|
| **Interviewer Invite** | Interviewer | Recruiter adds interviewer | Magic link to connect calendar |
| **Interview Confirmation** | Candidate + Interviewers | Candidate books slot | Date, time, video link, calendar invite |
| **Interview Reminder** | Candidate + Interviewers | 24h before interview | Same as confirmation |
| **Reschedule Request** | Candidate | Interviewer becomes unavailable | New scheduling link |
| **Reschedule Confirmation** | Candidate + Interviewers | Candidate reschedules | Updated date, time |
| **Cancellation Notice** | Candidate + Interviewers | Interview cancelled | Reason, next steps |
| **Feedback Reminder** | Interviewer | 2h after interview | Link to submit feedback |

### Extended Interface

```typescript
export interface EmailGateway {
  // Existing
  sendMagicLink(input: SendMagicLinkInput): Promise<void>;

  // Phase 9 additions
  sendInterviewerInvite(input: {
    email: string;
    name?: string;
    inviterName: string;
    orgName: string;
    magicLinkUrl: string;
  }): Promise<void>;

  sendInterviewConfirmation(input: {
    recipientEmail: string;
    recipientName: string;
    recipientType: "candidate" | "interviewer";
    jobTitle: string;
    companyName: string;
    stageName: string;
    scheduledAt: Date;
    durationMinutes: number;
    timezone: string;
    videoCallLink?: string;
    interviewerNames: string[];
    candidateName: string;
    calendarLinks: {
      google: string;
      outlook: string;
      ical: string;
    };
  }): Promise<void>;

  sendInterviewReminder(input: {
    // Same as confirmation
  }): Promise<void>;

  sendRescheduleRequest(input: {
    candidateEmail: string;
    candidateName: string;
    jobTitle: string;
    reason: string;
    rescheduleUrl: string;
    expiresAt: Date;
  }): Promise<void>;

  sendInterviewCancellation(input: {
    recipientEmail: string;
    recipientName: string;
    jobTitle: string;
    originalTime: Date;
    reason?: string;
  }): Promise<void>;

  sendFeedbackReminder(input: {
    interviewerEmail: string;
    interviewerName: string;
    candidateName: string;
    jobTitle: string;
    feedbackUrl: string;
  }): Promise<void>;
}
```

### Implementation Notes

- All email templates should include timezone-aware formatting
- Calendar invite attachments (.ics) should be included where applicable
- Unsubscribe links for reminder emails (per CAN-SPAM)
- Email sending is async (queued via Cloudflare Queues for reliability)

---

## Video Call Provider

Video call creation is **decoupled from calendar provider** to give organizations flexibility.

### Configuration

```typescript
// Organization-level setting
videoCallProvider: "calendar_native" | "zoom" | "google_meet" | "teams"
```

| Setting | Behavior |
|---------|----------|
| `calendar_native` (default) | Uses calendar's native video: Google Calendar → Meet, Outlook → Teams |
| `zoom` | Always creates Zoom meeting (requires Zoom OAuth) |
| `google_meet` | Always creates Google Meet (requires Google OAuth) |
| `teams` | Always creates Teams meeting (requires Microsoft OAuth) |

### Why Decoupled?

- Company may use Outlook calendars but prefer Zoom for interviews
- Google Meet only available if someone has Google Calendar
- Teams only available if someone has Outlook
- Zoom works regardless of calendar provider

### Schema Addition

```typescript
// In organizations table
videoCallProvider: text("video_call_provider", {
  enum: ["calendar_native", "zoom", "google_meet", "teams"]
}).default("calendar_native"),
```

### Video Provider Interface

```typescript
// src/domain/video/types.ts

export interface VideoCallProvider {
  readonly type: "google_meet" | "zoom" | "teams";

  createMeeting(input: {
    title: string;
    startTime: Date;
    durationMinutes: number;
    attendees: string[];
  }): Promise<{ meetingUrl: string; meetingId: string }>;

  deleteMeeting(meetingId: string): Promise<void>;
}
```

---

## Interview Feedback Structure

Aligned with Zehire's **signal-first philosophy** — no numeric ratings, no scores.

### Design Principles (from zehire-product-summary.md)

- ❌ No scores, no rankings, no confidence percentages
- ✅ Signal-first, evaluated independently
- ✅ Never collapsed into a single numeric score
- ✅ Interpreted in context

### Feedback Schema

```typescript
// src/domain/interviews/types.ts

export interface InterviewFeedback {
  /**
   * Signal-based observations.
   * Interviewer evaluates specific signals, not overall "quality".
   */
  observations: Array<{
    signalId: string;  // From the 10 core signals
    observation: "clear" | "partial" | "absent" | "unclear";
    evidence: string;  // Specific quote or example from interview
  }>;

  /**
   * Free-form summary.
   * Context that doesn't fit into signal observations.
   */
  summary: string;

  /**
   * Action-oriented recommendation.
   * NOT a quality judgment — just "is it safe to proceed?"
   */
  recommendation: "advance" | "hold" | "pass";
  recommendationReason: string;
}
```

### Why This Structure?

| Traditional ATS | Zehire Approach |
|-----------------|-----------------|
| "Rate candidate 1-5" | "What signals did you observe?" |
| "Would you hire? Yes/No" | "Is it safe to advance based on evidence?" |
| Collapses to a number | Preserves context and nuance |
| Enables ranking | Enables decision safety |

### Database Schema

```typescript
// In interview_participants table, feedbackContent stores JSON:
feedbackContent: text("feedback_content"),  // JSON string of InterviewFeedback

// Parsed example:
{
  "observations": [
    {
      "signalId": "technical_depth",
      "observation": "clear",
      "evidence": "Explained distributed systems tradeoffs with specific examples from previous role"
    },
    {
      "signalId": "communication_clarity",
      "observation": "partial",
      "evidence": "Clear on technical topics, less structured when discussing project management"
    }
  ],
  "summary": "Strong technical foundation, would benefit from more structured communication coaching.",
  "recommendation": "advance",
  "recommendationReason": "Technical signals are strong enough for next round. Communication gap is coachable."
}
```

---

## Reminder Scheduling

24-hour interview reminders using **Cloudflare Cron Triggers** — reliable and free.

### Why Cron Triggers?

| Option | Cost | Reliability | Complexity |
|--------|------|-------------|------------|
| **Cron Trigger (hourly)** ✅ | Free | High | Low |
| Queues with delay | Not supported | - | - |
| External scheduler | $$ | High | Medium |

### Implementation

```typescript
// wrangler.toml
[triggers]
crons = ["0 * * * *"]  // Every hour, on the hour

// src/scheduled/interview-reminders.ts
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const db = drizzle(env.DB);
    const emailGateway = createEmailGatewayFromEnv(env);

    const now = new Date();
    const reminderWindow = new Date(now.getTime() + 25 * 60 * 60 * 1000); // 25 hours

    // Find interviews needing reminders
    // - Scheduled in next 24-25 hours
    // - Not yet reminded
    // - Still active (not cancelled)
    const interviews = await db.select()
      .from(scheduledInterviews)
      .where(and(
        gte(scheduledInterviews.scheduledAt, now.toISOString()),
        lte(scheduledInterviews.scheduledAt, reminderWindow.toISOString()),
        isNull(scheduledInterviews.reminderSentAt),
        eq(scheduledInterviews.status, "scheduled")
      ));

    for (const interview of interviews) {
      try {
        // Send to candidate
        await emailGateway.sendInterviewReminder({
          recipientEmail: interview.candidateEmail,
          recipientType: "candidate",
          // ... other fields
        });

        // Send to interviewers
        const participants = await db.select()
          .from(interviewParticipants)
          .where(eq(interviewParticipants.interviewId, interview.id));

        for (const participant of participants) {
          await emailGateway.sendInterviewReminder({
            recipientEmail: participant.interviewerEmail,
            recipientType: "interviewer",
            // ... other fields
          });
        }

        // Mark as reminded
        await db.update(scheduledInterviews)
          .set({ reminderSentAt: now.toISOString() })
          .where(eq(scheduledInterviews.id, interview.id));

      } catch (error) {
        console.error(`Failed to send reminder for ${interview.id}:`, error);
        // Will retry next hour
      }
    }
  }
};
```

### Schema Addition

```typescript
// In scheduled_interviews table
reminderSentAt: text("reminder_sent_at"),  // ISO datetime, null until sent
```

### Why 25-Hour Window?

- We check every hour
- If a run fails, next hour catches it
- 25h window > 24h reminder = no missed reminders

---

## Environment Variables

All new environment variables required for Phase 9:

```bash
# =============================================================================
# CALENDAR PROVIDERS
# =============================================================================

# Google Calendar OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://api.zehire.com/auth/calendar/google/callback

# Microsoft Outlook OAuth (Phase 9G)
OUTLOOK_CLIENT_ID=your-outlook-client-id
OUTLOOK_CLIENT_SECRET=your-outlook-client-secret
OUTLOOK_REDIRECT_URI=https://api.zehire.com/auth/calendar/outlook/callback

# =============================================================================
# VIDEO CALL PROVIDERS (Optional, for org-level override)
# =============================================================================

# Zoom OAuth (only if orgs want Zoom instead of calendar-native)
ZOOM_CLIENT_ID=your-zoom-client-id
ZOOM_CLIENT_SECRET=your-zoom-client-secret
ZOOM_REDIRECT_URI=https://api.zehire.com/auth/video/zoom/callback

# =============================================================================
# SECURITY
# =============================================================================

# Token encryption key for storing OAuth tokens at rest
# Generate with: openssl rand -base64 32
CALENDAR_TOKEN_ENCRYPTION_KEY=your-32-byte-base64-key

# Magic link signing secret (for interviewer/candidate tokens)
MAGIC_LINK_SECRET=your-signing-secret
```

### Local Development (.dev.vars)

```bash
# For local development, use test credentials or console logging
GOOGLE_CLIENT_ID=test
GOOGLE_CLIENT_SECRET=test
GOOGLE_REDIRECT_URI=http://localhost:8787/auth/calendar/google/callback
CALENDAR_TOKEN_ENCRYPTION_KEY=test-key-do-not-use-in-production
MAGIC_LINK_SECRET=dev-secret
```

---

## Implementation Phases

### Phase 9A: Core Infrastructure (Week 1-2)
- [ ] Database schema migration (all new tables)
- [ ] Add `videoCallProvider` to organizations table
- [ ] Add `reminderSentAt` to scheduled_interviews table
- [ ] Interviewer CRUD endpoints
- [ ] Magic link generation and validation
- [ ] Basic interviewer dashboard

### Phase 9B: Calendar Provider Abstraction (Week 2-3)
- [ ] CalendarProvider interface definition
- [ ] Google Calendar provider implementation
- [ ] CalendarService orchestration layer
- [ ] Token encryption/decryption utilities
- [ ] OAuth flow (provider-agnostic callback)
- [ ] Video call provider abstraction (calendar-native default)

### Phase 9C: Availability Management (Week 3-4)
- [ ] Availability windows CRUD
- [ ] Blocked dates management
- [ ] "I'm unavailable today" quick action
- [ ] Slot calculation engine (uses CalendarService)

### Phase 9D: Stage Configuration (Week 4)
- [ ] Stage config endpoints
- [ ] Interviewer assignment to stages
- [ ] "Any one" vs "All required" modes
- [ ] Availability preview for recruiters

### Phase 9E: Candidate Scheduling & Feedback (Week 5)
- [ ] Scheduling token generation
- [ ] Public scheduling page
- [ ] Slot listing with real-time availability
- [ ] Booking flow with confirmation
- [ ] Interview feedback schema (signal-based, no scores)
- [ ] Feedback submission endpoint
- [ ] Feedback display in recruiter dashboard

### Phase 9F: Notifications & Reminders (Week 6)
- [ ] Extend EmailGateway interface with new email types
- [ ] Implement interviewer invite email
- [ ] Implement interview confirmation email (with calendar .ics)
- [ ] Implement reschedule/cancellation emails
- [ ] Cloudflare Cron Trigger for 24h reminders
- [ ] Implement interview reminder email
- [ ] Implement feedback reminder email (2h after interview)
- [ ] Conflict resolution flows
- [ ] Rescheduling and cancellation
- [ ] Race condition handling

### Phase 9G: Additional Providers (Future)
- [ ] Outlook Calendar provider implementation
- [ ] Apple Calendar provider implementation
- [ ] Zoom video provider (org-level override)
- [ ] Provider switching support (disconnect + reconnect)

---

## Security Considerations

1. **Magic Links**
   - Tokens are cryptographically random (32+ bytes)
   - Tokens are single-use for booking (not for dashboard access)
   - Optional: IP-based rate limiting

2. **Calendar OAuth Tokens (Provider-Agnostic)**
   - Stored encrypted at rest (AES-256-GCM)
   - Stored as JSON in `calendarTokens` field
   - Refresh tokens used to get new access tokens
   - Automatic token refresh before expiry (5 min buffer)
   - Provider type stored separately for factory lookup

3. **Scheduling Tokens**
   - Expire after 7 days
   - Scoped to specific application + stage
   - Cannot be reused after booking

4. **Data Access**
   - Interviewers only see their own interviews
   - Candidates only see their own scheduling options
   - Recruiters see all within their org

5. **Provider Credentials**
   - Client IDs/Secrets stored in environment variables
   - Different credentials per provider (GOOGLE_*, OUTLOOK_*, etc.)
   - Never exposed to frontend

---

## Metrics to Track

- **Scheduling completion rate**: % of candidates who book after receiving link
- **Time to book**: Average time from link sent to booking confirmed
- **Reschedule rate**: % of interviews rescheduled
- **No-show rate**: % of scheduled interviews where candidate didn't show
- **Calendar sync health**: % of interviewers with valid calendar connections
