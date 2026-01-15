# Applications Management API

Recruiter-facing endpoints for managing job applications.

**Authentication required** - All endpoints require valid JWT.

**Authorization** - User's organization must own the job the application belongs to.

## Endpoints

| Method | Path                                      | Description                    |
| ------ | ----------------------------------------- | ------------------------------ |
| GET    | `/v1/jobs/:jobId/applications`            | List applications for a job    |
| GET    | `/v1/applications/:applicationId`         | Get full application details   |
| PATCH  | `/v1/applications/:applicationId`         | Update application status      |
| GET    | `/v1/applications/:applicationId/posture` | Get decision posture           |
| GET    | `/v1/applications/:applicationId/cv`      | Download CV file               |

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
      "preferredName": "Jane",
      "phone": "+1-555-123-4567",
      "detectedCountry": "US",
      "status": "pending",
      "signalsStatus": "completed",
      "decisionPosture": "LOW_REGRET_RISK",
      "hasCv": true,
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

| Field             | Type        | Description                           |
| ----------------- | ----------- | ------------------------------------- |
| `id`              | string      | Application ID                        |
| `candidateEmail`  | string      | Candidate's email                     |
| `candidateName`   | string/null | Candidate's full name                 |
| `preferredName`   | string/null | Candidate's preferred name            |
| `phone`           | string/null | Candidate's phone number              |
| `detectedCountry` | string/null | Auto-detected country (via Cloudflare)|
| `status`          | string      | Application status                    |
| `signalsStatus`   | string      | Signal extraction status              |
| `decisionPosture` | string/null | Computed decision posture             |
| `hasCv`           | boolean     | Whether a CV was uploaded             |
| `createdAt`       | string      | Application submission timestamp      |
| `updatedAt`       | string      | Last update timestamp                 |

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
  "preferredName": "Jane",
  "phone": "+1-555-123-4567",
  "detectedCountry": "US",
  "detectedTimezone": "America/New_York",
  "hasCv": true,
  "cvUrl": "/v1/applications/abc123/cv",
  "cvFilename": "resume.pdf",
  "cvUploadedAt": "2024-01-15T10:00:00Z",
  "status": "pending",
  "signalsStatus": "completed",
  "decisionPosture": "LOW_REGRET_RISK",
  "signalEvaluations": {
    "posture": "LOW_REGRET_RISK",
    "primaryReason": "Critical signals are clearly demonstrated",
    "reasons": [
      {
        "code": "SIGNALS_SATISFIED",
        "message": "Critical signals are clearly demonstrated",
        "severity": "info"
      }
    ],
    "signalState": {
      "aggregated": {
        "present": ["decision_under_uncertainty", "accountability"],
        "partial": ["tradeoff_awareness"],
        "missing": [],
        "notAsked": ["technical_depth", "system_thinking"],
        "details": {
          "decision_under_uncertainty": {
            "bestConfidence": "clear",
            "evaluationCount": 1,
            "evidence": ["Candidate describes making decision with incomplete data..."]
          }
        }
      },
      "criticalAnalysis": {
        "criticalSignals": ["technical_depth", "system_thinking"],
        "satisfied": [],
        "gaps": [
          { "signalId": "technical_depth", "status": "unclear", "wasAsked": false }
        ],
        "hasCriticalGap": false
      },
      "conflicts": [],
      "computedAt": "2024-01-15T10:05:00Z"
    },
    "suggestedActions": [],
    "computedAt": "2024-01-15T10:05:00Z"
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
      "extractedSignals": [
        {
          "signalId": "decision_under_uncertainty",
          "confidence": "clear",
          "evidence": "Candidate describes making decision with incomplete data...",
          "reasoning": "The candidate demonstrates clear decision-making under uncertainty..."
        }
      ],
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
| `candidateName`    | string      | Candidate's full name                     |
| `preferredName`    | string/null | Candidate's preferred name (optional)     |
| `phone`            | string/null | Candidate's phone number (optional)       |
| `detectedCountry`  | string/null | Auto-detected country code (via Cloudflare) |
| `detectedTimezone` | string/null | Auto-detected timezone (via Cloudflare)   |
| `hasCv`            | boolean     | Whether a CV has been uploaded            |
| `cvUrl`            | string/null | URL to download CV (if uploaded)          |
| `cvFilename`       | string/null | Original CV filename                      |
| `cvUploadedAt`     | string/null | When the CV was uploaded                  |
| `status`           | string      | Application status                        |
| `signalsStatus`    | string      | Signal extraction status                  |
| `decisionPosture`  | string/null | Computed decision posture                 |
| `signalEvaluations`| object/null | Full signal evaluation (see structure below) |
| `signalsErrorMessage`| string/null | Error message if extraction failed      |
| `signalsErrorCode` | string/null | Error code if extraction failed           |
| `createdAt`        | string      | Application submission timestamp          |
| `updatedAt`        | string      | Last update timestamp                     |
| `signalsComputedAt`| string/null | When signals were computed                |
| `answers`          | array       | Array of answers with signals             |

### Signal Evaluations Structure

The `signalEvaluations` object contains the full posture computation result:

| Field             | Type   | Description                                      |
| ----------------- | ------ | ------------------------------------------------ |
| `posture`         | string | Decision posture: `LOW_REGRET_RISK`, `SOME_UNCERTAINTY`, `HIGH_UNCERTAINTY` |
| `primaryReason`   | string | Human-readable summary of the posture            |
| `reasons`         | array  | Array of reason objects with `code`, `message`, `severity` |
| `signalState`     | object | Aggregated signal analysis (see below)           |
| `suggestedActions`| array  | Recommended follow-up actions for hiring manager |
| `computedAt`      | string | ISO timestamp when posture was computed          |

**Signal State Structure:**

| Field             | Type   | Description                                      |
| ----------------- | ------ | ------------------------------------------------ |
| `aggregated.present` | array | Signal IDs clearly demonstrated                |
| `aggregated.partial` | array | Signal IDs partially demonstrated              |
| `aggregated.missing` | array | Signal IDs not demonstrated                    |
| `aggregated.notAsked`| array | Signal IDs not covered by questions            |
| `aggregated.details` | object | Per-signal details with confidence and evidence |
| `criticalAnalysis.criticalSignals` | array | Critical signals for this role      |
| `criticalAnalysis.gaps` | array | Critical signals with gaps                    |
| `criticalAnalysis.hasCriticalGap` | boolean | Whether there are critical gaps      |
| `conflicts`       | array  | Detected contradictions between signals          |

### Answer Fields

| Field            | Type        | Description                          |
| ---------------- | ----------- | ------------------------------------ |
| `id`             | string      | Answer ID                            |
| `archetypeId`    | string      | Question archetype identifier        |
| `questionText`   | string      | The question that was asked          |
| `answerText`     | string      | Candidate's answer                   |
| `extractedSignals`| array/null | Array of extracted signals           |
| `extractionStatus`| string     | Extraction status for this answer    |
| `answeredAt`     | string      | When answer was submitted            |
| `extractedAt`    | string/null | When signals were extracted          |

### Extracted Signal Fields

| Field        | Type   | Description                                    |
| ------------ | ------ | ---------------------------------------------- |
| `signalId`   | string | Signal identifier (e.g., `decision_under_uncertainty`) |
| `confidence` | string | Confidence level: `clear`, `partial`, `absent`, or `unclear` |
| `evidence`   | string | Quote from answer supporting this signal       |
| `reasoning`  | string | Explanation of why signal was detected         |

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

Returns the updated application (raw database record):

```json
{
  "id": "abc123",
  "jobId": "job456",
  "candidateEmail": "jane@example.com",
  "candidateName": "Jane Doe",
  "preferredName": "Jane",
  "phone": "+1-555-123-4567",
  "detectedCountry": "US",
  "detectedTimezone": "America/New_York",
  "cvPath": "cvs/abc123/resume.pdf",
  "cvFilename": "resume.pdf",
  "cvUploadedAt": "2024-01-15T10:00:00Z",
  "status": "screening",
  "signalsStatus": "completed",
  "signalEvaluations": "{...}",
  "decisionPosture": "LOW_REGRET_RISK",
  "signalsErrorMessage": null,
  "signalsErrorCode": null,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T12:00:00Z",
  "signalsComputedAt": "2024-01-15T10:05:00Z"
}
```

**Note:** Unlike `GET /v1/applications/:applicationId`, this response returns the raw database record. The `signalEvaluations` field is a JSON string (not parsed object) and `cvPath` is included (not transformed to `cvUrl`).

| Field              | Type        | Description                               |
| ------------------ | ----------- | ----------------------------------------- |
| `id`               | string      | Application ID                            |
| `jobId`            | string      | Associated job ID                         |
| `candidateEmail`   | string      | Candidate's email                         |
| `candidateName`    | string      | Candidate's full name                     |
| `preferredName`    | string/null | Candidate's preferred name                |
| `phone`            | string/null | Candidate's phone number                  |
| `detectedCountry`  | string/null | Auto-detected country code                |
| `detectedTimezone` | string/null | Auto-detected timezone                    |
| `cvPath`           | string/null | Internal CV storage path                  |
| `cvFilename`       | string/null | Original CV filename                      |
| `cvUploadedAt`     | string/null | When the CV was uploaded                  |
| `status`           | string      | Application status (updated)              |
| `signalsStatus`    | string      | Signal extraction status                  |
| `signalEvaluations`| string/null | Signal evaluations as JSON string         |
| `decisionPosture`  | string/null | Computed decision posture                 |
| `signalsErrorMessage`| string/null | Error message if extraction failed      |
| `signalsErrorCode` | string/null | Error code if extraction failed           |
| `createdAt`        | string      | Application submission timestamp          |
| `updatedAt`        | string      | Last update timestamp                     |
| `signalsComputedAt`| string/null | When signals were computed                |

### Errors

| Status | Message                |
| ------ | ---------------------- |
| 400    | Invalid status value   |
| 404    | Application not found  |

---

## GET /v1/applications/:applicationId/posture

Get the decision posture for an application, including signal analysis and suggested actions.

### Path Parameters

| Parameter       | Type   | Description        |
| --------------- | ------ | ------------------ |
| `applicationId` | string | The application ID |

### Response (200 OK)

When signals have been computed:

```json
{
  "posture": "SOME_UNCERTAINTY",
  "primaryReason": "Some critical signals are missing or unclear",
  "reasons": [
    {
      "code": "CRITICAL_GAP",
      "message": "Some critical signals are missing or unclear",
      "severity": "warning"
    },
    {
      "code": "CRITICAL_ONLY_PARTIAL",
      "message": "Some critical signals lack depth or specificity",
      "severity": "info"
    }
  ],
  "signals": {
    "present": ["accountability", "learning_from_failure"],
    "partial": ["tradeoff_awareness"],
    "missing": ["communication_clarity"],
    "criticalGaps": ["communication_clarity"]
  },
  "conflicts": [],
  "suggestedActions": [
    "Probe these areas in interview: Communication Clarity",
    "Ask for specific examples about: Tradeoff Awareness"
  ]
}
```

### Response (202 Accepted)

When signals are not yet computed:

```json
{
  "status": "not_started",
  "message": "Signal extraction has not started"
}
```

Or when processing:

```json
{
  "status": "processing",
  "message": "Signal extraction in progress"
}
```

### Response (500 Error)

When signal extraction failed:

```json
{
  "status": "failed",
  "error": "LLM rate limit exceeded",
  "code": "EXTRACTION_FAILED"
}
```

### Response Fields

| Field            | Type   | Description                                      |
| ---------------- | ------ | ------------------------------------------------ |
| `posture`        | string | Decision posture (see values below)              |
| `primaryReason`  | string | Human-readable primary reason for the posture    |
| `reasons`        | array  | All reasons contributing to posture              |
| `signals`        | object | Signal state breakdown                           |
| `signals.present`| array  | Signals clearly demonstrated                     |
| `signals.partial`| array  | Signals partially demonstrated                   |
| `signals.missing`| array  | Signals not demonstrated                         |
| `signals.criticalGaps` | array | Critical signals that are missing/partial   |
| `conflicts`      | array  | Any detected contradictions between signals      |
| `suggestedActions`| array | Recommended next steps for hiring manager       |

### Posture Values

| Posture            | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `LOW_REGRET_RISK`  | Critical signals clearly demonstrated, low risk      |
| `SOME_UNCERTAINTY` | Some gaps or concerns, worth probing in interview    |
| `HIGH_UNCERTAINTY` | Major concerns, significant gaps or contradictions   |

### Valid Signal IDs

| Signal ID                    | Label                      |
| ---------------------------- | -------------------------- |
| `decision_under_uncertainty` | Decision Under Uncertainty |
| `tradeoff_awareness`         | Tradeoff Awareness         |
| `risk_reasoning`             | Risk Reasoning             |
| `ethical_awareness`          | Ethical Awareness          |
| `technical_depth`            | Technical Depth            |
| `system_thinking`            | System Thinking            |
| `communication_clarity`      | Communication Clarity      |
| `stakeholder_management`     | Stakeholder Management     |
| `accountability`             | Accountability             |
| `learning_from_failure`      | Learning From Failure      |

### Reason Severities

| Severity   | Description                          |
| ---------- | ------------------------------------ |
| `info`     | Informational, no action required    |
| `warning`  | Notable concern, probe in interview  |
| `critical` | Serious concern, high risk indicator |

### Errors

| Status | Message               |
| ------ | --------------------- |
| 404    | Application not found |
| 404    | Posture not computed  |

---

## GET /v1/applications/:applicationId/cv

Download the CV file for an application.

### Path Parameters

| Parameter       | Type   | Description        |
| --------------- | ------ | ------------------ |
| `applicationId` | string | The application ID |

### Response (200 OK)

Returns the CV file as a binary stream.

**Headers:**
- `Content-Type`: File MIME type (e.g., `application/pdf`)
- `Content-Disposition`: `attachment; filename="original-filename.pdf"`
- `Content-Length`: File size in bytes

### Errors

| Status | Message                         |
| ------ | ------------------------------- |
| 404    | Application not found           |
| 404    | No CV uploaded for this application |
| 404    | CV file not found               |

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

4. Recruiter reviews candidate posture
   GET /v1/applications/:id/posture
   → View posture, signals, and suggested actions

5. Recruiter reviews full application
   GET /v1/applications/:id
   → View full answers and extracted signals

6. Recruiter moves through pipeline
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

2. **Application Posture View**
   - Uses `GET /v1/applications/:applicationId/posture`
   - Shows decision posture with reasons
   - Displays signal state (present/partial/missing)
   - Shows suggested actions for hiring manager

3. **Application Detail View** (`/applications/:applicationId`)
   - Uses `GET /v1/applications/:applicationId`
   - Shows full answers with extracted signals
   - Displays decision posture breakdown

4. **Status Update Actions**
   - Uses `PATCH /v1/applications/:applicationId`
   - Triggered by recruiter moving candidate through stages
