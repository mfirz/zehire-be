/**
 * Zehire Archetype Registry
 * =========================
 * Canonical, job-agnostic context question archetypes used by Zehire
 * to extract evaluative signals without ranking or scoring.
 *
 * Philosophy:
 * - Signal-first, not resume-first
 * - No scores, no rankings, no confidence percentages
 * - Silence and non-answers are valid signals
 * - Decision safety over prediction accuracy
 */

import type { Archetype, ArchetypeRegistry } from "./types";

/**
 * All archetypes defined in the system.
 * Each archetype is a template for context questions.
 */
const archetypes: Archetype[] = [
  // ===========================================================================
  // DECISION & JUDGMENT
  // ===========================================================================
  {
    id: "situational_uncertainty_story",
    category: "decision_judgment",
    description:
      "Evaluates how a candidate makes decisions when information is incomplete or outcomes are uncertain. This is the anchor archetype — activated for most roles.",
    signals: ["decision_under_uncertainty", "tradeoff_awareness", "risk_reasoning"],
    formats: ["experience_based"],
    activationRules: {
      default: true,
      whenRiskLevelAtLeast: "low",
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
      singleQuestion: true,
      minAnswerWords: 50,
    },
  },

  {
    id: "high_stakes_decision",
    category: "decision_judgment",
    description:
      "Assesses judgment and accountability when decisions have significant consequences. Activated for high-risk roles.",
    signals: ["risk_reasoning", "accountability"],
    formats: ["experience_based"],
    activationRules: {
      whenRiskLevelAtLeast: "high",
    },
    renderingConstraints: {
      requiresRealExample: true,
      singleQuestion: true,
      minAnswerWords: 75,
    },
  },

  {
    id: "tradeoff_explanation",
    category: "decision_judgment",
    description:
      "Evaluates explicit reasoning about tradeoffs between competing priorities. Tests system thinking and prioritization.",
    signals: ["system_thinking", "tradeoff_awareness"],
    formats: ["reflection", "experience_based"],
    activationRules: {
      default: true,
      minExperienceLevel: "mid",
    },
    renderingConstraints: {
      forbidYesNo: true,
      minAnswerWords: 50,
    },
  },

  {
    id: "ambiguity_navigation",
    category: "decision_judgment",
    description:
      "Assesses how candidates navigate situations with no clear right answer. Tests comfort with ambiguity.",
    signals: ["decision_under_uncertainty", "system_thinking"],
    formats: ["experience_based", "scenario_based"],
    activationRules: {
      minExperienceLevel: "mid",
      whenRiskLevelAtLeast: "medium",
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
    },
  },

  // ===========================================================================
  // OWNERSHIP
  // ===========================================================================
  {
    id: "ownership_of_outcome",
    category: "ownership",
    description:
      "Assesses responsibility for outcomes, including mistakes and follow-through. Fundamental accountability signal.",
    signals: ["accountability"],
    formats: ["experience_based"],
    activationRules: {
      default: true,
      minExperienceLevel: "mid",
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
      minAnswerWords: 50,
    },
  },

  {
    id: "failure_and_recovery",
    category: "ownership",
    description:
      "Evaluates learning behavior and growth after failure. Not about the failure itself, but the response to it.",
    signals: ["learning_from_failure", "accountability"],
    formats: ["experience_based"],
    activationRules: {
      minExperienceLevel: "mid",
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
      minAnswerWords: 75,
    },
  },

  {
    id: "initiative_without_permission",
    category: "ownership",
    description:
      "Assesses proactive behavior and initiative when formal authority is absent. Tests ownership mindset.",
    signals: ["accountability", "decision_under_uncertainty"],
    formats: ["experience_based"],
    activationRules: {
      minExperienceLevel: "mid",
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
    },
  },

  // ===========================================================================
  // EXECUTION
  // ===========================================================================
  {
    id: "execution_under_constraint",
    category: "execution",
    description:
      "Assesses execution quality under time or resource constraints. Tests delivery capability under pressure.",
    signals: ["decision_under_uncertainty", "tradeoff_awareness"],
    formats: ["experience_based"],
    activationRules: {
      default: true,
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
      minAnswerWords: 50,
    },
  },

  {
    id: "prioritization_under_pressure",
    category: "execution",
    description:
      "Evaluates how candidates prioritize when everything seems urgent. Tests judgment under operational pressure.",
    signals: ["tradeoff_awareness", "decision_under_uncertainty"],
    formats: ["experience_based", "scenario_based"],
    activationRules: {
      onlyDomains: ["operations", "retail", "logistics", "healthcare", "hospitality"],
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
    },
  },

  {
    id: "resource_optimization",
    category: "execution",
    description:
      "Assesses ability to deliver results with limited resources. Tests creative problem-solving under constraints.",
    signals: ["system_thinking", "tradeoff_awareness"],
    formats: ["experience_based"],
    activationRules: {
      minExperienceLevel: "mid",
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
    },
  },

  // ===========================================================================
  // COMMUNICATION
  // ===========================================================================
  {
    id: "explaining_complexity",
    category: "communication",
    description:
      "Assesses ability to explain complex ideas clearly to non-experts. Critical for cross-functional roles.",
    signals: ["communication_clarity"],
    formats: ["experience_based", "reflection"],
    activationRules: {
      default: true,
      whenCollaborationRequired: true,
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
      minAnswerWords: 50,
    },
  },

  {
    id: "disagreement_and_alignment",
    category: "communication",
    description:
      "Evaluates how a candidate handles disagreement and reaches alignment. Tests conflict resolution and influence.",
    signals: ["stakeholder_management", "communication_clarity"],
    formats: ["experience_based"],
    activationRules: {
      whenCollaborationRequired: true,
      minExperienceLevel: "mid",
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
      minAnswerWords: 75,
    },
  },

  {
    id: "stakeholder_interaction",
    category: "communication",
    description:
      "Assesses experience managing external stakeholders, clients, or customers. Tests relationship management.",
    signals: ["stakeholder_management", "communication_clarity"],
    formats: ["experience_based"],
    activationRules: {
      whenCustomerFacing: true,
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
      minAnswerWords: 50,
    },
  },

  {
    id: "motivation_and_intent",
    category: "communication",
    description:
      "Assesses clarity of intent and motivation for applying. Tests self-awareness and alignment with role.",
    signals: ["communication_clarity"],
    formats: ["reflection"],
    activationRules: {
      default: true,
    },
    renderingConstraints: {
      forbidYesNo: true,
      forbidPureTheory: true,
      minAnswerWords: 50,
    },
  },

  {
    id: "persuasion_and_influence",
    category: "communication",
    description:
      "Evaluates ability to persuade others without formal authority. Tests influence skills.",
    signals: ["stakeholder_management", "communication_clarity"],
    formats: ["experience_based"],
    activationRules: {
      minExperienceLevel: "senior",
      whenCollaborationRequired: true,
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
    },
  },

  // ===========================================================================
  // ETHICS
  // ===========================================================================
  {
    id: "ethical_boundary_case",
    category: "ethics",
    description:
      "Assesses ethical judgment in ambiguous or pressured situations. Critical for regulated environments.",
    signals: ["ethical_awareness", "accountability"],
    formats: ["experience_based"],
    activationRules: {
      requiresRegulation: true,
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
      singleQuestion: true,
      minAnswerWords: 75,
    },
  },

  {
    id: "rule_vs_judgment",
    category: "ethics",
    description:
      "Evaluates judgment when formal rules conflict with real-world context. Tests nuanced ethical reasoning.",
    signals: ["ethical_awareness", "decision_under_uncertainty"],
    formats: ["experience_based", "scenario_based"],
    activationRules: {
      requiresRegulation: true,
      minExperienceLevel: "mid",
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
      minAnswerWords: 75,
    },
  },

  {
    id: "pressure_to_compromise",
    category: "ethics",
    description:
      "Assesses response to pressure to cut corners or compromise standards. Tests integrity under pressure.",
    signals: ["ethical_awareness", "accountability"],
    formats: ["experience_based"],
    activationRules: {
      minExperienceLevel: "mid",
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
    },
  },

  // ===========================================================================
  // TECHNICAL DEPTH
  // ===========================================================================
  {
    id: "technical_depth_probe",
    category: "technical_depth",
    description:
      "Verifies hands-on technical depth beyond surface-level claims. Prevents credential inflation.",
    signals: ["technical_depth"],
    formats: ["experience_based", "problem_solving"],
    activationRules: {
      default: true,
      onlyDomains: ["technology", "engineering", "healthcare", "finance", "legal"],
    },
    renderingConstraints: {
      requiresRealExample: true,
      singleQuestion: true,
      minAnswerWords: 75,
    },
  },

  {
    id: "debugging_and_problem_diagnosis",
    category: "technical_depth",
    description:
      "Assesses systematic approach to diagnosing and solving technical problems. Tests analytical rigor.",
    signals: ["technical_depth", "system_thinking"],
    formats: ["experience_based", "problem_solving"],
    activationRules: {
      onlyDomains: ["technology", "engineering"],
    },
    renderingConstraints: {
      requiresRealExample: true,
      minAnswerWords: 75,
    },
  },

  {
    id: "technical_communication",
    category: "technical_depth",
    description:
      "Evaluates ability to communicate technical concepts to non-technical stakeholders. Bridges depth and clarity.",
    signals: ["technical_depth", "communication_clarity"],
    formats: ["experience_based"],
    activationRules: {
      onlyDomains: ["technology", "engineering"],
      whenCollaborationRequired: true,
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
    },
  },

  // ===========================================================================
  // LEADERSHIP
  // ===========================================================================
  {
    id: "leadership_through_others",
    category: "leadership",
    description:
      "Evaluates influence, delegation, and leadership without direct authority. Tests leadership mindset.",
    signals: ["stakeholder_management", "accountability"],
    formats: ["experience_based"],
    activationRules: {
      minExperienceLevel: "senior",
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
      minAnswerWords: 75,
    },
  },

  {
    id: "team_development",
    category: "leadership",
    description:
      "Assesses approach to developing and growing team members. Tests people management capability.",
    signals: ["stakeholder_management", "accountability"],
    formats: ["experience_based", "reflection"],
    activationRules: {
      whenPeopleManagement: true,
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
      minAnswerWords: 75,
    },
  },

  {
    id: "difficult_conversation",
    category: "leadership",
    description:
      "Evaluates handling of difficult conversations (feedback, conflict, performance). Tests emotional intelligence.",
    signals: ["stakeholder_management", "communication_clarity"],
    formats: ["experience_based"],
    activationRules: {
      minExperienceLevel: "senior",
      whenPeopleManagement: true,
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
      minAnswerWords: 75,
    },
  },

  {
    id: "strategic_alignment",
    category: "leadership",
    description:
      "Assesses ability to align team efforts with organizational strategy. Tests strategic thinking.",
    signals: ["system_thinking", "stakeholder_management"],
    formats: ["experience_based", "reflection"],
    activationRules: {
      minExperienceLevel: "executive",
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
      minAnswerWords: 100,
    },
  },

  {
    id: "crisis_leadership",
    category: "leadership",
    description:
      "Evaluates leadership effectiveness during crisis or high-pressure situations. Tests composure and decisiveness.",
    signals: ["decision_under_uncertainty", "stakeholder_management", "accountability"],
    formats: ["experience_based"],
    activationRules: {
      minExperienceLevel: "senior",
      whenRiskLevelAtLeast: "high",
    },
    renderingConstraints: {
      requiresRealExample: true,
      forbidYesNo: true,
      singleQuestion: true,
      minAnswerWords: 100,
    },
  },
];

/**
 * The canonical archetype registry.
 * Version follows semantic versioning:
 * - MAJOR: Breaking changes to archetype structure
 * - MINOR: New archetypes added
 * - PATCH: Fixes to descriptions, constraints
 */
const ARCHETYPE_REGISTRY: ArchetypeRegistry = {
  registryVersion: "1.1.0",
  description:
    "Canonical, job-agnostic context question archetypes used by Zehire to extract evaluative signals without ranking or scoring.",
  lastUpdated: "2026-01-06",
  archetypes,
};

/**
 * Lookup map for O(1) archetype retrieval by ID.
 */
export const ARCHETYPE_BY_ID: ReadonlyMap<string, Archetype> = new Map(
  archetypes.map((a) => [a.id, a])
);

/**
 * Get an archetype by ID.
 * @throws Error if archetype not found
 */
export function getArchetype(id: string): Archetype {
  const archetype = ARCHETYPE_BY_ID.get(id);
  if (!archetype) {
    throw new Error(`Archetype not found: ${id}`);
  }
  return archetype;
}

/**
 * Get an archetype by ID, returning undefined if not found.
 */
export function findArchetype(id: string): Archetype | undefined {
  return ARCHETYPE_BY_ID.get(id);
}

/**
 * Get all archetypes in a category.
 */
export function getArchetypesByCategory(category: string): Archetype[] {
  return archetypes.filter((a) => a.category === category);
}

/**
 * Get all archetypes that extract a specific signal.
 */
export function getArchetypesBySignal(signalId: string): Archetype[] {
  return archetypes.filter((a) => a.signals.includes(signalId as any));
}

// Named export for explicit imports
export { ARCHETYPE_REGISTRY };

// Default export for convenience
export default ARCHETYPE_REGISTRY;
