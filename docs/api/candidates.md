# Candidates API

Recruiter-facing endpoints for cross-application candidate lookup.

**Authentication required** - All endpoints require valid JWT.

**Authorization** - Results are filtered to applications within the user's organization.

## Endpoints

| Method | Path                   | Description                     |
| ------ | ---------------------- | ------------------------------- |
| GET    | `/v1/candidates/lookup`| Cross-application lookup by email |

---

## GET /v1/candidates/lookup

Look up all applications by a candidate email across all jobs in the organization.

This endpoint enables:
- Cross-application visibility for same-email candidates
- Understanding candidate history across multiple roles
- Viewing all applications from the same person

### Query Parameters

| Parameter | Type   | Required | Description                |
| --------- | ------ | -------- | -------------------------- |
| `email`   | string | Yes      | Valid email address to search |

### Response (200 OK)

```json
{
  "email": "jane@example.com",
  "totalApplications": 3,
  "applications": [
    {
      "applicationId": "app_abc123",
      "jobId": "job_xyz789",
      "jobTitle": "Senior Software Engineer",
      "status": "pending",
      "decisionPosture": "LOW_REGRET_RISK",
      "hasCv": true,
      "appliedAt": "2024-01-15T10:00:00Z"
    },
    {
      "applicationId": "app_def456",
      "jobId": "job_uvw123",
      "jobTitle": "Staff Engineer",
      "status": "rejected",
      "decisionPosture": "HIGH_UNCERTAINTY",
      "hasCv": true,
      "appliedAt": "2024-01-10T08:30:00Z"
    },
    {
      "applicationId": "app_ghi789",
      "jobId": "job_rst456",
      "jobTitle": "Engineering Manager",
      "status": "screening",
      "decisionPosture": "SOME_UNCERTAINTY",
      "hasCv": false,
      "appliedAt": "2024-01-05T14:00:00Z"
    }
  ]
}
```

### Response (No Applications Found)

```json
{
  "email": "unknown@example.com",
  "totalApplications": 0,
  "applications": []
}
```

### Response Fields

| Field              | Type   | Description                              |
| ------------------ | ------ | ---------------------------------------- |
| `email`            | string | The searched email address               |
| `totalApplications`| number | Total number of applications found       |
| `applications`     | array  | Array of application summaries           |

### Application Summary Fields

| Field           | Type        | Description                           |
| --------------- | ----------- | ------------------------------------- |
| `applicationId` | string      | Application ID                        |
| `jobId`         | string      | Associated job ID                     |
| `jobTitle`      | string      | Job title at time of application      |
| `status`        | string      | Application status                    |
| `decisionPosture`| string/null | Computed decision posture             |
| `hasCv`         | boolean     | Whether a CV was uploaded             |
| `appliedAt`     | string      | Application submission timestamp      |

### Errors

| Status | Message                  |
| ------ | ------------------------ |
| 400    | Valid email is required  |

---

## Use Cases

### 1. Candidate Profile View

When viewing an application, check if the candidate has applied to other roles:

```javascript
const response = await fetch(`/v1/candidates/lookup?email=${candidateEmail}`, {
  headers: { Authorization: `Bearer ${token}` }
});
const { applications } = await response.json();

if (applications.length > 1) {
  // Show "Applied to X other roles" indicator
}
```

### 2. Cross-Application Navigation

Allow recruiters to navigate between a candidate's applications:

```javascript
// Get all applications for this candidate
const { applications } = await lookupByEmail(candidateEmail);

// Show links to other applications
applications
  .filter(app => app.applicationId !== currentApplicationId)
  .forEach(app => {
    console.log(`Also applied to: ${app.jobTitle} (${app.status})`);
  });
```

### 3. Candidate History Summary

Display candidate's application history in a timeline:

```javascript
const { applications } = await lookupByEmail(candidateEmail);

// Sort by application date
const sorted = applications.sort((a, b) =>
  new Date(b.appliedAt) - new Date(a.appliedAt)
);

// Display timeline
sorted.forEach(app => {
  console.log(`${app.appliedAt}: ${app.jobTitle} - ${app.status}`);
});
```

---

## Notes

- Only returns applications for jobs within the authenticated user's organization
- Does not expose applications from other organizations
- Email matching is case-insensitive
- Results are not paginated (typically a candidate has few applications)
