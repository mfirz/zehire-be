# Interviewer Self-Service Portal API

Magic link authenticated endpoints for interviewers to manage their availability, view interviews, and submit feedback.

**Base path:** `/i/:token`

**Authentication:** Magic token (included in URL path)

No JWT required. The magic token in the URL authenticates the interviewer.

---

## Overview

The interviewer portal allows interviewers to:
- View upcoming interviews and pending feedback
- Manage availability windows and blocked dates
- Connect their calendar (Google, Outlook)
- Submit interview feedback

### Token Expiry

Magic tokens expire after 30 days. Interviewers can request a new invite from recruiters if their token expires.

---

## GET /i/:token

Get interviewer dashboard data including upcoming interviews and pending feedback.

### Request

```
GET /i/:token
```

### Response

#### 200 OK

```json
{
  "id": "int_abc123",
  "email": "interviewer@company.com",
  "name": "John Smith",
  "timezone": "America/New_York",
  "status": "active",
  "calendarConnected": true,
  "calendarProvider": "google",
  "upcomingInterviews": [
    {
      "id": "inv_xyz789",
      "scheduledAt": "2026-01-20T14:00:00Z",
      "durationMinutes": 60,
      "videoCallLink": "https://meet.google.com/abc-defg-hij",
      "candidateName": "Jane Candidate",
      "jobTitle": "Senior Software Engineer",
      "stageName": "Technical Interview"
    }
  ],
  "pendingFeedback": [
    {
      "interviewId": "inv_def456",
      "completedAt": "2026-01-18T15:00:00Z",
      "candidateName": "Bob Applicant",
      "jobTitle": "Frontend Developer"
    }
  ]
}
```

#### 401 Unauthorized

```json
{
  "error": "Invalid or expired token"
}
```

---

## GET /i/:token/interviews

List interviewer's upcoming interviews and pending feedback.

### Response

#### 200 OK

```json
{
  "upcomingInterviews": [
    {
      "id": "inv_xyz789",
      "scheduledAt": "2026-01-20T14:00:00Z",
      "durationMinutes": 60,
      "videoCallLink": "https://meet.google.com/abc-defg-hij",
      "candidateName": "Jane Candidate",
      "jobTitle": "Senior Software Engineer",
      "companyName": "Acme Corp",
      "stageName": "Technical Interview"
    }
  ],
  "pendingFeedback": [
    {
      "interviewId": "inv_def456",
      "completedAt": "2026-01-18T15:00:00Z",
      "candidateName": "Bob Applicant",
      "jobTitle": "Frontend Developer"
    }
  ]
}
```

---

## GET /i/:token/availability

Get interviewer's availability windows and blocked dates.

### Response

#### 200 OK

```json
{
  "timezone": "America/New_York",
  "windows": [
    {
      "id": "win_123",
      "dayOfWeek": 1,
      "startTime": "09:00",
      "endTime": "12:00"
    },
    {
      "id": "win_124",
      "dayOfWeek": 1,
      "startTime": "14:00",
      "endTime": "17:00"
    },
    {
      "id": "win_125",
      "dayOfWeek": 3,
      "startTime": "10:00",
      "endTime": "16:00"
    }
  ],
  "blockedDates": [
    {
      "id": "blk_456",
      "date": "2026-01-25",
      "reason": "Doctor appointment",
      "createdAt": "2026-01-20T10:00:00Z"
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `dayOfWeek` | 0 = Sunday, 1 = Monday, ... 6 = Saturday |
| `startTime` / `endTime` | Local time in HH:MM format |
| `date` | ISO date (YYYY-MM-DD) |

---

## PUT /i/:token/availability

Update interviewer's availability windows (replaces all existing).

### Request

```json
{
  "timezone": "America/Los_Angeles",
  "windows": [
    {
      "dayOfWeek": 1,
      "startTime": "09:00",
      "endTime": "17:00"
    },
    {
      "dayOfWeek": 2,
      "startTime": "09:00",
      "endTime": "17:00"
    },
    {
      "dayOfWeek": 3,
      "startTime": "09:00",
      "endTime": "17:00"
    },
    {
      "dayOfWeek": 4,
      "startTime": "09:00",
      "endTime": "17:00"
    },
    {
      "dayOfWeek": 5,
      "startTime": "09:00",
      "endTime": "17:00"
    }
  ]
}
```

| Field      | Type   | Required | Description                        |
|------------|--------|----------|------------------------------------|
| `timezone` | string | No       | IANA timezone identifier           |
| `windows`  | array  | Yes      | Array of availability windows      |

**Window object:**

| Field       | Type   | Required | Description                   |
|-------------|--------|----------|-------------------------------|
| `dayOfWeek` | number | Yes      | 0-6 (Sunday-Saturday)         |
| `startTime` | string | Yes      | Start time (HH:MM, 24-hour)   |
| `endTime`   | string | Yes      | End time (HH:MM, 24-hour)     |

### Response

#### 200 OK

Returns updated availability (same format as GET).

#### 400 Bad Request

```json
{
  "error": "Invalid window: startTime must be before endTime (17:00 >= 09:00)"
}
```

---

## POST /i/:token/block-date

Block a specific date.

### Request

```json
{
  "date": "2026-01-25",
  "reason": "Personal day"
}
```

| Field    | Type   | Required | Description                  |
|----------|--------|----------|------------------------------|
| `date`   | string | Yes      | Date to block (YYYY-MM-DD)   |
| `reason` | string | No       | Optional reason for blocking |

### Response

#### 201 Created

```json
{
  "id": "blk_789",
  "date": "2026-01-25",
  "reason": "Personal day",
  "createdAt": "2026-01-23T14:30:00Z"
}
```

#### 400 Bad Request

```json
{
  "error": "Cannot block dates in the past"
}
```

---

## DELETE /i/:token/block-date/:dateId

Unblock a specific date.

### Response

#### 204 No Content

Empty response on success.

#### 404 Not Found

```json
{
  "error": "Blocked date not found"
}
```

---

## POST /i/:token/unavailable-today

Quick action to mark interviewer unavailable for today.

### Response

#### 200 OK

```json
{
  "success": true,
  "blockedDate": {
    "id": "blk_today",
    "date": "2026-01-23",
    "reason": "Marked unavailable",
    "createdAt": "2026-01-23T09:15:00Z"
  }
}
```

---

## GET /i/:token/calendar-status

Check calendar connection status.

### Response

#### 200 OK

```json
{
  "connected": true,
  "provider": "google",
  "connectedAt": "2026-01-15T10:30:00Z"
}
```

---

## GET /i/:token/connect/:provider

Start OAuth flow for calendar connection.

**Redirects** to the provider's OAuth consent screen.

### Path Parameters

| Parameter  | Description                              |
|------------|------------------------------------------|
| `provider` | `google`, `outlook`, or `apple`          |

### Response

#### 302 Redirect

Redirects to OAuth consent screen.

#### 400 Bad Request

```json
{
  "error": "Invalid provider. Supported: google, outlook, apple"
}
```

```json
{
  "error": "Calendar already connected. Disconnect first to switch providers."
}
```

#### 501 Not Implemented

```json
{
  "error": "Apple calendar is not yet implemented"
}
```

---

## POST /i/:token/disconnect

Disconnect calendar from interviewer account.

### Response

#### 200 OK

```json
{
  "success": true,
  "message": "Calendar disconnected successfully"
}
```

#### 400 Bad Request

```json
{
  "error": "No calendar connected"
}
```

---

## POST /i/:token/interviews/:interviewId/feedback

Submit interview feedback.

### Request

```json
{
  "recommendation": "advance",
  "recommendationReason": "Strong technical skills demonstrated through clear system design discussion",
  "observations": [
    {
      "signal": "technical_depth",
      "observation": "clear",
      "evidence": "Demonstrated deep knowledge of distributed systems, explained CAP theorem tradeoffs"
    },
    {
      "signal": "communication_clarity",
      "observation": "clear",
      "evidence": "Explained complex architectural concepts clearly with good use of diagrams"
    },
    {
      "signal": "stakeholder_management",
      "observation": "partial",
      "evidence": "Mentioned cross-team collaboration but limited concrete examples provided"
    }
  ],
  "summary": "Strong candidate with excellent technical background. Recommend advancing to next round."
}
```

| Field                  | Type   | Required | Description                              |
|------------------------|--------|----------|------------------------------------------|
| `recommendation`       | enum   | Yes      | `advance`, `hold`, `pass`                |
| `recommendationReason` | string | Yes      | Explanation for recommendation (min 10 chars) |
| `observations`         | array  | Yes      | Signal observations from interview (min 1) |
| `summary`              | string | No       | Overall interview summary (max 1000 chars) |

**Recommendation values:**

| Value     | Description                                              |
|-----------|----------------------------------------------------------|
| `advance` | Candidate should move forward to the next stage          |
| `hold`    | Need more information or another interview               |
| `pass`    | Candidate should not continue in the process             |

**Observation object:**

| Field         | Type   | Required | Description                              |
|---------------|--------|----------|------------------------------------------|
| `signal`      | enum   | Yes      | Signal being evaluated (see list below)  |
| `observation` | enum   | Yes      | `clear`, `partial`, `absent`, `unclear`  |
| `evidence`    | string | Yes      | Supporting evidence (min 10 chars)       |

**Valid signal values:**
- `decision_under_uncertainty`
- `tradeoff_awareness`
- `risk_reasoning`
- `ethical_awareness`
- `technical_depth`
- `system_thinking`
- `communication_clarity`
- `stakeholder_management`
- `accountability`
- `learning_from_failure`

### Response

#### 200 OK

```json
{
  "success": true
}
```

#### 400 Bad Request

```json
{
  "error": "Validation failed",
  "details": {
    "recommendation": ["Invalid enum value. Expected 'advance' | 'hold' | 'pass'"]
  }
}
```

```json
{
  "error": "Validation failed",
  "details": {
    "observations": ["At least one signal observation is required"]
  }
}
```

```json
{
  "error": "Feedback already submitted for this interview"
}
```

#### 403 Forbidden

```json
{
  "error": "You are not a participant in this interview"
}
```

---

## Error Codes

| HTTP Status | Code           | Description                        |
|-------------|----------------|------------------------------------|
| 401         | `UNAUTHORIZED` | Invalid or expired magic token     |
| 403         | `FORBIDDEN`    | Not a participant in interview     |
| 400         | `BAD_REQUEST`  | Validation error or invalid state  |
| 404         | `NOT_FOUND`    | Resource not found                 |

---

## Related Endpoints

- [Interviewer Management](./v1/interviewers.md) - Recruiter endpoints for managing interviewers
- [Candidate Scheduling](./candidate-scheduling.md) - Candidate-facing scheduling endpoints
