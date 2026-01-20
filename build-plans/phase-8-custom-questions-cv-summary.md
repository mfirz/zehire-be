# Phase 8: Custom Questions & CV Summarization

## Overview

Add recruiter-defined custom questions and CV summarization to complement the auto-generated archetype questions.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CUSTOM QUESTIONS + CV SUMMARIZATION                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Current: 3 archetype questions (auto-generated)                            │
│                                                                             │
│  New:                                                                       │
│  ├── Custom Evaluative Questions (affect posture)                          │
│  ├── Screening Questions (pass/fail)                                       │
│  ├── Logistical Questions (data collection)                                │
│  └── CV Summarization (structured data + contradiction detection)          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Relationship to Archetypes

**Important clarification:**

| | Archetype Questions | Custom Questions |
|---|---------------------|------------------|
| Source | System registry (predefined) | Recruiter writes per job |
| Selection | Auto (based on JobContext) | Manual |
| Count | Always 3 | 0 to N |
| Reusable | N/A (system-managed) | No (one-off per job) |
| Signal mapping | Pre-defined per archetype | LLM suggests, recruiter selects from fixed list |

Custom questions are **additions** to the 3 archetype questions, not replacements.
Recruiters cannot add new archetypes to the system registry.

---

## Part 1: Question Categories

### 1.1 Evaluative Questions (Affect Decision Posture)

**Purpose:** Extract signals from open-ended answers, same as archetype questions.

| Attribute | Value |
|-----------|-------|
| Answer type | Free text only (50+ chars) |
| Signal mapping | Fixed 10 signals only (see below) |
| Affects posture | Yes (aggregated with archetype signals) |
| Required/Optional | Recruiter configures |
| Reusable | No (one-off per job) |

#### Available Signals (Fixed List - No Custom Signals)

Recruiters can ONLY select from these 10 predefined signals:

| Signal ID | Label | Description |
|-----------|-------|-------------|
| `decision_under_uncertainty` | Decision Under Uncertainty | How a candidate makes decisions when information is incomplete |
| `tradeoff_awareness` | Tradeoff Awareness | Explicit reasoning about competing priorities and constraints |
| `risk_reasoning` | Risk Reasoning | Understanding of risk, consequences, and mitigation |
| `ethical_awareness` | Ethical Awareness | Judgment in ambiguous or ethically complex situations |
| `technical_depth` | Technical Depth | Hands-on expertise beyond surface-level claims |
| `system_thinking` | System Thinking | Understanding of interconnected systems and second-order effects |
| `communication_clarity` | Communication Clarity | Ability to explain complex ideas clearly |
| `stakeholder_management` | Stakeholder Management | Navigating relationships, disagreements, and alignment |
| `accountability` | Accountability | Ownership of outcomes, including mistakes |
| `learning_from_failure` | Learning from Failure | Growth behavior and adaptation after setbacks |

**Why fixed signals only:**
- LLM extraction is designed for these specific signals
- Aggregation logic ("best confidence wins") depends on known signal types
- Posture computation rules reference specific signals
- Consistency across all jobs for comparison

#### UX Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Signal Selection Flow                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Recruiter types question text                                           │
│                           ↓                                                 │
│  2. Click "Analyze" → POST /v1/custom-questions/suggest-signals             │
│                           ↓                                                 │
│  3. API returns: { signals: ["accountability", "stakeholder_management"] }  │
│                           ↓                                                 │
│  4. UI shows checkboxes for all 10 signals, suggested ones pre-checked      │
│                           ↓                                                 │
│  5. Recruiter can:                                                          │
│     - Accept suggestions as-is                                              │
│     - Add more signals (check additional boxes)                             │
│     - Remove suggestions (uncheck boxes)                                    │
│     - Skip suggestion and manually select                                   │
│                           ↓                                                 │
│  6. Save → POST /v1/jobs/:jobId/custom-questions with targetSignals         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Example UI:**
```
Signal Selection (suggested signals are pre-checked)
┌─────────────────────────────────────────────────────────────────┐
│  ☑ Accountability            ★ Suggested                        │
│  ☑ Stakeholder Management    ★ Suggested                        │
│  ☐ Communication Clarity                                        │
│  ☐ Decision Under Uncertainty                                   │
│  ☐ Tradeoff Awareness                                           │
│  ☐ Risk Reasoning                                               │
│  ☐ Ethical Awareness                                            │
│  ☐ Technical Depth                                              │
│  ☐ System Thinking                                              │
│  ☐ Learning from Failure                                        │
│                                                                 │
│  [Cannot add custom signals - only select from above]           │
└─────────────────────────────────────────────────────────────────┘
```

**No Signals Case:**
If LLM finds no signal mapping → question becomes logistical (data collection only, no posture impact).

### 1.2 Screening Questions (Don't Affect Posture)

**Purpose:** Binary pass/fail checks for hard requirements.

| Attribute | Value |
|-----------|-------|
| Answer types | Yes/No, Single choice |
| Affects posture | No |
| Fail behavior | Flag for review (default), or auto-reject, or allow with warning |

**Flow:**
```
Recruiter creates question + expected answer(s)
    ↓
Candidate answers
    ↓
System checks: answer matches expected?
    ↓
If no → Action based on recruiter config:
    ├── Flag for review (default)
    ├── Auto-reject
    └── Allow with warning
```

**Examples:**
- "Do you have authorization to work in [country]?" → Expected: Yes
- "Do you have a valid driver's license?" → Expected: Yes
- "Are you willing to relocate?" → Expected: Yes or Maybe

### 1.3 Logistical Questions (Don't Affect Posture)

**Purpose:** Collect information for planning, not evaluation.

| Attribute | Value |
|-----------|-------|
| Answer types | Multiple choice, Single choice, Number, Date, URL |
| Affects posture | No |
| Required/Optional | Recruiter configures |

**Examples:**
| Question | Type | Options/Constraints |
|----------|------|---------------------|
| "What is your expected salary range?" | Number | min/max |
| "When is your earliest start date?" | Date | future dates only |
| "Which office locations work for you?" | Multiple choice | [NYC, SF, Remote, ...] |
| "Link to your portfolio" | URL | optional |
| "What is your notice period?" | Single choice | [Immediately, 2 weeks, 1 month, ...] |

---

## Part 2: CV Summarization

### 2.1 Design Decision: Structured Data per Application

**Approach:** CV data stored in normalized tables per application.

```
CV uploaded → Extract text → LLM structures → Store in normalized tables
                                           → Store raw JSON (backup)
```

**Why per application:**
- Candidates tailor CVs for different roles
- Each application is a point-in-time snapshot
- Different jobs may highlight different experience

**Cross-application visibility:**
- Query all applications by `candidate_email`
- UI shows "This candidate has N other applications"
- Recruiter can compare CVs across applications

### 2.2 Extraction Approach

**Choice:** Text-based only (covers 90%+ of CVs)

| Format | Supported | Method |
|--------|-----------|--------|
| PDF (text-based) | Yes | `pdf-parse` library |
| PDF (scanned/image) | No | Show warning to user |
| DOCX | Yes | `mammoth.js` library |
| DOC (old) | No | Ask user to convert |

**Detection:** If PDF has no extractable text → likely scanned → warn user.

### 2.3 Structured CV Data Model

```typescript
interface CVWorkExperience {
  id: string;
  title: string;
  company: string;
  startDate: string | null;    // YYYY-MM or YYYY
  endDate: string | null;      // YYYY-MM or "present"
  isCurrent: boolean;
  durationMonths: number | null;
  highlights: string[];
  orderIndex: number;
}

interface CVEducation {
  id: string;
  degree: string | null;       // "Bachelor's", "Master's", "PhD"
  field: string | null;        // "Computer Science"
  institution: string;
  year: string | null;
  orderIndex: number;
}

interface CVSkill {
  id: string;
  skillName: string;
  category: "language" | "framework" | "tool" | "soft_skill" | "other";
}

interface CVSummary {
  totalYearsExperience: number | null;
  hasManagementExperience: boolean;
  relevanceToJob: "high" | "medium" | "low" | null;
  gaps: string[];              // "2-year gap between X and Y"
  rawText: string;             // Original extracted text
}
```

### 2.4 Contradiction Detection (Affects Posture)

**When CV contradicts answer → triggers SOME_UNCERTAINTY**

**Detection logic:**
```
For each evaluative answer:
    Extract claims (titles, years, team sizes, etc.)
    Compare against CV structured data
    If mismatch found:
        Add to posture warnings
        Suggested action: "Verify [claim] in interview"
```

**Examples:**
| Answer Claim | CV Shows | Contradiction |
|--------------|----------|---------------|
| "As Engineering Manager..." | No management titles | Title mismatch |
| "Led team of 15" | IC roles only | Team size claim unsupported |
| "5 years at Google" | 18 months at Google | Duration mismatch |

**NOT contradictions:**
- CV outdated (last updated date old)
- Skills mentioned in answer but not in CV (CV might be incomplete)
- Soft claims ("strong communicator") — too subjective

### 2.5 CV Requirement

**Configurable per job:**
- Recruiter can mark CV as required when creating job
- If required: application blocked without CV
- If optional: CV summarization runs if provided, skipped otherwise

### 2.6 Cross-Application Visibility

**Same email, different applications:**
```
GET /v1/candidates/by-email?email=john@example.com

Response:
{
  email: "john@example.com",
  applications: [
    { id: "app1", jobId: "job1", jobTitle: "Engineer", appliedAt: "...", status: "..." },
    { id: "app2", jobId: "job2", jobTitle: "Manager", appliedAt: "...", status: "..." }
  ]
}
```

**UI shows:**
- "This candidate has 2 other applications" panel
- Links to other applications
- Can compare CVs side-by-side

**Same email, same job (reapplication):**
- Block by default: "You have already applied to this position"
- Future: allow update with new CV (re-run pipeline)

---

## Part 3: Database Schema

### 3.1 Custom Questions Table

```sql
CREATE TABLE custom_questions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- Question definition
  category TEXT NOT NULL,  -- 'evaluative' | 'screening' | 'logistical'
  answer_type TEXT NOT NULL,  -- 'free_text' | 'yes_no' | 'single_choice' | 'multiple_choice' | 'number' | 'date' | 'url'
  question_text TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,  -- boolean
  order_index INTEGER NOT NULL,

  -- For evaluative questions
  target_signals TEXT,  -- JSON array of SignalId[]

  -- For screening questions
  expected_answer TEXT,  -- JSON: string or string[]
  fail_action TEXT DEFAULT 'flag',  -- 'flag' | 'reject' | 'allow'

  -- For choice questions
  options TEXT,  -- JSON array of strings

  -- For number questions
  min_value REAL,
  max_value REAL,

  -- Metadata
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_custom_questions_job ON custom_questions(job_id);
```

### 3.2 Custom Answers Table

```sql
CREATE TABLE custom_answers (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES custom_questions(id) ON DELETE CASCADE,

  -- Answer content (one of these based on answer_type)
  answer_text TEXT,          -- For free_text, yes_no, single_choice
  answer_values TEXT,        -- JSON array for multiple_choice
  answer_number REAL,        -- For number
  answer_date TEXT,          -- For date (ISO string)
  answer_url TEXT,           -- For url

  -- Screening result
  screening_passed INTEGER,  -- NULL if not screening, 1/0 if screening

  -- Signal extraction (for evaluative only)
  extraction_status TEXT DEFAULT 'pending',  -- 'pending' | 'processing' | 'completed' | 'failed'
  extracted_signals TEXT,    -- JSON: same format as archetype answers

  -- Metadata
  created_at TEXT NOT NULL,

  UNIQUE(application_id, question_id)
);

CREATE INDEX idx_custom_answers_application ON custom_answers(application_id);
CREATE INDEX idx_custom_answers_question ON custom_answers(question_id);
CREATE INDEX idx_custom_answers_extraction ON custom_answers(extraction_status);
```

### 3.3 CV Structured Data Tables

```sql
-- Work experience entries
CREATE TABLE cv_work_experiences (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  start_date TEXT,           -- YYYY-MM or YYYY
  end_date TEXT,             -- YYYY-MM, YYYY, or "present"
  is_current INTEGER DEFAULT 0,
  duration_months INTEGER,   -- Computed by LLM or application
  highlights TEXT,           -- JSON array of strings
  order_index INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_cv_work_exp_application ON cv_work_experiences(application_id);

-- Education entries
CREATE TABLE cv_education (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  degree TEXT,               -- "Bachelor's", "Master's", "PhD", "High School"
  field TEXT,                -- "Computer Science", "Business Administration"
  institution TEXT NOT NULL,
  year TEXT,                 -- Graduation year
  order_index INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_cv_education_application ON cv_education(application_id);

-- Skills extracted from CV
CREATE TABLE cv_skills (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  category TEXT,             -- 'language' | 'framework' | 'tool' | 'soft_skill' | 'other'
  created_at TEXT NOT NULL
);

CREATE INDEX idx_cv_skills_application ON cv_skills(application_id);
CREATE INDEX idx_cv_skills_name ON cv_skills(skill_name);
```

### 3.4 Applications Table Updates

```sql
-- Add CV-related columns to applications table
ALTER TABLE applications ADD COLUMN cv_raw_text TEXT;
ALTER TABLE applications ADD COLUMN cv_summary_json TEXT;  -- Full LLM output backup
ALTER TABLE applications ADD COLUMN cv_extraction_status TEXT DEFAULT 'pending';  -- 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
ALTER TABLE applications ADD COLUMN cv_contradictions TEXT;  -- JSON array of contradiction objects
ALTER TABLE applications ADD COLUMN total_years_experience INTEGER;
ALTER TABLE applications ADD COLUMN has_management_experience INTEGER DEFAULT 0;

-- Add index for cross-application lookup by email
CREATE INDEX idx_applications_candidate_email ON applications(candidate_email);
```

### 3.5 Jobs Table Update

```sql
-- Add CV requirement flag
ALTER TABLE jobs ADD COLUMN cv_required INTEGER DEFAULT 0;
```

---

## Part 4: API Endpoints

### 4.1 Signal Suggestion

**POST /v1/custom-questions/suggest-signals**

Analyze a question and suggest which signals it evaluates.

**Request:**
```typescript
{
  questionText: string;        // 10-500 chars
  jobContext?: JobContext;     // Optional, improves suggestions
}
```

**Response:**
```typescript
{
  signals: SignalId[];         // Array of 0-5 signal IDs from the fixed list
  confidence: "high" | "medium" | "low";
  reasoning: string;           // Explanation of why these signals
}
```

**Example:**
```json
// Request
{
  "questionText": "Describe a time when you had to make a difficult decision with incomplete information."
}

// Response
{
  "signals": ["decision_under_uncertainty", "risk_reasoning"],
  "confidence": "high",
  "reasoning": "This question directly evaluates how candidates approach decisions when facing uncertainty and how they reason about potential risks."
}
```

### 4.2 Custom Questions CRUD

#### POST /v1/jobs/:jobId/custom-questions

Create a new custom question.

**Request (Evaluative):**
```typescript
{
  category: "evaluative";
  answerType: "free_text";
  questionText: string;        // 10-500 chars
  required?: boolean;          // default: true
  targetSignals?: SignalId[];  // 1-5 signals from fixed list
}
```

**Request (Screening):**
```typescript
{
  category: "screening";
  answerType: "yes_no" | "single_choice";
  questionText: string;
  required?: boolean;
  expectedAnswer: string | string[];  // Single value or array of acceptable answers
  failAction?: "flag" | "reject" | "allow";  // default: "flag"
  options?: string[];          // Required for single_choice (2-10 options)
}
```

**Request (Logistical):**
```typescript
{
  category: "logistical";
  answerType: "single_choice" | "multiple_choice" | "number" | "date" | "url";
  questionText: string;
  required?: boolean;
  options?: string[];          // For choice types (2-20 options)
  minValue?: number;           // For number type
  maxValue?: number;           // For number type
}
```

**Response (201 Created):**
```typescript
{
  id: string;
  jobId: string;
  category: "evaluative" | "screening" | "logistical";
  answerType: string;
  questionText: string;
  required: boolean;
  orderIndex: number;
  targetSignals: SignalId[] | null;
  expectedAnswer: string | string[] | null;
  failAction: "flag" | "reject" | "allow" | null;
  options: string[] | null;
  minValue: number | null;
  maxValue: number | null;
  createdAt: string;           // ISO timestamp
  updatedAt: string;           // ISO timestamp
}
```

#### GET /v1/jobs/:jobId/custom-questions

List all custom questions for a job.

**Response:**
```typescript
{
  questions: CustomQuestionOutput[];  // Ordered by orderIndex
}
```

#### GET /v1/jobs/:jobId/custom-questions/:qid

Get a specific custom question.

**Response:**
```typescript
CustomQuestionOutput
```

#### PUT /v1/jobs/:jobId/custom-questions/:qid

Update a custom question. All fields optional.

**Request:**
```typescript
{
  category?: "evaluative" | "screening" | "logistical";
  answerType?: string;
  questionText?: string;
  required?: boolean;
  targetSignals?: SignalId[] | null;
  expectedAnswer?: string | string[] | null;
  failAction?: "flag" | "reject" | "allow";
  options?: string[] | null;
  minValue?: number | null;
  maxValue?: number | null;
}
```

**Response:**
```typescript
CustomQuestionOutput
```

#### DELETE /v1/jobs/:jobId/custom-questions/:qid

Delete a custom question.

**Response:**
```typescript
{
  success: true
}
```

#### POST /v1/jobs/:jobId/custom-questions/reorder

Reorder custom questions.

**Request:**
```typescript
{
  questionIds: string[];  // All question IDs in desired order
}
```

**Response:**
```typescript
{
  questions: CustomQuestionOutput[];  // Reordered list
}
```

### 4.3 Public Apply (Updated)

#### GET /public/jobs/:slug

**Response includes (new fields):**
```typescript
{
  // ... existing fields ...

  // Archetype questions (existing)
  questions: Array<{
    archetypeId: string;
    text: string;
    minWords?: number;
  }>;

  // Custom questions (NEW - Phase 8)
  customQuestions: Array<{
    id: string;
    category: "evaluative" | "screening" | "logistical";
    answerType: "free_text" | "yes_no" | "single_choice" | "multiple_choice" | "number" | "date" | "url";
    questionText: string;
    required: boolean;
    orderIndex: number;
    options: string[] | null;
    minValue: number | null;
    maxValue: number | null;
  }>;

  // CV requirement (NEW - Phase 8)
  cvRequired: boolean;
}
```

#### POST /public/jobs/:slug/apply

**Request Body (multipart/form-data):**
- `data`: JSON string containing:
  ```typescript
  {
    email: string;
    name: string;
    preferredName?: string;
    phone?: string;
    answers: Array<{
      archetypeId: string;
      answerText: string;
    }>;
    customAnswers?: Array<{      // NEW - Phase 8
      questionId: string;
      value: string | string[] | number | null;
    }>;
  }
  ```
- `cv`: File (required if cvRequired is true)

### 4.4 Cross-Application Lookup (Phase 8C)

**GET /v1/candidates/by-email?email=john@example.com**

```typescript
{
  email: "john@example.com";
  totalApplications: number;
  applications: Array<{
    id: string;
    jobId: string;
    jobTitle: string;
    appliedAt: string;         // ISO timestamp
    status: string;
    hasCV: boolean;
  }>;
}
```

### 4.5 CV Summary & Reprocessing (Phase 8C)

**GET /v1/applications/:id/cv-summary**

```typescript
{
  extractionStatus: "pending" | "processing" | "completed" | "failed" | "skipped";
  totalYearsExperience: number | null;
  hasManagementExperience: boolean;
  relevanceToJob: "high" | "medium" | "low" | null;
  workExperiences: CVWorkExperience[];
  education: CVEducation[];
  skills: CVSkill[];
  gaps: string[];
  contradictions: Array<{
    claim: string;
    cvEvidence: string;
    severity: "warning" | "info";
  }>;
}
```

**POST /v1/applications/:id/cv/reprocess**

Trigger re-extraction.

```typescript
{
  status: "queued"
}
```

---

## Part 5: Processing Pipeline

### 5.1 Application Submission Flow

```
Candidate submits application
    ↓
Validate required fields (name, email)
    ↓
Check for duplicate application (same email + same job)
    ├── If exists → Reject with "Already applied"
    └── If new → Continue
    ↓
Validate all required questions answered
    ├── Archetype questions (all required)
    ├── Custom questions (based on required flag)
    └── CV (if cvRequired on job)
    ↓
Check screening questions
    ├── Any failures? → Mark application with screening_failed flags
    └── All pass? → Continue
    ↓
Store application + all answers (archetype + custom)
    ↓
Queue for async processing:
    ├── Signal extraction (archetype answers)
    ├── Signal extraction (evaluative custom answers)
    └── CV summarization (if CV provided)
```

### 5.2 Signal Extraction (Custom Evaluative)

Same pipeline as archetype answers:
1. Fetch answer + target signals (from custom_questions.target_signals)
2. LLM extracts signals with confidence
3. Store extraction results in custom_answers.extracted_signals
4. Include in aggregation (same pool as archetype signals)

### 5.3 CV Summarization Pipeline

```
CV file in R2
    ↓
Detect format (PDF/DOCX)
    ↓
Extract text
    ├── PDF: pdf-parse
    └── DOCX: mammoth
    ↓
If no text extracted → mark as "failed" (likely scanned), skip
    ↓
LLM summarization prompt → structured output
    ↓
Parse LLM response:
    ├── Insert work experiences → cv_work_experiences
    ├── Insert education → cv_education
    ├── Insert skills → cv_skills
    └── Update applications (summary fields, raw text)
    ↓
Contradiction detection (compare against answer claims)
    ↓
Store contradictions in applications.cv_contradictions
    ↓
If contradictions found → will affect posture computation
```

### 5.4 Posture Computation (Updated)

**Inputs:**
```typescript
// Existing
- Archetype answer signals
- Conflicts between answers

// New
- Custom evaluative answer signals (same pool)
- CV contradictions (if any)
```

**New posture rule:**
```typescript
{
  id: "CV_CONTRADICTION",
  severity: "warning",  // SOME_UNCERTAINTY
  condition: (input) => input.cvContradictions?.length > 0,
  reason: "CV content doesn't support some answer claims",
  suggestedAction: "Verify the following in interview: {contradictions}"
}
```

---

## Part 6: Implementation Phases

### Phase 8A: Database Schema & Custom Questions Backend ✅ COMPLETED

1. ✅ Created migration for new tables
2. ✅ Added Drizzle schema definitions
3. ✅ Implemented custom questions CRUD (repository, service, routes)
4. ✅ Implemented signal suggestion endpoint
5. ✅ Updated public job endpoint with customQuestions and cvRequired

### Phase 8B: Custom Questions in Apply Flow ✅ COMPLETED

1. ✅ Updated public apply endpoint:
   - Accept customAnswers in request
   - Validate against custom questions (required fields, answer types)
   - Check screening question answers
   - Store custom answers

2. ✅ Implemented screening logic:
   - Check answer against expected
   - Apply fail action (flag/reject/allow)
   - Store screening_passed result
   - Auto-reject if failAction is "reject"

3. ✅ Queue custom evaluative answers for extraction

4. ✅ Updated signal extraction service:
   - Process custom evaluative answers same as archetype
   - Include in aggregation with archetype signals

5. ✅ Added hasScreeningFailure column to applications table

6. ✅ Updated Postman collection with customAnswers example

### Phase 8C: CV Summarization Backend ✅ COMPLETED

1. ✅ Added CV text extraction:
   - `unpdf` for PDF parsing (Workers-compatible)
   - `mammoth` for DOCX parsing
   - Format detection and graceful error handling
   - Created `src/domain/cv/extractor.ts`

2. ✅ Implemented CV summarization LLM:
   - Structured JSON output prompt in `src/domain/cv/summarizer.ts`
   - Extracts work experience, education, skills
   - Computes derived fields (total years, management experience)
   - Gap detection for employment history

3. ✅ Store structured CV data:
   - Repository pattern in `src/domain/cv/repository.ts`
   - Inserts into normalized tables (cv_work_experiences, cv_education, cv_skills)
   - Updates application summary fields (cv_raw_text, cv_summary_json, etc.)

4. ✅ Implemented cross-application lookup endpoint:
   - `GET /v1/candidates/lookup?email=xxx`
   - Returns all applications for a candidate email (scoped to org)
   - Created `src/routes/v1/candidates/lookup.ts`

5. ✅ Added CV summary and reprocess endpoints:
   - `GET /v1/applications/:id/cv/summary` - Get structured CV data
   - `POST /v1/applications/:id/cv/reprocess` - Trigger re-extraction
   - Created `src/routes/v1/applications/cv.ts`

6. ✅ Queue-based CV processing:
   - Added `process_cv` message type to queue
   - CV processing triggered after application submission
   - Consumer processes CV asynchronously

7. ✅ Updated Postman collection with new endpoints

### Phase 8D: Contradiction Detection & Posture Update ✅ COMPLETED

1. ✅ Implemented contradiction detection:
   - Created `src/domain/cv/contradiction-detector.ts` with LLM-based detection
   - Extracts factual claims from answers (titles, tenure, team sizes)
   - Compares against CV structured data
   - Returns contradictions with severity (warning/info)

2. ✅ Updated posture computation:
   - Added `CVContradiction` type to `src/domain/signals/types.ts`
   - Added `cvContradictions` field to `SignalStateResult`
   - Added posture rules in `src/domain/signals/posture.ts`:
     - `MULTIPLE_CV_CONTRADICTIONS` (critical) → HIGH_UNCERTAINTY
     - `CV_CONTRADICTION` (warning) → SOME_UNCERTAINTY
     - `CV_CONTRADICTION_MINOR` (info)
   - Added suggested actions for CV contradictions

3. ✅ Integrated into signal extraction pipeline:
   - Updated `SignalExtractionService` to run contradiction detection
   - Contradiction detection runs after CV processing and signal extraction
   - Results stored in `applications.cv_contradictions` column
   - Contradictions included in posture computation

4. ✅ CV summary endpoint includes contradictions (already in Phase 8C)
5. ✅ CV reprocess endpoint (already in Phase 8C)

---

## Part 7: Testing

### 7.1 Custom Questions Tests
1. Create evaluative question → LLM suggests signals
2. Create screening question with expected answer
3. Create logistical question with options
4. Update question → changes persisted
5. Delete question → cascade to answers
6. Reorder questions → order_index updated

### 7.2 Screening Tests
1. Submit with correct screening answer → passes
2. Submit with wrong screening answer + flag action → application flagged
3. Submit with wrong screening answer + reject action → application rejected
4. Submit with wrong screening answer + allow action → warning stored

### 7.3 Signal Extraction Tests
1. Evaluative custom answer → signals extracted
2. Custom signals aggregated with archetype signals
3. Custom signals affect posture computation

### 7.4 CV Summarization Tests
1. Upload text PDF → summary generated, tables populated
2. Upload DOCX → summary generated
3. Upload scanned PDF → extraction fails gracefully
4. No CV provided (optional job) → extraction skipped

### 7.5 Contradiction Detection Tests
1. Answer claim matches CV → no contradiction
2. Answer claims title not in CV → contradiction flagged
3. Answer claims longer tenure than CV shows → contradiction flagged
4. Contradictions trigger SOME_UNCERTAINTY posture

### 7.6 Cross-Application Tests
1. Same email, different jobs → both applications stored
2. Same email, same job → second application blocked
3. Cross-application lookup returns all applications

### 7.7 Integration Tests
1. Full application with archetype + custom + CV
2. Posture reflects all signal sources
3. Recruiter sees complete picture (signals + CV + contradictions)

---

## Summary

| Component | Affects Posture | Storage | Processing |
|-----------|-----------------|---------|------------|
| Archetype questions (existing) | Yes | `answers` table | Signal extraction |
| Custom evaluative questions | Yes | `custom_answers` table | Signal extraction |
| Screening questions | No (pass/fail) | `custom_answers` table | Immediate check |
| Logistical questions | No | `custom_answers` table | Store only |
| CV summary | Via contradictions | Normalized tables | Async extraction |

**Candidate experience:**
- 3 archetype questions (required)
- N custom questions (recruiter-defined)
- CV upload (optional or required per job)

**Recruiter value:**
- Role-specific questions beyond archetypes
- Hard requirement filtering (screening)
- Planning data (logistical)
- Structured CV data in consistent UI
- Cross-application candidate visibility
- Automatic contradiction detection
