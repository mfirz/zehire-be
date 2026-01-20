# Phase 0: Question Generation Constraints

**Repository:** `zehire-be`

## Context

This phase updates the existing question generation system to enforce the "All Required + Smart Design" constraints. The key changes are:

1. **Hard cap at 3 questions** (down from 5)
2. **Ensure critical signals are always covered**
3. **Prioritize archetypes that probe critical signals**

### Why 3 Questions?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CONVERSION vs SIGNAL QUALITY ANALYSIS                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  5+ questions, all required:     50% completion, 90% signal quality         │
│  3 questions, all required:      70% completion, 95% signal quality         │
│     └── With save progress:      80% completion, 95% signal quality  ◄───   │
│                                                                             │
│  Sweet spot: 3 questions + save & continue                                  │
│  ├── Respects candidate time (~10 min)                                     │
│  ├── Covers critical signals                                               │
│  └── High completion rate with high signal quality                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Critical Signals

The posture computation requires these signals for LOW_REGRET_RISK determination:

| Signal ID | Description | Must be probed? |
|-----------|-------------|-----------------|
| `decision_under_uncertainty` | How candidate makes decisions with incomplete info | **CRITICAL** |
| `accountability` | Takes ownership of outcomes | **CRITICAL** |
| `learning_from_failure` | Learns and adapts from mistakes | **CRITICAL** |
| `tradeoff_awareness` | Reasons about competing priorities | Supporting |
| `technical_depth` | Deep technical understanding (if technical role) | Conditional |
| `communication_clarity` | Clear communication | Supporting |

---

## Your Task

### 1. Update Constants

Update `src/domain/jobs/archetypes/constants.ts`:

```typescript
/**
 * Maximum archetypes (questions) per job.
 *
 * Reduced from 5 to 3 based on "All Required + Smart Design" approach:
 * - 3 questions = ~10 min completion time
 * - 80% completion rate (with save & continue)
 * - 95% signal quality
 */
export const MAX_ARCHETYPES_PER_JOB = 3;

/**
 * Minimum archetypes per job.
 * Must have at least 2 to cover critical signals.
 */
export const MIN_ARCHETYPES_PER_JOB = 2;

/**
 * Critical archetypes that must always be included.
 * These archetypes probe signals required for LOW_REGRET_RISK posture.
 */
export const CRITICAL_ARCHETYPES = [
  "situational_uncertainty_story",  // → decision_under_uncertainty
  "ownership_of_outcome",           // → accountability
  "failure_and_learning",           // → learning_from_failure
] as const;

/**
 * Minimum number of critical archetypes that must be included.
 * With 3 max archetypes, we require at least 2 critical ones.
 */
export const MIN_CRITICAL_ARCHETYPES = 2;
```

---

### 2. Update Archetype Resolver

Update `src/domain/jobs/archetypes/resolver.ts`:

```typescript
import {
  MAX_ARCHETYPES_PER_JOB,
  MIN_ARCHETYPES_PER_JOB,
  CRITICAL_ARCHETYPES,
  MIN_CRITICAL_ARCHETYPES,
} from "./constants";

// ... existing imports ...

/**
 * Resolve archetypes for a job context.
 *
 * Updated logic:
 * 1. First, activate critical archetypes (if rules match)
 * 2. Then, fill remaining slots with supporting archetypes
 * 3. Ensure at least MIN_CRITICAL_ARCHETYPES critical ones are included
 * 4. Cap at MAX_ARCHETYPES_PER_JOB (3)
 */
export function resolveArchetypes(options: ResolveArchetypesOptions): ArchetypeResolutionResult {
  const {
    jobContext,
    registry = ARCHETYPE_REGISTRY,
    maxArchetypes = MAX_ARCHETYPES_PER_JOB,
    includeExcluded = true,
  } = options;

  const criticalActivated: ResolvedArchetype[] = [];
  const supportingActivated: ResolvedArchetype[] = [];
  const excluded: Array<{ id: string; reason: string }> = [];

  // Separate critical from supporting archetypes
  const criticalArchetypeIds = new Set(CRITICAL_ARCHETYPES);

  // Evaluate each archetype
  for (const archetype of registry.archetypes) {
    const result = evaluateActivationRules(archetype, jobContext);
    const isCritical = criticalArchetypeIds.has(archetype.id);

    if (result.activated) {
      const resolved: ResolvedArchetype = {
        ...archetype,
        selectionReason: result.reason,
      };

      if (isCritical) {
        criticalActivated.push(resolved);
      } else {
        supportingActivated.push(resolved);
      }
    } else if (includeExcluded) {
      excluded.push({
        id: archetype.id,
        reason: result.reason,
      });
    }
  }

  // Sort by priority within each group
  const sortedCritical = sortByPriority(criticalActivated);
  const sortedSupporting = sortByPriority(supportingActivated);

  // Build final selection:
  // 1. Include critical archetypes first (up to maxArchetypes)
  // 2. Fill remaining slots with supporting archetypes
  const selected: ResolvedArchetype[] = [];

  // Add critical archetypes (minimum MIN_CRITICAL_ARCHETYPES, maximum all of them if space)
  const criticalToAdd = Math.min(sortedCritical.length, maxArchetypes);
  selected.push(...sortedCritical.slice(0, criticalToAdd));

  // Add supporting archetypes to fill remaining slots
  const remainingSlots = maxArchetypes - selected.length;
  if (remainingSlots > 0) {
    selected.push(...sortedSupporting.slice(0, remainingSlots));
  }

  // Track capacity-excluded archetypes
  const selectedIds = new Set(selected.map((a) => a.id));

  for (const archetype of [...sortedCritical, ...sortedSupporting]) {
    if (!selectedIds.has(archetype.id) && includeExcluded) {
      excluded.push({
        id: archetype.id,
        reason: EXCLUSION_REASONS.capacityReached,
      });
    }
  }

  // Warn if not enough critical archetypes
  const criticalCount = selected.filter((a) => criticalArchetypeIds.has(a.id)).length;
  if (criticalCount < MIN_CRITICAL_ARCHETYPES) {
    console.warn(
      `Only ${criticalCount} critical archetypes activated (minimum ${MIN_CRITICAL_ARCHETYPES}). ` +
      `Posture computation may produce HIGH_UNCERTAINTY for all applications. ` +
      `Consider adjusting activation rules or job context.`
    );
  }

  // Warn if total is below minimum
  if (selected.length < MIN_ARCHETYPES_PER_JOB) {
    console.warn(
      `Only ${selected.length} archetypes activated for job context. ` +
      `Minimum is ${MIN_ARCHETYPES_PER_JOB}.`
    );
  }

  return {
    jobContext,
    archetypes: selected,
    excluded,
    resolvedAt: new Date().toISOString(),
    // New metadata for transparency
    metadata: {
      criticalCount,
      supportingCount: selected.length - criticalCount,
      maxArchetypes,
    },
  };
}
```

---

### 3. Update Resolution Result Type

Update `src/domain/jobs/archetypes/types.ts`:

```typescript
/**
 * Result of archetype resolution.
 */
export interface ArchetypeResolutionResult {
  /** The job context used for resolution */
  jobContext: JobContext;

  /** Selected archetypes in priority order */
  archetypes: ResolvedArchetype[];

  /** Excluded archetypes with reasons */
  excluded: Array<{ id: string; reason: string }>;

  /** Timestamp of resolution */
  resolvedAt: string;

  /** Resolution metadata (new) */
  metadata?: {
    /** Number of critical archetypes included */
    criticalCount: number;
    /** Number of supporting archetypes included */
    supportingCount: number;
    /** Maximum allowed archetypes */
    maxArchetypes: number;
  };
}
```

---

### 4. Ensure Critical Archetypes Exist

Verify these archetypes exist in `src/domain/jobs/archetypes/registry.ts`:

```typescript
// Archetype: situational_uncertainty_story
// Probes: decision_under_uncertainty
{
  id: "situational_uncertainty_story",
  category: "decision_making",
  signals: ["decision_under_uncertainty"],
  // ... other fields
}

// Archetype: ownership_of_outcome
// Probes: accountability
{
  id: "ownership_of_outcome",
  category: "accountability",
  signals: ["accountability"],
  // ... other fields
}

// Archetype: failure_and_learning
// Probes: learning_from_failure
{
  id: "failure_and_learning",
  category: "growth",
  signals: ["learning_from_failure"],
  // ... other fields
}
```

If any of these archetypes don't exist, create them following the existing pattern.

---

### 5. Update Activation Rules

Ensure critical archetypes have broad activation rules so they're included for most jobs.

Update activation rules in `src/domain/jobs/archetypes/registry.ts`:

```typescript
// Example: situational_uncertainty_story should activate for most jobs
{
  id: "situational_uncertainty_story",
  // ...
  activationRules: [
    {
      // Activate for any risk level (critical signal needed regardless)
      condition: (ctx) => true, // Always activate
      priority: 100, // High priority
      reason: "Critical signal: decision_under_uncertainty",
    },
  ],
}

// Example: ownership_of_outcome
{
  id: "ownership_of_outcome",
  // ...
  activationRules: [
    {
      condition: (ctx) => true, // Always activate
      priority: 100,
      reason: "Critical signal: accountability",
    },
  ],
}

// Example: failure_and_learning
{
  id: "failure_and_learning",
  // ...
  activationRules: [
    {
      condition: (ctx) => true, // Always activate
      priority: 100,
      reason: "Critical signal: learning_from_failure",
    },
  ],
}
```

---

### 6. Update Index Exports

Update `src/domain/jobs/archetypes/index.ts`:

```typescript
// Add new exports
export {
  MAX_ARCHETYPES_PER_JOB,
  MIN_ARCHETYPES_PER_JOB,
  CRITICAL_ARCHETYPES,
  MIN_CRITICAL_ARCHETYPES,
} from "./constants";
```

---

## Verification

After making these changes, verify:

### 1. Resolution produces 3 questions max

```typescript
const result = resolveArchetypes({ jobContext });
console.log(result.archetypes.length); // Should be <= 3
```

### 2. Critical archetypes are prioritized

```typescript
const result = resolveArchetypes({ jobContext });
const criticalIds = new Set(CRITICAL_ARCHETYPES);
const criticalIncluded = result.archetypes.filter(a => criticalIds.has(a.id));
console.log(criticalIncluded.length); // Should be >= 2
```

### 3. Metadata shows breakdown

```typescript
const result = resolveArchetypes({ jobContext });
console.log(result.metadata);
// { criticalCount: 2, supportingCount: 1, maxArchetypes: 3 }
```

---

## Impact on Signal Extraction

With this change:

| Scenario | Questions | Critical Signals | Expected Posture |
|----------|-----------|------------------|------------------|
| All 3 questions answered well | 3 | All 3 probed | Can achieve LOW_REGRET_RISK |
| All 3 questions answered poorly | 3 | All 3 probed, not detected | SOME_UNCERTAINTY or HIGH_UNCERTAINTY |
| Missing critical archetype | 2-3 | 1-2 missing | HIGH_UNCERTAINTY (gaps) |

The `missingCritical` check in posture computation (Phase 3) will now primarily trigger when:
- Answer was provided but signal wasn't detected (weak answer)

It will rarely trigger for:
- Question wasn't asked (because we ensure critical archetypes are included)

---

## Testing Checklist

1. **Resolution respects cap:**
   - Create various job contexts
   - Verify all produce <= 3 archetypes

2. **Critical archetypes prioritized:**
   - Verify critical archetypes are included even when many supporting ones are activated

3. **Metadata accurate:**
   - Check criticalCount and supportingCount sum to total

4. **Warning logs:**
   - Test with job context that doesn't activate critical archetypes
   - Verify warning is logged

5. **End-to-end:**
   - Create job → generates 3 questions
   - All 3 must be answered to apply
   - Signal extraction processes all 3
   - Posture computed based on extracted signals
