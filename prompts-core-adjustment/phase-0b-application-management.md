# Phase 0B: Application Management APIs

**Repository:** `zehire-be`

## Context

This phase creates the recruiter-facing APIs for managing job applications. These endpoints are authenticated and allow recruiters to:
1. View all applications for a job
2. Get detailed application information (including signals/posture after Phase 3)
3. Update application status through the hiring pipeline

### Hiring Flow Position

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Candidate submits application (Phase 0A)                                    │
│       │                                                                      │
│       ▼                                                                      │
│  Signal Extraction Pipeline (Phase 1-3)                                      │
│       │                                                                      │
│       ▼                                                                      │
│  [YOU ARE HERE]                                                              │
│                                                                              │
│  Recruiter Dashboard                                                         │
│       │                                                                      │
│       ├── GET /v1/jobs/:jobId/applications     ◄─── List all applications   │
│       │        └── Shows posture summary per candidate                       │
│       │                                                                      │
│       ├── GET /v1/applications/:id             ◄─── View full details       │
│       │        └── Shows answers, signals, posture breakdown                 │
│       │                                                                      │
│       └── PATCH /v1/applications/:id           ◄─── Update status           │
│                └── Move through pipeline stages                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Prerequisites

- Phase 0A completed (applications table, ApplicationRepository exists)
- Authentication middleware working (recruiter must own the job)

---

## Your Task

### 1. Extend Application Schemas

Add to `src/domain/applications/schemas.ts`:

```typescript
import { z } from "zod";

// ... existing schemas ...

/**
 * Schema for updating application status.
 */
export const UpdateApplicationSchema = z.object({
  status: z.enum([
    "pending",
    "screening",
    "assessment",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
  ]),
});

export type UpdateApplicationInput = z.infer<typeof UpdateApplicationSchema>;

/**
 * Application summary for list view.
 * Includes computed posture but not full signal details.
 */
export const ApplicationSummarySchema = z.object({
  id: z.string(),
  candidateEmail: z.string(),
  candidateName: z.string().nullable(),
  status: z.string(),
  signalsStatus: z.string(),
  decisionPosture: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ApplicationSummary = z.infer<typeof ApplicationSummarySchema>;

/**
 * Full application detail including answers and signals.
 */
export const ApplicationDetailSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  candidateEmail: z.string(),
  candidateName: z.string().nullable(),
  status: z.string(),
  signalsStatus: z.string(),
  decisionPosture: z.string().nullable(),
  signalEvaluations: z.any().nullable(), // Parsed JSON
  signalsErrorMessage: z.string().nullable(),
  signalsErrorCode: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  signalsComputedAt: z.string().nullable(),
  answers: z.array(z.object({
    id: z.string(),
    archetypeId: z.string(),
    questionText: z.string(),
    answerText: z.string().nullable(),
    extractedSignals: z.any().nullable(), // Parsed JSON
    extractionStatus: z.string(),
    answeredAt: z.string().nullable(),
    extractedAt: z.string().nullable(),
  })),
});

export type ApplicationDetail = z.infer<typeof ApplicationDetailSchema>;

/**
 * Query parameters for listing applications.
 */
export const ListApplicationsQuerySchema = z.object({
  status: z.enum([
    "pending",
    "screening",
    "assessment",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
  ]).optional(),
  signalsStatus: z.enum(["pending", "processing", "completed", "failed"]).optional(),
  posture: z.enum(["LOW_REGRET_RISK", "SOME_UNCERTAINTY", "HIGH_UNCERTAINTY"]).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sort: z.enum(["createdAt", "updatedAt", "candidateName"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type ListApplicationsQuery = z.infer<typeof ListApplicationsQuerySchema>;
```

---

### 2. Extend Application Repository

Add methods to `src/domain/applications/repository.ts`:

```typescript
import type {
  Application,
  Answer,
  PublicApplyInput,
  ApplicationSummary,
  ApplicationDetail,
  ListApplicationsQuery,
} from "./schemas";

// ... existing code ...

export class ApplicationRepository {
  // ... existing methods ...

  /**
   * List applications for a job with optional filtering.
   */
  async listByJobId(
    jobId: string,
    query: ListApplicationsQuery
  ): Promise<{ applications: ApplicationSummary[]; total: number }> {
    const conditions: string[] = ["job_id = ?"];
    const params: unknown[] = [jobId];

    if (query.status) {
      conditions.push("status = ?");
      params.push(query.status);
    }

    if (query.signalsStatus) {
      conditions.push("signals_status = ?");
      params.push(query.signalsStatus);
    }

    if (query.posture) {
      conditions.push("decision_posture = ?");
      params.push(query.posture);
    }

    const whereClause = conditions.join(" AND ");

    // Get total count
    const countResult = await this.db
      .prepare(`SELECT COUNT(*) as count FROM applications WHERE ${whereClause}`)
      .bind(...params)
      .first<{ count: number }>();

    const total = countResult?.count ?? 0;

    // Get paginated results
    const sortColumn = {
      createdAt: "created_at",
      updatedAt: "updated_at",
      candidateName: "candidate_name",
    }[query.sort];

    const results = await this.db
      .prepare(`
        SELECT
          id, candidate_email, candidate_name, status,
          signals_status, decision_posture, created_at, updated_at
        FROM applications
        WHERE ${whereClause}
        ORDER BY ${sortColumn} ${query.order.toUpperCase()}
        LIMIT ? OFFSET ?
      `)
      .bind(...params, query.limit, query.offset)
      .all();

    const applications: ApplicationSummary[] = results.results.map((row) => ({
      id: row.id as string,
      candidateEmail: row.candidate_email as string,
      candidateName: row.candidate_name as string | null,
      status: row.status as string,
      signalsStatus: row.signals_status as string,
      decisionPosture: row.decision_posture as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));

    return { applications, total };
  }

  /**
   * Get full application details including answers.
   */
  async getDetailById(id: string): Promise<ApplicationDetail | null> {
    const application = await this.getById(id);
    if (!application) return null;

    const answers = await this.getAnswers(id);

    return {
      ...application,
      signalEvaluations: application.signalEvaluations
        ? JSON.parse(application.signalEvaluations)
        : null,
      answers: answers.map((a) => ({
        id: a.id,
        archetypeId: a.archetypeId,
        questionText: a.questionText,
        answerText: a.answerText,
        extractedSignals: a.extractedSignals
          ? JSON.parse(a.extractedSignals)
          : null,
        extractionStatus: a.extractionStatus,
        answeredAt: a.answeredAt,
        extractedAt: a.extractedAt,
      })),
    };
  }

  /**
   * Update application status.
   */
  async updateStatus(id: string, status: string): Promise<Application | null> {
    const now = new Date().toISOString();

    await this.db
      .prepare(`
        UPDATE applications
        SET status = ?, updated_at = ?
        WHERE id = ?
      `)
      .bind(status, now, id)
      .run();

    return this.getById(id);
  }

  /**
   * Get the job_id for an application.
   * Used for authorization checks.
   */
  async getJobId(applicationId: string): Promise<string | null> {
    const result = await this.db
      .prepare(`SELECT job_id FROM applications WHERE id = ?`)
      .bind(applicationId)
      .first<{ job_id: string }>();

    return result?.job_id ?? null;
  }
}
```

---

### 3. Create Application Routes

Create `src/routes/v1/applications/index.ts`:

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ApplicationRepository } from "../../../domain/applications/repository";
import { JobsRepository } from "../../../domain/jobs/repository";
import {
  UpdateApplicationSchema,
  ListApplicationsQuerySchema,
} from "../../../domain/applications/schemas";
import type { Env } from "../../../types/bindings";
import type { AuthVariables } from "../../../middleware/auth";

const applicationsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

/**
 * GET /v1/applications/:applicationId
 *
 * Get full application details including answers and signals.
 * Recruiter must own the job this application belongs to.
 */
applicationsRoute.get("/:applicationId", async (c) => {
  const { applicationId } = c.req.param();
  const userId = c.get("userId");

  const applicationRepository = new ApplicationRepository(c.env.DB);
  const jobsRepository = new JobsRepository(c.env.DB);

  // Get application
  const application = await applicationRepository.getDetailById(applicationId);

  if (!application) {
    return c.json({ error: "Application not found" }, 404);
  }

  // Verify recruiter owns the job
  const job = await jobsRepository.getById(application.jobId);

  if (!job || job.recruiterId !== userId) {
    return c.json({ error: "Application not found" }, 404);
  }

  return c.json(application);
});

/**
 * PATCH /v1/applications/:applicationId
 *
 * Update application status.
 * Recruiter must own the job this application belongs to.
 */
applicationsRoute.patch(
  "/:applicationId",
  zValidator("json", UpdateApplicationSchema),
  async (c) => {
    const { applicationId } = c.req.param();
    const userId = c.get("userId");
    const input = c.req.valid("json");

    const applicationRepository = new ApplicationRepository(c.env.DB);
    const jobsRepository = new JobsRepository(c.env.DB);

    // Get application's job_id
    const jobId = await applicationRepository.getJobId(applicationId);

    if (!jobId) {
      return c.json({ error: "Application not found" }, 404);
    }

    // Verify recruiter owns the job
    const job = await jobsRepository.getById(jobId);

    if (!job || job.recruiterId !== userId) {
      return c.json({ error: "Application not found" }, 404);
    }

    // Update status
    const updated = await applicationRepository.updateStatus(
      applicationId,
      input.status
    );

    if (!updated) {
      return c.json({ error: "Failed to update application" }, 500);
    }

    return c.json(updated);
  }
);

export default applicationsRoute;
```

---

### 4. Create Job Applications Route

Create `src/routes/v1/jobs/applications.ts`:

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ApplicationRepository } from "../../../domain/applications/repository";
import { JobsRepository } from "../../../domain/jobs/repository";
import { ListApplicationsQuerySchema } from "../../../domain/applications/schemas";
import type { Env } from "../../../types/bindings";
import type { AuthVariables } from "../../../middleware/auth";

const jobApplicationsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

/**
 * GET /v1/jobs/:jobId/applications
 *
 * List all applications for a job.
 * Supports filtering by status, signalsStatus, and posture.
 * Recruiter must own the job.
 */
jobApplicationsRoute.get(
  "/:jobId/applications",
  zValidator("query", ListApplicationsQuerySchema),
  async (c) => {
    const { jobId } = c.req.param();
    const userId = c.get("userId");
    const query = c.req.valid("query");

    const jobsRepository = new JobsRepository(c.env.DB);
    const applicationRepository = new ApplicationRepository(c.env.DB);

    // Verify job exists and recruiter owns it
    const job = await jobsRepository.getById(jobId);

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    if (job.recruiterId !== userId) {
      return c.json({ error: "Job not found" }, 404);
    }

    // Get applications
    const { applications, total } = await applicationRepository.listByJobId(
      jobId,
      query
    );

    return c.json({
      applications,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + applications.length < total,
      },
    });
  }
);

export default jobApplicationsRoute;
```

---

### 5. Register Routes

Update `src/routes/v1/index.ts`:

```typescript
import { Hono } from "hono";
import jobsRoute from "./jobs";
import jobApplicationsRoute from "./jobs/applications";  // Add this
import applicationsRoute from "./applications";  // Add this
import type { Env } from "../../types/bindings";
import type { AuthVariables } from "../../middleware/auth";

const v1Route = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

// Existing routes
v1Route.route("/jobs", jobsRoute);

// New routes
v1Route.route("/jobs", jobApplicationsRoute);  // Add this (for /jobs/:jobId/applications)
v1Route.route("/applications", applicationsRoute);  // Add this

export default v1Route;
```

---

### 6. Update Index Export

Update `src/domain/applications/index.ts`:

```typescript
// Schemas
export {
  APPLICATION_STATUSES,
  PublicApplySchema,
  PublicApplyResponseSchema,
  AnswerInputSchema,
  UpdateApplicationSchema,
  ApplicationSummarySchema,
  ApplicationDetailSchema,
  ListApplicationsQuerySchema,
} from "./schemas";

export type {
  ApplicationStatus,
  PublicApplyInput,
  PublicApplyResponse,
  Application,
  Answer,
  UpdateApplicationInput,
  ApplicationSummary,
  ApplicationDetail,
  ListApplicationsQuery,
} from "./schemas";

// Repository
export { ApplicationRepository } from "./repository";
```

---

## API Specification

### `GET /v1/jobs/:jobId/applications`

**Description:** List all applications for a job with optional filtering.

**Authentication:** Required (Bearer token)

**Authorization:** Recruiter must own the job

**Path Parameters:**
- `jobId` (string): The job's ID

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| status | string | - | Filter by application status |
| signalsStatus | string | - | Filter by signals processing status |
| posture | string | - | Filter by decision posture |
| limit | number | 50 | Max results (1-100) |
| offset | number | 0 | Pagination offset |
| sort | string | createdAt | Sort field |
| order | string | desc | Sort order (asc/desc) |

**Success Response (200):**
```json
{
  "applications": [
    {
      "id": "abc123",
      "candidateEmail": "jane@example.com",
      "candidateName": "Jane Doe",
      "status": "pending",
      "signalsStatus": "completed",
      "decisionPosture": "LOW_REGRET_RISK",
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:05:00Z"
    }
  ],
  "pagination": {
    "total": 42,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

---

### `GET /v1/applications/:applicationId`

**Description:** Get full application details including answers and signals.

**Authentication:** Required (Bearer token)

**Authorization:** Recruiter must own the job this application belongs to

**Path Parameters:**
- `applicationId` (string): The application's ID

**Success Response (200):**
```json
{
  "id": "abc123",
  "jobId": "job456",
  "candidateEmail": "jane@example.com",
  "candidateName": "Jane Doe",
  "status": "pending",
  "signalsStatus": "completed",
  "decisionPosture": "LOW_REGRET_RISK",
  "signalEvaluations": {
    "posture": "LOW_REGRET_RISK",
    "criticalSignals": [...],
    "positiveSignals": [...],
    "concernSignals": [...],
    "conflicts": []
  },
  "signalsErrorMessage": null,
  "signalsErrorCode": null,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:05:00Z",
  "signalsComputedAt": "2024-01-15T10:05:00Z",
  "answers": [
    {
      "id": "ans789",
      "archetypeId": "situational_uncertainty_story",
      "questionText": "Tell us about a time when you had to make a decision with incomplete information...",
      "answerText": "When I was working at Company X...",
      "extractedSignals": {
        "signals": [
          {
            "id": "TAKES_OWNERSHIP",
            "confidence": 0.85,
            "evidence": "Candidate explicitly states they took responsibility..."
          }
        ]
      },
      "extractionStatus": "completed",
      "answeredAt": "2024-01-15T10:00:00Z",
      "extractedAt": "2024-01-15T10:05:00Z"
    }
  ]
}
```

**Error Responses:**

| Status | Message |
|--------|---------|
| 404 | Application not found |

---

### `PATCH /v1/applications/:applicationId`

**Description:** Update application status.

**Authentication:** Required (Bearer token)

**Authorization:** Recruiter must own the job this application belongs to

**Path Parameters:**
- `applicationId` (string): The application's ID

**Request Body:**
```json
{
  "status": "screening"
}
```

**Valid status values:**
- `pending` - Just submitted
- `screening` - Under initial review
- `assessment` - In assessment phase
- `interview` - Interview scheduled/in progress
- `offer` - Offer extended
- `rejected` - Rejected by recruiter
- `withdrawn` - Withdrawn by candidate

**Success Response (200):**
```json
{
  "id": "abc123",
  "jobId": "job456",
  "candidateEmail": "jane@example.com",
  "candidateName": "Jane Doe",
  "status": "screening",
  "signalsStatus": "completed",
  "signalEvaluations": "...",
  "decisionPosture": "LOW_REGRET_RISK",
  "signalsErrorMessage": null,
  "signalsErrorCode": null,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T12:00:00Z",
  "signalsComputedAt": "2024-01-15T10:05:00Z"
}
```

**Error Responses:**

| Status | Message |
|--------|---------|
| 400 | Invalid status value |
| 404 | Application not found |

---

## File Structure

```
src/domain/applications/
├── index.ts           # Exports (updated)
├── schemas.ts         # Zod schemas and types (extended)
└── repository.ts      # Database operations (extended)

src/routes/v1/
├── index.ts           # Route registration (updated)
├── jobs/
│   ├── index.ts       # Existing job routes
│   └── applications.ts # NEW: GET /jobs/:jobId/applications
└── applications/
    └── index.ts       # NEW: GET/PATCH /applications/:id
```

---

## Testing Checklist

### List Applications

1. **Happy path:** List all applications for a job
2. **Filtering:** Filter by status, signalsStatus, posture
3. **Pagination:** Verify limit, offset, hasMore work correctly
4. **Sorting:** Verify sort and order work correctly
5. **Authorization:** Return 404 for jobs not owned by recruiter

### Get Application Detail

1. **Happy path:** Get full application with answers and signals
2. **Signals pending:** Return application with null signalEvaluations
3. **Signals completed:** Return application with parsed signalEvaluations
4. **Authorization:** Return 404 for applications in jobs not owned by recruiter

### Update Application Status

1. **Happy path:** Update status from pending to screening
2. **All statuses:** Test all valid status transitions
3. **Invalid status:** Return 400 for invalid status value
4. **Authorization:** Return 404 for applications in jobs not owned by recruiter

---

## Frontend Integration Points

These APIs are consumed by the recruiter dashboard:

1. **Applications List View** (`/jobs/:jobId/applications`)
   - Uses `GET /v1/jobs/:jobId/applications`
   - Shows candidate list with posture badges
   - Supports filtering by posture (LOW_REGRET_RISK, SOME_UNCERTAINTY, HIGH_UNCERTAINTY)

2. **Application Detail View** (`/applications/:applicationId`)
   - Uses `GET /v1/applications/:applicationId`
   - Shows full answers with extracted signals
   - Displays decision posture breakdown (Phase 5 components)

3. **Status Update Actions**
   - Uses `PATCH /v1/applications/:applicationId`
   - Triggered by recruiter moving candidate through pipeline stages
