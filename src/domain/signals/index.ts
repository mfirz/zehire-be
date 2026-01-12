/**
 * Signals Domain
 * ===============
 * Signal extraction and aggregation for candidate answers.
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
} from "./types";

// Extractor
export {
  SIGNAL_EXTRACTION_SYSTEM_PROMPT,
  buildExtractionPrompt,
  parseExtractionResponse,
  extractSignalsFromAnswer,
} from "./extractor";

// Service
export { SignalExtractionService } from "./service";
