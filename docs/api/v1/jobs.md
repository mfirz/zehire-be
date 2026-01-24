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

### Pipeline Status

Separate from job status, tracks hiring pipeline generation:

- **none**: Pipeline not yet generated
- **pending**: Queued for generation
- **processing**: LLM pipeline running
- **completed**: Pipeline ready
- **failed**: Generation failed

The pipeline recommends assessment types and interview rounds based on job details.

#### Pipeline Staleness

When a job's **title or description** is edited after the pipeline has been generated, the pipeline is marked as "stale" via the `pipelineStaleAt` timestamp. This indicates the pipeline was created from older job content.

**Important**: The pipeline and recruiter customizations are **preserved** (not deleted). Frontend should:
1. Check if `pipelineStaleAt` is set
2. Show a warning: "Pipeline was created before recent job edits"
3. Offer option to regenerate via `POST /v1/jobs/:id/generate-pipeline`

This prevents accidental loss of recruiter's stage customizations when making minor edits to job content.

#### Data Storage

Pipeline data is stored in relational tables for optimal querying:
- **Interview stages**: `interview_stages` table (name, focus, duration, mode)
- **Interviewer assignments**: `interview_stage_interviewers` table
- **Assessment config**: `jobs.assessment_config` column (JSON)
- **LLM recommendation**: `jobs.pipeline_recommendation` column (JSON, read-only)

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
  "description": {
    "type": "doc",
    "content": [
      {
        "type": "paragraph",
        "content": [
          { "type": "text", "text": "We are looking for a " },
          { "type": "text", "marks": [{"type": "bold"}], "text": "senior engineer" },
          { "type": "text", "text": " to lead our backend team." }
        ]
      },
      {
        "type": "bulletList",
        "content": [
          {
            "type": "listItem",
            "content": [
              { "type": "paragraph", "content": [{ "type": "text", "text": "Design scalable systems" }] }
            ]
          },
          {
            "type": "listItem",
            "content": [
              { "type": "paragraph", "content": [{ "type": "text", "text": "Mentor junior developers" }] }
            ]
          }
        ]
      }
    ]
  },
  "companyName": "Acme Corp",
  "department": "Engineering",
  "location": "Remote",
  "workType": "remote",
  "employmentType": "fulltime",
  "salaryMin": 120000,
  "salaryMax": 180000,
  "salaryCurrency": "USD"
}
```

| Field            | Type       | Required | Description                          |
| ---------------- | ---------- | -------- | ------------------------------------ |
| `title`          | string     | Yes      | Job title (3-200 characters)         |
| `description`    | TiptapDoc  | Yes      | Tiptap JSON document (50-30000 chars extracted text) |
| `companyName`    | string     | No       | Company name (max 200 characters)    |
| `department`     | string     | No       | Department name (max 100 characters) |
| `location`       | string     | No       | Job location (max 200 characters)    |
| `workType`       | enum       | Yes      | `remote`, `hybrid`, or `onsite`      |
| `employmentType` | enum       | Yes      | `fulltime`, `parttime`, `contract`, or `internship` |
| `salaryMin`      | number     | No       | Minimum salary (non-negative)        |
| `salaryMax`      | number     | No       | Maximum salary (>= salaryMin)        |
| `salaryCurrency` | enum       | No       | `USD`, `EUR`, `GBP`, `SGD`, or `IDR` |

**Tiptap Description Format:**

The `description` field accepts a Tiptap JSON document. Allowed node types:
- `doc`, `paragraph`, `text`, `heading`, `bulletList`, `orderedList`, `listItem`
- `blockquote`, `codeBlock`, `hardBreak`, `horizontalRule`

Allowed marks: `bold`, `italic`, `underline`, `strike`, `code`, `link`

Links must use `http://` or `https://` protocols.

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

**Note:** `pipelineStatus` is not returned in the create response. Use `GET /v1/jobs/:id` to check both `questionsStatus` and `pipelineStatus`.

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
      "pipelineStatus": "completed",
      "companyName": "Acme Corp",
      "workType": "remote",
      "employmentType": "fulltime",
      "department": "Engineering",
      "location": "Remote",
      "salaryMin": 120000,
      "salaryMax": 180000,
      "salaryCurrency": "USD",
      "descriptionPreview": "We're looking for a senior backend engineer to join our team and help build scalable APIs...",
      "publicSlug": "acme-corp-senior-backend-engineer-x7k3m",
      "createdAt": "2026-01-01T10:00:00Z",
      "publishedAt": "2026-01-01T12:00:00Z"
    },
    {
      "id": "xyz789abc012def34",
      "title": "Frontend Engineer",
      "status": "draft",
      "questionsStatus": "none",
      "pipelineStatus": "none",
      "companyName": null,
      "workType": "hybrid",
      "employmentType": "contract",
      "department": null,
      "location": "San Francisco, CA",
      "salaryMin": null,
      "salaryMax": null,
      "salaryCurrency": null,
      "descriptionPreview": "Join our frontend team to build beautiful, responsive user interfaces using React and...",
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

**Job List Item Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique job identifier |
| `title` | string | Job title |
| `status` | enum | `draft`, `published`, `paused`, or `closed` |
| `questionsStatus` | enum | Question generation status |
| `pipelineStatus` | enum | Pipeline generation status |
| `companyName` | string | Company name (may be null) |
| `workType` | enum | `remote`, `hybrid`, or `onsite` |
| `employmentType` | enum | `fulltime`, `parttime`, `contract`, or `internship` |
| `department` | string | Department name (may be null) |
| `location` | string | Job location (may be null) |
| `salaryMin` | number | Minimum salary (may be null) |
| `salaryMax` | number | Maximum salary (may be null) |
| `salaryCurrency` | enum | `USD`, `EUR`, `GBP`, `SGD`, or `IDR` (may be null) |
| `descriptionPreview` | string | Plain text preview of description, truncated to 150 chars at word boundary (may be null) |
| `publicSlug` | string | URL slug for public job page (null if not published) |
| `createdAt` | string | ISO 8601 creation timestamp |
| `publishedAt` | string | ISO 8601 publish timestamp (null if not published) |

**Note:** Organization capacity status is available via [GET /v1/capacity](./capacity.md).

---

## GET /v1/jobs/:id

Get job status and details. Response varies by job status.

### Response by Status

#### Draft

Draft jobs return `description` as a Tiptap JSON object for the editor.

```json
{
  "id": "abc123def456ghi78",
  "status": "draft",
  "questionsStatus": "completed",
  "pipelineStatus": "completed",
  "title": "Senior Software Engineer",
  "description": {
    "type": "doc",
    "content": [
      {
        "type": "paragraph",
        "content": [{ "type": "text", "text": "We are looking for..." }]
      }
    ]
  },
  "companyName": "Acme Corp",
  "department": "Engineering",
  "location": "Remote",
  "workType": "remote",
  "employmentType": "fulltime",
  "salaryMin": 120000,
  "salaryMax": 180000,
  "salaryCurrency": "USD",
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
  "pipelineRecommendation": {
    "assessment": {
      "recommended": true,
      "reason": "Technical role requires validated coding skills",
      "suggestedType": "coding_challenge",
      "suggestedProviders": ["hackerrank", "codility"],
      "whatToTest": ["system_design", "algorithms", "code_quality"]
    },
    "interviewPanel": {
      "rounds": [
        {
          "name": "Technical Deep Dive",
          "duration": 60,
          "interviewerProfile": "Senior Engineer",
          "focus": "System design and architecture"
        },
        {
          "name": "Team Fit",
          "duration": 45,
          "interviewerProfile": "Engineering Manager",
          "focus": "Leadership and collaboration"
        }
      ],
      "totalTime": "105 minutes"
    },
    "evaluationCriteria": {
      "mustHave": ["system_design_experience", "team_leadership"],
      "niceToHave": ["open_source_contributions", "conference_talks"],
      "redFlags": ["difficulty_collaborating", "no_growth_mindset"]
    }
  },
  "pipeline": {
    "assessment": {
      "enabled": true,
      "providerId": "hackerrank",
      "config": null
    },
    "interviewRounds": [
      {
        "id": "abc123xyz",
        "name": "Technical Deep Dive",
        "duration": 60,
        "interviewerIds": [],
        "focus": "System design and architecture",
        "mode": "any_one"
      },
      {
        "id": "def456uvw",
        "name": "Team Fit",
        "duration": 45,
        "interviewerIds": [],
        "focus": "Leadership and collaboration",
        "mode": "any_one"
      }
    ],
    "totalDurationMinutes": 105
  },
  "errorMessage": null,
  "errorCode": null,
  "pipelineError": null,
  "pipelineErrorCode": null,
  "regenerationCount": 1,
  "lastRegenerationAt": "2026-01-07T10:35:00Z",
  "pipelineRegenerationCount": 1,
  "pipelineLastRegenerationAt": "2026-01-07T10:36:00Z",
  "createdAt": "2026-01-07T10:30:00Z",
  "updatedAt": "2026-01-07T10:35:00Z",
  "processingStartedAt": "2026-01-07T10:31:00Z",
  "completedAt": "2026-01-07T10:32:00Z",
  "pipelineGeneratedAt": "2026-01-07T10:36:00Z",
  "pipelineStaleAt": null
}
```

**Note**: `pipelineStaleAt` is set when title/description is edited after pipeline generation. If not null, the pipeline may be outdated and should be regenerated.

#### Published

Published, paused, and closed jobs return `descriptionHtml` as pre-rendered HTML (read-only).

```json
{
  "id": "abc123def456ghi78",
  "status": "published",
  "questionsStatus": "completed",
  "pipelineStatus": "completed",
  "title": "Senior Software Engineer",
  "descriptionHtml": "<p>We are looking for a <strong>senior engineer</strong> to lead our backend team.</p><ul><li><p>Design scalable systems</p></li></ul>",
  "companyName": "Acme Corp",
  "department": "Engineering",
  "location": "Remote",
  "workType": "remote",
  "employmentType": "fulltime",
  "salaryMin": 120000,
  "salaryMax": 180000,
  "salaryCurrency": "USD",
  "publicSlug": "acme-corp-senior-software-engineer-x7k3m",
  "jobContext": { ... },
  "archetypes": [ ... ],
  "questions": [ ... ],
  "pipelineRecommendation": { ... },
  "pipeline": { ... },
  "processingDurationMs": 3500,
  "createdAt": "2026-01-07T10:30:00Z",
  "updatedAt": "2026-01-07T12:00:00Z",
  "publishedAt": "2026-01-07T12:00:00Z",
  "completedAt": "2026-01-07T10:32:00Z",
  "pipelineGeneratedAt": "2026-01-07T10:36:00Z"
}
```

#### Paused / Closed

Same as published, with `descriptionHtml` instead of `description`. Closed jobs also include `closedAt`.

---

## PATCH /v1/jobs/:id

Update a draft job's content.

**Content Change Behavior** (when `title` or `description` changes):
- **Questions**: Reset to `none` and must be regenerated (questions depend on job content)
- **Pipeline**: Marked as stale (`pipelineStaleAt` set) but **preserved** (recruiter customizations kept)

This allows recruiters to make minor edits without losing their pipeline customizations. Frontend should check `pipelineStaleAt` and prompt to regenerate if needed.

### Request

```json
{
  "title": "Updated Job Title",
  "description": {
    "type": "doc",
    "content": [
      {
        "type": "paragraph",
        "content": [{ "type": "text", "text": "Updated description content..." }]
      }
    ]
  },
  "companyName": "New Company Name",
  "department": "New Department",
  "location": "New Location",
  "workType": "hybrid",
  "employmentType": "fulltime",
  "salaryMin": 150000,
  "salaryMax": 200000,
  "salaryCurrency": "USD"
}
```

All fields are optional. Only provided fields are updated.

| Field            | Type       | Description                          |
| ---------------- | ---------- | ------------------------------------ |
| `title`          | string     | Job title (3-200 characters)         |
| `description`    | TiptapDoc  | Tiptap JSON document (50-30000 chars extracted text) |
| `companyName`    | string     | Company name (max 200 characters)    |
| `department`     | string     | Department name (max 100 characters) |
| `location`       | string     | Job location (max 200 characters)    |
| `workType`       | enum       | `remote`, `hybrid`, or `onsite`      |
| `employmentType` | enum       | `fulltime`, `parttime`, `contract`, or `internship` |
| `salaryMin`      | number     | Minimum salary (non-negative)        |
| `salaryMax`      | number     | Maximum salary (>= salaryMin)        |
| `salaryCurrency` | enum       | `USD`, `EUR`, `GBP`, `SGD`, or `IDR` |

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

**Note:** Questions can only be generated once per job. To generate new questions, edit the job title or description (which resets `questionsStatus` to `none`).

### Response

#### 202 Accepted

```json
{
  "queued": true
}
```

#### 400 Bad Request

```json
{
  "error": {
    "code": "ALREADY_GENERATED",
    "message": "Questions already generated. Edit the job title or description to generate new questions."
  }
}
```

Or if already in progress:

```json
{
  "error": {
    "code": "ALREADY_PROCESSING",
    "message": "Question generation is already in progress"
  }
}
```

Or if not a draft:

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Only draft jobs can generate questions"
  }
}
```

---

## POST /v1/jobs/:id/generate-pipeline

Queue a job for pipeline generation. The pipeline recommends assessment types and interview rounds based on job details.

**Regeneration Rules:**
- First generation: Always allowed
- After completion: Blocked (returns `ALREADY_GENERATED`)
- After title/description edit: Allowed (pipeline is stale, `pipelineStaleAt` is set)

When regenerating a stale pipeline, the new pipeline will replace existing stages and clear `pipelineStaleAt`.

### Response

#### 202 Accepted

```json
{
  "queued": true
}
```

#### 400 Bad Request

```json
{
  "error": {
    "code": "ALREADY_GENERATED",
    "message": "Pipeline already generated. Edit the job title or description to generate a new pipeline."
  }
}
```

Or if already in progress:

```json
{
  "error": {
    "code": "ALREADY_PROCESSING",
    "message": "Pipeline generation is already in progress"
  }
}
```

Or if not a draft:

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Only draft jobs can generate pipeline"
  }
}
```

---

## GET /v1/jobs/:id/pipeline

Get the pipeline recommendation and configuration for a job.

### Response

Response varies by `pipelineStatus`:

#### 200 OK - Pipeline Not Started

When `pipelineStatus` is `none` or `pending`:

```json
{
  "pipelineStatus": "none",
  "recommendation": null,
  "config": null
}
```

#### 200 OK - Pipeline Processing

When `pipelineStatus` is `processing`:

```json
{
  "pipelineStatus": "processing",
  "recommendation": null,
  "config": null
}
```

#### 200 OK - Pipeline Failed

When `pipelineStatus` is `failed`:

```json
{
  "pipelineStatus": "failed",
  "recommendation": null,
  "config": null,
  "error": "Pipeline generation failed due to...",
  "errorCode": "PIPELINE_GENERATION_FAILED"
}
```

#### 200 OK - Pipeline Completed

When `pipelineStatus` is `completed`:

```json
{
  "pipelineStatus": "completed",
  "recommendation": {
    "assessment": {
      "recommended": true,
      "reason": "Technical role requires validated coding skills",
      "suggestedType": "coding_challenge",
      "suggestedProviders": ["hackerrank", "codility"],
      "whatToTest": ["system_design", "algorithms", "code_quality"]
    },
    "interviewPanel": {
      "rounds": [
        {
          "name": "Technical Deep Dive",
          "duration": 60,
          "interviewerProfile": "Senior Engineer",
          "focus": "System design and architecture"
        },
        {
          "name": "Team Fit",
          "duration": 45,
          "interviewerProfile": "Engineering Manager",
          "focus": "Leadership and collaboration"
        }
      ],
      "totalTime": "105 minutes"
    },
    "evaluationCriteria": {
      "mustHave": ["system_design_experience", "team_leadership"],
      "niceToHave": ["open_source_contributions"],
      "redFlags": ["difficulty_collaborating"]
    }
  },
  "config": {
    "assessment": {
      "enabled": true,
      "providerId": "hackerrank",
      "config": null
    },
    "interviewRounds": [
      {
        "id": "abc123xyz",
        "name": "Technical Deep Dive",
        "duration": 60,
        "interviewerIds": [],
        "focus": "System design and architecture",
        "mode": "any_one"
      },
      {
        "id": "def456uvw",
        "name": "Team Fit",
        "duration": 45,
        "interviewerIds": [],
        "focus": "Leadership and collaboration",
        "mode": "any_one"
      }
    ],
    "totalDurationMinutes": 105
  },
  "generatedAt": "2026-01-07T10:35:00Z"
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `pipelineStatus` | enum | `none`, `pending`, `processing`, `completed`, or `failed` |
| `recommendation` | object/null | AI-generated pipeline recommendation (null if not completed) |
| `config` | object/null | Editable pipeline configuration (null if not completed) |
| `config.totalDurationMinutes` | number | Total interview duration (calculated from rounds) |
| `generatedAt` | string/null | ISO 8601 timestamp when pipeline was generated |
| `error` | string | Error message (only present when failed) |
| `errorCode` | string | Error code (only present when failed) |

**Note:** `config.totalDurationMinutes` is automatically calculated by the backend whenever interview rounds are updated. Frontend does not need to calculate this.

#### 404 Not Found

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Job not found"
  }
}
```

---

## PATCH /v1/jobs/:id/pipeline

Update the pipeline configuration for a job. This is the **single endpoint** for all pipeline edits.

### Editing by Job Status

The editing model separates **process design** (draft) from **operations** (published):

| Job Status | Allowed Edits | Purpose |
|------------|---------------|---------|
| `draft` | Assessment, stages (name, duration, focus) | Design the interview process |
| `published` | `interviewerIds`, `mode` per stage | Assign people to conduct interviews |
| `paused` | `interviewerIds`, `mode` per stage | Assign people to conduct interviews |
| `closed` | Nothing | Archived |

**Why this separation?**

- **Draft phase**: Focus on designing the *ideal* interview process without worrying about who will conduct it
- **Published phase**: Assign *real people* to stages. Interviewers can change anytime (vacations, turnover, workload balancing)
- Structural changes after publishing would break consistency with existing interviews

### Request

```json
{
  "assessment": {
    "enabled": true,
    "providerId": "codility",
    "config": {
      "testId": "test_123",
      "timeLimit": 90
    }
  },
  "interviewRounds": [
    {
      "id": "abc123xyz",
      "name": "Technical Screen",
      "duration": 45,
      "interviewerIds": ["int_abc123", "int_def456"],
      "focus": "Technical fundamentals",
      "mode": "any_one"
    },
    {
      "id": "def456uvw",
      "name": "Team Fit",
      "duration": 30,
      "interviewerIds": ["int_ghi789"],
      "focus": "Culture and collaboration",
      "mode": "all_required"
    }
  ]
}
```

All fields are optional. Only provided fields are updated.

### Interview Round Fields

| Field            | Type   | Required | Description                                    |
|------------------|--------|----------|------------------------------------------------|
| `id`             | string | No       | Stage ID. See "Stage Operations" below         |
| `name`           | string | Draft    | Round name (e.g., "Technical Screen")          |
| `duration`       | number | Draft    | Interview duration in minutes                  |
| `focus`          | string | Draft    | What this round evaluates                      |
| `interviewerIds` | array  | No       | Array of interviewer IDs to assign             |
| `mode`           | enum   | No       | `any_one` (default) or `all_required`          |

### Stage Operations (Draft Only)

When updating `interviewRounds` on a draft job, the array **replaces** all existing stages:

| `id` Field | Behavior |
|------------|----------|
| **With valid ID** | Update that stage (ID must exist) |
| **Omitted** | Create a new stage |
| **Stage not in request** | Delete that stage (unless it has active interviews) |

For published/paused jobs, only partial updates are allowed:
- All stages must have an `id` (no new stages)
- Only `interviewerIds` and `mode` can be changed
- Omitting a stage doesn't delete it

### Interview Modes

| Mode           | Description                                              |
|----------------|----------------------------------------------------------|
| `any_one`      | Any one assigned interviewer must be available (default) |
| `all_required` | All assigned interviewers must be available              |

### Response

#### 200 OK

Returns the updated job (same format as GET /v1/jobs/:id for draft status).

#### 400 Bad Request

If trying to assign interviewers or set mode on a draft job:

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Cannot assign interviewers in draft state. Publish the job first, then assign interviewers."
  }
}
```

If trying to make structural changes on published/paused jobs:

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Cannot modify stage structure after publishing. Only interviewer assignments and mode can be changed."
  }
}
```

If trying to modify assessment after publishing:

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Cannot modify assessment after publishing. Only interviewer assignments can be changed."
  }
}
```

If trying to edit a closed job:

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Closed jobs cannot be edited"
  }
}
```

If pipeline hasn't been generated yet:

```json
{
  "error": {
    "code": "PIPELINE_NOT_READY",
    "message": "Pipeline must be generated before editing"
  }
}
```

If trying to delete stages with active interviews (draft only):

```json
{
  "error": {
    "code": "ACTIVE_INTERVIEWS_EXIST",
    "message": "Cannot delete stages with scheduled interviews. Please cancel the interviews first: \"Technical Deep Dive\"",
    "stageIds": ["abc123xyz"]
  }
}
```

If stage ID doesn't exist (when `id` is provided, it must be valid):

```json
{
  "error": {
    "code": "STAGE_NOT_FOUND",
    "message": "Stage ID(s) not found: stage_xyz123. Valid IDs: stage_abc, stage_def"
  }
}
```

If missing required fields for draft stage update (name, duration, focus required):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Stage updates require name, duration, and focus. Missing fields for: stage_abc123"
  }
}
```

---

## POST /v1/jobs/:id/pipeline/reset

Reset the pipeline configuration to the original AI recommendation.

This is useful when a recruiter wants to undo their customizations and revert to the initial suggestion. Unlike regenerating the pipeline:

- **No LLM call** - instant response
- **No token cost** - free
- **Doesn't count against regeneration limit**
- **Deterministic** - always produces the same config from the same recommendation

### Response

#### 200 OK

Returns the job with reset pipeline config (same format as GET /v1/jobs/:id).

```json
{
  "id": "abc123def456ghi78",
  "status": "draft",
  "questionsStatus": "completed",
  "pipelineStatus": "completed",
  "pipeline": {
    "assessment": {
      "enabled": true,
      "providerId": "hackerrank",
      "config": null
    },
    "interviewRounds": [
      {
        "id": "abc123xyz",
        "name": "Technical Deep Dive",
        "duration": 60,
        "interviewerIds": [],
        "focus": "System design and architecture",
        "mode": "any_one"
      }
    ]
  },
  ...
}
```

**Note:** Reset clears all interviewer assignments and resets mode to `any_one` for all rounds.

#### 400 Bad Request

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Only draft jobs can reset pipeline"
  }
}
```

Or if pipeline hasn't been generated yet:

```json
{
  "error": {
    "code": "PIPELINE_NOT_READY",
    "message": "Pipeline must be generated before resetting"
  }
}
```

---

## POST /v1/jobs/:id/publish

Publish a draft job.

**Prerequisites**:
- Job must be in `draft` status
- Questions must be `completed` (questionsStatus)
- Pipeline must be `completed` (pipelineStatus)

### Response

#### 200 OK

Returns the published job with `publicSlug`.

```json
{
  "id": "abc123def456ghi78",
  "status": "published",
  "questionsStatus": "completed",
  "pipelineStatus": "completed",
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

Or if pipeline is not ready:

```json
{
  "error": {
    "code": "PIPELINE_NOT_READY",
    "message": "Pipeline must be generated before publishing"
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

## GET /v1/assessment-providers

List available assessment providers for pipeline configuration.

### Authentication

**Required**: JWT via `Authorization: Bearer <jwt>` or session cookie

### Response

#### 200 OK

```json
{
  "providers": [
    {
      "id": "hackerrank",
      "name": "HackerRank",
      "type": "external",
      "description": "Technical assessments for developers with coding challenges and system design problems",
      "bestFor": ["engineering", "data", "devops"]
    },
    {
      "id": "codility",
      "name": "Codility",
      "type": "external",
      "description": "Coding tests and technical interviews with automated evaluation",
      "bestFor": ["engineering", "backend", "frontend"]
    },
    {
      "id": "testgorilla",
      "name": "TestGorilla",
      "type": "external",
      "description": "Pre-employment testing for any role including cognitive and personality assessments",
      "bestFor": ["any", "sales", "marketing", "operations"]
    },
    {
      "id": "takehome",
      "name": "Take-Home Project",
      "type": "internal",
      "description": "Custom take-home assignment relevant to the role",
      "bestFor": ["engineering", "design", "product", "content"]
    },
    {
      "id": "none",
      "name": "No Assessment",
      "type": "internal",
      "description": "Skip technical assessment, proceed directly to interviews",
      "bestFor": ["executive", "entry-level", "leadership"]
    }
  ]
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `id` | string | Unique provider identifier (used in pipeline config) |
| `name` | string | Human-readable provider name |
| `type` | string | `external` (third-party integration) or `internal` (custom) |
| `description` | string | Provider description |
| `bestFor` | array | Role categories this provider is best suited for |

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
  "workType": "remote",
  "employmentType": "fulltime",
  "salaryMin": 120000,
  "salaryMax": 180000,
  "salaryCurrency": "USD",
  "descriptionHtml": "<p>We are looking for a <strong>senior engineer</strong> to lead our backend team.</p><ul><li><p>Design scalable systems</p></li></ul>",
  "questions": [
    {
      "archetypeId": "situational_uncertainty_story",
      "text": "Describe a complex system you designed and the tradeoffs you considered.",
      "minWords": 150
    },
    {
      "archetypeId": "ownership_of_outcome",
      "text": "Tell us about a time you mentored a junior developer.",
      "minWords": 100
    }
  ]
}
```

| Field            | Type   | Description                          |
| ---------------- | ------ | ------------------------------------ |
| `title`          | string | Job title                            |
| `companyName`    | string | Company name (may be null)           |
| `department`     | string | Department name (may be null)        |
| `location`       | string | Job location (may be null)           |
| `workType`       | enum   | `remote`, `hybrid`, or `onsite`      |
| `employmentType` | enum   | `fulltime`, `parttime`, `contract`, or `internship` |
| `salaryMin`      | number | Minimum salary (may be null)         |
| `salaryMax`      | number | Maximum salary (may be null)         |
| `salaryCurrency` | enum   | `USD`, `EUR`, `GBP`, `SGD`, `IDR` (may be null) |
| `descriptionHtml`| string | Pre-rendered HTML job description (safe for SSR) |
| `questions`      | array  | Application questions                |

**Question Object:**

| Field         | Type   | Description                               |
| ------------- | ------ | ----------------------------------------- |
| `archetypeId` | string | Question archetype identifier             |
| `text`        | string | The question text for candidates to answer |
| `minWords`    | number | Optional minimum word count               |

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

### 3. Generate Pipeline

```bash
curl -X POST http://localhost:8787/v1/jobs/{id}/generate-pipeline \
  -H "Authorization: Bearer $JWT"
```

### 4. Poll for Completion

```bash
curl http://localhost:8787/v1/jobs/{id} \
  -H "Authorization: Bearer $JWT"
# Wait for BOTH questionsStatus: "completed" AND pipelineStatus: "completed"
```

### 5. (Optional) Customize Pipeline

```bash
curl -X PATCH http://localhost:8787/v1/jobs/{id}/pipeline \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "assessment": {
      "enabled": true,
      "providerId": "codility"
    }
  }'
```

### 6. Review and Publish

```bash
curl -X POST http://localhost:8787/v1/jobs/{id}/publish \
  -H "Authorization: Bearer $JWT"
```

### 7. Share Public Link

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
| `PIPELINE_NOT_READY` | Pipeline must be completed before publishing |
| `PIPELINE_NOT_GENERATED` | Pipeline must be generated before updating |
| `CAPACITY_EXCEEDED` | Organization has reached active role capacity |
| `ALREADY_GENERATED` | Questions/pipeline already generated (edit job to reset) |
| `ALREADY_PROCESSING` | Generation already in progress |
| `INFERENCE_FAILED` | LLM inference step failed |
| `ARCHETYPE_RESOLUTION_FAILED` | Archetype resolution failed |
| `QUESTION_RENDERING_FAILED` | Question rendering failed |
| `PIPELINE_GENERATION_FAILED` | Pipeline generation failed |
| `LLM_RATE_LIMITED` | LLM API rate limited |
| `LLM_TIMEOUT` | LLM API timed out |
| `VALIDATION_ERROR` | Input or output validation failed |
| `INTERNAL_ERROR` | Unexpected internal error |

### Capacity Exceeded Error

When attempting to publish a job and the organization has reached its active role capacity:

```json
{
  "error": {
    "code": "CAPACITY_EXCEEDED",
    "message": "Your organization has reached its active role capacity (3/3). To publish a new role, close an existing one. Note: Pausing does not free up capacity.",
    "activeRoles": 3,
    "capacity": 3
  }
}
```

Active roles include both `published` and `paused` jobs (Zehire is "on the hook" for evaluative work in both states). To free up capacity:
- Close jobs that are no longer needed
- Note: Pausing does NOT free up capacity (paused jobs are still active)

### Retryable vs Permanent Errors

Some errors are **retryable** (transient infrastructure issues) and the queue will automatically retry:

| Code | Retryable | Description |
|------|-----------|-------------|
| `LLM_RATE_LIMITED` | Yes | Rate limit or capacity exceeded, will retry |
| `LLM_TIMEOUT` | Yes | Timeout or temporary service error, will retry |
| `VALIDATION_ERROR` | No | Invalid input/output, requires user action |
| `INFERENCE_FAILED` | No | LLM inference logic failed |
| `ARCHETYPE_RESOLUTION_FAILED` | No | Archetype resolution logic failed |
| `QUESTION_RENDERING_FAILED` | No | Question rendering logic failed |
| `PIPELINE_GENERATION_FAILED` | No | Pipeline generation logic failed |
| `INTERNAL_ERROR` | No | Unexpected error |

For retryable errors:
- `questionsStatus` / `pipelineStatus` is reset to `pending` for queue retry

For permanent errors:
- `questionsStatus` / `pipelineStatus` is set to `failed`
- User must edit the job title or description (to reset status), then call `/generate` or `/generate-pipeline` again

---

## Caching

### GET /v1/jobs/:id Caching

| Job Status | Cache-Control | Reason |
|------------|---------------|--------|
| draft | `no-store` | Can be edited or regenerated at any time |
| published | `private, max-age=3600` | Immutable after publishing |
| paused | `private, max-age=3600` | Immutable |
| closed | `private, max-age=3600` | Immutable |

Draft jobs are never cached because:
- Content can be updated via `PATCH /v1/jobs/:id`
- Questions can be regenerated via `POST /v1/jobs/:id/generate`
- Status can change (pending → processing → completed/failed)

### GET /public/jobs/:slug Caching

Public job endpoints are cached for 1 hour (`Cache-Control: public, max-age=3600`) because published jobs are immutable. When a job is paused or closed, it returns 404 and the cache will be updated on the next request.

---

## Billing Events

Zehire records immutable billing events for every job state transition. These events are used for:
- Prorated billing calculation (calendar month)
- Audit trail of all job lifecycle changes
- Analytics and reporting

### Event Types

| Event Type | Trigger | Billing Impact |
|------------|---------|----------------|
| `activated` | Job published (draft → published) | Billing starts |
| `paused` | Job paused (published → paused) | No change (still active) |
| `resumed` | Job resumed (paused → published) | No change (still active) |
| `deactivated` | Job closed (any → closed) | Billing ends |

### Active Time Calculation

For billing purposes, "active time" is the duration between `activated` and `deactivated` events:

```
Active Time = deactivated_at - activated_at
```

**Important:** Pause/resume events are recorded for audit purposes but do NOT affect billing. Both `published` and `paused` jobs are considered "active" because Zehire is responsible for evaluating candidates in both states.

### Billing Calculation

Billing is calculated at the end of each calendar month based on active time.

**Formula:**
```
Job Charge = Monthly Rate × (active_ms / period_total_ms)
```

**Edge cases:**
| Scenario | Handling |
|----------|----------|
| Job activated before period start | Use period start as active_from |
| Job still active at period end | Use period end as active_to |
| Job activated and closed within period | Use actual timestamps |
| Job closed before period start | 0 charge |
| Job activated after period end | 0 charge |

### Prorated Billing Example

If a job is:
- Published on January 10
- Closed on January 25

The active time is 15 days. In a 31-day month, the charge would be:
```
$200 × (15 / 31) = $96.77
```

### Billing Waivers (Founding Access)

Founding access users see real billing but pay $0:
- Full invoice is generated showing actual charges
- 100% discount applied with reason "Founding Access"
- Total = $0

This reinforces that the work has real value while rewarding early adopters.

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

