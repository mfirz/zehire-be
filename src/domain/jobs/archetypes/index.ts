/**
 * Zehire Archetype System
 * =======================
 * Signal-first, volume-aware, regret-minimizing hiring platform.
 *
 * This module provides the archetype resolution system used when
 * recruiters post jobs (POST /jobs API). It maps job context to
 * contextual questions that extract evaluative signals.
 *
 * @example
 * ```typescript
 * import {
 *   resolveArchetypes,
 *   ARCHETYPE_REGISTRY,
 *   type JobContext,
 * } from "./archetypes"
 *
 * // From LLM inference of job title & description
 * const jobContext: JobContext = {
 *   domain: "technology",
 *   riskLevel: "medium",
 *   decisionImpact: "business",
 *   primarySignals: ["technical_depth", "decision_under_uncertainty"],
 *   collaborationRequired: "high",
 *   customerFacing: false,
 *   peopleManagement: false,
 *   regulatedEnvironment: false,
 *   experienceLevel: "mid",
 * }
 *
 * const result = resolveArchetypes({ jobContext })
 *
 * // Use result.archetypes to render context questions
 * for (const archetype of result.archetypes) {
 *   console.log(`${archetype.id}: ${archetype.description}`)
 *   console.log(`  Signals: ${archetype.signals.join(", ")}`)
 *   console.log(`  Reason: ${archetype.selectionReason}`)
 * }
 * ```
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  // Archetype definitions
  ActivationRules,
  Archetype,
  ArchetypeCategory,
  ArchetypeRegistry,
  ArchetypeResolutionMetadata,
  ArchetypeResolutionResult,
  CollaborationLevel,
  DecisionImpact,
  ExperienceLevel,
  // Job context
  JobContext,
  JobDomain,
  QuestionFormat,
  RenderingConstraints,
  // Resolution output
  ResolvedArchetype,
  RiskLevel,
  // Core types
  SignalId,
} from "./types";

// =============================================================================
// CONSTANT EXPORTS
// =============================================================================

export {
  ARCHETYPE_CATEGORIES,
  CATEGORY_METADATA,
  COLLABORATION_LEVELS,
  DECISION_IMPACTS,
  EXPERIENCE_LEVELS,
  FORMAT_METADATA,
  JOB_DOMAINS,
  QUESTION_FORMATS,
  // Level definitions
  RISK_LEVELS,
  // Signal & category metadata
  SIGNAL_IDS,
  SIGNAL_METADATA,
} from "./types";

export {
  // Priority
  ARCHETYPE_PRIORITY,
  // Critical archetypes for signal coverage
  CRITICAL_ARCHETYPES,
  // Defaults
  DEFAULT_RENDERING_CONSTRAINTS,
  // Domain groups
  DOMAIN_GROUPS,
  EXCLUSION_REASONS,
  // Level ordering
  EXPERIENCE_LEVEL_ORDER,
  // Limits
  MAX_ARCHETYPES_PER_JOB,
  MIN_ARCHETYPES_PER_JOB,
  MIN_CRITICAL_ARCHETYPES,
  RISK_LEVEL_ORDER,
  // Reason templates
  SELECTION_REASONS,
  meetsExperienceLevel,
  meetsRiskLevel,
} from "./constants";

// =============================================================================
// REGISTRY EXPORTS
// =============================================================================

export {
  ARCHETYPE_BY_ID,
  ARCHETYPE_REGISTRY,
  findArchetype,
  getArchetype,
  getArchetypesByCategory,
  getArchetypesBySignal,
} from "./registry";

// Default export is the registry
export { default as registry } from "./registry";

// =============================================================================
// RESOLVER EXPORTS
// =============================================================================

export type { ResolveArchetypesOptions } from "./resolver";

export {
  analyzeSignalCoverage,

  // Lower-level utilities (for testing/debugging)
  evaluateActivationRules,
  getActivationStatus,
  resolveArchetypeIds,
  resolveArchetypes,
  sortByPriority,
  wouldActivate,
} from "./resolver";

// =============================================================================
// INFERENCE EXPORTS
// =============================================================================

export type { JobPostingInput, LLMClient } from "./inference";

export {
  JOB_CONTEXT_SYSTEM_PROMPT,
  buildInferencePrompt,
  inferJobContext,
  parseJobContextResponse,
  resolveArchetypesFromJobPosting,
} from "./inference";

// =============================================================================
// RENDERER EXPORTS
// =============================================================================

export type { RenderQuestionsOptions, RenderQuestionsResult, RenderedQuestion } from "./renderer";

export {
  QUESTION_RENDER_SYSTEM_PROMPT,
  buildQuestionRenderPrompt,
  generateQuestionsForJob,
  renderQuestion,
  renderQuestions,
  validateRenderedQuestion,
} from "./renderer";
