# Phase 2: Signal Aggregation & Conflict Detection Rules

**Repository:** `zehire-be`

## Context

Phase 1 created the signal extraction service that produces `ExtractedSignal[]` per answer. Now we need to:

1. Aggregate signals across multiple answers into a unified view
2. Detect signal conflicts
3. Identify critical vs optional signal gaps

The existing types are in `src/domain/signals/types.ts`.

---

## Your Task

### 1. Extend Types

Add to `src/domain/signals/types.ts`:

```typescript
/**
 * A detected conflict between signals.
 */
export interface SignalConflict {
  /** The two signals that conflict */
  signals: [SignalId, SignalId];

  /** Why they conflict */
  reason: string;

  /** Evidence from answers showing the conflict */
  evidence: {
    signal1: { answerId: string; quote: string };
    signal2: { answerId: string; quote: string };
  };
}

/**
 * Critical signal analysis.
 */
export interface CriticalSignalAnalysis {
  /** Primary signals for this job (from JobContext) */
  criticalSignals: SignalId[];

  /** Which critical signals are clearly present */
  satisfied: SignalId[];

  /** Which critical signals are missing or unclear */
  gaps: Array<{
    signalId: SignalId;
    status: "missing" | "partial" | "unclear";
    wasAsked: boolean;  // Was there a question targeting this?
  }>;

  /** Overall: is there a critical gap? */
  hasCriticalGap: boolean;
}

/**
 * Complete signal state for an application.
 */
export interface SignalStateResult {
  aggregated: AggregatedSignalState;
  criticalAnalysis: CriticalSignalAnalysis;
  conflicts: SignalConflict[];
  computedAt: string;
}
```

---

### 2. Create Aggregation Service

Create `src/domain/signals/aggregator.ts`:

#### Function: `aggregateSignals()`

```typescript
interface AggregateSignalsInput {
  extractions: AnswerExtractionResult[];
  allSignalIds: SignalId[];  // All 10 possible signals
}

export function aggregateSignals(input: AggregateSignalsInput): AggregatedSignalState
```

**Aggregation Rules:**

1. For each signal, find all evaluations across all answers
2. **Best confidence wins:** clear > partial > absent > unclear
3. If a signal was never targeted by any question, it goes in `notAsked`
4. Collect all evidence for each signal into the `details` map

**Example:**

```typescript
// If accountability was evaluated in 2 answers:
// Answer 1: confidence: "partial", evidence: "mentioned ownership"
// Answer 2: confidence: "clear", evidence: "took full responsibility for..."

// Result:
details["accountability"] = {
  bestConfidence: "clear",  // Best wins
  evaluationCount: 2,
  evidence: ["mentioned ownership", "took full responsibility for..."]
}
// accountability goes into `present` array (because bestConfidence is "clear")
```

---

#### Function: `analyzeCriticalSignals()`

```typescript
interface AnalyzeCriticalSignalsInput {
  aggregatedState: AggregatedSignalState;
  primarySignals: SignalId[];  // From JobContext
}

export function analyzeCriticalSignals(input: AnalyzeCriticalSignalsInput): CriticalSignalAnalysis
```

**Rules:**

1. `primarySignals` from JobContext are the "critical" signals for this job
2. A critical signal is **"satisfied"** if it's in `present` (clear confidence)
3. A critical signal is a **"gap"** if:
   - It's in `missing` (was asked, got absent/unclear) → status: "missing"
   - It's in `partial` (was asked, got partial) → status: "partial"
   - It's in `notAsked` (wasn't even asked) → status: "unclear", wasAsked: false
4. `hasCriticalGap = gaps.length > 0`

---

### 3. Create Conflict Detection

Create conflict detection logic. You have two options:

#### Option A: Rule-Based (Recommended for Speed)

```typescript
export function detectConflicts(
  extractions: AnswerExtractionResult[]
): SignalConflict[]
```

**Define conflict patterns to detect:**

1. **Accountability vs Learning from Failure contradiction:**
   - Claims strong accountability BUT evidence shows blame-shifting
   - Or vice versa: claims learning from failure BUT evidence shows no ownership

2. **Communication Clarity vs Evidence quality:**
   - Claims communication clarity BUT answer itself is unclear/rambling

3. **Decision Under Uncertainty vs Risk Reasoning:**
   - Claims decisive action BUT shows no risk assessment
   - Or: paralyzed by analysis in risk-reasoning answer BUT claimed quick decisions elsewhere

4. **Stakeholder Management vs Accountability:**
   - Blames stakeholders for failures (poor accountability)
   - BUT claims good stakeholder management

**Implementation approach:**

- This is heuristic-based, not LLM-based (for speed and consistency)
- Look for contradictions in evidence across answers
- Only flag conflicts if both signals are "clear" or "partial" with contradictory evidence
- Be conservative — false positives are worse than missed conflicts

#### Option B: LLM-Based (More Nuanced)

If rule-based is too limited:

```typescript
export async function detectConflictsWithLLM(
  client: LLMClient,
  extractions: AnswerExtractionResult[]
): Promise<SignalConflict[]>
```

- Single LLM call with all answer extractions
- Ask: "Are there any contradictions in how this candidate presents themselves?"
- Return structured conflicts

**I recommend starting with Option A (rule-based) and adding Option B later if needed.**

---

### 4. Create Full Aggregation Pipeline

Create the main function that orchestrates everything:

```typescript
interface ComputeSignalStateInput {
  applicationId: string;
  extractions: AnswerExtractionResult[];
  jobContext: JobContext;
}

export async function computeSignalState(
  input: ComputeSignalStateInput
): Promise<SignalStateResult> {
  const { extractions, jobContext } = input;

  // 1. Get all possible signal IDs
  const allSignalIds = SIGNAL_IDS; // From types.ts

  // 2. Aggregate signals across all answers
  const aggregated = aggregateSignals({
    extractions,
    allSignalIds,
  });

  // 3. Analyze critical signal gaps
  const criticalAnalysis = analyzeCriticalSignals({
    aggregatedState: aggregated,
    primarySignals: jobContext.primarySignals,
  });

  // 4. Detect conflicts
  const conflicts = detectConflicts(extractions);

  return {
    aggregated,
    criticalAnalysis,
    conflicts,
    computedAt: new Date().toISOString(),
  };
}
```

---

### 5. Update Repository

Add to `src/domain/signals/repository.ts`:

```typescript
// Save computed signal state
async saveSignalState(applicationId: string, signalState: SignalStateResult): Promise<void> {
  await this.db.prepare(`
    UPDATE applications
    SET signal_evaluations = ?,
        signals_status = 'completed',
        signals_computed_at = ?
    WHERE id = ?
  `).bind(
    JSON.stringify(signalState),
    signalState.computedAt,
    applicationId
  ).run();
}

// Retrieve parsed signal state
async getSignalState(applicationId: string): Promise<SignalStateResult | null> {
  const result = await this.db.prepare(`
    SELECT signal_evaluations FROM applications WHERE id = ?
  `).bind(applicationId).first<{ signal_evaluations: string | null }>();

  if (!result?.signal_evaluations) return null;
  return JSON.parse(result.signal_evaluations);
}
```

---

### 6. Update Exports

Add to `src/domain/signals/index.ts`:

```typescript
// Types
export type {
  SignalConflict,
  CriticalSignalAnalysis,
  SignalStateResult,
} from "./types";

// Aggregator
export {
  aggregateSignals,
  analyzeCriticalSignals,
  detectConflicts,
  computeSignalState,
} from "./aggregator";
```

---

## File Structure After Phase 2

```
src/domain/signals/
├── index.ts           # Exports (updated)
├── types.ts           # Type definitions (extended)
├── extractor.ts       # LLM signal extraction (from Phase 1)
├── aggregator.ts      # NEW: Aggregation & conflict detection
└── repository.ts      # DB operations (updated)
```

---

## Important Design Decisions

### 1. Conflict Detection Should Be Conservative

- Only flag clear contradictions
- "Absence of evidence" is not evidence of conflict
- When in doubt, don't flag a conflict
- A few missed conflicts is better than false positives

### 2. Critical Signals Come From JobContext

- The job posting inference already determined `primarySignals`
- We use that as the definition of "critical"
- Don't invent new criticality rules

### 3. Partial Signals Are Gaps

- A hiring manager might want to probe further
- "Partial" for a critical signal = uncertainty worth noting

### 4. notAsked Is Informational

- Signals in `notAsked` weren't targeted by questions
- This might indicate question selection could be improved
- But it's not a candidate gap — we didn't ask

---

## Testing Guidance

Create test cases for:

1. **All critical signals satisfied (no gaps)**
   - All primarySignals are in `present`
   - Result: `hasCriticalGap = false`

2. **One critical signal missing (gap detected)**
   - One primarySignal is in `missing`
   - Result: `hasCriticalGap = true`, gap with status: "missing"

3. **Critical signal with partial confidence (gap detected)**
   - One primarySignal is in `partial`
   - Result: `hasCriticalGap = true`, gap with status: "partial"

4. **Clear conflict between two answers**
   - Contradictory evidence for related signals
   - Result: One SignalConflict in array

5. **Edge case: no answers at all (all signals unclear)**
   - All extractions have responseQuality: "empty"
   - Result: All signals in `missing` or `notAsked`

6. **Edge case: candidate only answered some questions**
   - Mix of answered and unanswered
   - Result: Correctly categorize based on available data

---

## Confidence Level Priority

For aggregation, use this priority order:

```typescript
const CONFIDENCE_PRIORITY: Record<SignalConfidence, number> = {
  clear: 4,    // Highest
  partial: 3,
  absent: 2,
  unclear: 1,  // Lowest
};

function getBestConfidence(confidences: SignalConfidence[]): SignalConfidence {
  return confidences.reduce((best, current) =>
    CONFIDENCE_PRIORITY[current] > CONFIDENCE_PRIORITY[best] ? current : best
  );
}
```

---

## Example Output

```typescript
const signalState: SignalStateResult = {
  aggregated: {
    present: ["decision_under_uncertainty", "accountability"],
    partial: ["tradeoff_awareness"],
    missing: ["risk_reasoning"],
    notAsked: ["ethical_awareness", "technical_depth", ...],
    details: {
      "decision_under_uncertainty": {
        bestConfidence: "clear",
        evaluationCount: 2,
        evidence: ["Quote from answer 1", "Quote from answer 2"]
      },
      // ... more details
    }
  },
  criticalAnalysis: {
    criticalSignals: ["decision_under_uncertainty", "risk_reasoning", "accountability"],
    satisfied: ["decision_under_uncertainty", "accountability"],
    gaps: [
      { signalId: "risk_reasoning", status: "missing", wasAsked: true }
    ],
    hasCriticalGap: true
  },
  conflicts: [],
  computedAt: "2024-01-12T10:30:00Z"
};
```
