# POST /v1/jobs

Create a new job posting.

## Request

```
POST /v1/jobs
Content-Type: application/json
```

### Body

```json
{
  "title": "Frontend Engineer"
}
```

| Field   | Type   | Required | Description                  |
| ------- | ------ | -------- | ---------------------------- |
| `title` | string | Yes      | Job title (1-200 characters) |

## Response

### 201 Created

Job successfully created.

```json
{
  "id": "job_123",
  "title": "Frontend Engineer"
}
```

| Field   | Type   | Description                                  |
| ------- | ------ | -------------------------------------------- |
| `id`    | string | Unique job identifier (prefixed with `job_`) |
| `title` | string | Job title as provided                        |

### 400 Bad Request

Request body is missing or invalid.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body"
  }
}
```

**Common causes:**

- Missing `title` field
- `title` is empty or exceeds 200 characters
- Request body is not valid JSON

## Notes

- Job IDs are generated server-side and are globally unique
- Future versions may accept additional fields (company, location, description)
- This endpoint will require authentication in production
