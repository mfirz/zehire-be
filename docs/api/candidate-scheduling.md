# Candidate Scheduling API

Public endpoints for candidates to self-schedule interviews.

**Base path:** `/schedule/:token`

**Authentication:** Scheduling token (included in URL path)

No JWT or session required. The scheduling token authenticates the candidate for a specific interview stage.

---

## Overview

The candidate scheduling flow:
1. Candidate receives a scheduling link via email
2. Views available time slots for the interview
3. Books a convenient slot
4. Receives confirmation with calendar invite links
5. Can reschedule or cancel if needed

### Token Expiry

Scheduling tokens expire after 7 days. Once an interview is booked, the token is marked as used but can still be used for confirmation, reschedule, and cancel operations.

---

## GET /schedule/:token

Get scheduling page data including job, stage, and interviewer information.

### Response

#### 200 OK

```json
{
  "job": {
    "title": "Senior Software Engineer",
    "company": "Acme Corp"
  },
  "stage": {
    "name": "Technical Interview",
    "durationMinutes": 60
  },
  "interviewers": [
    {
      "name": "John Smith"
    },
    {
      "name": "Jane Doe"
    }
  ],
  "candidate": {
    "name": "Bob Applicant",
    "email": "bob@example.com"
  }
}
```

#### 401 Unauthorized

```json
{
  "error": "Invalid or expired scheduling link"
}
```

---

## GET /schedule/:token/slots

Get available time slots for scheduling.

### Query Parameters

| Parameter   | Type   | Required | Default          | Description                     |
|-------------|--------|----------|------------------|---------------------------------|
| `timezone`  | string | No       | `UTC`            | IANA timezone for slot display  |
| `startDate` | string | No       | Today            | Start date (YYYY-MM-DD)         |
| `endDate`   | string | No       | Start + 14 days  | End date (YYYY-MM-DD)           |

### Response

#### 200 OK

```json
{
  "timezone": "America/New_York",
  "slots": [
    {
      "date": "2026-01-24",
      "times": ["09:00", "10:00", "11:00", "14:00", "15:00"]
    },
    {
      "date": "2026-01-25",
      "times": ["09:00", "10:00", "14:00", "16:00"]
    },
    {
      "date": "2026-01-27",
      "times": ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"]
    }
  ]
}
```

**Note:** Slots account for:
- Interviewer availability windows
- Blocked dates
- Calendar free/busy (if interviewers have connected calendars)
- Buffer time between interviews
- Interview duration

---

## POST /schedule/:token/book

Book an interview slot.

### Request

```json
{
  "date": "2026-01-24",
  "time": "14:00",
  "timezone": "America/New_York"
}
```

| Field      | Type   | Required | Description                     |
|------------|--------|----------|---------------------------------|
| `date`     | string | Yes      | Selected date (YYYY-MM-DD)      |
| `time`     | string | Yes      | Selected time (HH:MM, 24-hour)  |
| `timezone` | string | Yes      | IANA timezone identifier        |

### Response

#### 201 Created

```json
{
  "success": true,
  "interview": {
    "id": "inv_xyz789",
    "scheduledAt": "2026-01-24T19:00:00Z",
    "durationMinutes": 60,
    "videoCallLink": "https://meet.google.com/abc-defg-hij",
    "interviewers": ["John Smith", "Jane Doe"],
    "addToCalendar": {
      "google": "https://calendar.google.com/calendar/render?action=TEMPLATE&text=...",
      "outlook": "https://outlook.live.com/calendar/0/deeplink/compose?...",
      "ical": "/schedule/abc123/calendar.ics"
    }
  },
  "message": "Interview scheduled! You'll receive a confirmation email."
}
```

| Field | Description |
|-------|-------------|
| `scheduledAt` | UTC timestamp of the interview |
| `videoCallLink` | Video call URL (Google Meet, Zoom, or Teams) |
| `addToCalendar` | Links to add event to various calendar apps |

#### 400 Bad Request

```json
{
  "error": "Validation failed",
  "details": {
    "date": ["Invalid date format"]
  }
}
```

```json
{
  "error": "No interviewers assigned to this stage"
}
```

#### 409 Conflict

```json
{
  "error": "This time slot is no longer available. Please select another time.",
  "code": "SLOT_UNAVAILABLE"
}
```

### Side Effects

- Creates interview record with status `scheduled`
- Creates video call link (if calendar integration enabled)
- Marks scheduling token as used
- Sends confirmation emails to candidate and interviewers

---

## GET /schedule/:token/confirmation

Get booking confirmation details after an interview has been booked.

### Response

#### 200 OK

```json
{
  "interview": {
    "id": "inv_xyz789",
    "scheduledAt": "2026-01-24T19:00:00Z",
    "durationMinutes": 60,
    "videoCallLink": "https://meet.google.com/abc-defg-hij",
    "interviewers": ["John Smith", "Jane Doe"]
  },
  "job": {
    "title": "Senior Software Engineer",
    "company": "Acme Corp"
  },
  "stage": {
    "name": "technical_interview"
  }
}
```

#### 404 Not Found

```json
{
  "error": "No interview has been booked yet"
}
```

```json
{
  "error": "Interview not found"
}
```

---

## POST /schedule/:token/reschedule

Reschedule an existing interview to a new time.

### Request

```json
{
  "date": "2026-01-27",
  "time": "10:00",
  "timezone": "America/New_York"
}
```

| Field      | Type   | Required | Description                     |
|------------|--------|----------|---------------------------------|
| `date`     | string | Yes      | New date (YYYY-MM-DD)           |
| `time`     | string | Yes      | New time (HH:MM, 24-hour)       |
| `timezone` | string | Yes      | IANA timezone identifier        |

### Response

#### 200 OK

```json
{
  "success": true,
  "interview": {
    "id": "inv_abc123",
    "scheduledAt": "2026-01-27T15:00:00Z",
    "durationMinutes": 60,
    "videoCallLink": "https://meet.google.com/new-link",
    "interviewers": ["John Smith", "Jane Doe"]
  },
  "message": "Interview rescheduled. Updated confirmation sent to your email."
}
```

#### 404 Not Found

```json
{
  "error": "No scheduled interview found to reschedule"
}
```

#### 409 Conflict

```json
{
  "error": "This time slot is no longer available. Please select another time.",
  "code": "SLOT_UNAVAILABLE"
}
```

### Side Effects

- Marks original interview as `rescheduled`
- Creates new interview with status `scheduled`
- Sends rescheduling notifications to candidate and interviewers

---

## POST /schedule/:token/cancel

Cancel a scheduled interview.

### Request

```json
{
  "reason": "Accepted another position"
}
```

| Field    | Type   | Required | Description                  |
|----------|--------|----------|------------------------------|
| `reason` | string | No       | Optional cancellation reason |

### Response

#### 200 OK

```json
{
  "success": true,
  "message": "Interview cancelled."
}
```

#### 404 Not Found

```json
{
  "error": "No scheduled interview found to cancel"
}
```

### Side Effects

- Updates interview status to `cancelled`
- Stores cancellation reason
- Sends cancellation notifications to candidate and interviewers

---

## Interview Status Lifecycle

```
scheduled → completed
    ↓
rescheduled → (new interview created)
    ↓
cancelled
```

| Status       | Description                              |
|--------------|------------------------------------------|
| `scheduled`  | Interview is confirmed and upcoming      |
| `completed`  | Interview has finished                   |
| `rescheduled`| Interview was rescheduled to a new time  |
| `cancelled`  | Interview was cancelled                  |
| `no_show`    | Candidate didn't attend                  |

---

## Error Codes

| HTTP Status | Code              | Description                        |
|-------------|-------------------|------------------------------------|
| 401         | `UNAUTHORIZED`    | Invalid or expired scheduling token|
| 400         | `VALIDATION_ERROR`| Invalid request body               |
| 404         | `NOT_FOUND`       | Interview or resource not found    |
| 409         | `SLOT_UNAVAILABLE`| Time slot no longer available      |

---

## Related Endpoints

- [Interviewer Portal](./interviewer-portal.md) - Interviewer self-service endpoints
- [Pipeline Configuration](./v1/jobs.md#patch-v1jobsidpipeline) - Configure interview rounds and stages
