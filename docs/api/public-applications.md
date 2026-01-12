# Public Applications API

Public endpoints for candidate job applications.

**No authentication required.**

## Design Philosophy

Zehire uses an **"All Required + Smart Design"** approach:

- **3 questions maximum** per job (hard cap)
- **All questions must be answered** for submission
- **Save & Continue** feature allows candidates to save progress
- Drafts expire after **7 days**
- **Duplicate prevention** - one application per email per job

## Endpoints

| Method | Path                                    | Description                    |
| ------ | --------------------------------------- | ------------------------------ |
| POST   | `/public/jobs/:slug/apply`              | Submit complete application    |
| POST   | `/public/jobs/:slug/apply/draft`        | Save progress (Save & Continue)|
| GET    | `/public/jobs/:slug/apply/draft/:id`    | Resume saved progress          |

---

## POST /public/jobs/:slug/apply

Submit a complete job application. All questions must be answered.

### Request

```json
{
  "email": "candidate@example.com",
  "name": "Jane Doe",
  "answers": [
    {
      "archetypeId": "situational_uncertainty_story",
      "answerText": "When I was leading the migration project at my previous company..."
    },
    {
      "archetypeId": "ownership_of_outcome",
      "answerText": "I take full responsibility for the outcomes of my projects..."
    },
    {
      "archetypeId": "failure_and_recovery",
      "answerText": "During the Q3 release, we encountered a critical bug..."
    }
  ],
  "draftId": "abc123xyz"
}
```

| Field      | Type     | Required | Description                                      |
| ---------- | -------- | -------- | ------------------------------------------------ |
| `email`    | string   | Yes      | Valid email address                              |
| `name`     | string   | Yes      | Candidate's full name (1-200 chars)              |
| `answers`  | array    | Yes      | Array of answers to ALL questions                |
| `draftId`  | string   | No       | Draft ID if resuming from saved progress         |

### Answer Object

| Field         | Type   | Required | Description                                |
| ------------- | ------ | -------- | ------------------------------------------ |
| `archetypeId` | string | Yes      | The archetype ID of the question           |
| `answerText`  | string | Yes      | Answer text (minimum 50 characters)        |

### Response

**201 Created**

```json
{
  "success": true,
  "applicationId": "app_xyz789",
  "message": "Your application has been submitted successfully"
}
```

### Errors

| Status | Code                  | Description                              |
| ------ | --------------------- | ---------------------------------------- |
| 400    | Missing answers       | Not all questions were answered          |
| 400    | Answer too short      | Answer is less than 50 characters        |
| 400    | Job not published     | Job is not accepting applications        |
| 404    | Job not found         | No job with this slug exists             |
| 409    | Already applied       | Email has already applied to this job    |

**Example Error (Missing Answers)**

```json
{
  "error": "All questions must be answered",
  "missingQuestions": ["failure_and_recovery"],
  "message": "Please answer all 3 questions to submit your application"
}
```

**Example Error (Already Applied)**

```json
{
  "error": "You have already applied to this job",
  "applicationId": "existing_app_id"
}
```

---

## POST /public/jobs/:slug/apply/draft

Save application progress for later completion. Answers can be partial or empty.

### Request

```json
{
  "email": "candidate@example.com",
  "name": "Jane Doe",
  "answers": [
    {
      "archetypeId": "situational_uncertainty_story",
      "answerText": "When I was leading..."
    },
    {
      "archetypeId": "ownership_of_outcome",
      "answerText": ""
    },
    {
      "archetypeId": "failure_and_recovery",
      "answerText": ""
    }
  ]
}
```

| Field     | Type   | Required | Description                            |
| --------- | ------ | -------- | -------------------------------------- |
| `email`   | string | Yes      | Valid email address                    |
| `name`    | string | Yes      | Candidate's full name (1-200 chars)    |
| `answers` | array  | Yes      | Array of answers (can be incomplete)   |

### Response

**200 OK**

```json
{
  "success": true,
  "draftId": "draft_abc123",
  "resumeToken": "secure_random_token_64_chars",
  "expiresAt": "2026-01-19T15:00:00.000Z",
  "progress": {
    "answered": 1,
    "total": 3
  },
  "message": "Progress saved! You have 7 days to complete your application."
}
```

| Field         | Type   | Description                              |
| ------------- | ------ | ---------------------------------------- |
| `draftId`     | string | Unique draft identifier                  |
| `resumeToken` | string | Secure token to resume draft             |
| `expiresAt`   | string | ISO 8601 expiry timestamp (7 days)       |
| `progress`    | object | Completion status                        |

### Notes

- **Resume token** should be stored by the frontend and used to resume
- Subsequent saves with the same email will **update** the existing draft
- Draft is automatically **deleted** when application is submitted

---

## GET /public/jobs/:slug/apply/draft/:draftId

Resume a previously saved application draft.

### Query Parameters

| Param  | Required | Description                                      |
| ------ | -------- | ------------------------------------------------ |
| `token`| Yes*     | Resume token (can also be sent in header)        |

*Can alternatively be sent as `X-Resume-Token` header.

### Request

```
GET /public/jobs/senior-engineer-abc123/apply/draft/draft_xyz789?token=secure_token
```

### Response

**200 OK**

```json
{
  "draftId": "draft_xyz789",
  "candidateEmail": "candidate@example.com",
  "candidateName": "Jane Doe",
  "answers": [
    {
      "archetypeId": "situational_uncertainty_story",
      "answerText": "When I was leading..."
    },
    {
      "archetypeId": "ownership_of_outcome",
      "answerText": ""
    },
    {
      "archetypeId": "failure_and_recovery",
      "answerText": ""
    }
  ],
  "expiresAt": "2026-01-19T15:00:00.000Z",
  "progress": {
    "answered": 1,
    "total": 3
  }
}
```

### Errors

| Status | Code                | Description                              |
| ------ | ------------------- | ---------------------------------------- |
| 400    | Token required      | Resume token was not provided            |
| 404    | Draft not found     | Draft doesn't exist or has expired       |
| 404    | Job not found       | Job with this slug doesn't exist         |
| 409    | Already applied     | Application was already submitted        |

**Example Error (Expired)**

```json
{
  "error": "Draft not found or expired",
  "message": "Your saved progress may have expired. Please start a new application."
}
```

---

## Workflow Example

### Standard Application Flow

```
1. Candidate visits job page
   GET /public/jobs/senior-engineer-abc123

2. Candidate answers all questions and submits
   POST /public/jobs/senior-engineer-abc123/apply

3. Application is queued for signal extraction
```

### Save & Continue Flow

```
1. Candidate starts application, answers 1 question
   POST /public/jobs/senior-engineer-abc123/apply/draft
   → Returns draftId + resumeToken

2. Candidate returns later (within 7 days)
   GET /public/jobs/senior-engineer-abc123/apply/draft/draft_xyz?token=abc123
   → Returns saved answers

3. Candidate completes remaining questions
   POST /public/jobs/senior-engineer-abc123/apply/draft
   → Updates draft, returns new token

4. Candidate submits final application
   POST /public/jobs/senior-engineer-abc123/apply
   → Draft is deleted, application created
```

---

## Signal Extraction

After submission, applications are queued for **async signal extraction**:

1. Each answer is analyzed by LLM
2. Signals are extracted (e.g., `decision_under_uncertainty`, `accountability`)
3. Aggregated signals compute a **decision posture**
4. Results are available to recruiters via the applications management API

This process happens in the background and does not block the submission response.

---

## Data Retention

| Data Type    | Retention                                |
| ------------ | ---------------------------------------- |
| Drafts       | 7 days from creation/last update         |
| Applications | Indefinite (as long as job exists)       |
| Answers      | Tied to application lifecycle            |
