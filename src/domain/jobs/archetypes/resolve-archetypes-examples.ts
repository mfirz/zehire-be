/**
 * Zehire Archetype System — Usage Examples & Tests
 * =================================================
 * Demonstrates the complete archetype resolution flow.
 */
import {
  resolveArchetypes,
  resolveArchetypeIds,
  wouldActivate,
  analyzeSignalCoverage,
  ARCHETYPE_REGISTRY,
  getArchetype,
  getArchetypesByCategory,
  getArchetypesBySignal,
  CATEGORY_METADATA,
  MAX_ARCHETYPES_PER_JOB,
  type JobContext,
  type ArchetypeResolutionResult,
} from "./index"

// =============================================================================
// EXAMPLE JOB CONTEXTS
// =============================================================================

/**
 * Example: Senior Software Engineer
 */
const seniorEngineerContext: JobContext = {
  domain: "technology",
  specialization: "backend",
  riskLevel: "medium",
  decisionImpact: "business",
  primarySignals: [
    "technical_depth",
    "decision_under_uncertainty",
    "system_thinking",
  ],
  collaborationRequired: "high",
  customerFacing: false,
  peopleManagement: false,
  regulatedEnvironment: false,
  experienceLevel: "senior",
}

/**
 * Example: ICU Nurse
 */
const icuNurseContext: JobContext = {
  domain: "healthcare",
  specialization: "intensive_care",
  riskLevel: "high",
  decisionImpact: "human_life",
  primarySignals: [
    "decision_under_uncertainty",
    "ethical_awareness",
    "accountability",
  ],
  collaborationRequired: "high",
  customerFacing: true,
  peopleManagement: false,
  regulatedEnvironment: true,
  experienceLevel: "mid",
}

/**
 * Example: VP of Engineering
 */
const vpEngineeringContext: JobContext = {
  domain: "technology",
  specialization: "engineering_leadership",
  riskLevel: "high",
  decisionImpact: "business",
  primarySignals: [
    "stakeholder_management",
    "system_thinking",
    "accountability",
  ],
  collaborationRequired: "high",
  customerFacing: true,
  peopleManagement: true,
  regulatedEnvironment: false,
  experienceLevel: "executive",
}

/**
 * Example: Retail Store Manager
 */
const retailManagerContext: JobContext = {
  domain: "retail",
  specialization: null,
  riskLevel: "low",
  decisionImpact: "business",
  primarySignals: ["stakeholder_management", "tradeoff_awareness"],
  collaborationRequired: "medium",
  customerFacing: true,
  peopleManagement: true,
  regulatedEnvironment: false,
  experienceLevel: "mid",
}

/**
 * Example: Entry-Level Marketing Associate
 */
const entryMarketingContext: JobContext = {
  domain: "marketing",
  specialization: "digital",
  riskLevel: "low",
  decisionImpact: "low",
  primarySignals: ["communication_clarity"],
  collaborationRequired: "medium",
  customerFacing: false,
  peopleManagement: false,
  regulatedEnvironment: false,
  experienceLevel: "entry",
}

/**
 * Example: Compliance Officer (Finance)
 */
const complianceOfficerContext: JobContext = {
  domain: "finance",
  specialization: "compliance",
  riskLevel: "high",
  decisionImpact: "regulatory",
  primarySignals: ["ethical_awareness", "risk_reasoning", "accountability"],
  collaborationRequired: "medium",
  customerFacing: false,
  peopleManagement: false,
  regulatedEnvironment: true,
  experienceLevel: "senior",
}

// =============================================================================
// TEST FUNCTIONS
// =============================================================================

function printDivider(title: string) {
  console.log("\n" + "=".repeat(70))
  console.log(title)
  console.log("=".repeat(70))
}

function printResult(result: ArchetypeResolutionResult) {
  console.log(`\nDomain: ${result.jobContext.domain}`)
  console.log(`Experience: ${result.jobContext.experienceLevel}`)
  console.log(`Risk Level: ${result.jobContext.riskLevel}`)
  console.log(`Regulated: ${result.jobContext.regulatedEnvironment}`)
  console.log(`People Management: ${result.jobContext.peopleManagement}`)

  console.log(
    `\nSelected Archetypes (${result.archetypes.length}/${MAX_ARCHETYPES_PER_JOB}):`
  )
  for (const archetype of result.archetypes) {
    console.log(`  • ${archetype.id}`)
    console.log(`    Category: ${archetype.category}`)
    console.log(`    Signals: ${archetype.signals.join(", ")}`)
    console.log(`    Reason: ${archetype.selectionReason}`)
  }

  if (result.excluded.length > 0) {
    console.log(`\nExcluded Archetypes (${result.excluded.length}):`)
    for (const excluded of result.excluded.slice(0, 5)) {
      console.log(`  ✗ ${excluded.id}: ${excluded.reason}`)
    }
    if (result.excluded.length > 5) {
      console.log(`  ... and ${result.excluded.length - 5} more`)
    }
  }
}

// =============================================================================
// RUN EXAMPLES
// =============================================================================

function runExamples() {
  printDivider("ARCHETYPE REGISTRY INFO")
  console.log(`Version: ${ARCHETYPE_REGISTRY.registryVersion}`)
  console.log(`Total Archetypes: ${ARCHETYPE_REGISTRY.archetypes.length}`)
  console.log(`Last Updated: ${ARCHETYPE_REGISTRY.lastUpdated}`)

  // Categories breakdown
  console.log("\nArchetypes by Category:")
  for (const [category, meta] of Object.entries(CATEGORY_METADATA)) {
    const count = getArchetypesByCategory(category).length
    console.log(`  ${meta.label}: ${count}`)
  }

  printDivider("EXAMPLE 1: Senior Software Engineer")
  const engineerResult = resolveArchetypes({
    jobContext: seniorEngineerContext,
  })
  printResult(engineerResult)

  // Signal coverage analysis
  const engineerCoverage = analyzeSignalCoverage(engineerResult)
  console.log(`\nSignal Coverage:`)
  console.log(`  Covered: ${engineerCoverage.coveredSignals.join(", ")}`)
  if (engineerCoverage.uncoveredPrimarySignals.length > 0) {
    console.log(
      `  ⚠ Uncovered Primary: ${engineerCoverage.uncoveredPrimarySignals.join(", ")}`
    )
  }

  printDivider("EXAMPLE 2: ICU Nurse (High-Risk, Regulated)")
  const nurseResult = resolveArchetypes({ jobContext: icuNurseContext })
  printResult(nurseResult)

  printDivider("EXAMPLE 3: VP of Engineering (Executive)")
  const vpResult = resolveArchetypes({ jobContext: vpEngineeringContext })
  printResult(vpResult)

  printDivider("EXAMPLE 4: Retail Store Manager")
  const retailResult = resolveArchetypes({ jobContext: retailManagerContext })
  printResult(retailResult)

  printDivider("EXAMPLE 5: Entry-Level Marketing Associate")
  const marketingResult = resolveArchetypes({
    jobContext: entryMarketingContext,
  })
  printResult(marketingResult)

  printDivider("EXAMPLE 6: Compliance Officer (Finance)")
  const complianceResult = resolveArchetypes({
    jobContext: complianceOfficerContext,
  })
  printResult(complianceResult)

  printDivider("UTILITY FUNCTIONS DEMO")

  // Quick ID resolution
  console.log("\nQuick archetype IDs for Senior Engineer:")
  const ids = resolveArchetypeIds(seniorEngineerContext)
  console.log(`  ${ids.join(", ")}`)

  // Check specific activation
  console.log("\nWould 'ethical_boundary_case' activate for...")
  console.log(
    `  ICU Nurse: ${wouldActivate("ethical_boundary_case", icuNurseContext)}`
  )
  console.log(
    `  Senior Engineer: ${wouldActivate("ethical_boundary_case", seniorEngineerContext)}`
  )
  console.log(
    `  Compliance Officer: ${wouldActivate("ethical_boundary_case", complianceOfficerContext)}`
  )

  // Get single archetype details
  console.log("\nArchetype Details for 'high_stakes_decision':")
  const highStakes = getArchetype("high_stakes_decision")
  console.log(`  Category: ${highStakes.category}`)
  console.log(`  Signals: ${highStakes.signals.join(", ")}`)
  console.log(`  Formats: ${highStakes.formats.join(", ")}`)

  // Archetypes by signal
  console.log("\nArchetypes that extract 'ethical_awareness' signal:")
  const ethicsArchetypes = getArchetypesBySignal("ethical_awareness")
  for (const a of ethicsArchetypes) {
    console.log(`  • ${a.id}`)
  }

  printDivider("TESTS COMPLETE")
}

// Run if this is the main module
runExamples()
