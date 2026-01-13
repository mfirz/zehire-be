/**
 * Signal Extraction Types
 * =======================
 * Types for extracting and aggregating signals from candidate answers.
 *
 * Signals are extracted from each answer individually, then aggregated
 * to compute a decision posture for the application.
 */

import type { SignalId } from "../jobs/archetypes/types";

// =============================================================================
// CONFIDENCE & QUALITY
// =============================================================================

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
 * - "substantial": Answer is detailed with concrete examples
 * - "minimal": Answer is brief but addresses the question
 * - "empty": Answer is empty or too short to evaluate
 * - "off_topic": Answer doesn't address the question asked
 */
export type ResponseQuality = "substantial" | "minimal" | "empty" | "off_topic";

// =============================================================================
// EXTRACTED SIGNALS
// =============================================================================

/**
 * A single signal extracted from one answer.
 */
export interface ExtractedSignal {
  signalId: SignalId;
  confidence: SignalConfidence;
  evidence?: string; // Brief quote or summary from answer
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

// =============================================================================
// AGGREGATED STATE
// =============================================================================

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
  details: Record<
    string,
    {
      bestConfidence: SignalConfidence;
      evaluationCount: number;
      evidence: string[];
    }
  >;
}

// =============================================================================
// EXTRACTION INPUT
// =============================================================================

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

// =============================================================================
// LLM RESPONSE FORMAT
// =============================================================================

/**
 * Expected response format from the LLM.
 */
export interface LLMExtractionResponse {
  responseQuality: ResponseQuality;
  signals: Array<{
    signalId: string;
    confidence: SignalConfidence;
    evidence?: string;
    reasoning?: string;
  }>;
}

// =============================================================================
// SIGNAL CONFLICTS
// =============================================================================

/**
 * A detected conflict between signals.
 * Indicates contradictory evidence across different answers.
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

// =============================================================================
// CRITICAL SIGNAL ANALYSIS
// =============================================================================

/**
 * Analysis of critical (primary) signals for a job.
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
    wasAsked: boolean; // Was there a question targeting this?
  }>;

  /** Overall: is there a critical gap? */
  hasCriticalGap: boolean;
}

// =============================================================================
// COMPLETE SIGNAL STATE
// =============================================================================

/**
 * Complete signal state for an application.
 * Combines aggregation, critical analysis, and conflict detection.
 */
export interface SignalStateResult {
  aggregated: AggregatedSignalState;
  criticalAnalysis: CriticalSignalAnalysis;
  conflicts: SignalConflict[];
  computedAt: string;
}

// =============================================================================
// DECISION POSTURE
// =============================================================================

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
  code: string; // Machine-readable code
  message: string; // Human-readable message
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
