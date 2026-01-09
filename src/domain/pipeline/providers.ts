/**
 * Assessment Providers Registry
 * =============================
 * Static registry of available assessment providers.
 */

// =============================================================================
// PROVIDER TYPES
// =============================================================================

export interface AssessmentProvider {
  /** Unique identifier (used in pipeline config) */
  id: string;
  /** Display name */
  name: string;
  /** Provider type: external (third-party) or internal (custom) */
  type: "external" | "internal";
  /** Short description */
  description: string;
  /** Role categories this provider is best suited for */
  bestFor: string[];
}

// =============================================================================
// PROVIDERS REGISTRY
// =============================================================================

export const assessmentProviders: AssessmentProvider[] = [
  {
    id: "hackerrank",
    name: "HackerRank",
    type: "external",
    description: "Technical assessments for developers with coding challenges and system design problems",
    bestFor: ["engineering", "data", "devops"],
  },
  {
    id: "codility",
    name: "Codility",
    type: "external",
    description: "Coding tests and technical interviews with automated evaluation",
    bestFor: ["engineering", "backend", "frontend"],
  },
  {
    id: "testgorilla",
    name: "TestGorilla",
    type: "external",
    description: "Pre-employment testing for any role including cognitive and personality assessments",
    bestFor: ["any", "sales", "marketing", "operations"],
  },
  {
    id: "takehome",
    name: "Take-Home Project",
    type: "internal",
    description: "Custom take-home assignment relevant to the role",
    bestFor: ["engineering", "design", "product", "content"],
  },
  {
    id: "none",
    name: "No Assessment",
    type: "internal",
    description: "Skip technical assessment, proceed directly to interviews",
    bestFor: ["executive", "entry-level", "leadership"],
  },
];

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get a provider by ID.
 */
export function getProviderById(id: string): AssessmentProvider | undefined {
  return assessmentProviders.find((p) => p.id === id);
}

/**
 * Get all provider IDs.
 */
export function getProviderIds(): string[] {
  return assessmentProviders.map((p) => p.id);
}

/**
 * Check if a provider ID is valid.
 */
export function isValidProviderId(id: string): boolean {
  return assessmentProviders.some((p) => p.id === id);
}
