# Jobs API

Create and manage job postings with draft/publish lifecycle.

All authenticated job endpoints require JWT authentication.

## Overview

### Job Lifecycle

```
draft → published → paused → closed
         ↑___________|
              resume
```

- **draft**: Initial state. Edit content, generate questions
- **published**: Live, accepting applications (billing active)
- **paused**: Temporarily hidden (billing paused)
- **closed**: Permanently closed

### Questions Status

Separate from job status, tracks question generation:

- **none**: Questions not yet generated
- **pending**: Queued for generation
- **processing**: LLM pipeline running
- **completed**: Questions ready
- **failed**: Generation failed

---

## POST /v1/jobs

Create a new job as a draft.

Does NOT automatically queue for processing. Use `POST /v1/jobs/:id/generate` to generate questions.

### Authentication

**Required**: JWT via `Authorization: Bearer <jwt>` or session cookie

### Request

```
POST /v1/jobs
Authorization: Bearer <jwt>
Content-Type: application/json
```

#### Body

```json
{
  "title": "Senior Software Engineer",
  "description": "We are looking for a senior engineer to lead our backend team. You will be responsible for designing scalable systems, mentoring junior developers, and collaborating with product managers.",
  "companyName": "Acme Corp",
  "department": "Engineering",
  "location": "Remote"
}
```

| Field         | Type   | Required | Description                          |
| ------------- | ------ | -------- | ------------------------------------ |
| `title`       | string | Yes      | Job title (3-200 characters)         |
| `description` | string | Yes      | Job description (50-50000 characters)|
| `companyName` | string | No       | Company name (max 200 characters)    |
| `department`  | string | No       | Department name (max 100 characters) |
| `location`    | string | No       | Job location (max 200 characters)    |

### Response

#### 201 Created

```json
{
  "id": "abc123def456ghi78",
  "status": "draft",
  "questionsStatus": "none",
  "createdAt": "2026-01-07T10:30:00Z"
}
```

#### 400 Bad Request

```json
{
  "error": "Validation failed",
  "details": {
    "title": ["Title must be at least 3 characters"],
    "description": ["Description must be at least 50 characters"]
  }
}
```

---

## GET /v1/jobs

List jobs for the authenticated organization with cursor-based pagination.

### Query Parameters

| Parameter | Type   | Required | Default | Description                           |
| --------- | ------ | -------- | ------- | ------------------------------------- |
| `limit`   | number | No       | 20      | Number of items per page (max: 50)    |
| `cursor`  | string | No       | -       | Opaque cursor for next page           |
| `status`  | string | No       | -       | Filter by status (draft/published/paused/closed) |

### Response

#### 200 OK

```json
{
  "data": [
    {
      "id": "abc123def456ghi78",
      "title": "Senior Backend Engineer",
      "status": "published",
      "questionsStatus": "completed",
      "publicSlug": "acme-corp-senior-backend-engineer-x7k3m",
      "createdAt": "2026-01-01T10:00:00Z",
      "publishedAt": "2026-01-01T12:00:00Z"
    },
    {
      "id": "xyz789abc012def34",
      "title": "Frontend Engineer",
      "status": "draft",
      "questionsStatus": "none",
      "publicSlug": null,
      "createdAt": "2026-01-01T09:30:00Z",
      "publishedAt": null
    }
  ],
  "page": {
    "nextCursor": "eyJjIjoiMjAyNi0wMS0wMVQwOTozMDowMFoiLCJpIjoieHl6Nzg5YWJjMDEyZGVmMzQifQ"
  }
}
```

---

## GET /v1/jobs/:id

Get job status and details. Response varies by job status.

### Response by Status

#### Draft

```json
{
  "id": "abc123def456ghi78",
  "status": "draft",
  "questionsStatus": "completed",
  "title": "Senior Software Engineer",
  "description": "We are looking for...",
  "companyName": "Acme Corp",
  "department": "Engineering",
  "location": "Remote",
  "jobContext": {
    "domain": "software_engineering",
    "riskLevel": "medium",
    "decisionImpact": "team",
    "primarySignals": ["technical_depth", "system_thinking"],
    "collaborationRequired": "high",
    "customerFacing": false,
    "peopleManagement": false,
    "regulatedEnvironment": false,
    "experienceLevel": "senior"
  },
  "archetypes": [
    {
      "id": "senior_engineer_system_design",
      "category": "Technical Leadership",
      "description": "Evaluates system design and architecture skills",
      "signals": ["technical_depth", "system_thinking"],
      "selectionReason": "Role requires designing scalable systems"
    }
  ],
  "questions": [
    {
      "archetypeId": "senior_engineer_system_design",
      "questionText": "Describe a complex system you designed...",
      "signals": ["technical_depth", "system_thinking"],
      "minAnswerWords": 150,
      "metadata": {
        "category": "Technical Leadership",
        "formats": ["scenario", "reflection"],
        "renderingConstraints": {
          "requiresRealExample": true,
          "forbidYesNo": true,
          "singleQuestion": true
        }
      }
    }
  ],
  "errorMessage": null,
  "errorCode": null,
  "regenerationCount": 1,
  "lastRegenerationAt": "2026-01-07T10:35:00Z",
  "createdAt": "2026-01-07T10:30:00Z",
  "updatedAt": "2026-01-07T10:35:00Z",
  "processingStartedAt": "2026-01-07T10:31:00Z",
  "completedAt": "2026-01-07T10:32:00Z"
}
```

#### Published

```json
{
  "id": "abc123def456ghi78",
  "status": "published",
  "questionsStatus": "completed",
  "title": "Senior Software Engineer",
  "description": "We are looking for...",
  "companyName": "Acme Corp",
  "department": "Engineering",
  "location": "Remote",
  "publicSlug": "acme-corp-senior-software-engineer-x7k3m",
  "jobContext": { ... },
  "archetypes": [ ... ],
  "questions": [ ... ],
  "processingDurationMs": 3500,
  "createdAt": "2026-01-07T10:30:00Z",
  "updatedAt": "2026-01-07T12:00:00Z",
  "publishedAt": "2026-01-07T12:00:00Z",
  "completedAt": "2026-01-07T10:32:00Z"
}
```

#### Paused / Closed

Similar to published, with `closedAt` for closed jobs.

---

## PATCH /v1/jobs/:id

Update a draft job's content.

**Note**: If `title` or `description` changes, questions are reset to `none` and must be regenerated.

### Request

```json
{
  "title": "Updated Job Title",
  "description": "Updated description...",
  "companyName": "New Company Name",
  "department": "New Department",
  "location": "New Location"
}
```

All fields are optional. Only provided fields are updated.

### Response

#### 200 OK

Returns the updated job (same format as GET /v1/jobs/:id).

#### 400 Bad Request

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Only draft jobs can be updated"
  }
}
```

---

## DELETE /v1/jobs/:id

Delete a draft job.

**Note**: Only drafts can be deleted. Published/paused/closed jobs must be closed and remain for records.

### Response

#### 200 OK

```json
{
  "deleted": true
}
```

#### 400 Bad Request

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Only draft jobs can be deleted"
  }
}
```

---

## POST /v1/jobs/:id/generate

Queue a job for question generation.

### Rate Limits

- Maximum 20 regenerations per job
- 10 minute cooldown between regenerations

### Response

#### 202 Accepted

```json
{
  "queued": true
}
```

#### 429 Too Many Requests

```json
{
  "error": {
    "code": "REGENERATION_COOLDOWN",
    "message": "Please wait before regenerating questions",
    "retryAfter": 542
  }
}
```

Also returns `Retry-After` header with seconds to wait.

#### 400 Bad Request

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Only draft jobs can generate questions"
  }
}
```

---

## POST /v1/jobs/:id/publish

Publish a draft job.

**Prerequisites**:
- Job must be in `draft` status
- Questions must be `completed` (questionsStatus)

### Response

#### 200 OK

Returns the published job with `publicSlug`.

```json
{
  "id": "abc123def456ghi78",
  "status": "published",
  "questionsStatus": "completed",
  "publicSlug": "acme-corp-senior-software-engineer-x7k3m",
  ...
}
```

#### 400 Bad Request

```json
{
  "error": {
    "code": "QUESTIONS_NOT_READY",
    "message": "Questions must be completed before publishing"
  }
}
```

---

## POST /v1/jobs/:id/pause

Pause a published job.

Hides the job from public view and stops billing.

### Response

#### 200 OK

Returns the paused job.

#### 400 Bad Request

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Only published jobs can be paused"
  }
}
```

---

## POST /v1/jobs/:id/resume

Resume a paused job.

Makes the job public again and restarts billing.

### Response

#### 200 OK

Returns the resumed job (status: "published").

#### 400 Bad Request

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Only paused jobs can be resumed"
  }
}
```

---

## POST /v1/jobs/:id/close

Close a job permanently.

Can close published or paused jobs. Cannot be reopened.

### Response

#### 200 OK

Returns the closed job.

#### 400 Bad Request

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Only published or paused jobs can be closed"
  }
}
```

---

## GET /public/jobs/:slug

Get public job details by slug for candidates.

**No authentication required.**

Only returns published jobs.

### Request

```
GET /public/jobs/acme-corp-senior-software-engineer-x7k3m
```

### Response

#### 200 OK

```json
{
  "title": "Senior Software Engineer",
  "companyName": "Acme Corp",
  "department": "Engineering",
  "location": "Remote",
  "description": "We are looking for a senior engineer...",
  "questions": [
    {
      "id": "q1",
      "text": "Describe a complex system you designed and the tradeoffs you considered.",
      "minWords": 150
    },
    {
      "id": "q2",
      "text": "Tell us about a time you mentored a junior developer.",
      "minWords": 100
    }
  ]
}
```

#### 404 Not Found

```json
{
  "error": "Job not found"
}
```

---

## Workflow Example

### 1. Create Draft

```bash
curl -X POST http://localhost:8787/v1/jobs \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Senior Software Engineer",
    "description": "We are looking for a senior engineer to lead our backend team..."
  }'
```

### 2. Generate Questions

```bash
curl -X POST http://localhost:8787/v1/jobs/{id}/generate \
  -H "Authorization: Bearer $JWT"
```

### 3. Poll for Completion

```bash
curl http://localhost:8787/v1/jobs/{id} \
  -H "Authorization: Bearer $JWT"
# Wait for questionsStatus: "completed"
```

### 4. Review and Publish

```bash
curl -X POST http://localhost:8787/v1/jobs/{id}/publish \
  -H "Authorization: Bearer $JWT"
```

### 5. Share Public Link

```
https://yourapp.com/apply/acme-corp-senior-software-engineer-x7k3m
```

---

## Error Codes

| Code | Description |
| ---- | ----------- |
| `NOT_FOUND` | Job not found or not owned by organization |
| `INVALID_STATE` | Action not allowed for current job status |
| `QUESTIONS_NOT_READY` | Questions must be completed before publishing |
| `REGENERATION_LIMIT_REACHED` | Maximum 20 regenerations per job reached |
| `REGENERATION_COOLDOWN` | Must wait before regenerating (check retryAfter) |
| `INFERENCE_FAILED` | LLM inference step failed |
| `ARCHETYPE_RESOLUTION_FAILED` | Archetype resolution failed |
| `QUESTION_RENDERING_FAILED` | Question rendering failed |
| `LLM_RATE_LIMITED` | LLM API rate limited |
| `LLM_TIMEOUT` | LLM API timed out |
| `VALIDATION_ERROR` | Input or output validation failed |
| `INTERNAL_ERROR` | Unexpected internal error |

---

## FAQ

### Why can't published jobs be edited?

Once a job is published, it becomes immutable. This is a deliberate design decision based on Zehire's signal-first philosophy:

**1. Signal Consistency**

Questions are AI-generated based on the job's title and description. If you edit the job after publishing:
- The questions would no longer match the updated content
- Candidates who already applied answered questions for the *original* job
- Signal evaluation becomes inconsistent across applicants

**2. Fairness & Decision Safety**

Zehire's core principle is "reducing regret while acting under uncertainty." If a job changes mid-hiring:
- Candidates who applied before and after the change cannot be fairly compared
- Decision postures computed earlier would become invalid
- This creates unfair evaluation conditions

**3. Audit Trail**

For compliance and legal defensibility, there must be a clear record of:
- What was posted and when
- What questions each candidate answered
- When decisions were made

Editing would break this chain of evidence.

**4. Billing Clarity**

The job's content determines the "evaluative work" being performed and billed. Changing mid-cycle creates billing ambiguity.

**What to do instead:** If you need to change a published job significantly, close it and create a new job with the updated content.

### Why can't closed jobs be reopened?

Closed jobs are terminal and cannot be reopened. This design serves several purposes:

**1. Billing Integrity**

Closing a job permanently stops billing. Reopening would create ambiguity—should billing restart fresh or continue from where it left off? This would violate Zehire's billing philosophy: "Billing reflects work performed, not data stored."

**2. Historical Record Preservation**

A closed job represents a completed hiring decision (position filled, cancelled, etc.). It preserves:
- The complete applicant pool for that hiring cycle
- All signal evaluations and decision postures
- The audit trail of the hiring process

**3. Clean Separation of Hiring Cycles**

If you need to hire for the same role again, creating a new job ensures:
- Fresh applicant pool (no mixing with previous candidates)
- Clean billing cycle
- No confusion between historical and new signal evaluations
- Clear temporal boundaries for decision-making

**What to do instead:** Create a new job posting. The previous job remains in your records for reference.
