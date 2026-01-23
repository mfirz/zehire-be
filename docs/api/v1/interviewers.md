# Interviewers API

Manage interviewers for your organization. Interviewers are team members who participate in interviews and provide feedback on candidates.

All endpoints require JWT authentication.

## Overview

### Interviewer Lifecycle

```
invited → active → inactive
```

- **invited**: Initial state after creation, waiting for first access
- **active**: Interviewer has accessed their portal and is available
- **inactive**: Interviewer temporarily unavailable

### Authentication

Interviewers authenticate via magic links sent to their email. The magic link provides access to their self-service portal (`/i/:token`).

---

## POST /v1/interviewers

Create and invite a new interviewer.

### Request

```
POST /v1/interviewers
Authorization: Bearer <jwt>
Content-Type: application/json
```

#### Body

```json
{
  "email": "interviewer@company.com",
  "name": "John Smith"
}
```

| Field   | Type   | Required | Description                    |
|---------|--------|----------|--------------------------------|
| `email` | string | Yes      | Interviewer's email address    |
| `name`  | string | Yes      | Interviewer's display name     |

### Response

#### 201 Created

```json
{
  "id": "int_abc123",
  "email": "interviewer@company.com",
  "name": "John Smith",
  "status": "invited",
  "timezone": null,
  "calendarConnected": false,
  "calendarProvider": null,
  "createdAt": "2026-01-15T10:00:00Z"
}
```

| Field               | Type    | Description                              |
|---------------------|---------|------------------------------------------|
| `id`                | string  | Unique interviewer ID                    |
| `email`             | string  | Email address                            |
| `name`              | string  | Display name                             |
| `status`            | enum    | `invited`, `active`, or `inactive`       |
| `timezone`          | string  | Interviewer's timezone (null if not set) |
| `calendarConnected` | boolean | Whether calendar is connected            |
| `calendarProvider`  | string  | `google`, `outlook`, or null             |
| `createdAt`         | string  | ISO 8601 creation timestamp              |

#### 409 Conflict

```json
{
  "error": "Interviewer with this email already exists"
}
```

### Side Effects

- Sends an invite email with a magic link to the interviewer
- Magic link expires in 30 days

---

## GET /v1/interviewers

List all interviewers for the organization.

### Request

```
GET /v1/interviewers
Authorization: Bearer <jwt>
```

### Response

#### 200 OK

```json
{
  "interviewers": [
    {
      "id": "int_abc123",
      "email": "interviewer@company.com",
      "name": "John Smith",
      "status": "active",
      "timezone": "America/New_York",
      "calendarConnected": true,
      "calendarProvider": "google",
      "createdAt": "2026-01-15T10:00:00Z"
    },
    {
      "id": "int_def456",
      "email": "another@company.com",
      "name": "Jane Doe",
      "status": "invited",
      "timezone": null,
      "calendarConnected": false,
      "calendarProvider": null,
      "createdAt": "2026-01-16T14:30:00Z"
    }
  ],
  "total": 2
}
```

---

## GET /v1/interviewers/:id

Get interviewer details.

### Request

```
GET /v1/interviewers/:id
Authorization: Bearer <jwt>
```

### Response

#### 200 OK

```json
{
  "id": "int_abc123",
  "email": "interviewer@company.com",
  "name": "John Smith",
  "status": "active",
  "timezone": "America/New_York",
  "calendarConnected": true,
  "calendarProvider": "google",
  "createdAt": "2026-01-15T10:00:00Z"
}
```

#### 404 Not Found

```json
{
  "error": "Interviewer not found"
}
```

---

## PATCH /v1/interviewers/:id

Update an interviewer's information.

### Request

```
PATCH /v1/interviewers/:id
Authorization: Bearer <jwt>
Content-Type: application/json
```

#### Body

```json
{
  "name": "John D. Smith",
  "timezone": "America/Los_Angeles",
  "status": "inactive"
}
```

| Field      | Type   | Required | Description                        |
|------------|--------|----------|------------------------------------|
| `name`     | string | No       | Updated display name               |
| `timezone` | string | No       | IANA timezone (e.g., "US/Pacific") |
| `status`   | enum   | No       | `active` or `inactive`             |

All fields are optional.

### Response

#### 200 OK

Returns the updated interviewer object.

#### 404 Not Found

```json
{
  "error": "Interviewer not found"
}
```

---

## DELETE /v1/interviewers/:id

Remove an interviewer from the organization.

### Request

```
DELETE /v1/interviewers/:id
Authorization: Bearer <jwt>
```

### Response

#### 204 No Content

Empty response on success.

#### 404 Not Found

```json
{
  "error": "Interviewer not found"
}
```

### Warning

Deleting an interviewer:
- Removes them from all stage assignments
- Preserves historical interview and feedback records
- Cannot be undone

---

## POST /v1/interviewers/:id/resend

Resend the invite email with a new magic link.

### Request

```
POST /v1/interviewers/:id/resend
Authorization: Bearer <jwt>
```

### Response

#### 200 OK

```json
{
  "success": true,
  "message": "Invite resent successfully"
}
```

#### 404 Not Found

```json
{
  "error": "Interviewer not found"
}
```

#### 500 Internal Server Error

```json
{
  "error": "Failed to send invite email"
}
```

### Side Effects

- Invalidates the previous magic link
- Generates a new magic token (expires in 30 days)
- Sends a new invite email

---

## Error Codes

| HTTP Status | Code        | Description                         |
|-------------|-------------|-------------------------------------|
| 404         | `NOT_FOUND` | Interviewer not found in org        |
| 409         | `CONFLICT`  | Email already exists in org         |
| 500         | `ERROR`     | Failed to send email or update      |

---

## Related Endpoints

- [Interviewer Self-Service Portal](../interviewer-portal.md) - Magic link authenticated endpoints for interviewers
- [Pipeline Configuration](./jobs.md#patch-v1jobsidpipeline) - Assign interviewers to interview rounds
