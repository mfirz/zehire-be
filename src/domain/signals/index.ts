/**
 * Signals Domain
 * ===============
 * Signal extraction, aggregation, conflict detection, and posture computation.
 */

// Types
export type {
  SignalConfidence,
  ResponseQuality,
  ExtractedSignal,
  AnswerExtractionResult,
  AggregatedSignalState,
  SignalExtractionInput,
  LLMExtractionResponse,
  SignalConflict,
  CriticalSignalAnalysis,
  SignalStateResult,
  DecisionPosture,
  ReasonSeverity,
  PostureReason,
  PostureResult,
} from "./types";

// Extractor
export {
  SIGNAL_EXTRACTION_SYSTEM_PROMPT,
  buildExtractionPrompt,
  parseExtractionResponse,
  extractSignalsFromAnswer,
} from "./extractor";

// Aggregator
export {
  aggregateSignals,
  analyzeCriticalSignals,
  detectConflicts,
  computeSignalState,
} from "./aggregator";

// Posture computation
export { computePosture } from "./posture";

// Service
export { SignalExtractionService } from "./service";
