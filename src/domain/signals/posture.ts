/**
 * Posture Computation Service
 * ===========================
 * Computes decision posture from signal state using formal rules.
 *
 * Posture Levels:
 * - LOW_REGRET_RISK: Critical signals clearly demonstrated, no concerns
 * - SOME_UNCERTAINTY: Some gaps or partial signals, worth probing in interview
 * - HIGH_UNCERTAINTY: Major concerns, significant gaps or contradictions
 */

import { SIGNAL_METADATA, type SignalId } from "../jobs/archetypes/types";
import type {
  DecisionPosture,
  PostureReason,
  PostureResult,
  ReasonSeverity,
  SignalStateResult,
} from "./types";

// =============================================================================
// RULE DEFINITIONS
// =============================================================================

/**
 * Rule definition for posture computation.
 */
interface PostureRule {
  code: string;
  check: (state: SignalStateResult) => boolean;
  message: string;
  severity: ReasonSeverity;
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
      return details.length === 0 || details.every((d) => d.evaluationCount === 0);
    },
    message: "Candidate did not provide substantive responses",
    severity: "critical",
  },
  {
    code: "MAJORITY_CRITICAL_MISSING",
    check: (state) => {
      const { gaps, criticalSignals } = state.criticalAnalysis;
      const missingCount = gaps.filter((g) => g.status === "missing").length;
      return criticalSignals.length > 0 && missingCount > criticalSignals.length / 2;
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
      return gaps.some((g) => g.status === "partial");
    },
    message: "Some critical signals lack depth or specificity",
    severity: "info",
  },
];

/**
 * LOW_REGRET_RISK reason (default if no other rules triggered)
 */
const LOW_REGRET_RISK_REASON: PostureReason = {
  code: "SIGNALS_SATISFIED",
  message: "Critical signals are clearly demonstrated",
  severity: "info",
};

// =============================================================================
// POSTURE COMPUTATION
// =============================================================================

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
  if (reasons.some((r) => r.severity === "critical")) {
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
    if (reasons.some((r) => r.severity === "warning")) {
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
    primaryReason: reasons[0]?.message ?? "Unknown",
    reasons,
    signalState,
    suggestedActions,
    computedAt: new Date().toISOString(),
  };
}

// =============================================================================
// SUGGESTED ACTIONS
// =============================================================================

/**
 * Generate suggested actions based on posture and reasons.
 */
function generateSuggestedActions(
  posture: DecisionPosture,
  reasons: PostureReason[],
  signalState: SignalStateResult
): string[] {
  const actions: string[] = [];
  const reasonCodes = new Set(reasons.map((r) => r.code));

  if (reasonCodes.has("NO_RESPONSES") || reasonCodes.has("ALL_SIGNALS_UNCLEAR")) {
    actions.push("Follow up with candidate to complete the application");
    return actions; // No other actions make sense
  }

  if (reasonCodes.has("CRITICAL_GAP") || reasonCodes.has("MAJORITY_CRITICAL_MISSING")) {
    const missingSignals = signalState.criticalAnalysis.gaps
      .filter((g) => g.status === "missing")
      .map((g) => g.signalId);

    if (missingSignals.length > 0) {
      actions.push(`Probe these areas in interview: ${formatSignalList(missingSignals)}`);
    }
  }

  if (reasonCodes.has("CRITICAL_ONLY_PARTIAL")) {
    const partialSignals = signalState.criticalAnalysis.gaps
      .filter((g) => g.status === "partial")
      .map((g) => g.signalId);

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
 * Format signal list for display using human-readable labels.
 */
function formatSignalList(signals: SignalId[]): string {
  return signals.map((s) => SIGNAL_METADATA[s]?.label ?? s).join(", ");
}
