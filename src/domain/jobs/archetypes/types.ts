/**
 * Zehire Archetype System — Core Types
 * =====================================
 * Signal-first, volume-aware, regret-minimizing hiring platform.
 *
 * This module defines all shared types used across the archetype system:
 * - Domain inference (JobContext)
 * - Archetype definitions
 * - Activation rules
 * - Rendering constraints
 */

// =============================================================================
// SIGNAL DEFINITIONS
// =============================================================================

/**
 * Evaluative signals extracted from candidate answers.
 * These are interpreted contextually, NEVER scored numerically.
 */
export const SIGNAL_IDS = [
  "decision_under_uncertainty",
  "tradeoff_awareness",
  "risk_reasoning",
  "ethical_awareness",
  "technical_depth",
  "system_thinking",
  "communication_clarity",
  "stakeholder_management",
  "accountability",
  "learning_from_failure",
] as const;

export type SignalId = (typeof SIGNAL_IDS)[number];

/**
 * Human-readable signal metadata for UI hints and audit trails.
 */
export const SIGNAL_METADATA: Record<SignalId, { label: string; description: string }> = {
  decision_under_uncertainty: {
    label: "Decision Under Uncertainty",
    description: "How a candidate makes decisions when information is incomplete.",
  },
  tradeoff_awareness: {
    label: "Tradeoff Awareness",
    description: "Explicit reasoning about competing priorities and constraints.",
  },
  risk_reasoning: {
    label: "Risk Reasoning",
    description: "Understanding of risk, consequences, and mitigation.",
  },
  ethical_awareness: {
    label: "Ethical Awareness",
    description: "Judgment in ambiguous or ethically complex situations.",
  },
  technical_depth: {
    label: "Technical Depth",
    description: "Hands-on expertise beyond surface-level claims.",
  },
  system_thinking: {
    label: "System Thinking",
    description: "Understanding of interconnected systems and second-order effects.",
  },
  communication_clarity: {
    label: "Communication Clarity",
    description: "Ability to explain complex ideas clearly.",
  },
  stakeholder_management: {
    label: "Stakeholder Management",
    description: "Navigating relationships, disagreements, and alignment.",
  },
  accountability: {
    label: "Accountability",
    description: "Ownership of outcomes, including mistakes.",
  },
  learning_from_failure: {
    label: "Learning from Failure",
    description: "Growth behavior and adaptation after setbacks.",
  },
};

// =============================================================================
// ARCHETYPE CATEGORIES
// =============================================================================

export const ARCHETYPE_CATEGORIES = [
  "decision_judgment",
  "technical_depth",
  "communication",
  "leadership",
  "execution",
  "ethics",
  "ownership",
] as const;

export type ArchetypeCategory = (typeof ARCHETYPE_CATEGORIES)[number];

export const CATEGORY_METADATA: Record<ArchetypeCategory, { label: string; description: string }> =
  {
    decision_judgment: {
      label: "Decision & Judgment",
      description: "How candidates make decisions under uncertainty and pressure.",
    },
    technical_depth: {
      label: "Technical Depth",
      description: "Verification of hands-on technical expertise.",
    },
    communication: {
      label: "Communication",
      description: "Clarity, persuasion, and stakeholder interaction.",
    },
    leadership: {
      label: "Leadership",
      description: "Influence, delegation, and leading through others.",
    },
    execution: {
      label: "Execution",
      description: "Delivery under constraints and operational pressure.",
    },
    ethics: {
      label: "Ethics",
      description: "Judgment in ambiguous or regulated situations.",
    },
    ownership: {
      label: "Ownership",
      description: "Accountability and responsibility for outcomes.",
    },
  };

// =============================================================================
// QUESTION FORMATS
// =============================================================================

export const QUESTION_FORMATS = [
  "experience_based",
  "scenario_based",
  "hypothetical",
  "problem_solving",
  "reflection",
] as const;

export type QuestionFormat = (typeof QUESTION_FORMATS)[number];

export const FORMAT_METADATA: Record<QuestionFormat, { label: string; instruction: string }> = {
  experience_based: {
    label: "Experience-Based",
    instruction: "Ask about a real past experience with specific details.",
  },
  scenario_based: {
    label: "Scenario-Based",
    instruction: "Present a realistic scenario relevant to the role.",
  },
  hypothetical: {
    label: "Hypothetical",
    instruction: "Pose a what-if situation to explore reasoning.",
  },
  problem_solving: {
    label: "Problem Solving",
    instruction: "Present a concrete problem requiring analytical thinking.",
  },
  reflection: {
    label: "Reflection",
    instruction: "Ask for self-assessment or reasoning about intent.",
  },
};

// =============================================================================
// RISK & EXPERIENCE LEVELS
// =============================================================================

export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const EXPERIENCE_LEVELS = ["entry", "mid", "senior", "executive"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const COLLABORATION_LEVELS = ["low", "medium", "high"] as const;
export type CollaborationLevel = (typeof COLLABORATION_LEVELS)[number];

export const DECISION_IMPACTS = [
  "low",
  "business",
  "financial",
  "human_life",
  "regulatory",
] as const;
export type DecisionImpact = (typeof DECISION_IMPACTS)[number];

// =============================================================================
// JOB DOMAINS
// =============================================================================

export const JOB_DOMAINS = [
  "technology",
  "engineering",
  "healthcare",
  "finance",
  "legal",
  "operations",
  "retail",
  "logistics",
  "education",
  "marketing",
  "sales",
  "hr",
  "consulting",
  "manufacturing",
  "government",
  "nonprofit",
  "media",
  "hospitality",
  "construction",
  "real_estate",
  "other",
] as const;

export type JobDomain = (typeof JOB_DOMAINS)[number];

// =============================================================================
// JOB CONTEXT (LLM Inference Output)
// =============================================================================

/**
 * JobContext is the structured output from domain inference.
 * This is produced by an LLM analyzing the job title and description.
 */
export interface JobContext {
  /** Primary domain/industry */
  domain: JobDomain;

  /** More specific area within the domain */
  specialization?: string | null;

  /** Overall risk level of decisions in this role */
  riskLevel: RiskLevel;

  /** Type of impact decisions have */
  decisionImpact: DecisionImpact;

  /** Signals most important for this role (ordered by relevance) */
  primarySignals: SignalId[];

  /** How much collaboration is required */
  collaborationRequired: CollaborationLevel;

  /** Does the role interact directly with customers? */
  customerFacing: boolean;

  /** Does the role manage people? */
  peopleManagement: boolean;

  /** Is the role in a regulated environment? */
  regulatedEnvironment: boolean;

  /** Expected experience level */
  experienceLevel: ExperienceLevel;
}

// =============================================================================
// ACTIVATION RULES
// =============================================================================

/**
 * Rules determining when an archetype should be activated.
 * Evaluated by backend logic (not LLM).
 */
export interface ActivationRules {
  /** Enabled by default if no disqualifying rule exists */
  default?: boolean;

  /** Minimum risk level required */
  whenRiskLevelAtLeast?: RiskLevel;

  /** Only activate for specific domains */
  onlyDomains?: JobDomain[];

  /** Exclude from specific domains */
  excludeDomains?: JobDomain[];

  /** Require regulated environments */
  requiresRegulation?: boolean;

  /** Minimum experience level */
  minExperienceLevel?: ExperienceLevel;

  /** Require high collaboration */
  whenCollaborationRequired?: boolean;

  /** Require people management */
  whenPeopleManagement?: boolean;

  /** Require customer-facing role */
  whenCustomerFacing?: boolean;

  /** Activate when specific signals are primary */
  whenPrimarySignalIncludes?: SignalId[];
}

// =============================================================================
// RENDERING CONSTRAINTS
// =============================================================================

/**
 * Hard constraints enforced during question rendering.
 * These ensure questions meet quality standards.
 */
export interface RenderingConstraints {
  /** Must reference a real past experience */
  requiresRealExample?: boolean;

  /** Prevents yes/no questions */
  forbidYesNo?: boolean;

  /** Ensure only one question is rendered */
  singleQuestion?: boolean;

  /** Enforce minimum answer length hint (UX guardrail, in words) */
  minAnswerWords?: number;

  /** Disallow purely theoretical responses */
  forbidPureTheory?: boolean;

  /** Maximum question length (in characters) */
  maxQuestionLength?: number;
}

// =============================================================================
// ARCHETYPE DEFINITION
// =============================================================================

/**
 * An Archetype defines a type of context question.
 * Archetypes are job-agnostic templates that get rendered into
 * specific questions based on JobContext.
 */
export interface Archetype {
  /** Stable identifier used across system + analytics */
  id: string;

  /** High-level grouping */
  category: ArchetypeCategory;

  /** Human-readable explanation (for debugging, audit, UI hints) */
  description: string;

  /**
   * Signals this archetype is trying to extract from candidate answers.
   * Used later for interpretation, NOT scoring.
   */
  signals: SignalId[];

  /**
   * How questions should be framed
   * (e.g. experience-based, hypothetical, scenario-based)
   */
  formats: QuestionFormat[];

  /**
   * Rules for when this archetype is activated.
   * Evaluated by backend logic (not LLM).
   */
  activationRules: ActivationRules;

  /**
   * Hard constraints enforced during question rendering.
   */
  renderingConstraints: RenderingConstraints;
}

// =============================================================================
// REGISTRY DEFINITION
// =============================================================================

/**
 * The archetype registry is the canonical source of all archetypes.
 * This is a system-defined, versioned collection.
 */
export interface ArchetypeRegistry {
  /** Semantic version of the registry */
  registryVersion: string;

  /** Human-readable description */
  description: string;

  /** ISO date of last update */
  lastUpdated: string;

  /** All available archetypes */
  archetypes: Archetype[];
}

// =============================================================================
// RESOLVED ARCHETYPE (Output)
// =============================================================================

/**
 * A resolved archetype includes the selection reason for audit trails.
 */
export interface ResolvedArchetype extends Archetype {
  /** Why this archetype was selected */
  selectionReason: string;
}

/**
 * Result of archetype resolution for a job.
 */
export interface ArchetypeResolutionResult {
  /** Job context used for resolution */
  jobContext: JobContext;

  /** Selected archetypes in priority order */
  archetypes: ResolvedArchetype[];

  /** Archetypes that were considered but not selected */
  excluded: Array<{
    id: string;
    reason: string;
  }>;

  /** Timestamp of resolution */
  resolvedAt: string;
}
