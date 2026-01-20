/**
 * CV Domain
 * =========
 * Re-exports for CV processing module.
 */

export { CVService, type CVSummaryOutput, type ProcessCVResult } from "./service";
export { CVRepository, type CVData, type CrossApplicationResult } from "./repository";
export { extractTextFromCV, detectFormat, type ExtractionResult } from "./extractor";
export {
  summarizeCV,
  type CVSummary,
  type CVWorkExperience,
  type CVEducation,
  type CVSkill,
  type SummarizationResult,
} from "./summarizer";
export {
  detectContradictions,
  type CVContradiction,
  type ContradictionDetectionResult,
  type ContradictionDetectionInput,
} from "./contradiction-detector";
