/**
 * Zehire Archetype System — Constants
 * ====================================
 * Configuration constants for archetype resolution and selection.
 */

import type { ExperienceLevel, RiskLevel } from "./types";

// =============================================================================
// ARCHETYPE SELECTION LIMITS
// =============================================================================

/**
 * Maximum archetypes per job.
 *
 * Reduced from 5 to 3 based on "All Required + Smart Design" approach:
 * - 3 questions = ~10 min completion time
 * - 80% completion rate (with save & continue)
 * - 95% signal quality
 *
 * See: prompts-core-adjustment/README.md for design rationale.
 */
export const MAX_ARCHETYPES_PER_JOB = 3;

/**
 * Minimum archetypes per job (ensures signal diversity).
 * Must have at least 2 to cover critical signals.
 */
export const MIN_ARCHETYPES_PER_JOB = 2;

// =============================================================================
// CRITICAL ARCHETYPES
// =============================================================================

/**
 * Critical archetypes that should be prioritized for selection.
 * These archetypes probe signals required for LOW_REGRET_RISK posture.
 *
 * Critical signals:
 * - decision_under_uncertainty → situational_uncertainty_story
 * - accountability → ownership_of_outcome
 * - learning_from_failure → failure_and_recovery
 */
export const CRITICAL_ARCHETYPES = [
  "situational_uncertainty_story", // → decision_under_uncertainty
  "ownership_of_outcome", // → accountability
  "failure_and_recovery", // → learning_from_failure
] as const;

/**
 * Minimum number of critical archetypes that should be included.
 * With 3 max archetypes, we aim for at least 2 critical ones.
 */
export const MIN_CRITICAL_ARCHETYPES = 2;

// =============================================================================
// ARCHETYPE PRIORITY ORDER
// =============================================================================

/**
 * Priority order defines UX importance.
 * When more archetypes are selected than MAX_ARCHETYPES_PER_JOB,
 * this order determines which are kept.
 *
 * Priority rationale:
 * 1. situational_uncertainty_story — Anchor archetype, universal signal
 * 2. high_stakes_decision — Critical for high-risk roles
 * 3. ethical_boundary_case — Essential for regulated environments
 * 4. explaining_complexity — Communication is foundational
 * 5. technical_depth_probe — Verifies claims in technical roles
 * 6. ownership_of_outcome — Accountability is universal
 * 7. execution_under_constraint — Tests delivery capability
 * 8. leadership_through_others — Important for senior roles
 * 9. stakeholder_interaction — Customer-facing signal
 * 10. failure_and_recovery — Growth mindset indicator
 * 11. disagreement_and_alignment — Collaboration signal
 * 12. motivation_and_intent — Role alignment
 * 13+ — Remaining archetypes in category order
 */
export const ARCHETYPE_PRIORITY: readonly string[] = [
  // Tier 1: Universal anchors
  "situational_uncertainty_story",
  "high_stakes_decision",
  "ethical_boundary_case",

  // Tier 2: Communication & Technical
  "explaining_complexity",
  "technical_depth_probe",

  // Tier 3: Ownership & Execution
  "ownership_of_outcome",
  "execution_under_constraint",

  // Tier 4: Leadership & Stakeholders
  "leadership_through_others",
  "stakeholder_interaction",
  "team_development",

  // Tier 5: Growth & Alignment
  "failure_and_recovery",
  "disagreement_and_alignment",
  "motivation_and_intent",

  // Tier 6: Advanced
  "tradeoff_explanation",
  "ambiguity_navigation",
  "initiative_without_permission",
  "prioritization_under_pressure",
  "resource_optimization",
  "persuasion_and_influence",
  "rule_vs_judgment",
  "pressure_to_compromise",
  "debugging_and_problem_diagnosis",
  "technical_communication",
  "difficult_conversation",
  "strategic_alignment",
  "crisis_leadership",
] as const;

// =============================================================================
// EXPERIENCE LEVEL ORDERING
// =============================================================================

/**
 * Numeric ordering for experience levels.
 * Used for >= comparisons in activation rules.
 */
export const EXPERIENCE_LEVEL_ORDER: Record<ExperienceLevel, number> = {
  entry: 0,
  mid: 1,
  senior: 2,
  executive: 3,
};

/**
 * Check if experience level meets minimum requirement.
 */
export function meetsExperienceLevel(actual: ExperienceLevel, minimum: ExperienceLevel): boolean {
  return EXPERIENCE_LEVEL_ORDER[actual] >= EXPERIENCE_LEVEL_ORDER[minimum];
}

// =============================================================================
// RISK LEVEL ORDERING
// =============================================================================

/**
 * Numeric ordering for risk levels.
 * Used for >= comparisons in activation rules.
 */
export const RISK_LEVEL_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/**
 * Check if risk level meets minimum requirement.
 */
export function meetsRiskLevel(actual: RiskLevel, minimum: RiskLevel): boolean {
  return RISK_LEVEL_ORDER[actual] >= RISK_LEVEL_ORDER[minimum];
}

// =============================================================================
// SELECTION REASON TEMPLATES
// =============================================================================

/**
 * Human-readable reason templates for archetype selection.
 * Used in audit trails and debugging.
 */
export const SELECTION_REASONS = {
  // Default selections
  anchor: "Anchor archetype — activated for all roles",
  default: "Default activation — no disqualifying rules",

  // Context-based selections
  highRisk: "Activated due to high-risk role context",
  regulated: "Activated for regulated environment",
  collaboration: "Activated due to high collaboration requirement",
  technicalDomain: "Activated for technical domain verification",
  leadership: "Activated for leadership/executive role",
  customerFacing: "Activated for customer-facing role",
  peopleManagement: "Activated for people management responsibility",
  operationalDomain: "Activated for operational domain",
  primarySignal: "Activated to capture primary signal for role",

  // Experience-based
  experienceLevel: (level: string) => `Activated for ${level}+ experience level`,
} as const;

// =============================================================================
// EXCLUSION REASON TEMPLATES
// =============================================================================

/**
 * Human-readable reason templates for archetype exclusion.
 * Used in audit trails and debugging.
 */
export const EXCLUSION_REASONS = {
  // Limit-based exclusions
  capacityReached: "Excluded due to maximum archetype limit",
  lowerPriority: "Excluded in favor of higher priority archetypes",

  // Rule-based exclusions
  domainMismatch: (domains: string[]) =>
    `Excluded — only activates for domains: ${domains.join(", ")}`,
  domainExcluded: (domains: string[]) =>
    `Excluded — not applicable for domains: ${domains.join(", ")}`,
  experienceTooLow: (required: string) => `Excluded — requires ${required}+ experience level`,
  riskTooLow: (required: string) => `Excluded — requires ${required}+ risk level`,
  notRegulated: "Excluded — requires regulated environment",
  noCollaboration: "Excluded — requires high collaboration",
  notCustomerFacing: "Excluded — requires customer-facing role",
  noPeopleManagement: "Excluded — requires people management",
  signalNotPrimary: "Excluded — required signal not primary for this role",
} as const;

// =============================================================================
// DOMAIN GROUPS
// =============================================================================

/**
 * Domain groups for common activation patterns.
 */
export const DOMAIN_GROUPS = {
  /** Technical domains requiring depth verification */
  technical: ["technology", "engineering"] as const,

  /** Domains with high regulatory requirements */
  regulated: ["healthcare", "finance", "legal", "government"] as const,

  /** Operational domains with execution pressure */
  operational: ["operations", "retail", "logistics", "manufacturing", "hospitality"] as const,

  /** Domains with high customer interaction */
  customerIntensive: ["retail", "hospitality", "sales", "consulting"] as const,
} as const;

// =============================================================================
// QUESTION RENDERING DEFAULTS
// =============================================================================

/**
 * Default rendering constraints applied when not specified.
 */
export const DEFAULT_RENDERING_CONSTRAINTS = {
  minAnswerWords: 30,
  maxQuestionLength: 500,
} as const;
