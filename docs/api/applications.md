# Applications Management API

Recruiter-facing endpoints for managing job applications.

**Authentication required** - All endpoints require valid JWT.

**Authorization** - User's organization must own the job the application belongs to.

## Endpoints

| Method | Path                              | Description                    |
| ------ | --------------------------------- | ------------------------------ |
| GET    | `/v1/jobs/:jobId/applications`    | List applications for a job    |
| GET    | `/v1/applications/:applicationId` | Get full application details   |
| PATCH  | `/v1/applications/:applicationId` | Update application status      |

---

## GET /v1/jobs/:jobId/applications

List all applications for a job with optional filtering.

### Path Parameters

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `jobId`   | string | The job's ID |

### Query Parameters

| Parameter      | Type   | Default   | Description                               |
| -------------- | ------ | --------- | ----------------------------------------- |
| `status`       | string | -         | Filter by application status              |
| `signalsStatus`| string | -         | Filter by signals processing status       |
| `posture`      | string | -         | Filter by decision posture                |
| `limit`        | number | 50        | Max results per page (1-100)              |
| `offset`       | number | 0         | Pagination offset                         |
| `sort`         | string | createdAt | Sort field: createdAt, updatedAt, candidateName |
| `order`        | string | desc      | Sort order: asc, desc                     |

### Application Status Values

| Status      | Description                      |
| ----------- | -------------------------------- |
| `pending`   | Just submitted, awaiting review  |
| `screening` | Under initial review             |
| `assessment`| In assessment phase              |
| `interview` | Interview scheduled/in progress  |
| `offer`     | Offer extended                   |
| `rejected`  | Rejected by recruiter            |
| `withdrawn` | Withdrawn by candidate           |

### Signals Status Values

| Status       | Description                |
| ------------ | -------------------------- |
| `pending`    | Not yet processed          |
| `processing` | Signal extraction running  |
| `completed`  | Signals extracted          |
| `failed`     | Extraction failed          |

### Decision Posture Values

| Posture            | Description                           |
| ------------------ | ------------------------------------- |
| `LOW_REGRET_RISK`  | Strong signals, low hiring risk       |
| `SOME_UNCERTAINTY` | Mixed signals, moderate risk          |
| `HIGH_UNCERTAINTY` | Weak/concerning signals, higher risk  |

### Response (200 OK)

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

### Errors

| Status | Message       |
| ------ | ------------- |
| 404    | Job not found |

---

## GET /v1/applications/:applicationId

Get full application details including answers and extracted signals.

### Path Parameters

| Parameter       | Type   | Description        |
| --------------- | ------ | ------------------ |
| `applicationId` | string | The application ID |

### Response (200 OK)

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

### Response Fields

| Field              | Type        | Description                               |
| ------------------ | ----------- | ----------------------------------------- |
| `id`               | string      | Application ID                            |
| `jobId`            | string      | Associated job ID                         |
| `candidateEmail`   | string      | Candidate's email                         |
| `candidateName`    | string      | Candidate's name                          |
| `status`           | string      | Application status                        |
| `signalsStatus`    | string      | Signal extraction status                  |
| `decisionPosture`  | string/null | Computed decision posture                 |
| `signalEvaluations`| object/null | Full signal evaluation (when completed)   |
| `signalsErrorMessage`| string/null | Error message if extraction failed      |
| `signalsErrorCode` | string/null | Error code if extraction failed           |
| `createdAt`        | string      | Application submission timestamp          |
| `updatedAt`        | string      | Last update timestamp                     |
| `signalsComputedAt`| string/null | When signals were computed                |
| `answers`          | array       | Array of answers with signals             |

### Answer Fields

| Field            | Type        | Description                          |
| ---------------- | ----------- | ------------------------------------ |
| `id`             | string      | Answer ID                            |
| `archetypeId`    | string      | Question archetype identifier        |
| `questionText`   | string      | The question that was asked          |
| `answerText`     | string      | Candidate's answer                   |
| `extractedSignals`| object/null| Extracted signals (when completed)   |
| `extractionStatus`| string     | Extraction status for this answer    |
| `answeredAt`     | string      | When answer was submitted            |
| `extractedAt`    | string/null | When signals were extracted          |

### Errors

| Status | Message              |
| ------ | -------------------- |
| 404    | Application not found |

---

## PATCH /v1/applications/:applicationId

Update application status to move candidate through the hiring pipeline.

### Path Parameters

| Parameter       | Type   | Description        |
| --------------- | ------ | ------------------ |
| `applicationId` | string | The application ID |

### Request Body

```json
{
  "status": "screening"
}
```

| Field    | Type   | Required | Description                    |
| -------- | ------ | -------- | ------------------------------ |
| `status` | string | Yes      | New status (see values above)  |

### Response (200 OK)

Returns the updated application:

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

### Errors

| Status | Message                |
| ------ | ---------------------- |
| 400    | Invalid status value   |
| 404    | Application not found  |

---

## Typical Workflow

```
1. Candidate submits application
   POST /public/jobs/:slug/apply
   → Application created with status "pending"
   → Queued for signal extraction

2. Signal extraction runs (async)
   → signalsStatus: pending → processing → completed
   → decisionPosture computed

3. Recruiter views applications
   GET /v1/jobs/:jobId/applications?posture=LOW_REGRET_RISK
   → Filter by posture to prioritize review

4. Recruiter reviews candidate
   GET /v1/applications/:id
   → View full answers and extracted signals

5. Recruiter moves through pipeline
   PATCH /v1/applications/:id { "status": "screening" }
   PATCH /v1/applications/:id { "status": "interview" }
   PATCH /v1/applications/:id { "status": "offer" }
```

---

## Frontend Integration

These APIs power the recruiter dashboard:

1. **Applications List View** (`/jobs/:jobId/applications`)
   - Uses `GET /v1/jobs/:jobId/applications`
   - Shows candidate list with posture badges
   - Supports filtering by posture for prioritization

2. **Application Detail View** (`/applications/:applicationId`)
   - Uses `GET /v1/applications/:applicationId`
   - Shows full answers with extracted signals
   - Displays decision posture breakdown

3. **Status Update Actions**
   - Uses `PATCH /v1/applications/:applicationId`
   - Triggered by recruiter moving candidate through stages
