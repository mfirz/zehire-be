# Phase 4: Frontend DecisionContext Update

**Repository:** `zehire-fe`

---

## Important: Implementation Guidelines

### Follow Existing Coding Standards

Before making any changes, you MUST explore the `zehire-fe` repository to understand and follow the existing coding patterns:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MANDATORY: FOLLOW EXISTING PATTERNS                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. EXPLORE FIRST                                                          │
│     └── Read existing components in app/components/ui/                     │
│     └── Check how imports are structured                                   │
│     └── Look at existing TypeScript patterns                               │
│     └── Understand the project's file organization                         │
│                                                                             │
│  2. MATCH EXISTING STYLE                                                   │
│     └── Follow the same naming conventions                                 │
│     └── Use the same export patterns (named vs default)                    │
│     └── Match indentation, quotes, semicolons preferences                  │
│     └── Use existing utility functions (cn, etc.)                          │
│                                                                             │
│  3. USE EXISTING DEPENDENCIES                                              │
│     └── Check package.json for installed packages                          │
│     └── Use motion/react for animations (NOT framer-motion directly)       │
│     └── Use existing icon library (lucide-react)                           │
│     └── Use existing animation presets from ~/lib/motion                   │
│                                                                             │
│  4. CHECK FOR EXISTING PATTERNS                                            │
│     └── How are other UI components structured?                            │
│     └── How is state management handled?                                   │
│     └── How are types organized?                                           │
│     └── How are props interfaces named?                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Ask Questions First

**If anything is unclear about the existing implementation, ASK before proceeding:**

- If you're unsure about a coding pattern → ASK
- If you can't find an expected file/pattern → ASK
- If the existing code conflicts with these instructions → ASK
- If you need clarification on requirements → ASK

**Do NOT assume or guess.** It's better to ask and get it right than to implement something incorrectly.

### Key Files to Explore First

Before implementing, read these files to understand existing patterns:

```
app/components/ui/                    # Existing UI component patterns
app/components/ui/decision-posture/   # Current decision-posture implementation
app/lib/utils.ts                      # Utility functions (cn, etc.)
app/lib/motion.ts                     # Animation presets
package.json                          # Installed dependencies
tsconfig.json                         # TypeScript configuration
```

---

## Context

The backend now provides rich signal data via:

```
GET /v1/applications/:applicationId/posture
```

Response shape:

```typescript
{
  posture: "LOW_REGRET_RISK" | "SOME_UNCERTAINTY" | "HIGH_UNCERTAINTY",
  primaryReason: string,
  reasons: Array<{ code: string; message: string; severity: "info" | "warning" | "critical" }>,
  signals: {
    present: string[],     // SignalIds with clear confidence
    partial: string[],     // SignalIds with partial confidence
    missing: string[],     // SignalIds that were asked but not demonstrated
    criticalGaps: string[] // Critical signals that are gaps
  },
  conflicts: Array<{
    signals: [string, string],
    reason: string
  }>,
  suggestedActions?: string[]
}
```

The existing frontend decision-posture components are in:
`app/components/ui/decision-posture/`

Current files:
- `types.ts` - Old boolean-based DecisionContext
- `copy.ts` - Template-based copy
- `resolver.ts` - Frontend posture resolution (to be removed)
- `decision-posture-card.tsx`
- `decision-posture-badge.tsx`
- `decision-posture-showcase.tsx`
- `index.ts`

---

## Your Task

### 1. Replace Types

Replace `app/components/ui/decision-posture/types.ts` entirely:

```typescript
/**
 * Decision Posture Types (Updated for Signal Integration)
 *
 * Decision posture represents how safe it is to act on a candidate right now,
 * given the evidence currently available.
 *
 * It is NOT:
 * - A confidence score
 * - A prediction of candidate quality
 * - A ranking or recommendation
 *
 * It answers: "If I act now, how much regret risk am I taking?"
 */

export enum DecisionPosture {
  LOW_REGRET_RISK = "LOW_REGRET_RISK",
  SOME_UNCERTAINTY = "SOME_UNCERTAINTY",
  HIGH_UNCERTAINTY = "HIGH_UNCERTAINTY",
}

/**
 * Signal metadata for display.
 * This MUST match backend SIGNAL_METADATA.
 */
export const SIGNAL_LABELS: Record<string, string> = {
  decision_under_uncertainty: "Decision Under Uncertainty",
  tradeoff_awareness: "Tradeoff Awareness",
  risk_reasoning: "Risk Reasoning",
  ethical_awareness: "Ethical Awareness",
  technical_depth: "Technical Depth",
  system_thinking: "System Thinking",
  communication_clarity: "Communication Clarity",
  stakeholder_management: "Stakeholder Management",
  accountability: "Accountability",
  learning_from_failure: "Learning from Failure",
}

/**
 * Severity of a posture reason.
 */
export type ReasonSeverity = "info" | "warning" | "critical"

/**
 * A reason contributing to the posture decision.
 */
export interface PostureReason {
  code: string
  message: string
  severity: ReasonSeverity
}

/**
 * Signal conflict detected in candidate responses.
 */
export interface SignalConflict {
  signals: [string, string]
  reason: string
}

/**
 * Signal state for display.
 */
export interface SignalState {
  /** Signals clearly demonstrated */
  present: string[]

  /** Signals partially demonstrated */
  partial: string[]

  /** Signals asked but not demonstrated */
  missing: string[]

  /** Critical signals that are gaps (subset of missing/partial) */
  criticalGaps: string[]
}

/**
 * Complete decision context from backend.
 * This replaces the old boolean-based DecisionContext.
 */
export interface DecisionContext {
  posture: DecisionPosture
  primaryReason: string
  reasons: PostureReason[]
  signals: SignalState
  conflicts: SignalConflict[]
  suggestedActions?: string[]
}

/**
 * Props for DecisionPosture components.
 */
export interface DecisionPostureProps {
  context: DecisionContext
}
```

**Note:** The old `DecisionTemplate` enum and boolean-based `DecisionContext` are removed. We no longer need templates because `primaryReason` comes directly from the backend.

---

### 2. Replace Copy

Replace `app/components/ui/decision-posture/copy.ts`:

```typescript
import { DecisionPosture } from "./types"

export interface PostureColorScheme {
  bg: string
  border: string
  icon: string
  title: string
}

export interface DecisionCopyContent {
  title: string
  description: string
  color: PostureColorScheme
}

/**
 * Base styling for each posture level.
 */
export const PostureStyles: Record<DecisionPosture, { title: string; color: PostureColorScheme }> = {
  [DecisionPosture.LOW_REGRET_RISK]: {
    title: "Low regret risk",
    color: {
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      icon: "text-emerald-600",
      title: "text-emerald-900",
    },
  },
  [DecisionPosture.SOME_UNCERTAINTY]: {
    title: "Some uncertainty",
    color: {
      bg: "bg-amber-50",
      border: "border-amber-200",
      icon: "text-amber-600",
      title: "text-amber-900",
    },
  },
  [DecisionPosture.HIGH_UNCERTAINTY]: {
    title: "High uncertainty",
    color: {
      bg: "bg-rose-50",
      border: "border-rose-200",
      icon: "text-rose-600",
      title: "text-rose-900",
    },
  },
}

/**
 * Get full copy content for a decision context.
 * Description comes from backend's primaryReason.
 */
export function getPostureCopy(context: {
  posture: DecisionPosture
  primaryReason: string
}): DecisionCopyContent {
  const style = PostureStyles[context.posture]
  return {
    title: style.title,
    description: context.primaryReason,
    color: style.color,
  }
}
```

---

### 3. Delete Resolver

**Delete** `app/components/ui/decision-posture/resolver.ts`

Posture resolution now happens on the backend. The frontend just receives and displays the result.

---

### 4. Update Card Component

Replace `app/components/ui/decision-posture/decision-posture-card.tsx`:

```tsx
import { cn } from "~/lib/utils"
import { CheckCircle2, Circle, PauseCircle } from "lucide-react"
import { getPostureCopy, type PostureColorScheme } from "./copy"
import { DecisionPosture, SIGNAL_LABELS, type DecisionPostureProps } from "./types"

const postureIcons: Record<DecisionPosture, React.ElementType> = {
  [DecisionPosture.LOW_REGRET_RISK]: CheckCircle2,
  [DecisionPosture.SOME_UNCERTAINTY]: Circle,
  [DecisionPosture.HIGH_UNCERTAINTY]: PauseCircle,
}

export interface DecisionPostureCardProps extends DecisionPostureProps {
  className?: string
  /** Show critical signal gaps inline */
  showGaps?: boolean
}

/**
 * Decision posture card component.
 * Displays the posture state with title and description.
 */
export function DecisionPostureCard({
  context,
  className,
  showGaps = false,
}: DecisionPostureCardProps) {
  const copy = getPostureCopy(context)
  const Icon = postureIcons[context.posture]

  return (
    <div className={cn("rounded-lg border p-4 bg-white", className)}>
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 size-5 shrink-0", copy.color.icon)} />
        <div className="space-y-1 flex-1">
          <h3 className={cn("text-sm font-medium", copy.color.title)}>
            {copy.title}
          </h3>
          <p className="text-sm text-muted-foreground">{copy.description}</p>

          {showGaps && context.signals.criticalGaps.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Missing critical signals:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {context.signals.criticalGaps.map((signalId) => (
                  <span
                    key={signalId}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 border border-rose-200"
                  >
                    {SIGNAL_LABELS[signalId] ?? signalId}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

---

### 5. Update Badge Component

Replace `app/components/ui/decision-posture/decision-posture-badge.tsx`:

```tsx
import { cn } from "~/lib/utils"
import { CheckCircle2, Circle, PauseCircle } from "lucide-react"
import { PostureStyles } from "./copy"
import { DecisionPosture, type DecisionPostureProps } from "./types"

const postureIcons: Record<DecisionPosture, React.ElementType> = {
  [DecisionPosture.LOW_REGRET_RISK]: CheckCircle2,
  [DecisionPosture.SOME_UNCERTAINTY]: Circle,
  [DecisionPosture.HIGH_UNCERTAINTY]: PauseCircle,
}

export interface DecisionPostureBadgeProps extends DecisionPostureProps {
  className?: string
  /** Show only icon, no text */
  iconOnly?: boolean
}

/**
 * Compact badge showing decision posture.
 */
export function DecisionPostureBadge({
  context,
  className,
  iconOnly = false,
}: DecisionPostureBadgeProps) {
  const style = PostureStyles[context.posture]
  const Icon = postureIcons[context.posture]

  if (iconOnly) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center size-6 rounded-full",
          style.color.bg,
          className
        )}
        title={style.title}
      >
        <Icon className={cn("size-4", style.color.icon)} />
      </span>
    )
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        style.color.bg,
        style.color.title,
        className
      )}
    >
      <Icon className={cn("size-3.5", style.color.icon)} />
      {style.title}
    </span>
  )
}
```

---

### 6. Create Signal Badge Component

Create `app/components/ui/decision-posture/signal-badge.tsx`:

```tsx
import { cn } from "~/lib/utils"
import { SIGNAL_LABELS } from "./types"

export type SignalStatus = "present" | "partial" | "missing"

export interface SignalBadgeProps {
  signalId: string
  status: SignalStatus
  className?: string
}

const statusStyles: Record<SignalStatus, string> = {
  present: "bg-emerald-100 text-emerald-800 border-emerald-200",
  partial: "bg-amber-100 text-amber-800 border-amber-200",
  missing: "bg-rose-100 text-rose-800 border-rose-200",
}

/**
 * Badge showing a signal with its status.
 */
export function SignalBadge({ signalId, status, className }: SignalBadgeProps) {
  const label = SIGNAL_LABELS[signalId] ?? signalId

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
        statusStyles[status],
        className
      )}
    >
      {label}
    </span>
  )
}
```

---

### 7. Update Index Exports

Replace `app/components/ui/decision-posture/index.ts`:

```typescript
// Types
export { DecisionPosture } from "./types"
export type {
  DecisionContext,
  DecisionPostureProps,
  PostureReason,
  ReasonSeverity,
  SignalConflict,
  SignalState,
} from "./types"
export { SIGNAL_LABELS } from "./types"

// Copy & Styles
export { PostureStyles, getPostureCopy } from "./copy"
export type { DecisionCopyContent, PostureColorScheme } from "./copy"

// Components
export { DecisionPostureCard } from "./decision-posture-card"
export type { DecisionPostureCardProps } from "./decision-posture-card"

export { DecisionPostureBadge } from "./decision-posture-badge"
export type { DecisionPostureBadgeProps } from "./decision-posture-badge"

export { SignalBadge } from "./signal-badge"
export type { SignalBadgeProps, SignalStatus } from "./signal-badge"

// NOTE: resolveDecisionTemplate is REMOVED (backend handles this now)
// NOTE: DecisionTemplate enum is REMOVED (using primaryReason instead)
```

---

### 8. Delete or Update Showcase

Either **delete** `decision-posture-showcase.tsx` or update it to use mock `DecisionContext` objects:

```tsx
import { DecisionPostureBadge } from "./decision-posture-badge"
import { DecisionPostureCard } from "./decision-posture-card"
import { DecisionPosture, type DecisionContext } from "./types"

/**
 * Mock decision contexts for showcase.
 */
const mockContexts: Array<{ label: string; context: DecisionContext }> = [
  {
    label: "Low Regret Risk",
    context: {
      posture: DecisionPosture.LOW_REGRET_RISK,
      primaryReason: "Critical signals are clearly demonstrated",
      reasons: [{ code: "SIGNALS_SATISFIED", message: "Critical signals are clearly demonstrated", severity: "info" }],
      signals: {
        present: ["decision_under_uncertainty", "accountability", "tradeoff_awareness"],
        partial: [],
        missing: [],
        criticalGaps: [],
      },
      conflicts: [],
      suggestedActions: [],
    },
  },
  {
    label: "Some Uncertainty - Missing Signal",
    context: {
      posture: DecisionPosture.SOME_UNCERTAINTY,
      primaryReason: "Some critical signals are missing or unclear",
      reasons: [{ code: "CRITICAL_GAP", message: "Some critical signals are missing or unclear", severity: "warning" }],
      signals: {
        present: ["decision_under_uncertainty", "accountability"],
        partial: ["tradeoff_awareness"],
        missing: ["risk_reasoning"],
        criticalGaps: ["risk_reasoning"],
      },
      conflicts: [],
      suggestedActions: ["Probe these areas in interview: Risk Reasoning"],
    },
  },
  {
    label: "High Uncertainty - No Responses",
    context: {
      posture: DecisionPosture.HIGH_UNCERTAINTY,
      primaryReason: "Candidate did not respond to any questions",
      reasons: [{ code: "NO_RESPONSES", message: "Candidate did not respond to any questions", severity: "critical" }],
      signals: {
        present: [],
        partial: [],
        missing: [],
        criticalGaps: ["decision_under_uncertainty", "risk_reasoning", "accountability"],
      },
      conflicts: [],
      suggestedActions: ["Follow up with candidate to complete the application"],
    },
  },
]

/**
 * Showcase component for decision posture variants.
 */
export function DecisionPostureShowcase() {
  return (
    <div className="space-y-8">
      {mockContexts.map(({ label, context }) => (
        <div key={label} className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">{label}</h3>

          {/* Badge variants */}
          <div className="flex flex-wrap gap-2">
            <DecisionPostureBadge context={context} />
            <DecisionPostureBadge context={context} iconOnly />
          </div>

          {/* Card */}
          <DecisionPostureCard context={context} showGaps />
        </div>
      ))}
    </div>
  )
}
```

---

## File Changes Summary

| File | Action |
|------|--------|
| `types.ts` | **Replace entirely** |
| `copy.ts` | **Replace entirely** |
| `resolver.ts` | **Delete** |
| `decision-posture-card.tsx` | **Replace** |
| `decision-posture-badge.tsx` | **Replace** |
| `signal-badge.tsx` | **Create new** |
| `index.ts` | **Replace** |
| `decision-posture-showcase.tsx` | **Delete or update** |

---

## Important Notes

1. **SIGNAL_LABELS must match backend**
   - Copy from backend `SIGNAL_METADATA`
   - Keep in sync when signals change

2. **No more templates**
   - Old system had 12 templates (LRR_DEFAULT, SU_MISSING_SIGNAL, etc.)
   - New system uses `primaryReason` from backend
   - Much simpler and more flexible

3. **Context comes from API**
   - Components are pure/presentational
   - All logic is on backend
   - Frontend just renders

4. **Type safety**
   - Use the `DecisionContext` type for all posture data
   - Components expect `DecisionPostureProps` which includes `context`
