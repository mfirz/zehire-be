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

| Claim    | Type   | Description               |
| -------- | ------ | ------------------------- |
| `sub`    | string | User ID                   |
| `iss`    | string | Issuer (`zehire`)         |
| `aud`    | string | Audience (`zehire-api`)   |
| `org_id` | string | Organization ID           |
| `email`  | string | User email address        |
| `role`   | string | User role                 |
| `iat`    | number | Issued at (Unix timestamp) |
| `exp`    | number | Expiration (Unix timestamp) |

### Authentication Errors

| HTTP Status | Code           | Description                          |
| ----------- | -------------- | ------------------------------------ |
| 401         | `UNAUTHORIZED` | Missing, invalid, or expired JWT     |
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

| Method | Path             | Description             |
| ------ | ---------------- | ----------------------- |
| POST   | `/auth/login`    | Initiate magic link auth |
| GET    | `/auth/callback` | Complete authentication |
| POST   | `/auth/logout`   | Clear session           |
| GET    | `/auth/me`       | Get current user        |

### v1 (Protected)

| Method | Path            | Auth     | Description             |
| ------ | --------------- | -------- | ----------------------- |
| GET    | `/v1/`          | Public   | API root                |
| GET    | `/v1/jobs`      | Required | List jobs (paginated)   |
| POST   | `/v1/jobs`      | Required | Create a job            |
| GET    | `/v1/jobs/:id`  | Required | Get job status/results  |

### Internal (Public)

| Method | Path               | Description  |
| ------ | ------------------ | ------------ |
| GET    | `/internal/health` | Health check |
