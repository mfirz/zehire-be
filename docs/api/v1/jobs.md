# Jobs API

Create and manage job postings.

All job endpoints require JWT authentication.

## POST /v1/jobs

Create a new job posting and queue for async processing.

### Authentication

**Required**: JWT via `Authorization: Bearer <jwt>`

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
  "description": "We are looking for a senior engineer...",
  "companyName": "Acme Corp",
  "department": "Engineering",
  "location": "Remote"
}
```

| Field         | Type   | Required | Description                  |
| ------------- | ------ | -------- | ---------------------------- |
| `title`       | string | Yes      | Job title (1-200 characters) |
| `description` | string | No       | Job description              |
| `companyName` | string | No       | Company name                 |
| `department`  | string | No       | Department name              |
| `location`    | string | No       | Job location                 |

### Response

#### 202 Accepted

Job created and queued for processing.

```json
{
  "id": "job_abc123",
  "status": "pending",
  "title": "Senior Software Engineer",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

#### 400 Bad Request

```json
{
  "error": "Validation failed",
  "details": {
    "title": ["Required"]
  }
}
```

#### 401 Unauthorized

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid Authorization header. Expected: Bearer <jwt>"
  }
}
```

### Example

```bash
curl -X POST https://api.zehire.com/v1/jobs \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Frontend Engineer",
    "description": "Build amazing user experiences",
    "companyName": "Acme Corp",
    "location": "Remote"
  }'
```

---

## GET /v1/jobs

List jobs for the authenticated organization with cursor-based pagination.

Job list results are cached and refreshed automatically when jobs are created.

### Authentication

**Required**: JWT via `Authorization: Bearer <jwt>`

### Request

```
GET /v1/jobs
Authorization: Bearer <jwt>
```

### Query Parameters

| Parameter | Type   | Required | Default | Description                        |
| --------- | ------ | -------- | ------- | ---------------------------------- |
| `limit`   | number | No       | 20      | Number of items per page (max: 50) |
| `cursor`  | string | No       | -       | Opaque cursor for next page        |

### Response

#### 200 OK

```json
{
  "data": [
    {
      "id": "job_abc123",
      "title": "Senior Backend Engineer",
      "status": "completed",
      "createdAt": "2026-01-01T10:00:00Z"
    },
    {
      "id": "job_def456",
      "title": "Frontend Engineer",
      "status": "pending",
      "createdAt": "2026-01-01T09:30:00Z"
    }
  ],
  "page": {
    "nextCursor": "eyJjIjoiMjAyNi0wMS0wMVQwOTozMDowMFoiLCJpIjoiam9iX2RlZjQ1NiJ9"
  }
}
```

| Field             | Type        | Description                              |
| ----------------- | ----------- | ---------------------------------------- |
| `data`            | array       | List of job items                        |
| `data[].id`       | string      | Job ID                                   |
| `data[].title`    | string      | Job title                                |
| `data[].status`   | string      | Job status (pending/processing/completed/failed) |
| `data[].createdAt`| string      | ISO 8601 timestamp                       |
| `page.nextCursor` | string/null | Cursor for next page, null if no more    |

#### 401 Unauthorized

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid Authorization header. Expected: Bearer <jwt>"
  }
}
```

### Pagination

To fetch all jobs, iterate until `nextCursor` is `null`:

```javascript
async function fetchAllJobs(jwt) {
  const jobs = [];
  let cursor = null;

  do {
    const url = cursor ? `/v1/jobs?cursor=${cursor}` : '/v1/jobs';
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    const data = await res.json();

    jobs.push(...data.data);
    cursor = data.page.nextCursor;
  } while (cursor);

  return jobs;
}
```

### Caching

- Job lists are cached at the edge for fast responses
- Cache is automatically invalidated when:
  - A new job is created
  - A job status changes to `completed` or `failed`
- No manual cache management required

### Example

```bash
# First page
curl "https://api.zehire.com/v1/jobs" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# With custom limit
curl "https://api.zehire.com/v1/jobs?limit=10" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Next page with cursor
curl "https://api.zehire.com/v1/jobs?cursor=eyJjIjoiMjAyNi0wMS0wMVQwOTozMDowMFoiLCJpIjoiam9iX2RlZjQ1NiJ9" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## GET /v1/jobs/:id

Get job status and results.

Results for completed and failed jobs are cached at the edge for fast responses.

### Authentication

**Required**: JWT via `Authorization: Bearer <jwt>`

### Request

```
GET /v1/jobs/:id
Authorization: Bearer <jwt>
```

### Response

Response format varies by job status.

#### Pending

```json
{
  "id": "job_abc123",
  "status": "pending",
  "title": "Frontend Engineer",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

#### Processing

```json
{
  "id": "job_abc123",
  "status": "processing",
  "title": "Frontend Engineer",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

#### Completed

```json
{
  "id": "job_abc123",
  "status": "completed",
  "title": "Frontend Engineer",
  "createdAt": "2024-01-15T10:30:00Z",
  "completedAt": "2024-01-15T10:30:05Z",
  "results": {
    "context": { ... },
    "archetypes": [ ... ],
    "questions": [ ... ]
  }
}
```

#### Failed

```json
{
  "id": "job_abc123",
  "status": "failed",
  "title": "Frontend Engineer",
  "createdAt": "2024-01-15T10:30:00Z",
  "error": {
    "code": "INFERENCE_FAILED",
    "message": "LLM inference failed"
  }
}
```

#### 401 Unauthorized

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired JWT"
  }
}
```

#### 404 Not Found

```json
{
  "error": "Job not found"
}
```

### Example

```bash
curl https://api.zehire.com/v1/jobs/job_abc123 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Polling Strategy

Jobs are processed asynchronously. Recommended polling approach:

1. Create job via `POST /v1/jobs`
2. Poll `GET /v1/jobs/:id` every 2-5 seconds
3. Stop polling when status is `completed` or `failed`

```javascript
async function waitForJob(jobId, jwt, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    const job = await res.json();

    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }

    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Job processing timeout');
}
```

### Caching

- Only `completed` and `failed` jobs are cached (terminal states)
- `pending` and `processing` jobs are never cached (status will change)
- No manual cache invalidation needed - terminal states are immutable
