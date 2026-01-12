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
