# Phase 1: Signal Extraction Service

**Repository:** `zehire-be`

## Context

Zehire is a hiring platform with a signal-first approach. We have an existing archetype system that:

1. Infers JobContext from job postings (LLM)
2. Resolves archetypes based on JobContext (rule-based) - **now capped at 3 questions**
3. Renders context questions designed to extract specific signals (LLM)

The archetype system lives in: `src/domain/jobs/archetypes/`

Key existing types from `src/domain/jobs/archetypes/types.ts`:

- `SignalId`: 10 signal types (decision_under_uncertainty, tradeoff_awareness, risk_reasoning, ethical_awareness, technical_depth, system_thinking, communication_clarity, stakeholder_management, accountability, learning_from_failure)
- `JobContext`: Inferred job characteristics including `primarySignals: SignalId[]`
- `RenderedQuestion`: Generated question with `signals: SignalId[]` indicating what signals it extracts

### Important: All Required + Smart Design

This phase assumes the "All Required" design from Phase 0A:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DESIGN ASSUMPTIONS                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. ALL 3 ANSWERS ALWAYS PRESENT                                           │
│     └── Phase 0A enforces all questions answered before submission         │
│     └── No need to handle missing answers                                  │
│     └── extraction_status = 'skipped' is NOT used in normal flow           │
│                                                                             │
│  2. CRITICAL SIGNALS ALWAYS PROBED                                         │
│     └── Phase 0 ensures critical archetypes are selected                   │
│     └── decision_under_uncertainty, accountability, learning_from_failure   │
│     └── These signals will always have questions                           │
│                                                                             │
│  3. SIGNAL "MISSING" MEANS NOT DETECTED, NOT NOT ASKED                     │
│     └── If a signal is "missing" in posture computation, it means:         │
│         • The question was asked (archetype included)                      │
│         • The answer was provided (all required)                           │
│         • But the LLM didn't detect the signal in the answer               │
│     └── This is valuable information: candidate didn't demonstrate signal  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Your Task

Create a new signal extraction module that analyzes candidate answers and extracts signals. This is the missing bridge between "questions asked" and "decision posture computed."

**Note:** The database migration is now in Phase 0A. This phase focuses on the signal extraction logic.

---

## 1. Create Database Migration

Create `migrations/0011_applications.sql`:

```sql
-- Migration: 0011_applications
-- Description: Create applications and answers tables for candidate tracking
-- Created: 2024-01-12

-- Applications table: candidates applying to jobs
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY NOT NULL,  -- nanoid
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- Candidate info (no separate candidates table for now)
  candidate_email TEXT NOT NULL,
  candidate_name TEXT,

  -- Application status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'screening', 'assessment', 'interview', 'offer', 'rejected', 'withdrawn')),

  -- Signal extraction status (like jobs.questions_status)
  signals_status TEXT NOT NULL DEFAULT 'none'
    CHECK (signals_status IN ('none', 'pending', 'processing', 'completed', 'failed')),

  -- Aggregated signal evaluations (JSON, computed after all answers evaluated)
  signal_evaluations TEXT,  -- JSON: SignalEvaluationResult

  -- Decision posture (computed from signal_evaluations)
  decision_posture TEXT,  -- JSON: PostureResult

  -- Error tracking
  signals_error_message TEXT,
  signals_error_code TEXT,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  signals_computed_at TEXT
);

-- Answers table: candidate responses to questions
CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY NOT NULL,  -- nanoid
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,

  -- Link to the question (archetype-based)
  archetype_id TEXT NOT NULL,  -- References the archetype that generated the question
  question_text TEXT NOT NULL,  -- Snapshot of the rendered question

  -- Candidate's answer
  answer_text TEXT,  -- NULL if not answered yet

  -- Individual signal extraction for this answer (JSON)
  extracted_signals TEXT,  -- JSON: ExtractedSignal[]
  extraction_status TEXT NOT NULL DEFAULT 'none'
    CHECK (extraction_status IN ('none', 'pending', 'processing', 'completed', 'failed', 'skipped')),

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  answered_at TEXT,
  extracted_at TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_signals_status ON applications(signals_status);
CREATE INDEX IF NOT EXISTS idx_answers_application_id ON answers(application_id);
CREATE INDEX IF NOT EXISTS idx_answers_extraction_status ON answers(extraction_status);

-- Unique constraint: one answer per question per application
CREATE UNIQUE INDEX IF NOT EXISTS idx_answers_unique ON answers(application_id, archetype_id);

-- Trigger for applications.updated_at
CREATE TRIGGER IF NOT EXISTS trg_applications_updated_at
  AFTER UPDATE ON applications
  FOR EACH ROW
  WHEN OLD.updated_at = NEW.updated_at
BEGIN
  UPDATE applications SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE id = NEW.id;
END;

-- Trigger for answers.updated_at
CREATE TRIGGER IF NOT EXISTS trg_answers_updated_at
  AFTER UPDATE ON answers
  FOR EACH ROW
  WHEN OLD.updated_at = NEW.updated_at
BEGIN
  UPDATE answers SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE id = NEW.id;
END;
```

---

## 2. Create Signal Extraction Types

Create `src/domain/signals/types.ts`:

```typescript
import type { SignalId } from "../jobs/archetypes/types";

/**
 * Confidence level for extracted signals.
 * - "clear": Signal is clearly demonstrated with specific examples
 * - "partial": Signal is somewhat present but lacks depth or specificity
 * - "absent": Signal is clearly not demonstrated despite opportunity
 * - "unclear": Cannot determine from the answer (ambiguous, off-topic, etc.)
 */
export type SignalConfidence = "clear" | "partial" | "absent" | "unclear";

/**
 * Response quality assessment.
 */
export type ResponseQuality = "substantial" | "minimal" | "empty" | "off_topic";

/**
 * A single signal extracted from one answer.
 */
export interface ExtractedSignal {
  signalId: SignalId;
  confidence: SignalConfidence;
  evidence?: string;  // Brief quote or summary from answer
  reasoning?: string; // Why this confidence level
}

/**
 * Result of extracting signals from a single answer.
 */
export interface AnswerExtractionResult {
  answerId: string;
  archetypeId: string;
  responseQuality: ResponseQuality;
  signals: ExtractedSignal[];
  extractedAt: string;
}

/**
 * Aggregated signal state across all answers for an application.
 */
export interface AggregatedSignalState {
  /** Signals with at least one "clear" evaluation */
  present: SignalId[];

  /** Signals with "partial" but no "clear" */
  partial: SignalId[];

  /** Signals that were targeted but only got "absent" or "unclear" */
  missing: SignalId[];

  /** Signals that were never targeted by any question (not missing, just not asked) */
  notAsked: SignalId[];

  /** Per-signal detail for transparency */
  details: Record<string, {
    bestConfidence: SignalConfidence;
    evaluationCount: number;
    evidence: string[];
  }>;
}

/**
 * Input for signal extraction.
 */
export interface SignalExtractionInput {
  /** The question that was asked */
  questionText: string;

  /** The archetype that generated this question */
  archetypeId: string;

  /** Signals this question was designed to extract */
  targetSignals: SignalId[];

  /** Candidate's answer */
  answerText: string;

  /** Job context for calibration */
  jobContext: {
    domain: string;
    experienceLevel: string;
    riskLevel: string;
  };
}
```

---

## 3. Create Signal Extraction LLM Service

Create `src/domain/signals/extractor.ts`:

Build an LLM-powered signal extractor with:

### System Prompt Requirements

The system prompt must:

1. **Explain what signals are** (not scores, not rankings)
2. **Define each confidence level precisely:**
   - `clear`: Candidate provides specific, detailed examples that clearly demonstrate the signal
   - `partial`: Candidate touches on the signal but lacks specificity, depth, or concrete examples
   - `absent`: Candidate had opportunity to demonstrate but did not (despite relevant question)
   - `unclear`: Cannot determine - answer is off-topic, too vague, or doesn't address the signal
3. **Instruct to look for specific behaviors/examples, not just keywords**
4. **Emphasize extracting evidence quotes** from the actual answer
5. **Warn against inferring signals that aren't demonstrated**
6. **Calibrate expectations based on experience level** (entry vs senior)

### User Prompt Builder

Include:

- The question asked
- Target signals with their descriptions (use SIGNAL_METADATA from types.ts)
- The candidate's answer
- Job context for calibration

### Response Format

```typescript
interface LLMExtractionResponse {
  responseQuality: "substantial" | "minimal" | "empty" | "off_topic";
  signals: Array<{
    signalId: string;
    confidence: "clear" | "partial" | "absent" | "unclear";
    evidence?: string;
    reasoning?: string;
  }>;
}
```

### Key Function

```typescript
export async function extractSignalsFromAnswer(
  client: LLMClient,
  input: SignalExtractionInput,
  options?: { maxRetries?: number }
): Promise<AnswerExtractionResult>
```

### Implementation Notes

- Temperature: 0 for consistency
- Evaluate ONLY the target signals (don't invent signals not asked about)
- Evidence must be actual quotes or close paraphrases from answer
- Empty/very short answers → responseQuality: "empty", all signals: "unclear"
- Off-topic answers → responseQuality: "off_topic", relevant signals: "unclear"
- Include retry logic similar to `renderQuestion()` in the archetypes module

---

## 4. Create Batch Extraction

Add `extractSignalsForApplication()` function:

```typescript
export async function extractSignalsForApplication(
  client: LLMClient,
  applicationId: string,
  options?: {
    parallel?: boolean;  // Default false for rate limits
    maxRetries?: number;
  }
): Promise<AnswerExtractionResult[]>
```

This function:

1. Fetches all answers for the application from DB
2. Fetches the job to get JobContext
3. For each answer with answer_text:
   - Get the archetype to find target signals
   - Call `extractSignalsFromAnswer()`
   - Update the answer record with extracted_signals
4. Skip answers without answer_text (extraction_status = 'skipped')
5. Return all extraction results

---

## 5. Create Repository

Create `src/domain/signals/repository.ts`:

```typescript
export class SignalsRepository {
  constructor(private db: D1Database) {}

  // Applications
  async createApplication(data: CreateApplicationInput): Promise<Application>
  async getApplication(id: string): Promise<Application | null>
  async getApplicationWithAnswers(id: string): Promise<ApplicationWithAnswers | null>
  async updateApplicationSignalsStatus(id: string, status: string): Promise<void>
  async saveSignalEvaluations(id: string, evaluations: object): Promise<void>

  // Answers
  async createAnswer(data: CreateAnswerInput): Promise<Answer>
  async getAnswersByApplication(applicationId: string): Promise<Answer[]>
  async updateAnswerText(id: string, answerText: string): Promise<void>
  async saveExtractedSignals(id: string, signals: ExtractedSignal[]): Promise<void>
  async updateExtractionStatus(id: string, status: string): Promise<void>
}
```

---

## 6. Create Index Exports

Create `src/domain/signals/index.ts`:

```typescript
// Types
export type {
  SignalConfidence,
  ResponseQuality,
  ExtractedSignal,
  AnswerExtractionResult,
  AggregatedSignalState,
  SignalExtractionInput,
} from "./types";

// Extractor
export {
  SIGNAL_EXTRACTION_SYSTEM_PROMPT,
  buildExtractionPrompt,
  extractSignalsFromAnswer,
  extractSignalsForApplication,
} from "./extractor";

// Repository
export { SignalsRepository } from "./repository";
```

---

## File Structure

```
src/domain/signals/
├── index.ts           # Exports
├── types.ts           # Type definitions
├── extractor.ts       # LLM signal extraction
└── repository.ts      # DB operations for applications/answers
```

---

## Important Constraints

1. **Follow the same patterns as `src/domain/jobs/archetypes/`:**
   - Same LLMClient interface
   - Same error handling patterns
   - Same validation approach

2. **Signals are contextual, not absolute:**
   - "clear" for entry-level might be different than "clear" for senior
   - Use jobContext.experienceLevel in the prompt

3. **Do NOT score or rank:**
   - We extract signals, we don't judge candidates
   - "absent" is not "bad" — it's information

4. **Preserve evidence:**
   - Always include quotes from the answer
   - This enables transparency in the UI later

---

## Testing Guidance

Create example inputs/outputs for:

1. A substantial answer with clear signals
2. A minimal answer with partial signals
3. An empty answer
4. An off-topic answer
5. An answer that demonstrates some signals but not others

---

## Example LLM Prompt Structure

```
System: You are a signal extraction system for Zehire...

User:
## Question Asked
{questionText}

## Target Signals to Evaluate
1. decision_under_uncertainty: How a candidate makes decisions when information is incomplete
2. tradeoff_awareness: Explicit reasoning about competing priorities and constraints

## Candidate's Answer
{answerText}

## Job Context
- Domain: technology
- Experience Level: senior
- Risk Level: medium

## Instructions
Evaluate ONLY the target signals listed above...

## Output Format
Return JSON:
{
  "responseQuality": "substantial",
  "signals": [
    {
      "signalId": "decision_under_uncertainty",
      "confidence": "clear",
      "evidence": "Candidate stated: 'I had to decide without full data...'",
      "reasoning": "Provided specific example with clear decision-making process"
    }
  ]
}
```
