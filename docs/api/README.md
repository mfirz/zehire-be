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

Authentication requirements are documented per endpoint. Unauthenticated endpoints are marked as `Public`.

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

### v1

| Method | Path       | Description  |
| ------ | ---------- | ------------ |
| GET    | `/v1/`     | API root     |
| POST   | `/v1/jobs` | Create a job |

### Internal

| Method | Path               | Description  |
| ------ | ------------------ | ------------ |
| GET    | `/internal/health` | Health check |
