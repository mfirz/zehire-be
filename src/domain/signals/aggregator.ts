/**
 * Signal Aggregation Service
 * ==========================
 * Aggregates signals across multiple answers and detects conflicts.
 *
 * This module handles:
 * - Signal aggregation with "best confidence wins" rule
 * - Critical signal gap analysis
 * - Rule-based conflict detection
 */

import { SIGNAL_IDS, type SignalId } from "../jobs/archetypes/types";
import type {
  AggregatedSignalState,
  AnswerExtractionResult,
  CriticalSignalAnalysis,
  SignalConfidence,
  SignalConflict,
  SignalStateResult,
} from "./types";

// =============================================================================
// CONFIDENCE PRIORITY
// =============================================================================

/**
 * Confidence level priority for aggregation.
 * Higher number = better confidence.
 */
const CONFIDENCE_PRIORITY: Record<SignalConfidence, number> = {
  clear: 4, // Highest - signal clearly demonstrated
  partial: 3, // Some evidence but incomplete
  absent: 2, // Asked but not demonstrated
  unclear: 1, // Lowest - cannot determine
};


// =============================================================================
// SIGNAL AGGREGATION
// =============================================================================

export interface AggregateSignalsInput {
  extractions: AnswerExtractionResult[];
  allSignalIds: SignalId[];
}

/**
 * Aggregate signals across all extraction results.
 *
 * Rules:
 * 1. For each signal, find all evaluations across all answers
 * 2. Best confidence wins: clear > partial > absent > unclear
 * 3. If a signal was never targeted by any question, it goes in `notAsked`
 * 4. Collect all evidence for each signal into the `details` map
 */
export function aggregateSignals(input: AggregateSignalsInput): AggregatedSignalState {
  const { extractions, allSignalIds } = input;

  const signalDetails: Record<
    string,
    {
      bestConfidence: SignalConfidence;
      evaluationCount: number;
      evidence: string[];
    }
  > = {};

  // Track which signals were asked about
  const askedSignals = new Set<SignalId>();

  // Process each extraction result
  for (const result of extractions) {
    for (const signal of result.signals) {
      askedSignals.add(signal.signalId);

      let detail = signalDetails[signal.signalId];
      if (!detail) {
        detail = {
          bestConfidence: signal.confidence,
          evaluationCount: 0,
          evidence: [],
        };
        signalDetails[signal.signalId] = detail;
      }

      detail.evaluationCount++;

      // Upgrade confidence if better
      if (CONFIDENCE_PRIORITY[signal.confidence] > CONFIDENCE_PRIORITY[detail.bestConfidence]) {
        detail.bestConfidence = signal.confidence;
      }

      // Collect evidence
      if (signal.evidence) {
        detail.evidence.push(signal.evidence);
      }
    }
  }

  // Categorize signals
  const present: SignalId[] = [];
  const partial: SignalId[] = [];
  const missing: SignalId[] = [];
  const notAsked: SignalId[] = [];

  for (const signalId of allSignalIds) {
    if (!askedSignals.has(signalId)) {
      notAsked.push(signalId);
      continue;
    }

    const detail = signalDetails[signalId];
    if (!detail) {
      missing.push(signalId);
      continue;
    }

    switch (detail.bestConfidence) {
      case "clear":
        present.push(signalId);
        break;
      case "partial":
        partial.push(signalId);
        break;
      case "absent":
      case "unclear":
        missing.push(signalId);
        break;
    }
  }

  return {
    present,
    partial,
    missing,
    notAsked,
    details: signalDetails,
  };
}

// =============================================================================
// CRITICAL SIGNAL ANALYSIS
// =============================================================================

export interface AnalyzeCriticalSignalsInput {
  aggregatedState: AggregatedSignalState;
  primarySignals: SignalId[];
}

/**
 * Analyze critical signal gaps based on job's primary signals.
 *
 * Rules:
 * 1. primarySignals from JobContext are the "critical" signals for this job
 * 2. A critical signal is "satisfied" if it's in `present` (clear confidence)
 * 3. A critical signal is a "gap" if:
 *    - It's in `missing` (was asked, got absent/unclear) → status: "missing"
 *    - It's in `partial` (was asked, got partial) → status: "partial"
 *    - It's in `notAsked` (wasn't even asked) → status: "unclear", wasAsked: false
 * 4. hasCriticalGap = gaps.length > 0
 */
export function analyzeCriticalSignals(input: AnalyzeCriticalSignalsInput): CriticalSignalAnalysis {
  const { aggregatedState, primarySignals } = input;

  const satisfied: SignalId[] = [];
  const gaps: CriticalSignalAnalysis["gaps"] = [];

  for (const signalId of primarySignals) {
    // Check if signal is clearly present
    if (aggregatedState.present.includes(signalId)) {
      satisfied.push(signalId);
      continue;
    }

    // Check if signal is partial
    if (aggregatedState.partial.includes(signalId)) {
      gaps.push({
        signalId,
        status: "partial",
        wasAsked: true,
      });
      continue;
    }

    // Check if signal is missing (was asked but absent/unclear)
    if (aggregatedState.missing.includes(signalId)) {
      gaps.push({
        signalId,
        status: "missing",
        wasAsked: true,
      });
      continue;
    }

    // Signal was never asked about
    if (aggregatedState.notAsked.includes(signalId)) {
      gaps.push({
        signalId,
        status: "unclear",
        wasAsked: false,
      });
    }
  }

  // Only count gaps where the signal was actually asked about
  // wasAsked: false means the job's questions didn't cover this signal
  // (system design issue, not candidate failing)
  const askedGaps = gaps.filter((g) => g.wasAsked);

  return {
    criticalSignals: primarySignals,
    satisfied,
    gaps,
    hasCriticalGap: askedGaps.length > 0,
  };
}

// =============================================================================
// CONFLICT DETECTION
// =============================================================================

/**
 * Known conflict patterns between signals.
 * These are heuristic-based patterns to detect contradictions.
 */
interface ConflictPattern {
  /** The two signals that might conflict */
  signals: [SignalId, SignalId];
  /** Keywords/patterns that indicate conflict when found in opposing evidence */
  conflictIndicators: {
    signal1Negative: string[]; // Words in signal1 evidence that contradict signal2
    signal2Negative: string[]; // Words in signal2 evidence that contradict signal1
  };
  /** Description of why this is a conflict */
  conflictReason: string;
}

const CONFLICT_PATTERNS: ConflictPattern[] = [
  {
    signals: ["accountability", "learning_from_failure"],
    conflictIndicators: {
      signal1Negative: ["blame", "fault of", "their mistake", "not my", "wasn't responsible"],
      signal2Negative: ["blame", "fault of", "their mistake", "not my", "wasn't responsible"],
    },
    conflictReason:
      "Claims accountability but evidence shows blame-shifting, or claims learning from failure without taking ownership",
  },
  {
    signals: ["decision_under_uncertainty", "risk_reasoning"],
    conflictIndicators: {
      signal1Negative: ["paralyzed", "couldn't decide", "waited too long", "avoided"],
      signal2Negative: ["no plan", "didn't consider", "ignored risk", "reckless"],
    },
    conflictReason:
      "Claims decisive action without risk assessment, or shows analysis paralysis despite claiming decisiveness",
  },
  {
    signals: ["stakeholder_management", "accountability"],
    conflictIndicators: {
      signal1Negative: ["blame stakeholder", "their fault", "they didn't", "pushed back on me"],
      signal2Negative: ["blame stakeholder", "their fault", "they didn't", "pushed back on me"],
    },
    conflictReason: "Claims good stakeholder management but blames stakeholders for failures",
  },
];

/**
 * Negation phrases that negate the following words.
 * E.g., "Rather than blame" means NO blame, "didn't blame" means NO blame.
 */
const NEGATION_PATTERNS = [
  /rather than\s+/gi,
  /instead of\s+/gi,
  /didn't\s+/gi,
  /did not\s+/gi,
  /don't\s+/gi,
  /do not\s+/gi,
  /wasn't\s+/gi,
  /was not\s+/gi,
  /weren't\s+/gi,
  /were not\s+/gi,
  /isn't\s+/gi,
  /is not\s+/gi,
  /aren't\s+/gi,
  /are not\s+/gi,
  /not\s+/gi,
  /never\s+/gi,
  /without\s+/gi,
  /avoided\s+/gi,
  /avoiding\s+/gi,
  /refused to\s+/gi,
];

/**
 * Check if text contains any of the indicator phrases (case-insensitive).
 * Ignores matches that are negated (e.g., "Rather than blame" won't match "blame").
 */
function containsIndicator(text: string, indicators: string[]): boolean {
  const lowerText = text.toLowerCase();

  for (const indicator of indicators) {
    const lowerIndicator = indicator.toLowerCase();

    // Find all occurrences of the indicator
    let searchStart = 0;
    while (true) {
      const matchIndex = lowerText.indexOf(lowerIndicator, searchStart);
      if (matchIndex === -1) break;

      // Check if this match is negated by looking at preceding context
      const precedingText = lowerText.slice(Math.max(0, matchIndex - 30), matchIndex);

      // Check if any negation pattern appears right before this match
      const isNegated = NEGATION_PATTERNS.some((pattern) => {
        // Find the last match of the negation pattern in preceding text
        const matches = precedingText.match(pattern);
        if (!matches || matches.length === 0) return false;

        // Check if the negation ends right at (or very close to) the indicator
        const lastMatch = matches[matches.length - 1]!;
        return precedingText.trimEnd().endsWith(lastMatch.trimEnd());
      });

      if (!isNegated) {
        return true; // Found a non-negated match
      }

      searchStart = matchIndex + 1;
    }
  }

  return false;
}

/**
 * Detect conflicts between signals using rule-based heuristics.
 *
 * This is conservative — only flags clear contradictions.
 * False positives are worse than missed conflicts.
 *
 * Rules:
 * - Only check signals that have at least "partial" confidence
 * - Look for contradictory keywords/phrases in evidence
 * - Only flag if both signals have contradictory evidence
 */
export function detectConflicts(extractions: AnswerExtractionResult[]): SignalConflict[] {
  const conflicts: SignalConflict[] = [];

  // Build a map of signal -> all evidence with answer IDs
  const signalEvidence: Map<
    SignalId,
    Array<{
      answerId: string;
      confidence: SignalConfidence;
      evidence: string;
    }>
  > = new Map();

  for (const extraction of extractions) {
    for (const signal of extraction.signals) {
      // Only consider signals with clear or partial confidence
      if (signal.confidence !== "clear" && signal.confidence !== "partial") {
        continue;
      }

      if (!signal.evidence) {
        continue;
      }

      const existing = signalEvidence.get(signal.signalId) ?? [];
      existing.push({
        answerId: extraction.answerId,
        confidence: signal.confidence,
        evidence: signal.evidence,
      });
      signalEvidence.set(signal.signalId, existing);
    }
  }

  // Check each conflict pattern
  for (const pattern of CONFLICT_PATTERNS) {
    const [signal1Id, signal2Id] = pattern.signals;

    const evidence1List = signalEvidence.get(signal1Id);
    const evidence2List = signalEvidence.get(signal2Id);

    // Both signals must have evidence
    if (!evidence1List || !evidence2List) {
      continue;
    }

    // Look for conflicting evidence
    for (const e1 of evidence1List) {
      for (const e2 of evidence2List) {
        // Skip if both signals are from the same answer
        // (same answer can't conflict with itself - it's a coherent response)
        if (e1.answerId === e2.answerId) {
          continue;
        }

        // Check if signal1 evidence contains negative indicators for signal2
        const signal1HasConflict = containsIndicator(
          e1.evidence,
          pattern.conflictIndicators.signal1Negative
        );

        // Check if signal2 evidence contains negative indicators for signal1
        const signal2HasConflict = containsIndicator(
          e2.evidence,
          pattern.conflictIndicators.signal2Negative
        );

        // Only flag if there's a clear contradiction
        // Being conservative: require both to have conflicting indicators
        // or one to have very strong conflicting evidence
        if (signal1HasConflict || signal2HasConflict) {
          // Avoid duplicate conflicts
          const existingConflict = conflicts.find(
            (c) =>
              (c.signals[0] === signal1Id && c.signals[1] === signal2Id) ||
              (c.signals[0] === signal2Id && c.signals[1] === signal1Id)
          );

          if (!existingConflict) {
            conflicts.push({
              signals: [signal1Id, signal2Id],
              reason: pattern.conflictReason,
              evidence: {
                signal1: { answerId: e1.answerId, quote: e1.evidence },
                signal2: { answerId: e2.answerId, quote: e2.evidence },
              },
            });
          }
        }
      }
    }
  }

  return conflicts;
}

// =============================================================================
// FULL AGGREGATION PIPELINE
// =============================================================================

export interface ComputeSignalStateInput {
  applicationId: string;
  extractions: AnswerExtractionResult[];
  primarySignals: SignalId[];
}

/**
 * Compute complete signal state for an application.
 *
 * Orchestrates:
 * 1. Signal aggregation across all answers
 * 2. Critical signal gap analysis
 * 3. Conflict detection
 */
export function computeSignalState(input: ComputeSignalStateInput): SignalStateResult {
  const { extractions, primarySignals } = input;

  // 1. Get all possible signal IDs
  const allSignalIds = [...SIGNAL_IDS];

  // 2. Aggregate signals across all answers
  const aggregated = aggregateSignals({
    extractions,
    allSignalIds,
  });

  // 3. Analyze critical signal gaps
  const criticalAnalysis = analyzeCriticalSignals({
    aggregatedState: aggregated,
    primarySignals,
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
