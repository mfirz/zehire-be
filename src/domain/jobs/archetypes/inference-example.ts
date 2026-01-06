/**
 * Zehire Inference Example
 * ========================
 * Shows the complete flow from job posting to resolved archetypes.
 */
import {
  buildInferencePrompt,
  parseJobContextResponse,
  JOB_CONTEXT_SYSTEM_PROMPT,
  type JobPostingInput,
  type LLMClient,
  resolveArchetypesFromJobPosting,
} from "./index"

// =============================================================================
// EXAMPLE JOB POSTINGS
// =============================================================================

const seniorEngineerJob: JobPostingInput = {
  title: "Senior Software Engineer",
  description: `
    We're looking for a Senior Software Engineer to join our Platform team.

    You will:
    - Design and build scalable backend services
    - Lead technical decisions for your team's domain
    - Mentor junior engineers
    - Collaborate with Product and Design on feature development
    - Participate in on-call rotation for production systems

    Requirements:
    - 5+ years of experience in backend development
    - Strong experience with distributed systems
    - Proficiency in Go or Python
    - Experience with cloud infrastructure (AWS/GCP)
    - Excellent communication skills

    Nice to have:
    - Experience with Kubernetes
    - Previous tech lead experience
  `,
  companyName: "TechCorp",
  department: "Engineering",
}

const icuNurseJob: JobPostingInput = {
  title: "ICU Registered Nurse",
  description: `
    Join our Intensive Care Unit at Memorial Hospital.

    Responsibilities:
    - Provide critical care to patients in life-threatening conditions
    - Monitor vital signs and administer medications
    - Collaborate with physicians on treatment plans
    - Support families through difficult decisions
    - Document patient care accurately

    Requirements:
    - Active RN license
    - BLS and ACLS certification
    - 2+ years ICU experience preferred
    - Strong critical thinking and decision-making skills
    - Ability to remain calm under pressure
  `,
  companyName: "Memorial Hospital",
  department: "Critical Care",
  location: "California, USA",
}

const retailManagerJob: JobPostingInput = {
  title: "Store Manager",
  description: `
    Lead our flagship retail location in downtown.

    You will:
    - Manage a team of 15-20 sales associates
    - Drive sales targets and customer satisfaction
    - Handle inventory and merchandising
    - Resolve customer complaints
    - Hire and train new team members

    Requirements:
    - 3+ years retail management experience
    - Strong leadership and communication skills
    - Flexible schedule including weekends
    - Experience with POS systems
  `,
  companyName: "Fashion Outlet",
}

// =============================================================================
// MOCK LLM CLIENT (for demonstration)
// =============================================================================

/**
 * Mock LLM responses for demonstration.
 * In production, replace with actual Anthropic/OpenAI client.
 */
const mockResponses: Record<string, string> = {
  "Senior Software Engineer": JSON.stringify({
    domain: "technology",
    specialization: "backend",
    riskLevel: "medium",
    decisionImpact: "business",
    primarySignals: [
      "technical_depth",
      "decision_under_uncertainty",
      "system_thinking",
      "communication_clarity",
      "accountability",
    ],
    collaborationRequired: "high",
    customerFacing: false,
    peopleManagement: false,
    regulatedEnvironment: false,
    experienceLevel: "senior",
  }),

  "ICU Registered Nurse": JSON.stringify({
    domain: "healthcare",
    specialization: "intensive_care",
    riskLevel: "high",
    decisionImpact: "human_life",
    primarySignals: [
      "decision_under_uncertainty",
      "ethical_awareness",
      "accountability",
      "communication_clarity",
      "risk_reasoning",
    ],
    collaborationRequired: "high",
    customerFacing: true,
    peopleManagement: false,
    regulatedEnvironment: true,
    experienceLevel: "mid",
  }),

  "Store Manager": JSON.stringify({
    domain: "retail",
    specialization: null,
    riskLevel: "low",
    decisionImpact: "business",
    primarySignals: [
      "stakeholder_management",
      "accountability",
      "communication_clarity",
      "tradeoff_awareness",
    ],
    collaborationRequired: "high",
    customerFacing: true,
    peopleManagement: true,
    regulatedEnvironment: false,
    experienceLevel: "mid",
  }),
}

const mockLLMClient: LLMClient = {
  async complete({ user }) {
    // Extract job title from prompt to return mock response
    const titleMatch = user.match(/Job Title: (.+)/)?.[1]
    if (titleMatch && mockResponses[titleMatch]) {
      return mockResponses[titleMatch]
    }
    throw new Error(`No mock response for: ${titleMatch}`)
  },
}

// =============================================================================
// DEMONSTRATION
// =============================================================================

function printDivider(title: string) {
  console.log("\n" + "=".repeat(70))
  console.log(title)
  console.log("=".repeat(70))
}

async function demonstrateInference() {
  printDivider("1. BUILD INFERENCE PROMPT")

  const prompt = buildInferencePrompt(seniorEngineerJob)
  console.log("System Prompt (first 500 chars):")
  console.log(JOB_CONTEXT_SYSTEM_PROMPT.slice(0, 500) + "...")
  console.log("\nUser Prompt (first 1000 chars):")
  console.log(prompt.slice(0, 1000) + "...")

  printDivider("2. PARSE LLM RESPONSE")

  const mockResponse = mockResponses["Senior Software Engineer"]
  console.log("Raw LLM Response:")
  console.log(mockResponse)

  const jobContext = parseJobContextResponse(mockResponse!)
  console.log("\nParsed JobContext:")
  console.log(JSON.stringify(jobContext, null, 2))

  printDivider("3. FULL PIPELINE — Senior Software Engineer")

  const engineerResult = await resolveArchetypesFromJobPosting(
    mockLLMClient,
    seniorEngineerJob
  )

  console.log("Inferred Context:")
  console.log(`  Domain: ${engineerResult.jobContext.domain}`)
  console.log(`  Risk Level: ${engineerResult.jobContext.riskLevel}`)
  console.log(`  Experience: ${engineerResult.jobContext.experienceLevel}`)
  console.log(
    `  Primary Signals: ${engineerResult.jobContext.primarySignals.join(", ")}`
  )

  console.log("\nSelected Archetypes:")
  for (const arch of engineerResult.archetypes) {
    console.log(`  • ${arch.id}`)
    console.log(`    Signals: ${arch.signals.join(", ")}`)
  }

  printDivider("4. FULL PIPELINE — ICU Nurse")

  const nurseResult = await resolveArchetypesFromJobPosting(
    mockLLMClient,
    icuNurseJob
  )

  console.log("Inferred Context:")
  console.log(`  Domain: ${nurseResult.jobContext.domain}`)
  console.log(`  Risk Level: ${nurseResult.jobContext.riskLevel}`)
  console.log(`  Regulated: ${nurseResult.jobContext.regulatedEnvironment}`)
  console.log(`  Decision Impact: ${nurseResult.jobContext.decisionImpact}`)

  console.log("\nSelected Archetypes:")
  for (const arch of nurseResult.archetypes) {
    console.log(`  • ${arch.id}`)
    console.log(`    Signals: ${arch.signals.join(", ")}`)
  }

  printDivider("5. FULL PIPELINE — Store Manager")

  const managerResult = await resolveArchetypesFromJobPosting(
    mockLLMClient,
    retailManagerJob
  )

  console.log("Inferred Context:")
  console.log(`  Domain: ${managerResult.jobContext.domain}`)
  console.log(
    `  People Management: ${managerResult.jobContext.peopleManagement}`
  )
  console.log(`  Customer Facing: ${managerResult.jobContext.customerFacing}`)

  console.log("\nSelected Archetypes:")
  for (const arch of managerResult.archetypes) {
    console.log(`  • ${arch.id}`)
    console.log(`    Signals: ${arch.signals.join(", ")}`)
  }

  printDivider("DONE")
}

// =============================================================================
// PRODUCTION EXAMPLE (Anthropic SDK)
// =============================================================================

/**
 * Example production LLM client using Anthropic SDK.
 * Uncomment and use in your actual implementation.
 */
/*
import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic()

const productionLLMClient: LLMClient = {
  async complete({ system, user, temperature = 0, maxTokens = 1024 }) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: "user", content: user }],
    })

    const textBlock = response.content.find((block) => block.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from LLM")
    }
    return textBlock.text
  },
}
*/

// Run demonstration
demonstrateInference().catch(console.error)
