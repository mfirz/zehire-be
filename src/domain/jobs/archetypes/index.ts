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
  // Core types
  SignalId,
  ArchetypeCategory,
  QuestionFormat,
  RiskLevel,
  ExperienceLevel,
  CollaborationLevel,
  DecisionImpact,
  JobDomain,

  // Job context
  JobContext,

  // Archetype definitions
  ActivationRules,
  RenderingConstraints,
  Archetype,
  ArchetypeRegistry,

  // Resolution output
  ResolvedArchetype,
  ArchetypeResolutionResult,
} from "./types"

// =============================================================================
// CONSTANT EXPORTS
// =============================================================================

export {
  // Signal & category metadata
  SIGNAL_IDS,
  SIGNAL_METADATA,
  ARCHETYPE_CATEGORIES,
  CATEGORY_METADATA,
  QUESTION_FORMATS,
  FORMAT_METADATA,

  // Level definitions
  RISK_LEVELS,
  EXPERIENCE_LEVELS,
  COLLABORATION_LEVELS,
  DECISION_IMPACTS,
  JOB_DOMAINS,
} from "./types"

export {
  // Limits
  MAX_ARCHETYPES_PER_JOB,
  MIN_ARCHETYPES_PER_JOB,

  // Priority
  ARCHETYPE_PRIORITY,

  // Level ordering
  EXPERIENCE_LEVEL_ORDER,
  RISK_LEVEL_ORDER,
  meetsExperienceLevel,
  meetsRiskLevel,

  // Reason templates
  SELECTION_REASONS,
  EXCLUSION_REASONS,

  // Domain groups
  DOMAIN_GROUPS,

  // Defaults
  DEFAULT_RENDERING_CONSTRAINTS,
} from "./constants"

// =============================================================================
// REGISTRY EXPORTS
// =============================================================================

export {
  ARCHETYPE_REGISTRY,
  ARCHETYPE_BY_ID,
  getArchetype,
  findArchetype,
  getArchetypesByCategory,
  getArchetypesBySignal,
} from "./registry"

// Default export is the registry
export { default as registry } from "./registry"

// =============================================================================
// RESOLVER EXPORTS
// =============================================================================

export type { ResolveArchetypesOptions } from "./resolver"

export {
  resolveArchetypes,
  resolveArchetypeIds,
  wouldActivate,
  getActivationStatus,
  analyzeSignalCoverage,

  // Lower-level utilities (for testing/debugging)
  evaluateActivationRules,
  sortByPriority,
} from "./resolver"

// =============================================================================
// INFERENCE EXPORTS
// =============================================================================

export type { JobPostingInput, LLMClient } from "./inference"

export {
  JOB_CONTEXT_SYSTEM_PROMPT,
  buildInferencePrompt,
  parseJobContextResponse,
  inferJobContext,
  resolveArchetypesFromJobPosting,
} from "./inference"

// =============================================================================
// RENDERER EXPORTS
// =============================================================================

export type {
  RenderedQuestion,
  RenderQuestionsResult,
  RenderQuestionsOptions,
} from "./renderer"

export {
  QUESTION_RENDER_SYSTEM_PROMPT,
  buildQuestionRenderPrompt,
  validateRenderedQuestion,
  renderQuestion,
  renderQuestions,
  generateQuestionsForJob,
} from "./renderer"
