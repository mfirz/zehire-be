/**
 * Zehire Archetype Resolver
 * =========================
 * Resolves which archetypes to activate for a given job context.
 *
 * Philosophy:
 * - Signal-first evaluation
 * - No ranking or scoring
 * - Explicit, auditable selection reasons
 * - Candidate fatigue protection (max 5 questions)
 */
import {
  ARCHETYPE_PRIORITY,
  EXCLUSION_REASONS,
  MAX_ARCHETYPES_PER_JOB,
  meetsExperienceLevel,
  meetsRiskLevel,
  MIN_ARCHETYPES_PER_JOB,
  SELECTION_REASONS,
} from "./constants";
import { ARCHETYPE_REGISTRY, findArchetype } from "./registry";
import type {
  Archetype,
  ArchetypeRegistry,
  ArchetypeResolutionResult,
  JobContext,
  ResolvedArchetype,
} from "./types";

// =============================================================================
// ACTIVATION RULE EVALUATION
// =============================================================================

interface ActivationResult {
  activated: boolean;
  reason: string;
}

/**
 * Evaluate activation rules against job context.
 * Returns whether the archetype should be activated and why.
 */
function evaluateActivationRules(archetype: Archetype, jobContext: JobContext): ActivationResult {
  const rules = archetype.activationRules;

  // Check domain restrictions first (onlyDomains)
  if (rules.onlyDomains && rules.onlyDomains.length > 0) {
    if (!rules.onlyDomains.includes(jobContext.domain)) {
      return {
        activated: false,
        reason: EXCLUSION_REASONS.domainMismatch(rules.onlyDomains),
      };
    }
  }

  // Check domain exclusions (excludeDomains)
  if (rules.excludeDomains && rules.excludeDomains.length > 0) {
    if (rules.excludeDomains.includes(jobContext.domain)) {
      return {
        activated: false,
        reason: EXCLUSION_REASONS.domainExcluded(rules.excludeDomains),
      };
    }
  }

  // Check minimum experience level
  if (rules.minExperienceLevel) {
    if (!meetsExperienceLevel(jobContext.experienceLevel, rules.minExperienceLevel)) {
      return {
        activated: false,
        reason: EXCLUSION_REASONS.experienceTooLow(rules.minExperienceLevel),
      };
    }
  }

  // Check minimum risk level
  if (rules.whenRiskLevelAtLeast) {
    if (!meetsRiskLevel(jobContext.riskLevel, rules.whenRiskLevelAtLeast)) {
      return {
        activated: false,
        reason: EXCLUSION_REASONS.riskTooLow(rules.whenRiskLevelAtLeast),
      };
    }
  }

  // Check regulated environment requirement
  if (rules.requiresRegulation && !jobContext.regulatedEnvironment) {
    return {
      activated: false,
      reason: EXCLUSION_REASONS.notRegulated,
    };
  }

  // Check collaboration requirement
  if (rules.whenCollaborationRequired && jobContext.collaborationRequired !== "high") {
    return {
      activated: false,
      reason: EXCLUSION_REASONS.noCollaboration,
    };
  }

  // Check people management requirement
  if (rules.whenPeopleManagement && !jobContext.peopleManagement) {
    return {
      activated: false,
      reason: EXCLUSION_REASONS.noPeopleManagement,
    };
  }

  // Check customer-facing requirement
  if (rules.whenCustomerFacing && !jobContext.customerFacing) {
    return {
      activated: false,
      reason: EXCLUSION_REASONS.notCustomerFacing,
    };
  }

  // Check primary signal requirement
  if (rules.whenPrimarySignalIncludes && rules.whenPrimarySignalIncludes.length > 0) {
    const hasRequiredSignal = rules.whenPrimarySignalIncludes.some((signal) =>
      jobContext.primarySignals.includes(signal)
    );
    if (!hasRequiredSignal) {
      return {
        activated: false,
        reason: EXCLUSION_REASONS.signalNotPrimary,
      };
    }
  }

  // All rules passed — determine activation reason
  return {
    activated: true,
    reason: determineSelectionReason(archetype, jobContext),
  };
}

/**
 * Determine the most specific selection reason for an activated archetype.
 */
function determineSelectionReason(archetype: Archetype, jobContext: JobContext): string {
  const rules = archetype.activationRules;

  // Anchor archetype
  if (archetype.id === "situational_uncertainty_story") {
    return SELECTION_REASONS.anchor;
  }

  // High risk activation
  if (rules.whenRiskLevelAtLeast === "high" && jobContext.riskLevel === "high") {
    return SELECTION_REASONS.highRisk;
  }

  // Regulated environment
  if (rules.requiresRegulation && jobContext.regulatedEnvironment) {
    return SELECTION_REASONS.regulated;
  }

  // Technical domain
  if (rules.onlyDomains?.includes("technology") || rules.onlyDomains?.includes("engineering")) {
    if (jobContext.domain === "technology" || jobContext.domain === "engineering") {
      return SELECTION_REASONS.technicalDomain;
    }
  }

  // Operational domain
  if (rules.onlyDomains?.some((d) => ["operations", "retail", "logistics"].includes(d))) {
    return SELECTION_REASONS.operationalDomain;
  }

  // Leadership/Executive
  if (rules.minExperienceLevel === "senior" || rules.minExperienceLevel === "executive") {
    return SELECTION_REASONS.experienceLevel(rules.minExperienceLevel);
  }

  // Collaboration
  if (rules.whenCollaborationRequired) {
    return SELECTION_REASONS.collaboration;
  }

  // Customer-facing
  if (rules.whenCustomerFacing) {
    return SELECTION_REASONS.customerFacing;
  }

  // People management
  if (rules.whenPeopleManagement) {
    return SELECTION_REASONS.peopleManagement;
  }

  // Default activation
  return SELECTION_REASONS.default;
}

// =============================================================================
// PRIORITY SORTING
// =============================================================================

/**
 * Sort archetypes by priority order.
 * Archetypes not in the priority list are placed at the end.
 */
function sortByPriority(archetypes: ResolvedArchetype[]): ResolvedArchetype[] {
  return [...archetypes].sort((a, b) => {
    const aIndex = ARCHETYPE_PRIORITY.indexOf(a.id);
    const bIndex = ARCHETYPE_PRIORITY.indexOf(b.id);

    // If both are in priority list, sort by position
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }

    // Priority list items come before non-listed items
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;

    // Both not in list — maintain original order
    return 0;
  });
}

// =============================================================================
// MAIN RESOLVER
// =============================================================================

export interface ResolveArchetypesOptions {
  /** Job context from LLM inference */
  jobContext: JobContext;

  /** Archetype registry to use (defaults to canonical registry) */
  registry?: ArchetypeRegistry;

  /** Maximum archetypes to return (defaults to MAX_ARCHETYPES_PER_JOB) */
  maxArchetypes?: number;

  /** Include audit trail of excluded archetypes */
  includeExcluded?: boolean;
}

/**
 * Resolve archetypes for a job context.
 *
 * This is the main entry point for archetype selection.
 * It evaluates all archetypes against the job context,
 * sorts by priority, and caps at the maximum limit.
 *
 * @example
 * ```typescript
 * const result = resolveArchetypes({
 *   jobContext: {
 *     domain: "technology",
 *     riskLevel: "medium",
 *     decisionImpact: "business",
 *     primarySignals: ["technical_depth", "decision_under_uncertainty"],
 *     collaborationRequired: "high",
 *     customerFacing: false,
 *     peopleManagement: false,
 *     regulatedEnvironment: false,
 *     experienceLevel: "mid",
 *   },
 * })
 *
 * console.log(result.archetypes.map(a => a.id))
 * // ["situational_uncertainty_story", "explaining_complexity", "technical_depth_probe", ...]
 * ```
 */
export function resolveArchetypes(options: ResolveArchetypesOptions): ArchetypeResolutionResult {
  const {
    jobContext,
    registry = ARCHETYPE_REGISTRY,
    maxArchetypes = MAX_ARCHETYPES_PER_JOB,
    includeExcluded = true,
  } = options;

  const activated: ResolvedArchetype[] = [];
  const excluded: Array<{ id: string; reason: string }> = [];

  // Evaluate each archetype
  for (const archetype of registry.archetypes) {
    const result = evaluateActivationRules(archetype, jobContext);

    if (result.activated) {
      activated.push({
        ...archetype,
        selectionReason: result.reason,
      });
    } else if (includeExcluded) {
      excluded.push({
        id: archetype.id,
        reason: result.reason,
      });
    }
  }

  // Sort by priority
  const sorted = sortByPriority(activated);

  // Apply capacity limit
  const selected = sorted.slice(0, maxArchetypes);
  const capacityExcluded = sorted.slice(maxArchetypes);

  // Add capacity-excluded archetypes to excluded list
  if (includeExcluded) {
    for (const archetype of capacityExcluded) {
      excluded.push({
        id: archetype.id,
        reason: EXCLUSION_REASONS.capacityReached,
      });
    }
  }

  // Ensure minimum diversity
  if (selected.length < MIN_ARCHETYPES_PER_JOB) {
    console.warn(
      `Only ${selected.length} archetypes activated for job context. ` +
        `Consider reviewing job context or activation rules.`
    );
  }

  return {
    jobContext,
    archetypes: selected,
    excluded,
    resolvedAt: new Date().toISOString(),
  };
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Get just the archetype IDs for a job context.
 * Useful for quick lookups without full resolution details.
 */
export function resolveArchetypeIds(jobContext: JobContext): string[] {
  const result = resolveArchetypes({ jobContext, includeExcluded: false });
  return result.archetypes.map((a) => a.id);
}

/**
 * Check if a specific archetype would be activated for a job context.
 */
export function wouldActivate(archetypeId: string, jobContext: JobContext): boolean {
  const archetype = findArchetype(archetypeId);
  if (!archetype) return false;

  const result = evaluateActivationRules(archetype, jobContext);
  return result.activated;
}

/**
 * Get activation status for all archetypes.
 * Useful for debugging and UI display.
 */
export function getActivationStatus(
  jobContext: JobContext
): Map<string, { activated: boolean; reason: string }> {
  const result = resolveArchetypes({ jobContext, includeExcluded: true });
  const status = new Map<string, { activated: boolean; reason: string }>();

  for (const archetype of result.archetypes) {
    status.set(archetype.id, {
      activated: true,
      reason: archetype.selectionReason,
    });
  }

  for (const excluded of result.excluded) {
    status.set(excluded.id, {
      activated: false,
      reason: excluded.reason,
    });
  }

  return status;
}

// =============================================================================
// SIGNAL COVERAGE ANALYSIS
// =============================================================================

/**
 * Analyze signal coverage for resolved archetypes.
 * Ensures the selected archetypes capture the primary signals.
 */
export function analyzeSignalCoverage(result: ArchetypeResolutionResult): {
  coveredSignals: string[];
  uncoveredPrimarySignals: string[];
  signalFrequency: Map<string, number>;
} {
  const signalFrequency = new Map<string, number>();

  for (const archetype of result.archetypes) {
    for (const signal of archetype.signals) {
      signalFrequency.set(signal, (signalFrequency.get(signal) || 0) + 1);
    }
  }

  const coveredSignals = Array.from(signalFrequency.keys());
  const uncoveredPrimarySignals = result.jobContext.primarySignals.filter(
    (signal) => !signalFrequency.has(signal)
  );

  return {
    coveredSignals,
    uncoveredPrimarySignals,
    signalFrequency,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export { evaluateActivationRules, sortByPriority };
