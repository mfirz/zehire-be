# Phase 3: Posture Computation

**Repository:** `zehire-be`

## Context

We have:

- **Phase 0:** Question generation (3 questions max, critical signals covered)
- **Phase 0A:** Public apply (all 3 answers required)
- **Phase 1:** Signal extraction from answers → `ExtractedSignal[]`
- **Phase 2:** Aggregation & conflicts → `SignalStateResult`

Now we need formal rules to compute `DecisionPosture` from signal state.

The frontend expects these posture values:

```typescript
type DecisionPosture = "LOW_REGRET_RISK" | "SOME_UNCERTAINTY" | "HIGH_UNCERTAINTY";
```

### Important: "Missing" Signal Semantics

With the "All Required + Smart Design" approach:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  WHEN missingCritical TRIGGERS                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  In our design, "missing" means:                                           │
│                                                                             │
│  ✅ Question WAS asked (archetype always included for critical signals)     │
│  ✅ Answer WAS provided (all 3 required before submission)                  │
│  ❌ Signal NOT detected by LLM (answer didn't demonstrate it)               │
│                                                                             │
│  This is VALUABLE INFORMATION:                                              │
│  "Candidate had the opportunity to demonstrate this signal but didn't"      │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Example:                                                                   │
│                                                                             │
│  Question: "Tell us about a time you took ownership of a difficult project" │
│  Answer: "My team worked on a project. We followed the manager's plan."     │
│                                                                             │
│  Signal extraction result:                                                  │
│  - accountability: NOT DETECTED (answer shows following, not owning)        │
│                                                                             │
│  Posture impact:                                                            │
│  - accountability is "missing" → SOME_UNCERTAINTY or HIGH_UNCERTAINTY       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Your Task

### 1. Add Posture Types

Add to `src/domain/signals/types.ts`:

```typescript
/**
 * Decision posture levels.
 * Must match frontend DecisionPosture enum exactly.
 */
export type DecisionPosture = "LOW_REGRET_RISK" | "SOME_UNCERTAINTY" | "HIGH_UNCERTAINTY";

/**
 * Severity of a posture reason.
 */
export type ReasonSeverity = "info" | "warning" | "critical";

/**
 * A reason contributing to the posture decision.
 */
export interface PostureReason {
  code: string;        // Machine-readable code
  message: string;     // Human-readable message
  severity: ReasonSeverity;
}

/**
 * Complete posture computation result.
 */
export interface PostureResult {
  posture: DecisionPosture;

  /** Primary reason for this posture (shown prominently in UI) */
  primaryReason: string;

  /** All contributing reasons */
  reasons: PostureReason[];

  /** Signal state that led to this posture */
  signalState: SignalStateResult;

  /** Suggested actions for the hiring manager */
  suggestedActions: string[];

  computedAt: string;
}
```

---

### 2. Create Posture Computation Service

Create `src/domain/signals/posture.ts`:

#### Define the Rules

```typescript
import type {
  SignalStateResult,
  PostureResult,
  PostureReason,
  DecisionPosture,
} from "./types";

/**
 * Rule definition for posture computation.
 */
interface PostureRule {
  code: string;
  check: (state: SignalStateResult) => boolean;
  message: string;
  severity: "info" | "warning" | "critical";
}

/**
 * HIGH_UNCERTAINTY triggers (any of these → HIGH)
 */
const HIGH_UNCERTAINTY_RULES: PostureRule[] = [
  {
    code: "NO_RESPONSES",
    check: (state) => {
      // All answers were empty
      const details = Object.values(state.aggregated.details);
      return details.length === 0 || details.every(d => d.evaluationCount === 0);
    },
    message: "Candidate did not respond to any questions",
    severity: "critical",
  },
  {
    code: "MAJORITY_CRITICAL_MISSING",
    check: (state) => {
      const { gaps, criticalSignals } = state.criticalAnalysis;
      const missingCount = gaps.filter(g => g.status === "missing").length;
      return missingCount > criticalSignals.length / 2;
    },
    message: "Majority of critical signals are not demonstrated",
    severity: "critical",
  },
  {
    code: "MULTIPLE_CONFLICTS",
    check: (state) => state.conflicts.length >= 2,
    message: "Multiple contradictions detected in responses",
    severity: "critical",
  },
  {
    code: "ALL_SIGNALS_UNCLEAR",
    check: (state) => {
      const { present, partial } = state.aggregated;
      return present.length === 0 && partial.length === 0;
    },
    message: "No signals could be evaluated from responses",
    severity: "critical",
  },
];

/**
 * SOME_UNCERTAINTY triggers (any of these → SOME, if not already HIGH)
 */
const SOME_UNCERTAINTY_RULES: PostureRule[] = [
  {
    code: "CRITICAL_GAP",
    check: (state) => state.criticalAnalysis.hasCriticalGap,
    message: "Some critical signals are missing or unclear",
    severity: "warning",
  },
  {
    code: "SIGNAL_CONFLICT",
    check: (state) => state.conflicts.length === 1,
    message: "One contradiction detected in responses",
    severity: "warning",
  },
  {
    code: "MOSTLY_PARTIAL",
    check: (state) => {
      const { present, partial } = state.aggregated;
      return partial.length > present.length && partial.length > 0;
    },
    message: "Most signals are only partially demonstrated",
    severity: "warning",
  },
  {
    code: "CRITICAL_ONLY_PARTIAL",
    check: (state) => {
      const { gaps } = state.criticalAnalysis;
      return gaps.some(g => g.status === "partial");
    },
    message: "Some critical signals lack depth or specificity",
    severity: "info",
  },
];

/**
 * LOW_REGRET_RISK check (default if no other rules triggered)
 */
const LOW_REGRET_RISK_REASON: PostureReason = {
  code: "SIGNALS_SATISFIED",
  message: "Critical signals are clearly demonstrated",
  severity: "info",
};
```

#### Implement `computePosture()`

```typescript
/**
 * Compute decision posture from signal state.
 */
export function computePosture(signalState: SignalStateResult): PostureResult {
  const reasons: PostureReason[] = [];
  let posture: DecisionPosture = "LOW_REGRET_RISK";

  // Check HIGH_UNCERTAINTY rules first (highest priority)
  for (const rule of HIGH_UNCERTAINTY_RULES) {
    if (rule.check(signalState)) {
      reasons.push({
        code: rule.code,
        message: rule.message,
        severity: rule.severity,
      });
    }
  }

  // If any critical reason found → HIGH_UNCERTAINTY
  if (reasons.some(r => r.severity === "critical")) {
    posture = "HIGH_UNCERTAINTY";
  } else {
    // Check SOME_UNCERTAINTY rules
    for (const rule of SOME_UNCERTAINTY_RULES) {
      if (rule.check(signalState)) {
        reasons.push({
          code: rule.code,
          message: rule.message,
          severity: rule.severity,
        });
      }
    }

    // If any warning reason found → SOME_UNCERTAINTY
    if (reasons.some(r => r.severity === "warning")) {
      posture = "SOME_UNCERTAINTY";
    }
  }

  // If no reasons yet, it's LOW_REGRET_RISK
  if (reasons.length === 0) {
    reasons.push(LOW_REGRET_RISK_REASON);
  }

  // Generate suggested actions based on posture and reasons
  const suggestedActions = generateSuggestedActions(posture, reasons, signalState);

  return {
    posture,
    primaryReason: reasons[0].message,
    reasons,
    signalState,
    suggestedActions,
    computedAt: new Date().toISOString(),
  };
}
```

#### Implement `generateSuggestedActions()`

```typescript
/**
 * Generate suggested actions based on posture and reasons.
 */
function generateSuggestedActions(
  posture: DecisionPosture,
  reasons: PostureReason[],
  signalState: SignalStateResult
): string[] {
  const actions: string[] = [];
  const reasonCodes = new Set(reasons.map(r => r.code));

  if (reasonCodes.has("NO_RESPONSES")) {
    actions.push("Follow up with candidate to complete the application");
    return actions; // No other actions make sense
  }

  if (reasonCodes.has("CRITICAL_GAP") || reasonCodes.has("MAJORITY_CRITICAL_MISSING")) {
    const missingSignals = signalState.criticalAnalysis.gaps
      .filter(g => g.status === "missing")
      .map(g => g.signalId);

    if (missingSignals.length > 0) {
      actions.push(`Probe these areas in interview: ${formatSignalList(missingSignals)}`);
    }
  }

  if (reasonCodes.has("CRITICAL_ONLY_PARTIAL")) {
    const partialSignals = signalState.criticalAnalysis.gaps
      .filter(g => g.status === "partial")
      .map(g => g.signalId);

    if (partialSignals.length > 0) {
      actions.push(`Ask for specific examples about: ${formatSignalList(partialSignals)}`);
    }
  }

  if (reasonCodes.has("SIGNAL_CONFLICT") || reasonCodes.has("MULTIPLE_CONFLICTS")) {
    actions.push("Review conflicting responses and explore in interview");
  }

  if (reasonCodes.has("MOSTLY_PARTIAL")) {
    actions.push("Responses were brief; interview can explore depth");
  }

  // Default action for uncertainty
  if (posture !== "LOW_REGRET_RISK" && actions.length === 0) {
    actions.push("Consider scheduling an interview to clarify uncertainties");
  }

  return actions;
}

/**
 * Format signal list for display.
 */
function formatSignalList(signals: SignalId[]): string {
  return signals
    .map(s => SIGNAL_METADATA[s]?.label ?? s)
    .join(", ");
}
```

---

### 3. Create API Endpoint

Create `src/routes/v1/applications/posture.ts`:

```typescript
import { Hono } from "hono";
import { jwtAuth } from "../../../middleware/auth";
import { SignalsRepository } from "../../../domain/signals";
import type { Env, AuthVariables } from "../../../types/bindings";

const postureRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

postureRoute.use("/*", jwtAuth);

/**
 * GET /v1/applications/:applicationId/posture
 *
 * Returns the decision posture for an application.
 */
postureRoute.get("/:applicationId/posture", async (c) => {
  const { applicationId } = c.req.param();
  const repository = new SignalsRepository(c.env.DB);

  // Get application
  const application = await repository.getApplication(applicationId);
  if (!application) {
    return c.json({ error: "Application not found" }, 404);
  }

  // Check if posture is computed
  if (application.signals_status === "none") {
    return c.json({
      status: "not_started",
      message: "Signal extraction has not started"
    }, 202);
  }

  if (application.signals_status === "pending" || application.signals_status === "processing") {
    return c.json({
      status: application.signals_status,
      message: "Signal extraction in progress"
    }, 202);
  }

  if (application.signals_status === "failed") {
    return c.json({
      status: "failed",
      error: application.signals_error_message,
      code: application.signals_error_code
    }, 500);
  }

  // Get computed posture
  const posture = await repository.getPostureResult(applicationId);
  if (!posture) {
    return c.json({ error: "Posture not found" }, 404);
  }

  // Format response for frontend
  return c.json({
    posture: posture.posture,
    primaryReason: posture.primaryReason,
    reasons: posture.reasons,
    signals: {
      present: posture.signalState.aggregated.present,
      partial: posture.signalState.aggregated.partial,
      missing: posture.signalState.aggregated.missing,
      criticalGaps: posture.signalState.criticalAnalysis.gaps.map(g => g.signalId),
    },
    conflicts: posture.signalState.conflicts.map(c => ({
      signals: c.signals,
      reason: c.reason,
    })),
    suggestedActions: posture.suggestedActions,
  });
});

export default postureRoute;
```

---

### 4. Create Full Pipeline Function

Create `src/domain/signals/pipeline.ts`:

```typescript
import type { LLMClient } from "../jobs/archetypes";
import { extractSignalsForApplication } from "./extractor";
import { computeSignalState } from "./aggregator";
import { computePosture } from "./posture";
import { SignalsRepository } from "./repository";
import type { PostureResult } from "./types";

interface EvaluateApplicationInput {
  applicationId: string;
  db: D1Database;
  client: LLMClient;
}

/**
 * Full pipeline: Extract signals → Aggregate → Compute posture
 */
export async function evaluateApplication(
  input: EvaluateApplicationInput
): Promise<PostureResult> {
  const { applicationId, db, client } = input;
  const repository = new SignalsRepository(db);

  try {
    // Update status to processing
    await repository.updateApplicationSignalsStatus(applicationId, "processing");

    // 1. Get application with job context
    const application = await repository.getApplicationWithAnswers(applicationId);
    if (!application) {
      throw new Error("Application not found");
    }

    const job = await getJob(db, application.jobId);
    const jobContext = JSON.parse(job.job_context);

    // 2. Extract signals from each answer
    const extractions = await extractSignalsForApplication(client, applicationId, {
      parallel: false, // Sequential for rate limits
    });

    // 3. Compute signal state (aggregate + conflicts)
    const signalState = await computeSignalState({
      applicationId,
      extractions,
      jobContext,
    });

    // 4. Compute posture
    const posture = computePosture(signalState);

    // 5. Save to database
    await repository.savePostureResult(applicationId, posture);

    return posture;

  } catch (error) {
    // Mark as failed
    await repository.updateApplicationSignalsStatus(applicationId, "failed");
    await repository.saveSignalsError(applicationId, {
      message: error instanceof Error ? error.message : "Unknown error",
      code: "EVALUATION_FAILED",
    });
    throw error;
  }
}
```

---

### 5. Update Repository

Add to `src/domain/signals/repository.ts`:

```typescript
// Save posture result
async savePostureResult(applicationId: string, posture: PostureResult): Promise<void> {
  await this.db.prepare(`
    UPDATE applications
    SET decision_posture = ?,
        signal_evaluations = ?,
        signals_status = 'completed',
        signals_computed_at = ?
    WHERE id = ?
  `).bind(
    JSON.stringify(posture),
    JSON.stringify(posture.signalState),
    posture.computedAt,
    applicationId
  ).run();
}

// Retrieve posture result
async getPostureResult(applicationId: string): Promise<PostureResult | null> {
  const result = await this.db.prepare(`
    SELECT decision_posture FROM applications WHERE id = ?
  `).bind(applicationId).first<{ decision_posture: string | null }>();

  if (!result?.decision_posture) return null;
  return JSON.parse(result.decision_posture);
}

// Save error
async saveSignalsError(applicationId: string, error: { message: string; code: string }): Promise<void> {
  await this.db.prepare(`
    UPDATE applications
    SET signals_error_message = ?,
        signals_error_code = ?,
        signals_status = 'failed'
    WHERE id = ?
  `).bind(error.message, error.code, applicationId).run();
}
```

---

### 6. Update Exports

Add to `src/domain/signals/index.ts`:

```typescript
// Types
export type {
  DecisionPosture,
  ReasonSeverity,
  PostureReason,
  PostureResult,
} from "./types";

// Posture computation
export { computePosture } from "./posture";

// Full pipeline
export { evaluateApplication } from "./pipeline";
```

---

### 7. Register Route

Add to `src/routes/v1/index.ts`:

```typescript
import postureRoute from "./applications/posture";

// ... existing routes ...

app.route("/applications", postureRoute);
```

---

## File Structure After Phase 3

```
src/domain/signals/
├── index.ts           # Exports (updated)
├── types.ts           # Type definitions (extended)
├── extractor.ts       # LLM signal extraction (from Phase 1)
├── aggregator.ts      # Aggregation & conflicts (from Phase 2)
├── posture.ts         # NEW: Posture computation rules
├── pipeline.ts        # NEW: Full evaluation pipeline
└── repository.ts      # DB operations (updated)

src/routes/v1/
├── applications/
│   └── posture.ts     # NEW: Posture API endpoint
└── index.ts           # Updated to include new route
```

---

## API Response Format

```typescript
// GET /v1/applications/:applicationId/posture

// Success (200)
{
  "posture": "SOME_UNCERTAINTY",
  "primaryReason": "Some critical signals are missing or unclear",
  "reasons": [
    {
      "code": "CRITICAL_GAP",
      "message": "Some critical signals are missing or unclear",
      "severity": "warning"
    }
  ],
  "signals": {
    "present": ["decision_under_uncertainty", "accountability"],
    "partial": ["tradeoff_awareness"],
    "missing": ["risk_reasoning"],
    "criticalGaps": ["risk_reasoning"]
  },
  "conflicts": [],
  "suggestedActions": [
    "Probe these areas in interview: Risk Reasoning"
  ]
}

// Processing (202)
{
  "status": "processing",
  "message": "Signal extraction in progress"
}

// Failed (500)
{
  "status": "failed",
  "error": "LLM rate limit exceeded",
  "code": "RATE_LIMIT"
}
```

---

## Testing Guidance

Test each posture level:

1. **LOW_REGRET_RISK:**
   - All critical signals present (in `present` array)
   - No conflicts
   - Expected: posture = "LOW_REGRET_RISK"

2. **SOME_UNCERTAINTY (critical gap):**
   - One critical signal missing
   - Expected: posture = "SOME_UNCERTAINTY", reason code = "CRITICAL_GAP"

3. **SOME_UNCERTAINTY (conflict):**
   - One conflict detected
   - Expected: posture = "SOME_UNCERTAINTY", reason code = "SIGNAL_CONFLICT"

4. **HIGH_UNCERTAINTY (no responses):**
   - All answers empty
   - Expected: posture = "HIGH_UNCERTAINTY", reason code = "NO_RESPONSES"

5. **HIGH_UNCERTAINTY (majority missing):**
   - More than half of critical signals missing
   - Expected: posture = "HIGH_UNCERTAINTY", reason code = "MAJORITY_CRITICAL_MISSING"

6. **Edge case: borderline**
   - Exactly 50% of responses minimal
   - Test that rules handle edge cases correctly
