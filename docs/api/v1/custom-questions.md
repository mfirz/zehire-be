# Custom Questions API

Recruiter-facing endpoints for managing custom questions on jobs.

**Authentication required** - All endpoints require valid JWT.

**Authorization** - User's organization must own the job.

## Overview

Custom questions allow recruiters to add additional questions beyond the 3 archetype questions. There are three categories:

| Category      | Purpose                           | Affects Posture? |
| ------------- | --------------------------------- | ---------------- |
| `evaluative`  | Extract signals about judgment    | Yes              |
| `screening`   | Hard requirements (pass/fail)     | No               |
| `logistical`  | Informational for planning        | No               |

## Endpoints

| Method | Path                                      | Description                    |
| ------ | ----------------------------------------- | ------------------------------ |
| POST   | `/v1/jobs/:jobId/custom-questions`        | Create custom question         |
| GET    | `/v1/jobs/:jobId/custom-questions`        | List custom questions          |
| GET    | `/v1/jobs/:jobId/custom-questions/:qid`   | Get custom question            |
| PUT    | `/v1/jobs/:jobId/custom-questions/:qid`   | Update custom question         |
| DELETE | `/v1/jobs/:jobId/custom-questions/:qid`   | Delete custom question         |
| POST   | `/v1/jobs/:jobId/custom-questions/reorder`| Reorder questions              |
| POST   | `/v1/custom-questions/suggest-signals`    | Suggest signals for a question |

---

## POST /v1/jobs/:jobId/custom-questions

Create a new custom question for a job.

**Note:** Can only add questions to draft jobs.

### Path Parameters

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `jobId`   | string | The job ID  |

### Request Body (Evaluative Question)

```json
{
  "category": "evaluative",
  "answerType": "free_text",
  "questionText": "Describe a situation where you had to make a difficult decision with incomplete information.",
  "required": true,
  "targetSignals": ["decision_under_uncertainty", "risk_reasoning"]
}
```

### Request Body (Screening Question)

```json
{
  "category": "screening",
  "answerType": "yes_no",
  "questionText": "Do you have authorization to work in the United States?",
  "required": true,
  "expectedAnswer": "Yes",
  "failAction": "flag"
}
```

### Request Body (Logistical Question)

```json
{
  "category": "logistical",
  "answerType": "single_choice",
  "questionText": "Which office location works best for you?",
  "required": true,
  "options": ["San Francisco", "New York", "Remote"]
}
```

### Request Fields

| Field          | Type          | Required | Description                                      |
| -------------- | ------------- | -------- | ------------------------------------------------ |
| `category`     | string        | Yes      | `evaluative`, `screening`, or `logistical`       |
| `answerType`   | string        | Yes      | Answer format (see below)                        |
| `questionText` | string        | Yes      | Question text (10-500 chars)                     |
| `required`     | boolean       | No       | Whether answer is required (default: true)       |
| `targetSignals`| string[]      | No       | Signal IDs for evaluative questions (1-5)        |
| `expectedAnswer`| string/string[] | Conditional | Expected answer for screening questions       |
| `failAction`   | string        | No       | Action on screening fail: `flag`, `reject`, `allow` |
| `options`      | string[]      | Conditional | Options for choice questions (2-20)           |
| `minValue`     | number        | No       | Minimum for number questions                     |
| `maxValue`     | number        | No       | Maximum for number questions                     |

### Answer Types by Category

| Category     | Allowed Answer Types                                    |
| ------------ | ------------------------------------------------------- |
| `evaluative` | `free_text` only                                        |
| `screening`  | `yes_no`, `single_choice`                               |
| `logistical` | `single_choice`, `multiple_choice`, `number`, `date`, `url` |

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

### Response (201 Created)

```json
{
  "id": "cq_abc123",
  "jobId": "job_xyz789",
  "category": "evaluative",
  "answerType": "free_text",
  "questionText": "Describe a situation where you had to make a difficult decision with incomplete information.",
  "required": true,
  "orderIndex": 0,
  "targetSignals": ["decision_under_uncertainty", "risk_reasoning"],
  "expectedAnswer": null,
  "failAction": null,
  "options": null,
  "minValue": null,
  "maxValue": null,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:00:00Z"
}
```

### Errors

| Status | Message                              |
| ------ | ------------------------------------ |
| 400    | Can only add questions to draft jobs |
| 400    | Options are required for choice-type questions |
| 400    | Expected answer must be one of the options |
| 404    | Job not found                        |

---

## GET /v1/jobs/:jobId/custom-questions

List all custom questions for a job.

### Path Parameters

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `jobId`   | string | The job ID  |

### Response (200 OK)

```json
{
  "questions": [
    {
      "id": "cq_abc123",
      "jobId": "job_xyz789",
      "category": "evaluative",
      "answerType": "free_text",
      "questionText": "Describe a situation...",
      "required": true,
      "orderIndex": 0,
      "targetSignals": ["decision_under_uncertainty"],
      "expectedAnswer": null,
      "failAction": null,
      "options": null,
      "minValue": null,
      "maxValue": null,
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:00:00Z"
    },
    {
      "id": "cq_def456",
      "jobId": "job_xyz789",
      "category": "screening",
      "answerType": "yes_no",
      "questionText": "Do you have work authorization?",
      "required": true,
      "orderIndex": 1,
      "targetSignals": null,
      "expectedAnswer": "Yes",
      "failAction": "flag",
      "options": null,
      "minValue": null,
      "maxValue": null,
      "createdAt": "2024-01-15T10:01:00Z",
      "updatedAt": "2024-01-15T10:01:00Z"
    }
  ]
}
```

### Errors

| Status | Message       |
| ------ | ------------- |
| 404    | Job not found |

---

## GET /v1/jobs/:jobId/custom-questions/:qid

Get a specific custom question.

### Path Parameters

| Parameter | Type   | Description       |
| --------- | ------ | ----------------- |
| `jobId`   | string | The job ID        |
| `qid`     | string | The question ID   |

### Response (200 OK)

```json
{
  "id": "cq_abc123",
  "jobId": "job_xyz789",
  "category": "evaluative",
  "answerType": "free_text",
  "questionText": "Describe a situation...",
  "required": true,
  "orderIndex": 0,
  "targetSignals": ["decision_under_uncertainty"],
  "expectedAnswer": null,
  "failAction": null,
  "options": null,
  "minValue": null,
  "maxValue": null,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:00:00Z"
}
```

### Errors

| Status | Message            |
| ------ | ------------------ |
| 404    | Job not found      |
| 404    | Question not found |

---

## PUT /v1/jobs/:jobId/custom-questions/:qid

Update a custom question.

**Note:** Can only update questions on draft jobs.

### Path Parameters

| Parameter | Type   | Description       |
| --------- | ------ | ----------------- |
| `jobId`   | string | The job ID        |
| `qid`     | string | The question ID   |

### Request Body

All fields are optional. Only include fields you want to update.

```json
{
  "questionText": "Updated question text...",
  "required": false,
  "targetSignals": ["accountability", "learning_from_failure"]
}
```

### Response (200 OK)

Returns the updated question object.

### Errors

| Status | Message                                 |
| ------ | --------------------------------------- |
| 400    | Can only update questions on draft jobs |
| 404    | Job not found                           |
| 404    | Question not found                      |

---

## DELETE /v1/jobs/:jobId/custom-questions/:qid

Delete a custom question.

**Note:** Can only delete questions on draft jobs.

### Path Parameters

| Parameter | Type   | Description       |
| --------- | ------ | ----------------- |
| `jobId`   | string | The job ID        |
| `qid`     | string | The question ID   |

### Response (200 OK)

```json
{
  "success": true
}
```

### Errors

| Status | Message                                 |
| ------ | --------------------------------------- |
| 400    | Can only delete questions on draft jobs |
| 404    | Job not found                           |
| 404    | Question not found                      |

---

## POST /v1/jobs/:jobId/custom-questions/reorder

Reorder custom questions for a job.

**Note:** Can only reorder questions on draft jobs.

### Path Parameters

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `jobId`   | string | The job ID  |

### Request Body

```json
{
  "questionIds": ["cq_def456", "cq_abc123", "cq_ghi789"]
}
```

| Field        | Type     | Required | Description                    |
| ------------ | -------- | -------- | ------------------------------ |
| `questionIds`| string[] | Yes      | Ordered array of question IDs  |

### Response (200 OK)

Returns the reordered questions list.

```json
{
  "questions": [
    { "id": "cq_def456", "orderIndex": 0, ... },
    { "id": "cq_abc123", "orderIndex": 1, ... },
    { "id": "cq_ghi789", "orderIndex": 2, ... }
  ]
}
```

### Errors

| Status | Message                                  |
| ------ | ---------------------------------------- |
| 400    | Can only reorder questions on draft jobs |
| 404    | Job not found                            |

---

## POST /v1/custom-questions/suggest-signals

Suggest target signals for a question text using AI.

### Request Body

```json
{
  "questionText": "Tell me about a time when you had to push back on a stakeholder's request.",
  "jobContext": {
    "domain": "engineering",
    "riskLevel": "high",
    "primarySignals": ["technical_depth", "system_thinking"]
  }
}
```

| Field         | Type   | Required | Description                          |
| ------------- | ------ | -------- | ------------------------------------ |
| `questionText`| string | Yes      | The question to analyze (10-500 chars) |
| `jobContext`  | object | No       | Optional job context for better suggestions |

### Response (200 OK)

```json
{
  "signals": ["stakeholder_management", "communication_clarity", "accountability"],
  "confidence": "high",
  "reasoning": "This question directly asks about stakeholder interactions and pushback, which clearly maps to stakeholder management. The need to articulate disagreement relates to communication clarity, and taking a stand involves accountability."
}
```

| Field        | Type     | Description                                |
| ------------ | -------- | ------------------------------------------ |
| `signals`    | string[] | Suggested signal IDs (1-5)                 |
| `confidence` | string   | `high`, `medium`, or `low`                 |
| `reasoning`  | string   | Explanation of why these signals were chosen |

### Errors

| Status | Message                    |
| ------ | -------------------------- |
| 400    | Question text is required  |
| 400    | Question must be 10-500 chars |

---

## Question Categories Explained

### Evaluative Questions

Evaluative questions are designed to extract judgment signals from candidates. They:
- Must use `free_text` answer type (minimum 50 character response)
- Can target 1-5 signals from the 10 core signals
- Are processed through the same signal extraction pipeline as archetype questions
- Contribute to the decision posture computation

**Use case:** "Describe a situation where you had to balance competing priorities from different stakeholders."

### Screening Questions

Screening questions check hard requirements without affecting the decision posture. They:
- Use `yes_no` or `single_choice` answer types
- Have an expected answer that defines "pass"
- Have a configurable fail action:
  - `flag` (default): Application is submitted but flagged for recruiter review
  - `reject`: Application is auto-rejected
  - `allow`: Fail is noted but no special handling

**Use case:** "Are you legally authorized to work in the United States?"

### Logistical Questions

Logistical questions collect planning information. They:
- Support various answer types for structured data
- Do not affect decision posture
- Are displayed to recruiters in the application detail

**Use case:** "What is your expected salary range?" (number), "When can you start?" (date)

---

## Quick Reference

### Answer Types by Category

| Category     | Allowed Answer Types                                    |
| ------------ | ------------------------------------------------------- |
| `evaluative` | `free_text`                                             |
| `screening`  | `yes_no`, `single_choice`                               |
| `logistical` | `single_choice`, `multiple_choice`, `number`, `date`, `url` |

### Required Fields by Category

#### Evaluative Questions

| Field          | Required | Default | Notes                           |
| -------------- | -------- | ------- | ------------------------------- |
| `category`     | Yes      | -       | Must be `"evaluative"`          |
| `answerType`   | Yes      | -       | Must be `"free_text"`           |
| `questionText` | Yes      | -       | 10-500 characters               |
| `required`     | No       | `true`  |                                 |
| `targetSignals`| No       | `null`  | 1-5 signal IDs if provided      |
| `expectedAnswer` | -      | -       | **Not allowed**                 |
| `failAction`   | -        | -       | **Not allowed**                 |
| `options`      | -        | -       | **Not allowed**                 |

#### Screening Questions

| Field          | Required    | Default  | Notes                                        |
| -------------- | ----------- | -------- | -------------------------------------------- |
| `category`     | Yes         | -        | Must be `"screening"`                        |
| `answerType`   | Yes         | -        | `"yes_no"` or `"single_choice"`              |
| `questionText` | Yes         | -        | 10-500 characters                            |
| `required`     | No          | `true`   |                                              |
| `expectedAnswer` | Yes       | -        | String or string[]                           |
| `failAction`   | No          | `"flag"` | `"flag"`, `"reject"`, or `"allow"`           |
| `options`      | Conditional | -        | Required if `answerType` is `"single_choice"` |
| `targetSignals`| -           | -        | **Not allowed**                              |

#### Logistical Questions

| Field          | Required    | Default | Notes                                               |
| -------------- | ----------- | ------- | --------------------------------------------------- |
| `category`     | Yes         | -       | Must be `"logistical"`                              |
| `answerType`   | Yes         | -       | `"single_choice"`, `"multiple_choice"`, `"number"`, `"date"`, `"url"` |
| `questionText` | Yes         | -       | 10-500 characters                                   |
| `required`     | No          | `true`  |                                                     |
| `options`      | Conditional | -       | Required if `answerType` is `"single_choice"` or `"multiple_choice"` |
| `minValue`     | No          | `null`  | For `number` type only                              |
| `maxValue`     | No          | `null`  | For `number` type only                              |
| `targetSignals`| -           | -       | **Not allowed**                                     |
| `expectedAnswer` | -         | -       | **Not allowed**                                     |
| `failAction`   | -           | -       | **Not allowed**                                     |

### Valid Signal IDs

```
decision_under_uncertainty  - Decision Under Uncertainty
tradeoff_awareness          - Tradeoff Awareness
risk_reasoning              - Risk Reasoning
ethical_awareness           - Ethical Awareness
technical_depth             - Technical Depth
system_thinking             - System Thinking
communication_clarity       - Communication Clarity
stakeholder_management      - Stakeholder Management
accountability              - Accountability
learning_from_failure       - Learning From Failure
```

### Field Constraints

| Field          | Constraint                                              |
| -------------- | ------------------------------------------------------- |
| `questionText` | Min: 10 characters, Max: 500 characters                 |
| `targetSignals`| Min: 1 signal, Max: 5 signals                           |
| `options` (screening) | Min: 2 options, Max: 10 options                  |
| `options` (logistical) | Min: 2 options, Max: 20 options                 |
| `expectedAnswer` | Must match one of `options` for `single_choice` type  |

### Screening Failure Handling

| `failAction` | Behavior | Response to Candidate |
| ------------ | -------- | --------------------- |
| `"flag"` (default) | Application submitted, marked for review | "Your application has been submitted. Some responses will be reviewed by the hiring team." |
| `"reject"` | Application auto-rejected | "Your application could not be submitted due to eligibility requirements." |
| `"allow"` | No action, just records the answer | Normal success message |
