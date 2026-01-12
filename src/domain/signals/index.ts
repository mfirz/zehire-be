/**
 * Signals Domain
 * ===============
 * Signal extraction, aggregation, and conflict detection for candidate answers.
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

// Service
export { SignalExtractionService } from "./service";
