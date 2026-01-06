/**
 * Zehire Complete Pipeline Example
 * =================================
 * Shows the full flow: Job Posting → Questions
 */
import {
  generateQuestionsForJob,
  validateRenderedQuestion,
  type JobPostingInput,
  type LLMClient,
} from "./index";

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
  `,
  companyName: "TechCorp",
};

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
  `,
  companyName: "Memorial Hospital",
};

// =============================================================================
// MOCK LLM CLIENT
// =============================================================================

/**
 * Mock LLM that returns realistic responses for demonstration.
 */
const mockLLMClient: LLMClient = {
  async complete({ user }) {
    // Detect if this is a job context inference or question rendering
    if (user.includes("Return JSON matching this exact schema")) {
      // Job context inference
      return getMockJobContext(user);
    } else if (user.includes("Write a single interview question")) {
      // Question rendering
      return getMockQuestion(user);
    }
    throw new Error("Unknown prompt type");
  },
};

function getMockJobContext(prompt: string): string {
  if (prompt.includes("Senior Software Engineer")) {
    return JSON.stringify({
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
    });
  }

  if (prompt.includes("ICU")) {
    return JSON.stringify({
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
    });
  }

  throw new Error("Unknown job type in mock");
}

function getMockQuestion(prompt: string): string {
  // Return appropriate mock questions based on archetype
  if (prompt.includes("situational_uncertainty_story")) {
    if (prompt.includes("technology")) {
      return "Tell me about a time when you had to make a significant technical decision without having all the information you needed. What was the situation, how did you approach the decision, and what was the outcome?";
    }
    if (prompt.includes("healthcare")) {
      return "Describe a situation where you had to make a critical patient care decision with incomplete information. How did you assess the situation, what factors did you prioritize, and how did it turn out?";
    }
  }

  if (prompt.includes("technical_depth_probe")) {
    return "Walk me through the most complex technical problem you've solved in the past year. What made it challenging, what approach did you take, and what did you learn from the experience?";
  }

  if (prompt.includes("explaining_complexity")) {
    if (prompt.includes("technology")) {
      return "Describe a time when you had to explain a complex technical concept to a non-technical stakeholder. What was the concept, how did you approach the explanation, and how did you know they understood?";
    }
    if (prompt.includes("healthcare")) {
      return "Tell me about a time when you had to explain a complex medical situation to a patient's family. How did you approach the conversation and ensure they understood?";
    }
  }

  if (prompt.includes("high_stakes_decision")) {
    return "Describe a situation where you had to make a high-stakes decision that could have had significant negative consequences if wrong. What was at stake, how did you approach the decision, and what happened?";
  }

  if (prompt.includes("ethical_boundary_case")) {
    return "Tell me about a time when you faced an ethical dilemma in your work. What was the situation, what considerations did you weigh, and how did you decide what to do?";
  }

  if (prompt.includes("execution_under_constraint")) {
    return "Describe a project where you had to deliver results under significant time or resource constraints. How did you prioritize, what tradeoffs did you make, and what was the outcome?";
  }

  if (prompt.includes("ownership_of_outcome")) {
    return "Tell me about a time when something you were responsible for didn't go as planned. What happened, how did you respond, and what did you learn from the experience?";
  }

  if (prompt.includes("stakeholder_interaction")) {
    return "Describe a challenging interaction with a customer or client. What made it difficult, how did you handle it, and what was the result?";
  }

  // Default fallback
  return "Tell me about a significant professional challenge you've faced. What was the situation, how did you approach it, and what did you learn?";
}

// =============================================================================
// DEMONSTRATION
// =============================================================================

function printDivider(title: string) {
  console.log("\n" + "=".repeat(70));
  console.log(title);
  console.log("=".repeat(70));
}

async function demonstrateFullPipeline() {
  printDivider("COMPLETE PIPELINE — Senior Software Engineer");

  const engineerResult = await generateQuestionsForJob(mockLLMClient, seniorEngineerJob);

  console.log("\n📋 Job Context Inferred:");
  console.log(`   Domain: ${engineerResult.jobContext.domain}`);
  console.log(`   Specialization: ${engineerResult.jobContext.specialization}`);
  console.log(`   Experience: ${engineerResult.jobContext.experienceLevel}`);
  console.log(`   Risk Level: ${engineerResult.jobContext.riskLevel}`);
  console.log(
    `   Primary Signals: ${engineerResult.jobContext.primarySignals.slice(0, 3).join(", ")}`
  );

  console.log("\n📝 Archetypes Selected:");
  for (const arch of engineerResult.archetypes) {
    console.log(`   • ${arch.id}`);
  }

  console.log("\n❓ Questions Generated:");
  for (let i = 0; i < engineerResult.questions.length; i++) {
    const q = engineerResult.questions[i];
    console.log(`\n   Question ${i + 1} (${q!.archetypeId}):`);
    console.log(`   "${q!.questionText}"`);
    console.log(`   Signals: ${q!.signals.join(", ")}`);
    if (q!.minAnswerWords) {
      console.log(`   Min words hint: ${q!.minAnswerWords}`);
    }
  }

  printDivider("COMPLETE PIPELINE — ICU Nurse");

  const nurseResult = await generateQuestionsForJob(mockLLMClient, icuNurseJob);

  console.log("\n📋 Job Context Inferred:");
  console.log(`   Domain: ${nurseResult.jobContext.domain}`);
  console.log(`   Risk Level: ${nurseResult.jobContext.riskLevel}`);
  console.log(`   Decision Impact: ${nurseResult.jobContext.decisionImpact}`);
  console.log(`   Regulated: ${nurseResult.jobContext.regulatedEnvironment}`);

  console.log("\n📝 Archetypes Selected:");
  for (const arch of nurseResult.archetypes) {
    console.log(`   • ${arch.id}`);
  }

  console.log("\n❓ Questions Generated:");
  for (let i = 0; i < nurseResult.questions.length; i++) {
    const q = nurseResult.questions[i];
    console.log(`\n   Question ${i + 1} (${q!.archetypeId}):`);
    console.log(`   "${q!.questionText}"`);
    console.log(`   Signals: ${q!.signals.join(", ")}`);
  }

  printDivider("VALIDATION EXAMPLE");

  // Show validation in action
  const goodQuestion =
    "Tell me about a time when you had to make a decision with incomplete information.";
  const badQuestion = "Do you have experience with distributed systems?";

  console.log("\nValidating good question:");
  console.log(`   "${goodQuestion}"`);
  const goodResult = validateRenderedQuestion(goodQuestion, {
    forbidYesNo: true,
    singleQuestion: true,
  });
  console.log(`   Valid: ${goodResult.valid}`);

  console.log("\nValidating bad question (yes/no):");
  console.log(`   "${badQuestion}"`);
  const badResult = validateRenderedQuestion(badQuestion, {
    forbidYesNo: true,
    singleQuestion: true,
  });
  console.log(`   Valid: ${badResult.valid}`);
  console.log(`   Issues: ${badResult.issues.join(", ")}`);

  printDivider("DATA TO STORE IN DATABASE");

  console.log(`
When POST /jobs completes, store:

1. Job record:
   {
     id: "job_xxx",
     title: "${seniorEngineerJob.title}",
     description: "...",
     createdAt: "${engineerResult.renderedAt}"
   }

2. Job context (for audit/debugging):
   {
     jobId: "job_xxx",
     context: ${JSON.stringify(engineerResult.jobContext, null, 6)
       .split("\n")
       .map((l, i) => (i === 0 ? l : "     " + l))
       .join("\n")}
   }

3. Questions:
   [
     ${engineerResult.questions
       .map(
         (q) => `{
       jobId: "job_xxx",
       archetypeId: "${q.archetypeId}",
       questionText: "${q.questionText.slice(0, 50)}...",
       signals: ${JSON.stringify(q.signals)},
       order: ${engineerResult.questions.indexOf(q) + 1}
     }`
       )
       .join(",\n     ")}
   ]
`);

  printDivider("DONE");
}

// Run
demonstrateFullPipeline().catch(console.error);
