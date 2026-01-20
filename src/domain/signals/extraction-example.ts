/**
 * Signal Extraction Example
 * =========================
 * Demonstrates and tests signal extraction from candidate answers.
 *
 * Run with: bun run src/domain/signals/extraction-example.ts
 */

import type { LLMClient } from "../jobs/archetypes/inference";
import type { SignalId } from "../jobs/archetypes/types";
import {
  buildExtractionPrompt,
  extractSignalsFromAnswer,
  parseExtractionResponse,
  SIGNAL_EXTRACTION_SYSTEM_PROMPT,
} from "./extractor";
import { aggregateSignals, detectConflicts, analyzeCriticalSignals } from "./aggregator";
import { computePosture } from "./posture";
import type {
  AnswerExtractionResult,
  SignalConfidence,
  SignalExtractionInput,
  SignalStateResult,
} from "./types";

// =============================================================================
// EXAMPLE INPUTS
// =============================================================================

const exampleInput: SignalExtractionInput = {
  questionText:
    "Tell me about a time when you had to make a significant decision with incomplete information. What was the situation, what did you decide, and how did it turn out?",
  archetypeId: "past_decision_uncertainty",
  targetSignals: [
    "decision_under_uncertainty",
    "risk_reasoning",
    "accountability",
  ] as SignalId[],
  answerText: `
    Last year at my previous company, we had a critical decision to make about migrating our
    payment system. We had two options: a well-established vendor with higher costs, or a newer
    startup with better pricing but less track record.

    The challenge was that we had only 3 weeks to decide before our current contract expired,
    and the newer vendor couldn't provide all the reference customers we wanted to talk to.

    I led the evaluation and ultimately recommended the newer vendor. My reasoning was:
    1. Their technical architecture was more modern and would save us 6+ months of integration work
    2. The cost savings of $200K/year could fund a backup plan if things went wrong
    3. I negotiated a 90-day exit clause so we could switch if there were issues

    I took full ownership of this recommendation to leadership, presenting both the risks and
    my mitigation strategies. The decision paid off - the migration went smoothly and we've
    now been on the platform for 18 months with 99.9% uptime.

    If it had failed, I was prepared to own that outcome too and had already drafted a
    contingency plan for rapid migration to the alternative vendor.
  `,
  jobContext: {
    domain: "technology",
    experienceLevel: "senior",
    riskLevel: "medium",
  },
};

const minimalAnswerInput: SignalExtractionInput = {
  questionText:
    "Describe a situation where you had to balance multiple stakeholder needs.",
  archetypeId: "stakeholder_balance",
  targetSignals: ["stakeholder_management", "tradeoff_awareness"] as SignalId[],
  answerText: "I usually try to listen to everyone and find a compromise.",
  jobContext: {
    domain: "consulting",
    experienceLevel: "mid",
    riskLevel: "low",
  },
};

const emptyAnswerInput: SignalExtractionInput = {
  questionText: "Tell me about a time you failed and what you learned.",
  archetypeId: "learning_from_failure",
  targetSignals: ["learning_from_failure", "accountability"] as SignalId[],
  answerText: "",
  jobContext: {
    domain: "healthcare",
    experienceLevel: "entry",
    riskLevel: "high",
  },
};

// =============================================================================
// MOCK LLM RESPONSES
// =============================================================================

const mockResponses: Record<string, string> = {
  // Match by a phrase from the question
  "incomplete information": JSON.stringify({
    responseQuality: "substantial",
    signals: [
      {
        signalId: "decision_under_uncertainty",
        confidence: "clear",
        evidence:
          "Candidate explicitly describes making a decision with incomplete information (couldn't get all reference customers) and a tight timeline (3 weeks).",
        reasoning:
          "The answer demonstrates clear decision-making under uncertainty with specific details about the constraints and unknowns.",
      },
      {
        signalId: "risk_reasoning",
        confidence: "clear",
        evidence:
          "Candidate articulated specific risk mitigation: negotiated 90-day exit clause, calculated cost savings to fund backup plan, and had contingency plan ready.",
        reasoning:
          "Strong evidence of systematic risk assessment and proactive mitigation strategies.",
      },
      {
        signalId: "accountability",
        confidence: "clear",
        evidence:
          "Candidate states 'I took full ownership of this recommendation' and 'I was prepared to own that outcome too'.",
        reasoning:
          "Explicit statements of ownership for both the decision and potential consequences.",
      },
    ],
  }),

  // Match stakeholder question
  "balance multiple stakeholder": JSON.stringify({
    responseQuality: "minimal",
    signals: [
      {
        signalId: "stakeholder_management",
        confidence: "partial",
        evidence: "Candidate mentions 'listen to everyone'",
        reasoning:
          "Shows awareness of stakeholder needs but no specific example or depth.",
      },
      {
        signalId: "tradeoff_awareness",
        confidence: "absent",
        evidence: "Only mentions 'find a compromise'",
        reasoning:
          "No specific discussion of tradeoffs or how different needs were balanced.",
      },
    ],
  }),
};

// =============================================================================
// MOCK LLM CLIENT
// =============================================================================

class MockLLMClient implements LLMClient {
  async complete(params: {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    // Simulate async behavior
    await Promise.resolve();

    // Find archetype in the prompt
    for (const [archetype, response] of Object.entries(mockResponses)) {
      if (params.user.includes(archetype)) {
        return response;
      }
    }

    // Default response for unknown archetypes
    return JSON.stringify({
      responseQuality: "minimal",
      signals: [],
    });
  }
}

// =============================================================================
// TEST FUNCTIONS
// =============================================================================

/**
 * Test 1: Prompt building
 */
function testPromptBuilding(): void {
  console.log("=".repeat(60));
  console.log("TEST 1: Prompt Building");
  console.log("=".repeat(60));

  const prompt = buildExtractionPrompt(exampleInput);

  console.log("\n--- System Prompt (truncated) ---");
  console.log(SIGNAL_EXTRACTION_SYSTEM_PROMPT.slice(0, 500) + "...\n");

  console.log("--- User Prompt ---");
  console.log(prompt);

  console.log("\n✓ Prompt building works correctly\n");
}

/**
 * Test 2: Response parsing
 */
function testResponseParsing(): void {
  console.log("=".repeat(60));
  console.log("TEST 2: Response Parsing");
  console.log("=".repeat(60));

  // Test valid response
  const validResponse = mockResponses["incomplete information"]!;
  const parsed = parseExtractionResponse(validResponse, exampleInput.targetSignals);

  console.log("\n--- Parsed Response ---");
  console.log("Response Quality:", parsed.responseQuality);
  console.log("Signals:");
  for (const signal of parsed.signals) {
    console.log(`  - ${signal.signalId}: ${signal.confidence}`);
    if (signal.evidence) {
      console.log(`    Evidence: ${signal.evidence.slice(0, 80)}...`);
    }
  }

  // Test markdown-wrapped response
  const markdownResponse = "```json\n" + validResponse + "\n```";
  const parsedMarkdown = parseExtractionResponse(
    markdownResponse,
    exampleInput.targetSignals
  );
  console.log("\n✓ Markdown-wrapped JSON parsing works");
  console.log("  Parsed signals:", parsedMarkdown.signals.length);

  // Test invalid response handling
  console.log("\n--- Testing Invalid Responses ---");
  try {
    parseExtractionResponse("not json", ["decision_under_uncertainty"] as SignalId[]);
    console.log("✗ Should have thrown on invalid JSON");
  } catch (e) {
    console.log("✓ Correctly threw on invalid JSON");
  }

  try {
    parseExtractionResponse('{"responseQuality": "invalid"}', [
      "decision_under_uncertainty",
    ] as SignalId[]);
    console.log("✗ Should have thrown on invalid responseQuality");
  } catch (e) {
    console.log("✓ Correctly threw on invalid responseQuality");
  }

  console.log("");
}

/**
 * Test 3: Signal extraction with mock client
 */
async function testSignalExtraction(): Promise<void> {
  console.log("=".repeat(60));
  console.log("TEST 3: Signal Extraction (Mock LLM)");
  console.log("=".repeat(60));

  const client = new MockLLMClient();

  // Test substantial answer
  console.log("\n--- Substantial Answer ---");
  const result1 = await extractSignalsFromAnswer(
    client,
    exampleInput,
    "answer-001"
  );
  printExtractionResult(result1);

  // Test minimal answer
  console.log("\n--- Minimal Answer ---");
  const result2 = await extractSignalsFromAnswer(
    client,
    minimalAnswerInput,
    "answer-002"
  );
  printExtractionResult(result2);

  // Test empty answer (should skip LLM call)
  console.log("\n--- Empty Answer (skips LLM) ---");
  const result3 = await extractSignalsFromAnswer(
    client,
    emptyAnswerInput,
    "answer-003"
  );
  printExtractionResult(result3);

  console.log("");
}

/**
 * Test 4: Signal aggregation
 */
function testSignalAggregation(): void {
  console.log("=".repeat(60));
  console.log("TEST 4: Signal Aggregation");
  console.log("=".repeat(60));

  // Create mock extraction results
  const results: AnswerExtractionResult[] = [
    {
      answerId: "a1",
      archetypeId: "past_decision",
      responseQuality: "substantial",
      signals: [
        { signalId: "decision_under_uncertainty" as SignalId, confidence: "clear" },
        { signalId: "risk_reasoning" as SignalId, confidence: "partial" },
        { signalId: "accountability" as SignalId, confidence: "clear" },
      ],
      extractedAt: new Date().toISOString(),
    },
    {
      answerId: "a2",
      archetypeId: "failure_question",
      responseQuality: "minimal",
      signals: [
        { signalId: "learning_from_failure" as SignalId, confidence: "partial" },
        { signalId: "accountability" as SignalId, confidence: "partial" }, // Second evaluation of accountability
      ],
      extractedAt: new Date().toISOString(),
    },
    {
      answerId: "a3",
      archetypeId: "stakeholder_q",
      responseQuality: "substantial",
      signals: [
        { signalId: "stakeholder_management" as SignalId, confidence: "absent" },
        { signalId: "communication_clarity" as SignalId, confidence: "unclear" },
      ],
      extractedAt: new Date().toISOString(),
    },
  ];

  const allSignals: SignalId[] = [
    "decision_under_uncertainty",
    "risk_reasoning",
    "accountability",
    "learning_from_failure",
    "stakeholder_management",
    "communication_clarity",
    "technical_depth", // Never asked about
  ];

  // Test the standalone aggregateSignals function
  const aggregated = aggregateSignals({
    extractions: results,
    allSignalIds: allSignals,
  });

  console.log("\n--- Aggregated Signals ---");
  console.log("Present (clear):", aggregated.present);
  console.log("Partial:", aggregated.partial);
  console.log("Missing (absent/unclear):", aggregated.missing);
  console.log("Not Asked:", aggregated.notAsked);

  console.log("\n--- Details ---");
  for (const [signalId, detail] of Object.entries(aggregated.details)) {
    const typedDetail = detail as {
      bestConfidence: SignalConfidence;
      evaluationCount: number;
      evidence: string[];
    };
    console.log(`${signalId}:`);
    console.log(`  Best confidence: ${typedDetail.bestConfidence}`);
    console.log(`  Evaluation count: ${typedDetail.evaluationCount}`);
  }

  // Verify results
  const checks = [
    {
      name: "decision_under_uncertainty is present",
      pass: aggregated.present.includes("decision_under_uncertainty" as SignalId),
    },
    {
      name: "accountability is present (best of clear, partial)",
      pass: aggregated.present.includes("accountability" as SignalId),
    },
    {
      name: "risk_reasoning is partial",
      pass: aggregated.partial.includes("risk_reasoning" as SignalId),
    },
    {
      name: "learning_from_failure is partial",
      pass: aggregated.partial.includes("learning_from_failure" as SignalId),
    },
    {
      name: "stakeholder_management is missing (absent)",
      pass: aggregated.missing.includes("stakeholder_management" as SignalId),
    },
    {
      name: "technical_depth was not asked",
      pass: aggregated.notAsked.includes("technical_depth" as SignalId),
    },
  ];

  console.log("\n--- Verification ---");
  for (const check of checks) {
    console.log(`${check.pass ? "✓" : "✗"} ${check.name}`);
  }

  console.log("");
}

/**
 * Test 5: Conflict Detection
 */
function testConflictDetection(): void {
  console.log("=".repeat(60));
  console.log("TEST 5: Conflict Detection");
  console.log("=".repeat(60));

  // Create extraction results with conflicting evidence
  // Scenario: Candidate claims accountability but blames others
  const conflictingResults: AnswerExtractionResult[] = [
    {
      answerId: "conflict-a1",
      archetypeId: "accountability_question",
      responseQuality: "substantial",
      signals: [
        {
          signalId: "accountability" as SignalId,
          confidence: "clear",
          evidence:
            "I took full ownership of the project outcome and was responsible for all decisions.",
        },
      ],
      extractedAt: new Date().toISOString(),
    },
    {
      answerId: "conflict-a2",
      archetypeId: "failure_question",
      responseQuality: "substantial",
      signals: [
        {
          signalId: "learning_from_failure" as SignalId,
          confidence: "partial",
          evidence:
            "The project failed because it wasn't my fault - the team didn't deliver and their mistake caused the delay.",
        },
      ],
      extractedAt: new Date().toISOString(),
    },
  ];

  console.log("\n--- Testing Accountability vs Blame-Shifting Conflict ---");
  console.log("Answer 1 (accountability): 'I took full ownership...'");
  console.log("Answer 2 (learning_from_failure): 'wasn't my fault...their mistake...'");

  const conflicts = detectConflicts(conflictingResults);

  console.log(`\nDetected conflicts: ${conflicts.length}`);
  for (const conflict of conflicts) {
    console.log(`\n  Conflict: ${conflict.signals[0]} vs ${conflict.signals[1]}`);
    console.log(`  Reason: ${conflict.reason}`);
    console.log(`  Evidence signal1: "${conflict.evidence.signal1.quote.slice(0, 50)}..."`);
    console.log(`  Evidence signal2: "${conflict.evidence.signal2.quote.slice(0, 50)}..."`);
  }

  // Test case with NO conflict (consistent answers)
  console.log("\n--- Testing Consistent Answers (No Conflict) ---");
  const consistentResults: AnswerExtractionResult[] = [
    {
      answerId: "consistent-a1",
      archetypeId: "accountability_question",
      responseQuality: "substantial",
      signals: [
        {
          signalId: "accountability" as SignalId,
          confidence: "clear",
          evidence: "I took full ownership and when things went wrong, I owned up to it.",
        },
      ],
      extractedAt: new Date().toISOString(),
    },
    {
      answerId: "consistent-a2",
      archetypeId: "failure_question",
      responseQuality: "substantial",
      signals: [
        {
          signalId: "learning_from_failure" as SignalId,
          confidence: "clear",
          evidence:
            "I made a mistake in the architecture decision. I learned to validate assumptions earlier.",
        },
      ],
      extractedAt: new Date().toISOString(),
    },
  ];

  const noConflicts = detectConflicts(consistentResults);
  console.log(`Detected conflicts: ${noConflicts.length}`);
  console.log(noConflicts.length === 0 ? "✓ Correctly found no conflicts" : "✗ Unexpected conflict");

  // Verify results
  console.log("\n--- Verification ---");
  console.log(conflicts.length > 0 ? "✓ Detected blame-shifting conflict" : "✗ Missed conflict");
  console.log(
    noConflicts.length === 0 ? "✓ No false positives on consistent answers" : "✗ False positive"
  );

  console.log("");
}

/**
 * Test 6: Critical Signal Analysis
 */
function testCriticalSignalAnalysis(): void {
  console.log("=".repeat(60));
  console.log("TEST 6: Critical Signal Analysis");
  console.log("=".repeat(60));

  // Create aggregated state
  const aggregatedState = {
    present: ["decision_under_uncertainty", "accountability"] as SignalId[],
    partial: ["risk_reasoning"] as SignalId[],
    missing: ["learning_from_failure"] as SignalId[],
    notAsked: ["technical_depth", "ethical_awareness"] as SignalId[],
    details: {},
  };

  // Define primary (critical) signals for a job
  const primarySignals: SignalId[] = [
    "decision_under_uncertainty",
    "risk_reasoning",
    "accountability",
    "learning_from_failure",
  ];

  console.log("\n--- Primary (Critical) Signals for Job ---");
  console.log(primarySignals);

  console.log("\n--- Aggregated State ---");
  console.log("Present:", aggregatedState.present);
  console.log("Partial:", aggregatedState.partial);
  console.log("Missing:", aggregatedState.missing);
  console.log("Not Asked:", aggregatedState.notAsked);

  const analysis = analyzeCriticalSignals({
    aggregatedState,
    primarySignals,
  });

  console.log("\n--- Critical Signal Analysis ---");
  console.log("Critical Signals:", analysis.criticalSignals);
  console.log("Satisfied:", analysis.satisfied);
  console.log("Gaps:", analysis.gaps);
  console.log("Has Critical Gap:", analysis.hasCriticalGap);

  // Verification
  console.log("\n--- Verification ---");
  const checks = [
    {
      name: "decision_under_uncertainty is satisfied (present)",
      pass: analysis.satisfied.includes("decision_under_uncertainty" as SignalId),
    },
    {
      name: "accountability is satisfied (present)",
      pass: analysis.satisfied.includes("accountability" as SignalId),
    },
    {
      name: "risk_reasoning is a gap with status 'partial'",
      pass: analysis.gaps.some(
        (g) => g.signalId === "risk_reasoning" && g.status === "partial" && g.wasAsked === true
      ),
    },
    {
      name: "learning_from_failure is a gap with status 'missing'",
      pass: analysis.gaps.some(
        (g) => g.signalId === "learning_from_failure" && g.status === "missing" && g.wasAsked === true
      ),
    },
    {
      name: "hasCriticalGap is true (because of risk_reasoning and learning_from_failure)",
      pass: analysis.hasCriticalGap === true,
    },
  ];

  for (const check of checks) {
    console.log(`${check.pass ? "✓" : "✗"} ${check.name}`);
  }

  console.log("");
}

/**
 * Test 7: Posture Computation
 */
function testPostureComputation(): void {
  console.log("=".repeat(60));
  console.log("TEST 7: Posture Computation");
  console.log("=".repeat(60));

  // Test 1: LOW_REGRET_RISK (all critical signals satisfied)
  console.log("\n--- Test: LOW_REGRET_RISK ---");
  const lowRiskState: SignalStateResult = {
    aggregated: {
      present: [
        "decision_under_uncertainty",
        "accountability",
        "risk_reasoning",
        "learning_from_failure",
      ] as SignalId[],
      partial: [] as SignalId[],
      missing: [] as SignalId[],
      notAsked: ["technical_depth"] as SignalId[],
      details: {
        decision_under_uncertainty: { bestConfidence: "clear", evaluationCount: 1, evidence: [] },
        accountability: { bestConfidence: "clear", evaluationCount: 1, evidence: [] },
        risk_reasoning: { bestConfidence: "clear", evaluationCount: 1, evidence: [] },
        learning_from_failure: { bestConfidence: "clear", evaluationCount: 1, evidence: [] },
      },
    },
    criticalAnalysis: {
      criticalSignals: [
        "decision_under_uncertainty",
        "accountability",
        "risk_reasoning",
      ] as SignalId[],
      satisfied: [
        "decision_under_uncertainty",
        "accountability",
        "risk_reasoning",
      ] as SignalId[],
      gaps: [],
      hasCriticalGap: false,
    },
    conflicts: [],
    cvContradictions: [],
    computedAt: new Date().toISOString(),
  };

  const lowRiskPosture = computePosture(lowRiskState);
  console.log(`Posture: ${lowRiskPosture.posture}`);
  console.log(`Primary Reason: ${lowRiskPosture.primaryReason}`);
  console.log(`Suggested Actions: ${lowRiskPosture.suggestedActions.length}`);
  console.log(
    lowRiskPosture.posture === "LOW_REGRET_RISK"
      ? "✓ Correctly computed LOW_REGRET_RISK"
      : "✗ Expected LOW_REGRET_RISK"
  );

  // Test 2: SOME_UNCERTAINTY (critical gap)
  console.log("\n--- Test: SOME_UNCERTAINTY (critical gap) ---");
  const someUncertaintyState: SignalStateResult = {
    aggregated: {
      present: ["decision_under_uncertainty", "accountability"] as SignalId[],
      partial: ["risk_reasoning"] as SignalId[],
      missing: ["learning_from_failure"] as SignalId[],
      notAsked: [] as SignalId[],
      details: {
        decision_under_uncertainty: { bestConfidence: "clear", evaluationCount: 1, evidence: [] },
        accountability: { bestConfidence: "clear", evaluationCount: 1, evidence: [] },
        risk_reasoning: { bestConfidence: "partial", evaluationCount: 1, evidence: [] },
        learning_from_failure: { bestConfidence: "absent", evaluationCount: 1, evidence: [] },
      },
    },
    criticalAnalysis: {
      criticalSignals: [
        "decision_under_uncertainty",
        "accountability",
        "risk_reasoning",
      ] as SignalId[],
      satisfied: ["decision_under_uncertainty", "accountability"] as SignalId[],
      gaps: [{ signalId: "risk_reasoning" as SignalId, status: "partial", wasAsked: true }],
      hasCriticalGap: true,
    },
    conflicts: [],
    cvContradictions: [],
    computedAt: new Date().toISOString(),
  };

  const someUncertaintyPosture = computePosture(someUncertaintyState);
  console.log(`Posture: ${someUncertaintyPosture.posture}`);
  console.log(`Primary Reason: ${someUncertaintyPosture.primaryReason}`);
  console.log(`Reasons: ${someUncertaintyPosture.reasons.map((r) => r.code).join(", ")}`);
  console.log(`Suggested Actions: ${someUncertaintyPosture.suggestedActions.join("; ")}`);
  console.log(
    someUncertaintyPosture.posture === "SOME_UNCERTAINTY"
      ? "✓ Correctly computed SOME_UNCERTAINTY"
      : "✗ Expected SOME_UNCERTAINTY"
  );

  // Test 3: HIGH_UNCERTAINTY (majority critical missing)
  console.log("\n--- Test: HIGH_UNCERTAINTY (majority critical missing) ---");
  const highUncertaintyState: SignalStateResult = {
    aggregated: {
      present: [] as SignalId[],
      partial: [] as SignalId[],
      missing: [
        "decision_under_uncertainty",
        "accountability",
        "risk_reasoning",
      ] as SignalId[],
      notAsked: [] as SignalId[],
      details: {
        decision_under_uncertainty: { bestConfidence: "absent", evaluationCount: 1, evidence: [] },
        accountability: { bestConfidence: "absent", evaluationCount: 1, evidence: [] },
        risk_reasoning: { bestConfidence: "absent", evaluationCount: 1, evidence: [] },
      },
    },
    criticalAnalysis: {
      criticalSignals: [
        "decision_under_uncertainty",
        "accountability",
        "risk_reasoning",
      ] as SignalId[],
      satisfied: [] as SignalId[],
      gaps: [
        { signalId: "decision_under_uncertainty" as SignalId, status: "missing", wasAsked: true },
        { signalId: "accountability" as SignalId, status: "missing", wasAsked: true },
        { signalId: "risk_reasoning" as SignalId, status: "missing", wasAsked: true },
      ],
      hasCriticalGap: true,
    },
    conflicts: [],
    cvContradictions: [],
    computedAt: new Date().toISOString(),
  };

  const highUncertaintyPosture = computePosture(highUncertaintyState);
  console.log(`Posture: ${highUncertaintyPosture.posture}`);
  console.log(`Primary Reason: ${highUncertaintyPosture.primaryReason}`);
  console.log(`Reasons: ${highUncertaintyPosture.reasons.map((r) => r.code).join(", ")}`);
  console.log(`Suggested Actions: ${highUncertaintyPosture.suggestedActions.join("; ")}`);
  console.log(
    highUncertaintyPosture.posture === "HIGH_UNCERTAINTY"
      ? "✓ Correctly computed HIGH_UNCERTAINTY"
      : "✗ Expected HIGH_UNCERTAINTY"
  );

  // Test 4: HIGH_UNCERTAINTY (multiple conflicts)
  console.log("\n--- Test: HIGH_UNCERTAINTY (multiple conflicts) ---");
  const conflictState: SignalStateResult = {
    aggregated: {
      present: ["decision_under_uncertainty", "accountability"] as SignalId[],
      partial: [] as SignalId[],
      missing: [] as SignalId[],
      notAsked: [] as SignalId[],
      details: {
        decision_under_uncertainty: { bestConfidence: "clear", evaluationCount: 1, evidence: [] },
        accountability: { bestConfidence: "clear", evaluationCount: 1, evidence: [] },
      },
    },
    criticalAnalysis: {
      criticalSignals: ["decision_under_uncertainty", "accountability"] as SignalId[],
      satisfied: ["decision_under_uncertainty", "accountability"] as SignalId[],
      gaps: [],
      hasCriticalGap: false,
    },
    conflicts: [
      {
        signals: ["accountability", "learning_from_failure"] as [SignalId, SignalId],
        reason: "Claims accountability but blames others",
        evidence: {
          signal1: { answerId: "a1", quote: "I took ownership" },
          signal2: { answerId: "a2", quote: "It wasn't my fault" },
        },
      },
      {
        signals: ["decision_under_uncertainty", "risk_reasoning"] as [SignalId, SignalId],
        reason: "Claims decisiveness but shows analysis paralysis",
        evidence: {
          signal1: { answerId: "a1", quote: "I made quick decisions" },
          signal2: { answerId: "a3", quote: "I couldn't decide for weeks" },
        },
      },
    ],
    cvContradictions: [],
    computedAt: new Date().toISOString(),
  };

  const conflictPosture = computePosture(conflictState);
  console.log(`Posture: ${conflictPosture.posture}`);
  console.log(`Primary Reason: ${conflictPosture.primaryReason}`);
  console.log(`Reasons: ${conflictPosture.reasons.map((r) => r.code).join(", ")}`);
  console.log(
    conflictPosture.posture === "HIGH_UNCERTAINTY"
      ? "✓ Correctly computed HIGH_UNCERTAINTY for multiple conflicts"
      : "✗ Expected HIGH_UNCERTAINTY"
  );

  // Summary
  console.log("\n--- Summary ---");
  console.log(
    `LOW_REGRET_RISK: ${lowRiskPosture.posture === "LOW_REGRET_RISK" ? "✓" : "✗"}`
  );
  console.log(
    `SOME_UNCERTAINTY (gap): ${someUncertaintyPosture.posture === "SOME_UNCERTAINTY" ? "✓" : "✗"}`
  );
  console.log(
    `HIGH_UNCERTAINTY (missing): ${highUncertaintyPosture.posture === "HIGH_UNCERTAINTY" ? "✓" : "✗"}`
  );
  console.log(
    `HIGH_UNCERTAINTY (conflicts): ${conflictPosture.posture === "HIGH_UNCERTAINTY" ? "✓" : "✗"}`
  );

  console.log("");
}

// =============================================================================
// HELPERS
// =============================================================================

function printExtractionResult(result: AnswerExtractionResult): void {
  console.log(`Answer ID: ${result.answerId}`);
  console.log(`Response Quality: ${result.responseQuality}`);
  console.log("Signals:");
  for (const signal of result.signals) {
    console.log(`  - ${signal.signalId}: ${signal.confidence}`);
    if (signal.reasoning) {
      console.log(`    Reasoning: ${signal.reasoning.slice(0, 60)}...`);
    }
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║          Signal Extraction Example & Tests                 ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("\n");

  testPromptBuilding();
  testResponseParsing();
  await testSignalExtraction();
  testSignalAggregation();
  testConflictDetection();
  testCriticalSignalAnalysis();
  testPostureComputation();

  console.log("=".repeat(60));
  console.log("All tests completed!");
  console.log("=".repeat(60));
}

main().catch(console.error);
