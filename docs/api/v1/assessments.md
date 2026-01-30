# Zehire Assessment API Specification

**Version:** 1.2 (MVP)
**Last Updated:** January 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Key Decisions](#key-decisions)
3. [Data Models](#data-models)
4. [Assessment Status Flow](#assessment-status-flow)
5. [Status Transition Mechanism](#status-transition-mechanism)
6. [API Endpoints](#api-endpoints)
   - [Assessment Library](#1-assessment-library)
   - [Job Assessment](#2-job-assessment)
   - [Candidate Assessment (Recruiter)](#3-candidate-assessment-recruiter)
   - [Candidate-Facing](#4-candidate-facing)
   - [Files](#5-files)
7. [File Upload Rules](#file-upload-rules)
8. [Evaluation Signals](#evaluation-signals)
9. [Error Handling](#error-handling)
10. [Job Status & Assessment Behavior](#job-status--assessment-behavior)

---

## Overview

Zehire's assessment system allows organizations to create reusable assessments that can be attached to jobs. Candidates receive invitations, schedule their assessment time, complete submissions, and receive evaluation.

**Core Flow:**
```
INVITE → SCHEDULE → START → SUBMIT → EVALUATE
```

---

## Key Decisions

| Decision | Choice |
|----------|--------|
| Assessment scope | Organization library |
| Assessments per job | 1 max |
| Parts per assessment | Multiple allowed |
| Parts can be optional | Yes (`required` field, default `true`) |
| Submission type | File only (no links, no text) |
| Draft job | Live sync to library |
| Published job | Frozen snapshot (denormalized JSON) |
| Paused job | Assessments continue |
| Closed job | Assessments auto-cancelled (via queue) |
| Candidate stages | Existing: `pending`, `screening`, `assessment`, `interview`, `offer`, `rejected`, `withdrawn` |
| Extend deadline | Not in MVP (use cancel + re-invite) |
| Instructions visibility | Hidden until window opens (`in_progress`) |
| Deadline grace period | 10 minutes (checked at request start) |
| Max file size | 50 MB |
| Timezone handling | Store UTC, display in candidate's timezone |
| Candidate auth | Opaque token (same pattern as scheduling tokens) |
| Status transitions | Hybrid: lazy evaluation on access + cron for side effects |
| Archive assessment | Via PATCH (soft status change, not DELETE) |

---

## Timezone Handling

All datetime values are stored and transmitted in **UTC** (with `Z` suffix).

The `timezone` field (e.g., `"Asia/Jakarta"`) is stored alongside scheduled times for **display purposes only**. This allows:
- Showing candidates their scheduled time in their local timezone
- Sending reminder emails with localized times
- Displaying deadline countdowns accurately

**Flow:**
1. Candidate selects a time in their local timezone (e.g., "Feb 1, 2pm Jakarta time")
2. Client converts to UTC before sending: `"2026-02-01T07:00:00Z"`
3. Server stores both: `scheduledFor` (UTC) + `scheduledTimezone` (IANA identifier)
4. All deadline calculations use UTC
5. Display back to candidate uses stored timezone

---

## Deadline Grace Period

To handle network latency and slow uploads, deadlines include a **10-minute grace period**.

**Rules:**
- Deadline is checked at **request start**, not completion
- If a candidate starts an upload at `completionDeadline - 1 minute`, the upload is allowed to complete
- The grace period applies to: file uploads, file deletions, and final submission
- The grace period does NOT extend the `completionDeadline` shown to candidates

**Example:**
```
completionDeadline: 2026-02-02T14:00:00Z
Actual cutoff for requests: 2026-02-02T14:10:00Z

- Upload started at 13:59 → Allowed (within deadline)
- Upload started at 14:07 → Allowed (within grace period)
- Upload started at 14:11 → Rejected (EXPIRED error)
```

**Rationale:** 50MB at 1 Mbps (slow mobile) takes ~6.7 minutes. A 10-minute grace period covers even the worst reasonable case with room for retries.

---

## Candidate Authentication

Candidate-facing endpoints use **opaque tokens** (same pattern as existing scheduling tokens):

- Generated per `CandidateAssessment` when a candidate is invited
- 32-character alphanumeric string via `nanoid`
- Stored in database with indexed lookup
- Multi-use (candidate accesses multiple times: schedule, view, upload, submit)
- Expiry based on assessment lifecycle

**Important:** The `{token}` in candidate-facing routes (`/assess/{token}/...`) is the opaque token, NOT the CandidateAssessment ID. The token identifies both the candidate and the specific assessment.

**Token lifecycle:**
1. Recruiter invites candidate → token generated, included in email link
2. Candidate clicks link → token validated via middleware (DB lookup + expiry check)
3. Token remains valid until assessment reaches a terminal state or expires

---

## Data Models

### AssessmentDefinition (Library)

```
AssessmentDefinition
├── id: string
├── organizationId: string
├── name: string
├── parts: AssessmentPart[]
├── scheduling: SchedulingConfig
├── status: "active" | "archived"
├── createdAt: datetime
├── updatedAt: datetime
└── createdBy: string
```

### AssessmentPart

```
AssessmentPart
├── id: string
├── name: string
├── instructions: string (markdown supported)
├── evidenceDescription: string
└── required: boolean (default: true)
```

**Note:** Part ordering is determined by array position. No explicit `order` field in the API. The database uses an internal `order_index` column for deterministic query ordering, but this is not exposed.

### SchedulingConfig

```
SchedulingConfig
├── scheduleWithinDays: number (default: 7)
├── completeWithinHours: number (default: 48)
└── maxReschedules: number (default: 2)
```

### JobAssessment

```
JobAssessment
├── jobId: string
├── assessmentDefinitionId: string
├── snapshot: JSON | null (null if draft, denormalized JSON if published)
└── snapshotAt: datetime | null
```

**Note:** `snapshot` stores a complete copy of the assessment definition at publish time. This is a denormalized JSON column for MVP simplicity.

### CandidateAssessment

```
CandidateAssessment
├── id: string
├── candidateId: string
├── jobId: string
├── token: string (opaque, indexed, for candidate access)
├── tokenExpiresAt: datetime
├── status: CandidateAssessmentStatus
├── timeline: Timeline
├── rescheduleCount: number
├── submissions: PartSubmission[]
├── evaluation: Evaluation | null
├── cancelledAt: datetime | null
└── cancelReason: string | null
```

### Timeline

```
Timeline
├── invitedAt: datetime
├── scheduleDeadline: datetime
├── scheduledFor: datetime | null (UTC)
├── scheduledTimezone: string | null (IANA timezone, e.g., "Asia/Jakarta")
├── completionDeadline: datetime | null (UTC)
└── submittedAt: datetime | null
```

### PartSubmission

```
PartSubmission
├── partId: string
├── partName: string
└── files: UploadedFile[]
```

### UploadedFile

Standard file shape used across all responses:

```
UploadedFile
├── id: string
├── name: string
├── size: number (bytes)
├── mimeType: string
└── uploadedAt: datetime
```

**Note:** `downloadUrl` is only included in recruiter-facing responses. Candidate-facing responses omit it (candidates uploaded the file, they only need to see/delete).

### Evaluation

```
Evaluation
├── signal: "clear_evidence" | "some_gaps" | "insufficient_evidence"
├── notes: string | null
├── evaluatedBy: string
├── evaluatedAt: datetime
├── updatedBy: string | null
└── updatedAt: datetime | null
```

---

## Assessment Status Flow

```
invited
   │
   ├──► schedule_expired (didn't schedule in time)
   │
   ▼
scheduled
   │
   ▼
in_progress
   │
   ├──► expired (didn't submit in time)
   │
   ▼
submitted
   │
   ▼
evaluated

(also: cancelled - by recruiter or auto when job closes)
```

| Status | Description |
|--------|-------------|
| `invited` | Email sent, waiting for candidate to schedule |
| `schedule_expired` | Candidate didn't schedule before deadline |
| `scheduled` | Candidate picked a time, waiting for window to open |
| `in_progress` | Window open, candidate can submit |
| `expired` | Candidate didn't submit before deadline |
| `submitted` | Candidate submitted, waiting for evaluation |
| `evaluated` | Recruiter recorded signal |
| `cancelled` | Cancelled by recruiter or auto (job closed) |

---

## Status Transition Mechanism

Status transitions use a **hybrid approach**: lazy evaluation on access for real-time correctness, plus a cron job for side effects and cleanup.

### Lazy Evaluation (Primary)

When a candidate or recruiter accesses a CandidateAssessment, the server checks if a status transition should occur based on current time:

| Current Status | Condition | Transition To |
|---|---|---|
| `invited` | `now > scheduleDeadline` | `schedule_expired` |
| `scheduled` | `now >= scheduledFor` | `in_progress` |
| `in_progress` | `now > completionDeadline + 10min grace` | `expired` |

The transition is applied (DB write) before returning the response. This ensures candidates always see the correct status instantly.

### Cron Job (Secondary — Hourly)

A scheduled Worker runs hourly to handle:
- **Bulk status updates**: Transition stale records that nobody accessed
- **Email notifications**: Send reminder/expiry emails
- **Cleanup**: Mark abandoned assessments

The cron job is not latency-sensitive. It handles housekeeping that doesn't require real-time response.

### Auto-Cancel on Job Close (Queue)

When a job is closed, a queue message is dispatched to batch-cancel all non-terminal assessments:

```
Message Type: "cancel_assessments"
Payload: { jobId, reason: "job_closed" }
```

The queue consumer updates all assessments with status in (`invited`, `scheduled`, `in_progress`) to `cancelled`. This avoids blocking the job close request.

---

## API Endpoints

Base URL: `/api/v1`

### Authentication

- **Recruiter endpoints:** `Authorization: Bearer {recruiterJWT}`
- **Candidate endpoints:** Token in URL path (`/assess/{token}/...`)

### File Download Authorization

File downloads (`GET /v1/assessments/files/{fileId}`) are accessible to any recruiter or admin within the organization. Access is scoped to the organization, not to the individual recruiter who invited the candidate.

---

### 1. Assessment Library

#### List Assessments

```
GET /assessments

Query Parameters:
- status: "active" | "archived" (default: "active")
- search: string (optional)

Response: 200 OK
{
  "data": [
    {
      "id": "asmt_abc123",
      "name": "Frontend Technical",
      "partsCount": 2,
      "scheduling": {
        "scheduleWithinDays": 7,
        "completeWithinHours": 48,
        "maxReschedules": 2
      },
      "status": "active",
      "createdAt": "2026-01-15T10:00:00Z",
      "updatedAt": "2026-01-20T14:00:00Z"
    }
  ]
}
```

#### Create Assessment

```
POST /assessments

Request:
{
  "name": "Frontend Technical",
  "parts": [
    {
      "name": "Coding Challenge",
      "instructions": "Build a React component for a todo list.\n\nRequirements:\n• Add, edit, delete todos\n• Filter by status\n• Include README with setup instructions\n\nSubmit as .zip file.",
      "evidenceDescription": "Can write clean, working frontend code",
      "required": true
    },
    {
      "name": "System Design",
      "instructions": "Design the frontend architecture for a real-time collaborative document editor.\n\nSubmit as PDF.",
      "evidenceDescription": "Can design scalable frontend systems",
      "required": true
    }
  ],
  "scheduling": {
    "scheduleWithinDays": 7,
    "completeWithinHours": 48,
    "maxReschedules": 2
  }
}

Response: 201 Created
{
  "data": {
    "id": "asmt_abc123",
    "name": "Frontend Technical",
    "parts": [
      {
        "id": "part_1",
        "name": "Coding Challenge",
        "instructions": "Build a React component for a todo list...",
        "evidenceDescription": "Can write clean, working frontend code",
        "required": true
      },
      {
        "id": "part_2",
        "name": "System Design",
        "instructions": "Design the frontend architecture...",
        "evidenceDescription": "Can design scalable frontend systems",
        "required": true
      }
    ],
    "scheduling": {
      "scheduleWithinDays": 7,
      "completeWithinHours": 48,
      "maxReschedules": 2
    },
    "status": "active",
    "createdAt": "2026-01-29T10:00:00Z",
    "updatedAt": "2026-01-29T10:00:00Z"
  }
}
```

#### Get Assessment

```
GET /assessments/{id}

Response: 200 OK
{
  "data": {
    "id": "asmt_abc123",
    "name": "Frontend Technical",
    "parts": [
      {
        "id": "part_1",
        "name": "Coding Challenge",
        "instructions": "Build a React component for a todo list...",
        "evidenceDescription": "Can write clean, working frontend code",
        "required": true
      },
      {
        "id": "part_2",
        "name": "System Design",
        "instructions": "Design the frontend architecture...",
        "evidenceDescription": "Can design scalable frontend systems",
        "required": true
      }
    ],
    "scheduling": {
      "scheduleWithinDays": 7,
      "completeWithinHours": 48,
      "maxReschedules": 2
    },
    "status": "active",
    "createdAt": "2026-01-15T10:00:00Z",
    "updatedAt": "2026-01-20T14:00:00Z"
  }
}
```

#### Update Assessment

```
PATCH /assessments/{id}

Request:
{
  "name": "Frontend Technical (Updated)",
  "parts": [
    {
      "id": "part_1",
      "name": "Coding Challenge (Updated)",
      "instructions": "Updated instructions...",
      "evidenceDescription": "Can write clean, working frontend code",
      "required": true
    },
    {
      "name": "New Part",
      "instructions": "New part instructions...",
      "evidenceDescription": "New evidence description",
      "required": false
    }
  ],
  "scheduling": {
    "completeWithinHours": 72
  }
}

Note:
- Include "id" → update existing part
- No "id" → create new part
- Existing part not in request → delete it
- Same sync semantics as interview stage CRUD

Response: 200 OK
{
  "data": {
    "id": "asmt_abc123",
    "name": "Frontend Technical (Updated)",
    "parts": [
      {
        "id": "part_1",
        "name": "Coding Challenge (Updated)",
        "instructions": "Updated instructions...",
        "evidenceDescription": "Can write clean, working frontend code",
        "required": true
      },
      {
        "id": "part_3",
        "name": "New Part",
        "instructions": "New part instructions...",
        "evidenceDescription": "New evidence description",
        "required": false
      }
    ],
    "scheduling": {
      "scheduleWithinDays": 7,
      "completeWithinHours": 72,
      "maxReschedules": 2
    },
    "status": "active",
    "createdAt": "2026-01-15T10:00:00Z",
    "updatedAt": "2026-01-29T10:00:00Z"
  }
}
```

#### Archive Assessment

```
PATCH /assessments/{id}

Request:
{
  "status": "archived"
}

Response: 200 OK
{
  "data": {
    "id": "asmt_abc123",
    "name": "Frontend Technical",
    "parts": [...],
    "scheduling": {...},
    "status": "archived",
    "createdAt": "2026-01-15T10:00:00Z",
    "updatedAt": "2026-01-29T10:00:00Z"
  }
}

Note: Soft status change. Data remains. Cannot be attached to new jobs.
Published jobs with frozen snapshots are unaffected.
Draft jobs will see the archived status during publish review.
```

---

### 2. Job Assessment

#### Get Job Assessment

```
GET /jobs/{jobId}/assessment

Response: 200 OK (attached, draft job - live sync)
{
  "data": {
    "assessmentId": "asmt_abc123",
    "name": "Frontend Technical",
    "parts": [
      {
        "id": "part_1",
        "name": "Coding Challenge",
        "instructions": "Build a React component...",
        "evidenceDescription": "Can write clean, working frontend code",
        "required": true
      },
      {
        "id": "part_2",
        "name": "System Design",
        "instructions": "Design the frontend architecture...",
        "evidenceDescription": "Can design scalable frontend systems",
        "required": true
      }
    ],
    "scheduling": {
      "scheduleWithinDays": 7,
      "completeWithinHours": 48,
      "maxReschedules": 2
    },
    "isSnapshot": false,
    "snapshotAt": null
  }
}

Response: 200 OK (attached, published job - frozen snapshot)
{
  "data": {
    "assessmentId": "asmt_abc123",
    "name": "Frontend Technical",
    "parts": [...],
    "scheduling": {...},
    "isSnapshot": true,
    "snapshotAt": "2026-01-20T10:00:00Z"
  }
}

Response: 200 OK (not attached)
{
  "data": null
}
```

#### Set Job Assessment

```
PUT /jobs/{jobId}/assessment

Request:
{
  "assessmentId": "asmt_abc123"
}

Response: 200 OK
{
  "data": {
    "assessmentId": "asmt_abc123",
    "name": "Frontend Technical",
    "parts": [...],
    "scheduling": {...},
    "isSnapshot": false,
    "snapshotAt": null
  }
}

Errors:
- 400 ASSESSMENT_NOT_FOUND: Assessment doesn't exist
- 400 ASSESSMENT_ARCHIVED: Cannot attach archived assessment
- 400 JOB_CLOSED: Cannot modify closed job
- 400 JOB_PUBLISHED: Cannot change assessment on published job
```

#### Remove Job Assessment

```
DELETE /jobs/{jobId}/assessment

Response: 200 OK
{
  "message": "Assessment removed"
}

Errors:
- 400 JOB_PUBLISHED: Cannot remove from published job
- 400 JOB_CLOSED: Cannot modify closed job
```

---

### 3. Candidate Assessment (Recruiter)

#### Get Candidate Assessment

```
GET /jobs/{jobId}/candidates/{applicationId}/assessment

Response: 200 OK (not invited)
{
  "data": null
}

Response: 200 OK (invited, not yet scheduled)
{
  "data": {
    "id": "ca_def456",
    "status": "invited",
    "assessment": {
      "name": "Frontend Technical",
      "parts": [
        {
          "id": "part_1",
          "name": "Coding Challenge",
          "evidenceDescription": "Can write clean, working frontend code",
          "required": true
        },
        {
          "id": "part_2",
          "name": "System Design",
          "evidenceDescription": "Can design scalable frontend systems",
          "required": true
        }
      ]
    },
    "timeline": {
      "invitedAt": "2026-01-29T10:00:00Z",
      "scheduleDeadline": "2026-02-05T10:00:00Z",
      "scheduledFor": null,
      "scheduledTimezone": null,
      "completionDeadline": null,
      "submittedAt": null
    },
    "rescheduleCount": 0,
    "submissions": null,
    "evaluation": null
  }
}

Response: 200 OK (scheduled)
{
  "data": {
    "id": "ca_def456",
    "status": "scheduled",
    "assessment": {
      "name": "Frontend Technical",
      "parts": [...]
    },
    "timeline": {
      "invitedAt": "2026-01-29T10:00:00Z",
      "scheduleDeadline": "2026-02-05T10:00:00Z",
      "scheduledFor": "2026-02-01T07:00:00Z",
      "scheduledTimezone": "Asia/Jakarta",
      "completionDeadline": "2026-02-02T07:00:00Z",
      "submittedAt": null
    },
    "rescheduleCount": 0,
    "submissions": null,
    "evaluation": null
  }
}

Response: 200 OK (submitted)
{
  "data": {
    "id": "ca_def456",
    "status": "submitted",
    "assessment": {
      "name": "Frontend Technical",
      "parts": [...]
    },
    "timeline": {
      "invitedAt": "2026-01-29T10:00:00Z",
      "scheduleDeadline": "2026-02-05T10:00:00Z",
      "scheduledFor": "2026-02-01T07:00:00Z",
      "scheduledTimezone": "Asia/Jakarta",
      "completionDeadline": "2026-02-02T07:00:00Z",
      "submittedAt": "2026-02-01T11:30:00Z"
    },
    "rescheduleCount": 0,
    "submissions": [
      {
        "partId": "part_1",
        "partName": "Coding Challenge",
        "files": [
          {
            "id": "file_123",
            "name": "todo-app.zip",
            "size": 2400000,
            "mimeType": "application/zip",
            "uploadedAt": "2026-02-01T08:30:00Z",
            "downloadUrl": "/v1/assessments/files/file_123"
          }
        ]
      },
      {
        "partId": "part_2",
        "partName": "System Design",
        "files": [
          {
            "id": "file_124",
            "name": "architecture.pdf",
            "size": 450000,
            "mimeType": "application/pdf",
            "uploadedAt": "2026-02-01T09:15:00Z",
            "downloadUrl": "/v1/assessments/files/file_124"
          }
        ]
      }
    ],
    "evaluation": null
  }
}

Response: 200 OK (evaluated)
{
  "data": {
    "id": "ca_def456",
    "status": "evaluated",
    "assessment": {...},
    "timeline": {...},
    "rescheduleCount": 0,
    "submissions": [...],
    "evaluation": {
      "signal": "clear_evidence",
      "notes": "Strong coding skills. Clean architecture.",
      "evaluatedBy": "user_123",
      "evaluatedAt": "2026-02-03T09:00:00Z",
      "updatedBy": null,
      "updatedAt": null
    }
  }
}

Response: 200 OK (cancelled)
{
  "data": {
    "id": "ca_def456",
    "status": "cancelled",
    "assessment": {...},
    "timeline": {...},
    "rescheduleCount": 0,
    "submissions": null,
    "evaluation": null,
    "cancelledAt": "2026-01-30T10:00:00Z",
    "cancelReason": "Sent wrong assessment"
  }
}
```

#### Invite Candidate

```
POST /jobs/{jobId}/candidates/{applicationId}/assessment/invite

Note: Body is optional. Uses job's attached assessment.

Response: 201 Created
{
  "data": {
    "id": "ca_def456",
    "status": "invited",
    "timeline": {
      "invitedAt": "2026-01-29T10:00:00Z",
      "scheduleDeadline": "2026-02-05T10:00:00Z",
      "scheduledFor": null,
      "scheduledTimezone": null,
      "completionDeadline": null,
      "submittedAt": null
    }
  }
}

Side Effects:
- Generates opaque candidate token
- Sends invitation email with assessment link containing token

Errors:
- 400 NO_ASSESSMENT: Job has no assessment attached
- 400 ALREADY_INVITED: Candidate already has assessment
- 400 JOB_NOT_OPEN: Job is not open
```

#### Evaluate

```
POST /jobs/{jobId}/candidates/{applicationId}/assessment/evaluate

Request:
{
  "signal": "clear_evidence",
  "notes": "Strong coding skills. Clean architecture. Good documentation."
}

Response: 200 OK
{
  "data": {
    "id": "ca_def456",
    "status": "evaluated",
    "evaluation": {
      "signal": "clear_evidence",
      "notes": "Strong coding skills. Clean architecture. Good documentation.",
      "evaluatedBy": "user_123",
      "evaluatedAt": "2026-02-03T09:00:00Z",
      "updatedBy": null,
      "updatedAt": null
    }
  }
}

Errors:
- 400 NOT_SUBMITTED: Cannot evaluate before submission
- 400 INVALID_SIGNAL: Signal must be clear_evidence | some_gaps | insufficient_evidence

Note: Calling POST again on an already-evaluated assessment updates the signal/notes
and tracks `evaluationUpdatedBy`/`evaluationUpdatedAt`. No separate PATCH endpoint needed.
```

#### Cancel

```
POST /jobs/{jobId}/candidates/{applicationId}/assessment/cancel

Request:
{
  "reason": "Sent wrong assessment"
}

Response: 200 OK
{
  "data": {
    "id": "ca_def456",
    "status": "cancelled",
    "cancelledAt": "2026-01-30T10:00:00Z",
    "cancelReason": "Sent wrong assessment"
  }
}

Errors:
- 400 ALREADY_SUBMITTED: Cannot cancel after submission
- 400 ALREADY_EVALUATED: Cannot cancel after evaluation
- 400 ALREADY_CANCELLED: Already cancelled
```

---

### 4. Candidate-Facing

All candidate-facing endpoints use the **opaque token in the URL path** for authentication.
The token is generated when the candidate is invited and included in the email link.

Middleware validates the token on every request: DB lookup → expiry check → attach CandidateAssessment to context.

#### View Assessment

```
GET /assess/{token}

Response varies based on status. Instructions are only revealed when status is `in_progress`.
Lazy status transitions are applied before returning (see Status Transition Mechanism).
```

**Response: 200 OK (invited)**
```json
{
  "data": {
    "id": "ca_def456",
    "status": "invited",
    "company": "Acme Inc",
    "jobTitle": "Senior Frontend Engineer",
    "assessment": {
      "name": "Frontend Technical",
      "parts": [
        {
          "id": "part_1",
          "name": "Coding Challenge",
          "instructions": null,
          "required": true
        },
        {
          "id": "part_2",
          "name": "System Design",
          "instructions": null,
          "required": true
        }
      ]
    },
    "scheduling": {
      "scheduleDeadline": "2026-02-05T10:00:00Z",
      "completeWithinHours": 48,
      "maxReschedules": 2
    },
    "scheduledFor": null,
    "scheduledTimezone": null,
    "completionDeadline": null,
    "rescheduleCount": 0,
    "remainingReschedules": 2
  }
}
```

**Response: 200 OK (scheduled)**
```json
{
  "data": {
    "id": "ca_def456",
    "status": "scheduled",
    "company": "Acme Inc",
    "jobTitle": "Senior Frontend Engineer",
    "assessment": {
      "name": "Frontend Technical",
      "parts": [
        {
          "id": "part_1",
          "name": "Coding Challenge",
          "instructions": null,
          "required": true
        },
        {
          "id": "part_2",
          "name": "System Design",
          "instructions": null,
          "required": true
        }
      ]
    },
    "scheduling": {
      "scheduleDeadline": "2026-02-05T10:00:00Z",
      "completeWithinHours": 48,
      "maxReschedules": 2
    },
    "scheduledFor": "2026-02-01T07:00:00Z",
    "scheduledTimezone": "Asia/Jakarta",
    "completionDeadline": "2026-02-02T07:00:00Z",
    "rescheduleCount": 1,
    "remainingReschedules": 1
  }
}
```

**Response: 200 OK (in_progress) — Instructions revealed**
```json
{
  "data": {
    "id": "ca_def456",
    "status": "in_progress",
    "company": "Acme Inc",
    "jobTitle": "Senior Frontend Engineer",
    "assessment": {
      "name": "Frontend Technical",
      "parts": [
        {
          "id": "part_1",
          "name": "Coding Challenge",
          "instructions": "Build a React component for a todo list.\n\nRequirements:\n• Add, edit, delete todos\n• Filter by status\n• Include README with setup instructions\n\nSubmit as .zip file.",
          "required": true,
          "files": []
        },
        {
          "id": "part_2",
          "name": "System Design",
          "instructions": "Design the frontend architecture for a real-time collaborative document editor.\n\nSubmit as PDF.",
          "required": false,
          "files": [
            {
              "id": "file_124",
              "name": "architecture.pdf",
              "size": 450000,
              "mimeType": "application/pdf",
              "uploadedAt": "2026-02-01T09:15:00Z"
            }
          ]
        }
      ]
    },
    "completionDeadline": "2026-02-02T07:00:00Z",
    "allowedFileTypes": [
      ".zip", ".tar.gz", ".rar", ".7z",
      ".pdf", ".doc", ".docx", ".ppt", ".pptx",
      ".xlsx", ".xls", ".csv",
      ".png", ".jpg", ".jpeg", ".fig", ".sketch"
    ],
    "maxFileSizeMB": 50
  }
}
```

**Note:** No `remainingTime` field. The frontend calculates remaining time from `completionDeadline` (UTC).

**Response: 200 OK (submitted)**
```json
{
  "data": {
    "id": "ca_def456",
    "status": "submitted",
    "company": "Acme Inc",
    "jobTitle": "Senior Frontend Engineer",
    "assessment": {
      "name": "Frontend Technical"
    },
    "submittedAt": "2026-02-01T11:30:00Z",
    "message": "Your assessment has been submitted. Good luck!"
  }
}
```

**Response: 200 OK (schedule_expired / expired / cancelled)**
```json
{
  "data": {
    "id": "ca_def456",
    "status": "schedule_expired",
    "company": "Acme Inc",
    "jobTitle": "Senior Frontend Engineer",
    "assessment": {
      "name": "Frontend Technical"
    },
    "message": "The scheduling deadline has passed."
  }
}
```

**Errors:**
- 401 UNAUTHORIZED: Invalid or expired token
- 404 NOT_FOUND: Assessment not found

#### Start Assessment

```
POST /assess/{token}/start

Request: (no body required)

Response: 200 OK
{
  "data": {
    "id": "ca_def456",
    "status": "in_progress"
  }
}

Transitions `scheduled` → `in_progress`.
Validates that the assessment is in `scheduled` state, the `scheduledFor` time has arrived,
and the completion deadline has not passed (including grace period).

Errors:
- 404 NOT_FOUND: Assessment not found
- 400 ALREADY_STARTED: Assessment is already in progress
- 400 NOT_SCHEDULED: Assessment is not in a scheduled state
- 400 INVALID_TIME: Assessment scheduled time hasn't arrived yet
- 400 EXPIRED: Assessment completion deadline has passed
```

#### Schedule

```
POST /assess/{token}/schedule

Request:
{
  "scheduledFor": "2026-02-01T07:00:00Z",
  "timezone": "Asia/Jakarta"
}

Response: 200 OK
{
  "data": {
    "id": "ca_def456",
    "status": "scheduled",
    "scheduledFor": "2026-02-01T07:00:00Z",
    "scheduledTimezone": "Asia/Jakarta",
    "completionDeadline": "2026-02-02T07:00:00Z",
    "message": "Scheduled for Saturday, February 1 at 2:00 PM WIB"
  }
}

Side Effects:
- Sends confirmation email to candidate

Errors:
- 400 PAST_SCHEDULE_DEADLINE: Cannot schedule after deadline
- 400 INVALID_TIME: Time must be in the future
- 400 ALREADY_SCHEDULED: Already scheduled (use reschedule)
- 400 CANCELLED: Assessment was cancelled
```

#### Reschedule

```
POST /assess/{token}/reschedule

Request:
{
  "scheduledFor": "2026-02-02T03:00:00Z",
  "timezone": "Asia/Jakarta"
}

Response: 200 OK
{
  "data": {
    "id": "ca_def456",
    "status": "scheduled",
    "scheduledFor": "2026-02-02T03:00:00Z",
    "scheduledTimezone": "Asia/Jakarta",
    "completionDeadline": "2026-02-03T03:00:00Z",
    "rescheduleCount": 1,
    "remainingReschedules": 1,
    "message": "Rescheduled to Sunday, February 2 at 10:00 AM WIB"
  }
}

Errors:
- 400 NO_RESCHEDULES_LEFT: Maximum reschedules reached
- 400 ALREADY_STARTED: Cannot reschedule after window opened
- 400 PAST_SCHEDULE_DEADLINE: New time must be before schedule deadline
- 400 INVALID_TIME: Time must be in the future
- 400 NOT_SCHEDULED: Must schedule first
```

#### Upload File

```
POST /assess/{token}/parts/{partId}/files

Headers:
- Content-Type: multipart/form-data

Body:
- file: (binary)

Response: 200 OK
{
  "data": {
    "id": "file_123",
    "name": "todo-app.zip",
    "size": 2400000,
    "mimeType": "application/zip",
    "uploadedAt": "2026-02-01T08:30:00Z"
  }
}

Errors:
- 400 INVALID_FILE_TYPE: File type not allowed
- 400 FILE_TOO_LARGE: Exceeds 50MB limit
- 400 EXPIRED: Deadline has passed (including 10-min grace period)
- 400 NOT_IN_PROGRESS: Assessment not in progress
- 400 PART_NOT_FOUND: Part does not exist
```

#### Delete File

```
DELETE /assess/{token}/parts/{partId}/files/{fileId}

Response: 200 OK
{
  "message": "File deleted"
}

Errors:
- 400 EXPIRED: Deadline has passed (including 10-min grace period)
- 400 NOT_IN_PROGRESS: Assessment not in progress
- 404 FILE_NOT_FOUND: File doesn't exist
```

#### Submit

```
POST /assess/{token}/submit

Request: (no body required)

Response: 200 OK
{
  "data": {
    "id": "ca_def456",
    "status": "submitted",
    "submittedAt": "2026-02-01T11:30:00Z",
    "message": "Assessment submitted successfully. Good luck!"
  }
}

Errors:
- 400 MISSING_PARTS: Required parts without files: ["Coding Challenge"]
- 400 EXPIRED: Deadline has passed (including 10-min grace period)
- 400 ALREADY_SUBMITTED: Cannot submit twice
- 400 NOT_IN_PROGRESS: Assessment not in progress

Note: Only parts with `required: true` must have at least one file.
Optional parts can be submitted without files.
```

---

### 5. Files

#### Download File

```
GET /v1/assessments/files/{fileId}

Headers:
- Authorization: Bearer {recruiterJWT}

Response: 200 OK
- Content-Type: application/octet-stream
- Content-Disposition: attachment; filename="todo-app.zip"

(binary file content)

Errors:
- 404 FILE_NOT_FOUND: File doesn't exist
- 403 FORBIDDEN: No access to this file

Note: Accessible to any recruiter or admin in the organization.
Candidates cannot download (they uploaded it).
```

---

## File Upload Rules

### Allowed File Types

```
Archives:    .zip, .tar.gz, .rar, .7z
Documents:   .pdf, .doc, .docx, .ppt, .pptx
Spreadsheet: .xlsx, .xls, .csv
Images:      .png, .jpg, .jpeg
Design:      .fig, .sketch
```

### Limits

| Limit | Value |
|-------|-------|
| Max file size | 50 MB |
| Max files per part | No limit (reasonable) |
| Grace period | 10 minutes |

---

## Evaluation Signals

Assessment evaluation uses a dedicated signal system, separate from the screening triage signals (`SHORTLIST` / `MAYBE` / `WEAK`):

| Signal | Meaning | Decision Impact |
|--------|---------|-----------------|
| `clear_evidence` | Strong positive signal | Proceed with confidence |
| `some_gaps` | Mixed signal, some concerns | Needs discussion or another signal |
| `insufficient_evidence` | Weak or negative signal | High uncertainty |

**When used:** After candidate submits assessment, recruiter reviews submissions and records their evaluation signal. This is distinct from screening triage which happens earlier in the pipeline.

---

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

### Common Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `UNAUTHORIZED` | 401 | Invalid or missing token |
| `FORBIDDEN` | 403 | No permission for this action |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `ASSESSMENT_NOT_FOUND` | 400 | Assessment doesn't exist |
| `ASSESSMENT_ARCHIVED` | 400 | Cannot use archived assessment |
| `NO_ASSESSMENT` | 400 | Job has no assessment attached |
| `ALREADY_INVITED` | 400 | Candidate already has assessment |
| `ALREADY_SCHEDULED` | 400 | Already scheduled |
| `ALREADY_STARTED` | 400 | Cannot modify after window opened |
| `ALREADY_SUBMITTED` | 400 | Cannot modify after submission |
| `ALREADY_EVALUATED` | 400 | Cannot modify after evaluation |
| `ALREADY_CANCELLED` | 400 | Already cancelled |
| `NOT_SCHEDULED` | 400 | Must schedule first |
| `NOT_IN_PROGRESS` | 400 | Assessment not in progress |
| `NOT_SUBMITTED` | 400 | Cannot evaluate before submission |
| `EXPIRED` | 400 | Deadline has passed |
| `NO_RESCHEDULES_LEFT` | 400 | Maximum reschedules reached |
| `PAST_SCHEDULE_DEADLINE` | 400 | Schedule deadline has passed |
| `INVALID_TIME` | 400 | Time must be in the future |
| `INVALID_SIGNAL` | 400 | Invalid evaluation signal |
| `INVALID_FILE_TYPE` | 400 | File type not allowed |
| `FILE_TOO_LARGE` | 400 | Exceeds size limit |
| `FILE_NOT_FOUND` | 404 | File doesn't exist |
| `PART_NOT_FOUND` | 400 | Part doesn't exist |
| `MISSING_PARTS` | 400 | Required parts without files |
| `JOB_NOT_OPEN` | 400 | Job is not open |
| `JOB_PUBLISHED` | 400 | Cannot modify published job assessment |
| `JOB_CLOSED` | 400 | Job is closed |

---

## Job Status & Assessment Behavior

| Job Status | New Candidates | Existing Assessments | Assessment Source |
|------------|----------------|---------------------|-------------------|
| `draft` | Cannot apply | Cannot invite | Live sync to library |
| `open` | Can apply | Active | Frozen snapshot |
| `paused` | Cannot apply | Continue (no change) | Frozen snapshot |
| `closed` | Cannot apply | Auto-cancelled (via queue) | Frozen snapshot |

### Snapshot Behavior

Follows the same pattern as interview pipeline CRUD:

| Job Status | Assessment Source | Editable |
|------------|-------------------|----------|
| Draft | Live sync to library definition | Attach/detach freely |
| Published | Frozen snapshot (denormalized JSON) | Cannot change |

**When job is published:**
1. Assessment definition is copied as JSON snapshot into `JobAssessment.snapshot`
2. Changes to library do not affect this job
3. All candidates see the same version
4. Recruiter reviews snapshot during publish flow

**When job is closed:**
1. Queue message dispatched: `{ type: "cancel_assessments", jobId, reason: "job_closed" }`
2. Consumer batch-updates all non-terminal assessments to `cancelled`
3. Candidate tokens remain valid but show cancelled status

---

## Endpoint Summary

| Category | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| **Library** | `GET` | `/assessments` | List assessments |
| | `POST` | `/assessments` | Create assessment |
| | `GET` | `/assessments/{id}` | Get assessment |
| | `PATCH` | `/assessments/{id}` | Update assessment or archive |
| **Job** | `GET` | `/jobs/{jobId}/assessment` | Get job assessment |
| | `PUT` | `/jobs/{jobId}/assessment` | Attach assessment |
| | `DELETE` | `/jobs/{jobId}/assessment` | Remove assessment (draft only) |
| **Candidate (Recruiter)** | `GET` | `/jobs/{jobId}/candidates/{applicationId}/assessment` | Get candidate assessment |
| | `POST` | `/jobs/{jobId}/candidates/{applicationId}/assessment/invite` | Invite candidate |
| | `POST` | `.../assessment/evaluate` | Evaluate submission (re-call to update) |
| | `POST` | `.../assessment/cancel` | Cancel assessment |
| **Candidate-Facing** | `GET` | `/assess/{token}` | View assessment (status-aware) |
| | `POST` | `/assess/{token}/start` | Start assessment |
| | `POST` | `/assess/{token}/schedule` | Schedule |
| | `POST` | `/assess/{token}/reschedule` | Reschedule |
| | `POST` | `/assess/{token}/parts/{partId}/files` | Upload file |
| | `DELETE` | `/assess/{token}/parts/{partId}/files/{fileId}` | Delete file |
| | `POST` | `/assess/{token}/submit` | Submit |
| **Files** | `GET` | `/v1/assessments/files/{fileId}` | Download file |

**Total: 16 endpoints**

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | January 2026 | Initial MVP specification |
| 1.1 | January 2026 | Added: timezone handling, 5-min grace period, bulk invite, evaluation updates, merged candidate view. Changed: `usedByJobs` → `usedByActiveJobs`. |
| 1.2 | January 2026 | **Breaking changes from v1.1 review.** Replaced external assessment providers with in-house library. Changed: candidate auth to opaque tokens (`/assess/{token}/...`), grace period 5min → 10min, max file size 100MB → 50MB, archive via `PATCH` not `DELETE`, removed `usedByActiveJobs` and `remainingTime`, removed `PUT` with null for removal (use `DELETE` only), removed `order` from parts (array position is order). Added: `required` field on parts, hybrid status transition mechanism (lazy eval + cron), queue-based auto-cancel on job close, candidate token model, standardized file fields, terminal status responses (expired/cancelled). Kept existing candidate stages unchanged. |
