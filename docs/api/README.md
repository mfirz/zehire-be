# Zehire API

REST API for the Zehire hiring platform.

## Base URL

```
https://zehire-backend.{account}.workers.dev
```

Production and staging environments use environment-specific subdomains.

## Versioning

All public endpoints are versioned via URL path:

```
/v1/jobs
/v2/jobs
```

- Version is always the first path segment
- Multiple versions may coexist
- Internal endpoints (`/internal/*`) are not versioned

## Content Type

All requests and responses use JSON:

```
Content-Type: application/json
```

Exceptions are explicitly documented per endpoint.

## Authentication

Protected endpoints require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <jwt>
```

JWTs are issued via the magic link authentication flow (`/auth/login` → `/auth/callback`).

### JWT Claims

| Claim    | Type   | Description                 |
| -------- | ------ | --------------------------- |
| `sub`    | string | User ID                     |
| `iss`    | string | Issuer (`zehire`)           |
| `aud`    | string | Audience (`zehire-api`)     |
| `org_id` | string | Organization ID             |
| `email`  | string | User email address          |
| `role`   | string | User role                   |
| `iat`    | number | Issued at (Unix timestamp)  |
| `exp`    | number | Expiration (Unix timestamp) |

### Authentication Errors

| HTTP Status | Code           | Description                            |
| ----------- | -------------- | -------------------------------------- |
| 401         | `UNAUTHORIZED` | Missing, invalid, or expired JWT       |
| 403         | `FORBIDDEN`    | Valid JWT but insufficient permissions |

See [Authentication Guide](./authentication.md) for complete details.

Unauthenticated (public) endpoints are explicitly marked as `Public`.

## Error Responses

All errors follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body"
  }
}
```

| Field           | Type   | Description                 |
| --------------- | ------ | --------------------------- |
| `error.code`    | string | Machine-readable error code |
| `error.message` | string | Human-readable description  |

### Common Error Codes

| HTTP Status | Code               | Description                       |
| ----------- | ------------------ | --------------------------------- |
| 400         | `VALIDATION_ERROR` | Request body failed validation    |
| 401         | `UNAUTHORIZED`     | Missing or invalid authentication |
| 403         | `FORBIDDEN`        | Authenticated but not permitted   |
| 404         | `NOT_FOUND`        | Resource does not exist           |
| 500         | `INTERNAL_ERROR`   | Unexpected server error           |

## Endpoint Index

### Authentication (Public)

| Method | Path             | Description              |
| ------ | ---------------- | ------------------------ |
| POST   | `/auth/login`    | Initiate magic link auth |
| GET    | `/auth/callback` | Complete authentication  |
| POST   | `/auth/logout`   | Clear session            |
| GET    | `/auth/me`       | Get current user         |

### v1 (Protected)

| Method | Path                            | Auth     | Description                    |
| ------ | ------------------------------- | -------- | ------------------------------ |
| GET    | `/v1/`                          | Public   | API root                       |
| GET    | `/v1/jobs`                      | Required | List jobs (paginated)          |
| POST   | `/v1/jobs`                      | Required | Create a job                   |
| GET    | `/v1/jobs/:id`                  | Required | Get job status/results         |
| PATCH  | `/v1/jobs/:id`                  | Required | Update draft job               |
| DELETE | `/v1/jobs/:id`                  | Required | Delete draft job               |
| POST   | `/v1/jobs/:id/generate`         | Required | Generate screening questions   |
| POST   | `/v1/jobs/:id/generate-pipeline`| Required | Generate hiring pipeline       |
| GET    | `/v1/jobs/:id/pipeline`         | Required | Get pipeline recommendation    |
| PATCH  | `/v1/jobs/:id/pipeline`         | Required | Update pipeline configuration  |
| POST   | `/v1/jobs/:id/pipeline/reset`   | Required | Reset pipeline to AI suggestion|
| POST   | `/v1/jobs/:id/publish`          | Required | Publish draft job              |
| POST   | `/v1/jobs/:id/pause`            | Required | Pause published job            |
| POST   | `/v1/jobs/:id/resume`           | Required | Resume paused job              |
| POST   | `/v1/jobs/:id/close`            | Required | Close job permanently          |
| GET    | `/v1/jobs/:id/applications`     | Required | List applications for job      |
| GET    | `/v1/applications/:id`          | Required | Get application details        |
| GET    | `/v1/applications/:id/posture`  | Required | Get application posture        |
| PATCH  | `/v1/applications/:id`          | Required | Update application status      |
| GET    | `/v1/applications/:id/cv`       | Required | Download CV file               |
| GET    | `/v1/applications/:id/cv/summary`| Required | Get structured CV summary     |
| POST   | `/v1/applications/:id/cv/reprocess`| Required | Reprocess CV extraction     |
| GET    | `/v1/applications/:id/notes`    | Required | Get application notes          |
| POST   | `/v1/applications/:id/notes`    | Required | Add note to application        |
| DELETE | `/v1/applications/:id/notes/:nid`| Required | Delete a note                 |
| GET    | `/v1/applications/:id/timeline` | Required | Get activity timeline          |
| GET    | `/v1/candidates/lookup`         | Required | Cross-app lookup by email      |
| POST   | `/v1/jobs/:id/custom-questions` | Required | Create custom question         |
| GET    | `/v1/jobs/:id/custom-questions` | Required | List custom questions          |
| GET    | `/v1/jobs/:id/custom-questions/:qid`| Required | Get custom question         |
| PUT    | `/v1/jobs/:id/custom-questions/:qid`| Required | Update custom question      |
| DELETE | `/v1/jobs/:id/custom-questions/:qid`| Required | Delete custom question      |
| POST   | `/v1/jobs/:id/custom-questions/reorder`| Required | Reorder questions        |
| POST   | `/v1/custom-questions/suggest-signals`| Required | Suggest signals for question |
| GET    | `/v1/assessment-providers`      | Required | List assessment providers      |
| GET    | `/v1/capacity`                  | Required | Get organization capacity      |
| GET    | `/v1/billing`                   | Required | Current month usage summary    |
| GET    | `/v1/billing/preview`           | Required | Preview current charges        |
| GET    | `/v1/billing/:year/:month`      | Required | Usage for specific month       |
| GET    | `/v1/billing/:year/:month/invoice` | Required | Invoice for specific month  |
| POST   | `/v1/interviewers`              | Required | Create/invite interviewer      |
| GET    | `/v1/interviewers`              | Required | List org's interviewers        |
| GET    | `/v1/interviewers/:id`          | Required | Get interviewer details        |
| PATCH  | `/v1/interviewers/:id`          | Required | Update interviewer             |
| DELETE | `/v1/interviewers/:id`          | Required | Remove interviewer             |
| POST   | `/v1/interviewers/:id/resend`   | Required | Resend invite email            |
| GET    | `/v1/jobs/:id/stages/:stageId/config` | Required | Get stage configuration  |
| PUT    | `/v1/jobs/:id/stages/:stageId/config` | Required | Update stage configuration |
| GET    | `/v1/jobs/:id/stages/:stageId/interviewers` | Required | List stage interviewers |
| POST   | `/v1/jobs/:id/stages/:stageId/interviewers` | Required | Assign interviewer to stage |
| DELETE | `/v1/jobs/:id/stages/:stageId/interviewers/:interviewerId` | Required | Remove interviewer from stage |
| GET    | `/v1/jobs/:id/stages/:stageId/availability` | Required | Preview stage availability |

### Public (No Auth)

| Method | Path                                    | Description                           |
| ------ | --------------------------------------- | ------------------------------------- |
| GET    | `/public/jobs/:slug`                    | Get job details by slug               |
| POST   | `/public/jobs/:slug/apply`              | Submit application (with optional CV) |
| POST   | `/public/jobs/:slug/apply/draft`        | Save application progress             |
| GET    | `/public/jobs/:slug/apply/draft/:id`    | Resume saved application              |

See [Public Applications API](./public-applications.md) for candidate-facing application endpoints.

See [Applications Management API](./v1/applications.md) for recruiter-facing application management.

See [Custom Questions API](./v1/custom-questions.md) for custom questions CRUD and signal suggestion.

See [Candidates API](./v1/candidates.md) for cross-application lookup.

See [Interviewers API](./v1/interviewers.md) for interviewer management.

See [Stage Configuration](./v1/jobs.md#stage-configuration) for interview stage setup.

### Interviewer Self-Service (Magic Link Auth)

| Method | Path                                    | Description                           |
| ------ | --------------------------------------- | ------------------------------------- |
| GET    | `/i/:token`                             | Interviewer dashboard                 |
| GET    | `/i/:token/interviews`                  | List upcoming interviews              |
| GET    | `/i/:token/availability`                | Get availability windows              |
| PUT    | `/i/:token/availability`                | Update availability windows           |
| POST   | `/i/:token/block-date`                  | Block a date                          |
| DELETE | `/i/:token/block-date/:dateId`          | Unblock a date                        |
| POST   | `/i/:token/unavailable-today`           | Mark unavailable for today            |
| GET    | `/i/:token/calendar-status`             | Check calendar connection             |
| GET    | `/i/:token/connect/:provider`           | Start calendar OAuth flow             |
| POST   | `/i/:token/disconnect`                  | Disconnect calendar                   |
| POST   | `/i/:token/interviews/:id/feedback`     | Submit interview feedback             |

See [Interviewer Portal API](./interviewer-portal.md) for complete documentation.

### Candidate Scheduling (Scheduling Token Auth)

| Method | Path                           | Description                           |
| ------ | ------------------------------ | ------------------------------------- |
| GET    | `/schedule/:token`             | Get scheduling page data              |
| GET    | `/schedule/:token/slots`       | Get available time slots              |
| POST   | `/schedule/:token/book`        | Book an interview slot                |
| GET    | `/schedule/:token/confirmation`| Get booking confirmation              |
| POST   | `/schedule/:token/reschedule`  | Reschedule interview                  |
| POST   | `/schedule/:token/cancel`      | Cancel interview                      |

See [Candidate Scheduling API](./candidate-scheduling.md) for complete documentation.

### Internal (Public)

| Method | Path               | Description  |
| ------ | ------------------ | ------------ |
| GET    | `/internal/health` | Health check |
