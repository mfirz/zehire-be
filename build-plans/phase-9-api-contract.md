# Phase 9 Interview Scheduling - API Contract

> For Frontend Team - All endpoints and payloads

---

## 1. Interviewer Management (Recruiter Dashboard)

Base path: `/v1/interviewers` (JWT required)

### POST /v1/interviewers
Create/invite an interviewer.

**Request:**
```json
{
  "email": "sarah@company.com",
  "name": "Sarah Chen"
}
```

**Response 201:**
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

### GET /v1/interviewers
List organization's interviewers.

**Response 200:**
```json
{
  "interviewers": [
    {
      "id": "int_abc123",
      "email": "sarah@company.com",
      "name": "Sarah Chen",
      "status": "active",
      "calendarConnected": true,
      "calendarProvider": "google"
    }
  ]
}
```

### GET /v1/interviewers/:id
Get interviewer details.

**Response 200:**
```json
{
  "id": "int_abc123",
  "email": "sarah@company.com",
  "name": "Sarah Chen",
  "status": "active",
  "calendarConnected": true,
  "calendarProvider": "google",
  "timezone": "Asia/Jakarta",
  "invitedAt": "2025-01-20T10:00:00Z",
  "connectedAt": "2025-01-21T14:00:00Z"
}
```

### PATCH /v1/interviewers/:id
Update interviewer name.

**Request:**
```json
{
  "name": "Sarah Chen-Wong"
}
```

**Response 200:** Same as GET

### DELETE /v1/interviewers/:id
Remove interviewer.

**Response:** 204 No Content

### POST /v1/interviewers/:id/resend-invite
Resend invite email.

**Response 200:**
```json
{
  "success": true,
  "message": "Invite email sent"
}
```

---

## 2. Interviewer Self-Service Portal (Magic Link)

Base path: `/i/:token` (magic link auth)

### GET /i/:token
Interviewer dashboard.

**Response 200:**
```json
{
  "id": "int_abc123",
  "email": "sarah@company.com",
  "name": "Sarah Chen",
  "timezone": "Asia/Jakarta",
  "status": "active",
  "calendarConnected": true,
  "calendarProvider": "google",
  "upcomingInterviews": [
    {
      "id": "sch_xyz789",
      "candidateName": "Ahmad Rizky",
      "jobTitle": "Senior Frontend Engineer",
      "stageName": "Technical Interview",
      "scheduledAt": "2025-01-28T14:00:00+07:00",
      "durationMinutes": 45,
      "videoCallLink": "https://meet.google.com/abc-xyz"
    }
  ],
  "pendingFeedback": [
    {
      "interviewId": "sch_abc456",
      "candidateName": "Diana Lee",
      "jobTitle": "Backend Engineer",
      "completedAt": "2025-01-27T15:00:00+07:00"
    }
  ]
}
```

### GET /i/:token/availability
Get availability windows and blocked dates.

**Response 200:**
```json
{
  "timezone": "Asia/Jakarta",
  "windows": [
    { "id": "avl_1", "dayOfWeek": 1, "startTime": "14:00", "endTime": "17:00" },
    { "id": "avl_2", "dayOfWeek": 2, "startTime": "13:00", "endTime": "16:00" },
    { "id": "avl_3", "dayOfWeek": 4, "startTime": "13:00", "endTime": "16:00" }
  ],
  "blockedDates": [
    { "id": "blk_1", "date": "2025-02-14", "reason": "Holiday", "createdAt": "2025-01-20T10:00:00Z" }
  ]
}
```

### PUT /i/:token/availability
Update availability windows (replaces all).

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

**Response 200:** Same structure as GET /i/:token/availability

### POST /i/:token/block-date
Block a specific date.

**Request:**
```json
{
  "date": "2025-02-14",
  "reason": "Holiday"
}
```

**Response 201:**
```json
{
  "id": "blk_xyz",
  "date": "2025-02-14",
  "reason": "Holiday",
  "createdAt": "2025-01-23T10:00:00Z"
}
```

### DELETE /i/:token/block-date/:dateId
Unblock a date.

**Response:** 204 No Content

### POST /i/:token/unavailable-today
Quick "I'm out today" action.

**Response 200:**
```json
{
  "success": true,
  "blockedDate": {
    "id": "blk_abc",
    "date": "2025-01-23",
    "reason": "Marked unavailable",
    "createdAt": "2025-01-23T10:00:00Z"
  }
}
```

### GET /i/:token/calendar-status
Check calendar connection status.

**Response 200:**
```json
{
  "connected": true,
  "provider": "google",
  "connectedAt": "2025-01-20T10:00:00Z"
}
```

### GET /i/:token/connect/:provider
Start OAuth flow. Redirects to provider consent screen.

**Providers:** `google`, `outlook`, `apple`

**Response:** 302 Redirect to OAuth consent

### POST /i/:token/disconnect
Disconnect calendar.

**Response 200:**
```json
{
  "success": true,
  "message": "Calendar disconnected successfully"
}
```

---

## 3. Interview Feedback (Interviewer Portal)

### POST /i/:token/interviews/:interviewId/feedback
Submit interview feedback.

**Request:**
```json
{
  "recommendation": "advance",
  "recommendationReason": "Technical signals strong enough for next round. Communication gap is coachable.",
  "observations": [
    {
      "signal": "technical_depth",
      "observation": "clear",
      "evidence": "Explained React server components and hydration patterns in depth, demonstrated understanding of trade-offs"
    },
    {
      "signal": "communication_clarity",
      "observation": "partial",
      "evidence": "Clear on technical topics, less structured when discussing project management decisions"
    },
    {
      "signal": "decision_under_uncertainty",
      "observation": "clear",
      "evidence": "Articulated how they chose between Redux and Context for state management with limited information"
    }
  ],
  "summary": "Strong technical foundation, would benefit from more structured communication coaching."
}
```

**Response 200:**
```json
{
  "success": true
}
```

#### Enums

**recommendation** (action-oriented, NOT quality ratings):
| Value | Meaning |
|-------|---------|
| `advance` | Safe to proceed to next stage |
| `hold` | Need more information / another interview |
| `pass` | Not a fit for this role |

**observation** (signal confidence):
| Value | Meaning |
|-------|---------|
| `clear` | Strong evidence observed |
| `partial` | Some evidence observed |
| `absent` | No evidence observed |
| `unclear` | Conflicting/ambiguous evidence |

**signal** (from Zehire's 10 core signals - see `archetypes/types.ts`):
- `decision_under_uncertainty` — How a candidate makes decisions when information is incomplete
- `tradeoff_awareness` — Explicit reasoning about competing priorities and constraints
- `risk_reasoning` — Understanding of risk, consequences, and mitigation
- `ethical_awareness` — Judgment in ambiguous or ethically complex situations
- `technical_depth` — Hands-on expertise beyond surface-level claims
- `system_thinking` — Understanding of interconnected systems and second-order effects
- `communication_clarity` — Ability to explain complex ideas clearly
- `stakeholder_management` — Navigating relationships, disagreements, and alignment
- `accountability` — Ownership of outcomes, including mistakes
- `learning_from_failure` — Growth behavior and adaptation after setbacks

---

## 4. Stage Configuration (Recruiter - Job Pipeline)

Base path: `/v1/jobs/:jobId/stages/:stageId` (JWT required)

### GET /v1/jobs/:jobId/stages/:stageId/config
Get stage configuration.

**Response 200:**
```json
{
  "stageId": "stage_tech_interview",
  "mode": "any_one",
  "durationMinutes": 45,
  "bufferMinutes": 15,
  "interviewers": [
    { "id": "int_abc", "email": "sarah@co.com", "name": "Sarah Chen", "calendarConnected": true },
    { "id": "int_def", "email": "tom@co.com", "name": "Tom Wilson", "calendarConnected": true }
  ]
}
```

### PUT /v1/jobs/:jobId/stages/:stageId/config
Update stage configuration.

**Request:**
```json
{
  "mode": "all_required",
  "durationMinutes": 60,
  "bufferMinutes": 15
}
```

**Response 200:** Same structure as GET

#### Enums

**mode**:
| Value | Meaning |
|-------|---------|
| `any_one` | At least one interviewer available (default) |
| `all_required` | All assigned interviewers must be free |

### GET /v1/jobs/:jobId/stages/:stageId/interviewers
List assigned interviewers.

**Response 200:**
```json
{
  "interviewers": [
    { "id": "int_abc", "email": "sarah@co.com", "name": "Sarah Chen", "calendarConnected": true }
  ]
}
```

### POST /v1/jobs/:jobId/stages/:stageId/interviewers
Assign interviewer to stage.

**Request:**
```json
{
  "interviewerId": "int_abc123"
}
```

**Response 201:**
```json
{
  "id": "assign_xyz",
  "interviewerId": "int_abc123",
  "email": "sarah@co.com",
  "name": "Sarah Chen",
  "calendarConnected": true
}
```

### DELETE /v1/jobs/:jobId/stages/:stageId/interviewers/:interviewerId
Remove interviewer from stage.

**Response:** 204 No Content

### GET /v1/jobs/:jobId/stages/:stageId/availability
Preview available slots (next 2 weeks).

**Response 200:**
```json
{
  "stageId": "stage_tech_interview",
  "mode": "any_one",
  "durationMinutes": 45,
  "startDate": "2025-01-23",
  "endDate": "2025-02-06",
  "slotsPerDay": {
    "2025-01-24": 4,
    "2025-01-27": 6,
    "2025-01-28": 5,
    "2025-01-29": 3
  },
  "totalSlots": 42,
  "interviewerAvailability": [
    { "id": "int_abc", "name": "Sarah Chen", "slotsContributed": 12, "calendarConnected": true },
    { "id": "int_def", "name": "Tom Wilson", "slotsContributed": 18, "calendarConnected": true }
  ]
}
```

---

## 5. Candidate Scheduling (Public)

Base path: `/schedule/:token` (scheduling token auth)

### GET /schedule/:token
Get scheduling page data.

**Response 200:**
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
  "candidate": {
    "name": "Ahmad Rizky",
    "email": "ahmad@email.com"
  }
}
```

### GET /schedule/:token/slots
Get available time slots.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `startDate` | string | today | YYYY-MM-DD |
| `endDate` | string | +14 days | YYYY-MM-DD |
| `timezone` | string | UTC | Candidate's timezone |

**Response 200:**
```json
{
  "timezone": "Asia/Jakarta",
  "slots": [
    { "date": "2025-01-28", "times": ["13:00", "14:00", "15:00"] },
    { "date": "2025-01-30", "times": ["13:00", "14:00"] },
    { "date": "2025-01-31", "times": ["14:00", "15:00", "16:00"] }
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

**Response 201:**
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
      "google": "https://calendar.google.com/calendar/render?action=TEMPLATE&...",
      "outlook": "https://outlook.live.com/calendar/0/deeplink/compose?...",
      "ical": "/schedule/xyz789/calendar.ics"
    }
  },
  "message": "Interview scheduled! You'll receive a confirmation email."
}
```

**Error 409 (slot no longer available):**
```json
{
  "error": "This time slot is no longer available. Please select another time.",
  "code": "SLOT_UNAVAILABLE"
}
```

### GET /schedule/:token/confirmation
Get booking confirmation (after booking).

**Response 200:**
```json
{
  "interview": {
    "id": "sch_xyz789",
    "scheduledAt": "2025-01-28T14:00:00+07:00",
    "durationMinutes": 45,
    "videoCallLink": "https://meet.google.com/abc-xyz",
    "interviewers": ["Sarah Chen", "Tom Wilson"]
  },
  "job": {
    "title": "Senior Frontend Engineer",
    "company": "TechCorp"
  },
  "stage": {
    "name": "Technical Interview"
  },
  "addToCalendar": {
    "google": "https://calendar.google.com/...",
    "outlook": "https://outlook.live.com/...",
    "ical": "/schedule/xyz789/calendar.ics"
  }
}
```

### POST /schedule/:token/reschedule
Reschedule interview.

**Request:**
```json
{
  "date": "2025-01-29",
  "time": "15:00",
  "timezone": "Asia/Jakarta"
}
```

**Response 200:**
```json
{
  "success": true,
  "interview": {
    "id": "sch_abc123",
    "scheduledAt": "2025-01-29T15:00:00+07:00",
    "durationMinutes": 45,
    "videoCallLink": "https://meet.google.com/new-xyz",
    "interviewers": ["Sarah Chen", "Tom Wilson"]
  },
  "message": "Interview rescheduled. Updated confirmation sent to your email."
}
```

### POST /schedule/:token/cancel
Cancel interview.

**Request:**
```json
{
  "reason": "Schedule conflict"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Interview cancelled."
}
```

---

## 6. Scheduled Interviews (Recruiter Dashboard)

Base path: `/v1/interviews` (JWT required)

### GET /v1/interviews
List all scheduled interviews.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter: `scheduled`, `completed`, `cancelled` |
| `jobId` | string | Filter by job |
| `startDate` | string | Filter by date range (YYYY-MM-DD) |
| `endDate` | string | Filter by date range (YYYY-MM-DD) |

**Response 200:**
```json
{
  "interviews": [
    {
      "id": "sch_xyz789",
      "applicationId": "app_123",
      "candidateName": "Ahmad Rizky",
      "candidateEmail": "ahmad@email.com",
      "jobId": "job_456",
      "jobTitle": "Senior Frontend Engineer",
      "stageId": "stage_tech",
      "stageName": "Technical Interview",
      "scheduledAt": "2025-01-28T14:00:00+07:00",
      "durationMinutes": 45,
      "timezone": "Asia/Jakarta",
      "status": "scheduled",
      "videoCallLink": "https://meet.google.com/abc-xyz",
      "interviewers": [
        { "id": "int_abc", "name": "Sarah Chen", "feedbackStatus": "pending" },
        { "id": "int_def", "name": "Tom Wilson", "feedbackStatus": "pending" }
      ]
    }
  ]
}
```

### GET /v1/interviews/:id
Get interview details.

**Response 200:**
```json
{
  "id": "sch_xyz789",
  "applicationId": "app_123",
  "candidateName": "Ahmad Rizky",
  "candidateEmail": "ahmad@email.com",
  "jobId": "job_456",
  "jobTitle": "Senior Frontend Engineer",
  "stageId": "stage_tech",
  "stageName": "Technical Interview",
  "scheduledAt": "2025-01-28T14:00:00+07:00",
  "durationMinutes": 45,
  "timezone": "Asia/Jakarta",
  "status": "scheduled",
  "videoCallLink": "https://meet.google.com/abc-xyz",
  "videoCallProvider": "google_meet",
  "interviewers": [
    {
      "id": "int_abc",
      "name": "Sarah Chen",
      "email": "sarah@co.com",
      "feedbackStatus": "submitted",
      "feedback": {
        "recommendation": "advance",
        "recommendationReason": "Strong technical skills",
        "observations": [...],
        "summary": "..."
      }
    }
  ],
  "createdAt": "2025-01-25T10:00:00Z",
  "updatedAt": "2025-01-25T10:00:00Z"
}
```

### PATCH /v1/interviews/:id
Update interview (cancel or reschedule).

**Request (cancel):**
```json
{
  "status": "cancelled",
  "cancelledReason": "Candidate withdrew"
}
```

**Request (reschedule):**
```json
{
  "scheduledAt": "2025-01-29T15:00:00+07:00"
}
```

**Response 200:** Same as GET

### GET /v1/applications/:applicationId/interviews
List interviews for an application.

**Response 200:**
```json
{
  "interviews": [
    {
      "id": "sch_xyz789",
      "stageId": "stage_tech",
      "stageName": "Technical Interview",
      "scheduledAt": "2025-01-28T14:00:00+07:00",
      "durationMinutes": 45,
      "status": "completed",
      "interviewers": [
        { "id": "int_abc", "name": "Sarah Chen", "feedbackStatus": "submitted" }
      ]
    }
  ]
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `NOT_FOUND` | 404 | Resource not found |
| `UNAUTHORIZED` | 401 | Invalid or expired token |
| `FORBIDDEN` | 403 | No permission for this action |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `SLOT_UNAVAILABLE` | 409 | Interview slot no longer available |
| `TOKEN_EXPIRED` | 401 | Scheduling token expired |
| `ALREADY_BOOKED` | 409 | Interview already booked for this stage |

---

## Implementation Status

| Phase | Endpoints | Status |
|-------|-----------|--------|
| 9A | Core infrastructure (DB schema) | ✅ Complete |
| 9B | Calendar/Video OAuth | ✅ Complete |
| 9C | Availability management | ✅ Complete |
| 9D | Stage configuration | ✅ Complete |
| 9E | Candidate scheduling & feedback | 🚧 In Progress |
| 9F | Notifications & reminders | ⏳ Pending |
