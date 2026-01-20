# Phase 5: Transparency UI Components

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
│  5. REFERENCE IMPLEMENTATIONS                                              │
│     └── app/components/jobs/collapsible-section.tsx - for animations       │
│     └── app/components/ui/decision-posture/* - existing implementation     │
│     └── ~/lib/motion.ts - animation presets (collapse, fadeInUp, etc.)    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Ask Questions First

**If anything is unclear about the existing implementation, ASK before proceeding:**

- If you're unsure about a coding pattern → ASK
- If you can't find an expected file/pattern → ASK
- If the existing code conflicts with these instructions → ASK
- If you need clarification on requirements → ASK
- If a component pattern doesn't match existing conventions → ASK

**Do NOT assume or guess.** It's better to ask and get it right than to implement something incorrectly.

### Verify After Phase 4

This phase depends on Phase 4 being completed. Before starting, verify:

1. `app/components/ui/decision-posture/types.ts` has been updated with new types
2. `app/components/ui/decision-posture/copy.ts` has been updated
3. `app/components/ui/decision-posture/resolver.ts` has been deleted
4. Existing components (`decision-posture-card.tsx`, `decision-posture-badge.tsx`) work with new types

If any of these are not in place, **ASK** before proceeding.

---

## Context

After Phase 4, we have updated types and basic components. Now we need to build the full transparency UI that shows:

1. Signal breakdown (which signals present/missing)
2. Conflict details
3. All reasons contributing to posture
4. Suggested actions

The updated types are in `app/components/ui/decision-posture/types.ts`.

---

## Your Task

### 1. Create Signal Breakdown Panel

Create `app/components/ui/decision-posture/signal-breakdown.tsx`:

```tsx
import { cn } from "~/lib/utils"
import { CheckCircle2, Circle, XCircle, AlertTriangle } from "lucide-react"
import { SignalBadge } from "./signal-badge"
import { SIGNAL_LABELS, type SignalState } from "./types"

export interface SignalBreakdownProps {
  signals: SignalState
  className?: string
}

/**
 * Panel showing breakdown of all signals by status.
 */
export function SignalBreakdown({ signals, className }: SignalBreakdownProps) {
  const { present, partial, missing, criticalGaps } = signals

  // Set for O(1) lookup
  const criticalSet = new Set(criticalGaps)

  // Skip rendering if no signals at all
  const hasSignals = present.length > 0 || partial.length > 0 || missing.length > 0
  if (!hasSignals) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        No signal data available
      </div>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Present Signals */}
      {present.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span className="text-sm font-medium text-gray-700">
              Clearly demonstrated ({present.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 ml-6">
            {present.map((signalId) => (
              <SignalBadge key={signalId} signalId={signalId} status="present" />
            ))}
          </div>
        </div>
      )}

      {/* Partial Signals */}
      {partial.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Circle className="size-4 text-amber-600" />
            <span className="text-sm font-medium text-gray-700">
              Partially demonstrated ({partial.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 ml-6">
            {partial.map((signalId) => (
              <div key={signalId} className="flex items-center gap-1">
                <SignalBadge signalId={signalId} status="partial" />
                {criticalSet.has(signalId) && (
                  <AlertTriangle
                    className="size-3 text-amber-600"
                    aria-label="Critical signal"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing Signals */}
      {missing.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="size-4 text-rose-600" />
            <span className="text-sm font-medium text-gray-700">
              Not demonstrated ({missing.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 ml-6">
            {missing.map((signalId) => (
              <div key={signalId} className="flex items-center gap-1">
                <SignalBadge signalId={signalId} status="missing" />
                {criticalSet.has(signalId) && (
                  <AlertTriangle
                    className="size-3 text-rose-600"
                    aria-label="Critical signal"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend for critical markers */}
      {criticalGaps.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2 border-t">
          <AlertTriangle className="size-3" />
          <span>Critical for this role</span>
        </div>
      )}
    </div>
  )
}
```

---

### 2. Create Conflict Panel

Create `app/components/ui/decision-posture/conflict-panel.tsx`:

```tsx
import { cn } from "~/lib/utils"
import { AlertTriangle } from "lucide-react"
import { SIGNAL_LABELS, type SignalConflict } from "./types"

export interface ConflictPanelProps {
  conflicts: SignalConflict[]
  className?: string
}

/**
 * Panel showing detected signal conflicts.
 */
export function ConflictPanel({ conflicts, className }: ConflictPanelProps) {
  if (conflicts.length === 0) return null

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-amber-600" />
        <span className="text-sm font-medium text-gray-700">
          Contradictions detected ({conflicts.length})
        </span>
      </div>

      <div className="space-y-2 ml-6">
        {conflicts.map((conflict, idx) => {
          const [signal1, signal2] = conflict.signals
          const label1 = SIGNAL_LABELS[signal1] ?? signal1
          const label2 = SIGNAL_LABELS[signal2] ?? signal2

          return (
            <div
              key={idx}
              className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm"
            >
              <p className="font-medium text-amber-900">
                {label1} vs {label2}
              </p>
              <p className="text-amber-800 mt-1">{conflict.reason}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

---

### 3. Create Reasons List

Create `app/components/ui/decision-posture/reasons-list.tsx`:

```tsx
import { cn } from "~/lib/utils"
import { Info, AlertTriangle, XCircle } from "lucide-react"
import type { PostureReason, ReasonSeverity } from "./types"

export interface ReasonsListProps {
  reasons: PostureReason[]
  className?: string
}

const severityConfig: Record<
  ReasonSeverity,
  { icon: React.ElementType; className: string }
> = {
  info: {
    icon: Info,
    className: "text-blue-600",
  },
  warning: {
    icon: AlertTriangle,
    className: "text-amber-600",
  },
  critical: {
    icon: XCircle,
    className: "text-rose-600",
  },
}

/**
 * List showing all reasons contributing to the posture.
 */
export function ReasonsList({ reasons, className }: ReasonsListProps) {
  if (reasons.length === 0) return null

  return (
    <ul className={cn("space-y-2", className)}>
      {reasons.map((reason, idx) => {
        const config = severityConfig[reason.severity]
        const Icon = config.icon

        return (
          <li key={idx} className="flex items-start gap-2 text-sm">
            <Icon
              className={cn("size-4 mt-0.5 shrink-0", config.className)}
              aria-hidden="true"
            />
            <span className="text-gray-700">{reason.message}</span>
          </li>
        )
      })}
    </ul>
  )
}
```

---

### 4. Create Suggested Actions

Create `app/components/ui/decision-posture/suggested-actions.tsx`:

```tsx
import { cn } from "~/lib/utils"
import { Lightbulb } from "lucide-react"

export interface SuggestedActionsProps {
  actions: string[]
  className?: string
}

/**
 * Panel showing suggested next steps for the hiring manager.
 */
export function SuggestedActions({ actions, className }: SuggestedActionsProps) {
  if (!actions || actions.length === 0) return null

  return (
    <div
      className={cn(
        "p-4 bg-blue-50 border border-blue-200 rounded-lg",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Lightbulb className="size-4 text-blue-600" aria-hidden="true" />
        <span className="text-sm font-medium text-blue-900">
          Suggested next steps
        </span>
      </div>
      <ul className="space-y-1 ml-6 list-disc text-sm text-blue-800">
        {actions.map((action, idx) => (
          <li key={idx}>{action}</li>
        ))}
      </ul>
    </div>
  )
}
```

---

### 5. Create Full Decision Panel

Create `app/components/ui/decision-posture/decision-panel.tsx`:

This is the comprehensive panel that shows everything with expand/collapse:

```tsx
import { useState } from "react"
import { cn } from "~/lib/utils"
import { collapse } from "~/lib/motion"
import { AnimatePresence, motion } from "motion/react"
import { ChevronDown } from "lucide-react"
import { DecisionPostureCard } from "./decision-posture-card"
import { SignalBreakdown } from "./signal-breakdown"
import { ConflictPanel } from "./conflict-panel"
import { ReasonsList } from "./reasons-list"
import { SuggestedActions } from "./suggested-actions"
import type { DecisionContext } from "./types"

export interface DecisionPanelProps {
  context: DecisionContext
  className?: string
  /** Expand to show full details by default */
  defaultExpanded?: boolean
}

/**
 * Full decision panel with expandable details.
 * Shows posture card + optional breakdown of signals, conflicts, reasons, and actions.
 */
export function DecisionPanel({
  context,
  className,
  defaultExpanded = false,
}: DecisionPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const hasDetails =
    context.signals.present.length > 0 ||
    context.signals.partial.length > 0 ||
    context.signals.missing.length > 0 ||
    context.conflicts.length > 0 ||
    context.reasons.length > 1 ||
    (context.suggestedActions && context.suggestedActions.length > 0)

  return (
    <div className={cn("space-y-4", className)}>
      {/* Main posture card */}
      <DecisionPostureCard context={context} />

      {/* Expand/collapse toggle (only if there are details) */}
      {hasDetails && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          {expanded ? "Hide details" : "Show details"}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <ChevronDown className="size-4" />
          </motion.div>
        </button>
      )}

      {/* Expanded details */}
      <AnimatePresence initial={false}>
        {expanded && hasDetails && (
          <motion.div {...collapse} className="overflow-hidden">
            <div className="space-y-6 pt-2">
              {/* Signal breakdown */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">
                  Signal Analysis
                </h4>
                <SignalBreakdown signals={context.signals} />
              </div>

              {/* Conflicts if any */}
              {context.conflicts.length > 0 && (
                <ConflictPanel conflicts={context.conflicts} />
              )}

              {/* All reasons (if more than just the primary) */}
              {context.reasons.length > 1 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3">
                    Contributing factors
                  </h4>
                  <ReasonsList reasons={context.reasons} />
                </div>
              )}

              {/* Suggested actions */}
              {context.suggestedActions && context.suggestedActions.length > 0 && (
                <SuggestedActions actions={context.suggestedActions} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

---

### 6. Update Index Exports

Add all new components to `app/components/ui/decision-posture/index.ts`:

```typescript
// ... existing exports from Phase 4 ...

// Signal Breakdown
export { SignalBreakdown } from "./signal-breakdown"
export type { SignalBreakdownProps } from "./signal-breakdown"

// Conflict Panel
export { ConflictPanel } from "./conflict-panel"
export type { ConflictPanelProps } from "./conflict-panel"

// Reasons List
export { ReasonsList } from "./reasons-list"
export type { ReasonsListProps } from "./reasons-list"

// Suggested Actions
export { SuggestedActions } from "./suggested-actions"
export type { SuggestedActionsProps } from "./suggested-actions"

// Full Decision Panel
export { DecisionPanel } from "./decision-panel"
export type { DecisionPanelProps } from "./decision-panel"
```

---

### 7. Update Showcase

Update `decision-posture-showcase.tsx` to include all new components:

```tsx
import { DecisionPostureBadge } from "./decision-posture-badge"
import { DecisionPostureCard } from "./decision-posture-card"
import { DecisionPanel } from "./decision-panel"
import { SignalBreakdown } from "./signal-breakdown"
import { ConflictPanel } from "./conflict-panel"
import { ReasonsList } from "./reasons-list"
import { SuggestedActions } from "./suggested-actions"
import { DecisionPosture, type DecisionContext } from "./types"

/**
 * Mock decision contexts for showcase.
 */
const mockContexts: Array<{ label: string; context: DecisionContext }> = [
  {
    label: "Low Regret Risk - All Clear",
    context: {
      posture: DecisionPosture.LOW_REGRET_RISK,
      primaryReason: "Critical signals are clearly demonstrated",
      reasons: [
        { code: "SIGNALS_SATISFIED", message: "Critical signals are clearly demonstrated", severity: "info" },
      ],
      signals: {
        present: ["decision_under_uncertainty", "accountability", "tradeoff_awareness", "risk_reasoning"],
        partial: ["communication_clarity"],
        missing: [],
        criticalGaps: [],
      },
      conflicts: [],
      suggestedActions: [],
    },
  },
  {
    label: "Some Uncertainty - Missing Critical Signal",
    context: {
      posture: DecisionPosture.SOME_UNCERTAINTY,
      primaryReason: "Some critical signals are missing or unclear",
      reasons: [
        { code: "CRITICAL_GAP", message: "Some critical signals are missing or unclear", severity: "warning" },
        { code: "MOSTLY_PARTIAL", message: "Most signals are only partially demonstrated", severity: "info" },
      ],
      signals: {
        present: ["decision_under_uncertainty"],
        partial: ["accountability", "tradeoff_awareness"],
        missing: ["risk_reasoning", "technical_depth"],
        criticalGaps: ["risk_reasoning"],
      },
      conflicts: [],
      suggestedActions: [
        "Probe these areas in interview: Risk Reasoning",
        "Ask for specific examples about: Accountability, Tradeoff Awareness",
      ],
    },
  },
  {
    label: "Some Uncertainty - Signal Conflict",
    context: {
      posture: DecisionPosture.SOME_UNCERTAINTY,
      primaryReason: "One contradiction detected in responses",
      reasons: [
        { code: "SIGNAL_CONFLICT", message: "One contradiction detected in responses", severity: "warning" },
      ],
      signals: {
        present: ["decision_under_uncertainty", "accountability"],
        partial: ["tradeoff_awareness"],
        missing: [],
        criticalGaps: [],
      },
      conflicts: [
        {
          signals: ["accountability", "learning_from_failure"],
          reason: "Claimed strong ownership but blamed external factors for a project failure",
        },
      ],
      suggestedActions: [
        "Review conflicting responses and explore in interview",
      ],
    },
  },
  {
    label: "High Uncertainty - No Responses",
    context: {
      posture: DecisionPosture.HIGH_UNCERTAINTY,
      primaryReason: "Candidate did not respond to any questions",
      reasons: [
        { code: "NO_RESPONSES", message: "Candidate did not respond to any questions", severity: "critical" },
      ],
      signals: {
        present: [],
        partial: [],
        missing: [],
        criticalGaps: ["decision_under_uncertainty", "risk_reasoning", "accountability"],
      },
      conflicts: [],
      suggestedActions: [
        "Follow up with candidate to complete the application",
      ],
    },
  },
]

/**
 * Full showcase of all decision posture components.
 */
export function DecisionPostureShowcase() {
  return (
    <div className="space-y-12">
      <h2 className="text-xl font-bold">Decision Posture Components</h2>

      {/* Individual Components */}
      <section className="space-y-6">
        <h3 className="text-lg font-semibold border-b pb-2">Individual Components</h3>

        {/* Badges */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Badges</h4>
          <div className="flex flex-wrap gap-3">
            {mockContexts.map(({ label, context }) => (
              <div key={label} className="flex items-center gap-2">
                <DecisionPostureBadge context={context} />
                <DecisionPostureBadge context={context} iconOnly />
              </div>
            ))}
          </div>
        </div>

        {/* Signal Breakdown */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Signal Breakdown</h4>
          <div className="max-w-md border rounded-lg p-4">
            <SignalBreakdown signals={mockContexts[1].context.signals} />
          </div>
        </div>

        {/* Conflict Panel */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Conflict Panel</h4>
          <div className="max-w-md">
            <ConflictPanel conflicts={mockContexts[2].context.conflicts} />
          </div>
        </div>

        {/* Reasons List */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Reasons List</h4>
          <div className="max-w-md">
            <ReasonsList reasons={mockContexts[1].context.reasons} />
          </div>
        </div>

        {/* Suggested Actions */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Suggested Actions</h4>
          <div className="max-w-md">
            <SuggestedActions actions={mockContexts[1].context.suggestedActions!} />
          </div>
        </div>
      </section>

      {/* Full Decision Panels */}
      <section className="space-y-6">
        <h3 className="text-lg font-semibold border-b pb-2">Full Decision Panels</h3>

        <div className="grid gap-6 md:grid-cols-2">
          {mockContexts.map(({ label, context }) => (
            <div key={label} className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">{label}</h4>
              <DecisionPanel context={context} defaultExpanded />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
```

---

## File Structure After Phase 5

```
app/components/ui/decision-posture/
├── index.ts                      # Exports (updated)
├── types.ts                      # Types (from Phase 4)
├── copy.ts                       # Copy & styles (from Phase 4)
├── decision-posture-card.tsx     # Card component (from Phase 4)
├── decision-posture-badge.tsx    # Badge component (from Phase 4)
├── signal-badge.tsx              # Signal badge (from Phase 4)
├── signal-breakdown.tsx          # NEW: Signal breakdown panel
├── conflict-panel.tsx            # NEW: Conflict display
├── reasons-list.tsx              # NEW: Reasons list
├── suggested-actions.tsx         # NEW: Suggested actions
├── decision-panel.tsx            # NEW: Full expandable panel
└── decision-posture-showcase.tsx # Updated showcase
```

---

## Usage Example

```tsx
// In your candidate review page
import { DecisionPanel } from "~/components/ui/decision-posture"

function CandidateReview({ applicationId }: { applicationId: string }) {
  const { data: postureData, isLoading } = useQuery({
    queryKey: ["posture", applicationId],
    queryFn: () => fetchPosture(applicationId),
  })

  if (isLoading) {
    return <Skeleton className="h-32" />
  }

  if (!postureData) {
    return <div>Posture not available</div>
  }

  // Transform API response to DecisionContext
  const context: DecisionContext = {
    posture: postureData.posture as DecisionPosture,
    primaryReason: postureData.primaryReason,
    reasons: postureData.reasons,
    signals: postureData.signals,
    conflicts: postureData.conflicts,
    suggestedActions: postureData.suggestedActions,
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Application Review</h2>
      <DecisionPanel context={context} defaultExpanded />
    </div>
  )
}
```

---

## Important Notes

1. **All components are pure/presentational**
   - They receive data, they render
   - No fetching, no business logic

2. **Styling uses existing patterns**
   - Tailwind classes
   - `cn()` utility for conditional classes
   - Colors match posture semantics (emerald=good, amber=warning, rose=critical)

3. **Responsive design**
   - Flex wrap for signal badges
   - Panels stack vertically on mobile
   - Grid layout for showcase

4. **Accessibility**
   - Semantic HTML (lists, headings, buttons)
   - Icons have `aria-hidden="true"` (text provides meaning)
   - Color is not the only indicator (icons + text)
   - Interactive elements are focusable

5. **Animation**
   - Uses `motion/react` (Framer Motion) - already installed in the project
   - Shared animation presets from `~/lib/motion.ts`:
     - `collapse` - for expand/collapse sections with height animation
     - `fadeInUp`, `fade`, `scaleUp` - for entry animations
     - `staggerContainer`, `staggerItem` - for list animations
   - Pattern: `<AnimatePresence>` + `<motion.div {...collapse}>` for collapsible content
   - See `app/components/jobs/collapsible-section.tsx` for reference implementation

6. **Dependencies**
   - `motion/react` for animations (already installed)
   - `lucide-react` for icons (already used in existing components)
   - `~/lib/utils` for `cn()` function
   - `~/lib/motion` for animation presets
   - React `useState` for expand/collapse
