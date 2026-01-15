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
| GET    | `/v1/assessment-providers`      | Required | List assessment providers      |
| GET    | `/v1/capacity`                  | Required | Get organization capacity      |
| GET    | `/v1/billing`                   | Required | Current month usage summary    |
| GET    | `/v1/billing/preview`           | Required | Preview current charges        |
| GET    | `/v1/billing/:year/:month`      | Required | Usage for specific month       |
| GET    | `/v1/billing/:year/:month/invoice` | Required | Invoice for specific month  |

### Public (No Auth)

| Method | Path                                    | Description                           |
| ------ | --------------------------------------- | ------------------------------------- |
| GET    | `/public/jobs/:slug`                    | Get job details by slug               |
| POST   | `/public/jobs/:slug/apply`              | Submit application (with optional CV) |
| POST   | `/public/jobs/:slug/apply/draft`        | Save application progress             |
| GET    | `/public/jobs/:slug/apply/draft/:id`    | Resume saved application              |

See [Public Applications API](./public-applications.md) for candidate-facing application endpoints.

See [Applications Management API](./applications.md) for recruiter-facing application management.

### Internal (Public)

| Method | Path               | Description  |
| ------ | ------------------ | ------------ |
| GET    | `/internal/health` | Health check |
