/**
 * Pipeline Domain Module
 * ======================
 * Handles hiring pipeline generation, including:
 * - Assessment type recommendations
 * - Interview panel structure
 * - Evaluation criteria
 *
 * This module follows the same pattern as question generation:
 * 1. LLM generates PipelineRecommendation
 * 2. System creates initial PipelineConfig from recommendation
 * 3. Recruiters can customize the config
 */

// Types
export type {
  AssessmentRecommendation,
  InterviewRoundRecommendation,
  InterviewPanelRecommendation,
  EvaluationCriteria,
  PipelineRecommendation,
  AssessmentConfig,
  InterviewRoundConfig,
  PipelineConfig,
  PipelineUpdate,
} from "./types";

export {
  AssessmentRecommendationSchema,
  InterviewRoundRecommendationSchema,
  InterviewPanelRecommendationSchema,
  EvaluationCriteriaSchema,
  PipelineRecommendationSchema,
  AssessmentConfigSchema,
  InterviewRoundConfigSchema,
  PipelineConfigSchema,
  PipelineUpdateSchema,
} from "./types";

// Providers
export type { AssessmentProvider } from "./providers";

export {
  assessmentProviders,
  getProviderById,
  getProviderIds,
  isValidProviderId,
} from "./providers";

// Advisor (LLM generation)
export type { PipelineGenerationInput, PipelineGenerationResult } from "./advisor";

export {
  generatePipelineRecommendation,
  generateInitialConfig,
  buildPipelinePrompt,
  parsePipelineResponse,
  PIPELINE_ADVISOR_SYSTEM_PROMPT,
} from "./advisor";
