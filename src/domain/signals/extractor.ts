/**
 * Signal Extraction Service
 * =========================
 * LLM-powered signal extraction from candidate answers.
 *
 * Signals are extracted contextually based on:
 * - The question asked (archetype)
 * - The target signals for that question
 * - The candidate's answer
 * - Job context (experience level, domain, risk)
 */

import { SIGNAL_METADATA, type SignalId } from "../jobs/archetypes/types";
import type { LLMClient } from "../jobs/archetypes/inference";
import type {
  AnswerExtractionResult,
  ExtractedSignal,
  LLMExtractionResponse,
  ResponseQuality,
  SignalConfidence,
  SignalExtractionInput,
} from "./types";

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

/**
 * System prompt for signal extraction.
 * Defines what signals are and how to evaluate them.
 */
export const SIGNAL_EXTRACTION_SYSTEM_PROMPT = `You are a signal extraction system for Zehire, a hiring platform. Your job is to analyze candidate answers and extract behavioral signals.

## What Are Signals?

Signals are observable indicators of how a candidate thinks, decides, and behaves. They are NOT scores or rankings. You are extracting information, not judging candidates.

## Confidence Levels

For each target signal, evaluate the candidate's answer and assign a confidence level:

- **clear**: The candidate describes a SPECIFIC past situation with concrete details: what happened, what they specifically did, and the outcome. REQUIRES all three: (1) a specific event/situation, (2) their specific actions, (3) results or outcomes. Example: "When our API went down in March, I coordinated the incident response and we restored service in 23 minutes."

- **partial**: The candidate touches on the signal but lacks specificity. This includes: philosophical statements about general approach, beliefs about how they work, or vague references to past experiences without concrete details. Example: "I always try to take ownership when things go wrong" or "Throughout my career, I have handled many difficult situations."

- **absent**: The candidate had an opportunity to demonstrate this signal (the question asked about it) but did not. Their answer shows no evidence of this behavior.

- **unclear**: Cannot determine from the answer. The answer may be off-topic, too vague, or ambiguous. Use this when you genuinely cannot assess the signal.

## Response Quality

Also assess the overall response quality:

- **substantial**: Detailed answer with concrete examples, specific actions, and clear outcomes
- **minimal**: Brief but addresses the question; lacks depth or specifics
- **empty**: Answer is empty, too short (< 20 words), or just filler text
- **off_topic**: Answer doesn't address the question asked

## Important Rules

1. **Only evaluate the target signals listed** - Do not invent or infer other signals
2. **Extract evidence VERBATIM from the answer** - You MUST quote the candidate's EXACT words as they appear in the answer. Do NOT add, remove, or modify any words. Do NOT add pronouns like "I" to make it grammatically correct. The evidence text must be a substring that exists exactly in the original answer.
3. **Do not infer signals that aren't demonstrated** - "I would..." or "I believe..." is weaker than "I did..."
4. **Calibrate to experience level** - "clear" for entry-level may mean less depth than for senior
5. **"absent" is information, not judgment** - It means the signal wasn't shown, not that the candidate is bad
6. **Look for behaviors and examples, not keywords** - Candidates saying "I take ownership" without examples is weak
7. **CRITICAL: Philosophical statements are NEVER "clear"** - General statements about approach or beliefs (e.g., "I always try to...", "I believe strongly in...", "Throughout my career...", "I approach problems by...") without describing a SPECIFIC situation are "partial" at best. Length does not equal specificity - a 200-word philosophical essay is still "partial" if it lacks a concrete example with specific details.

## Output Format

Return valid JSON matching this structure:
{
  "responseQuality": "substantial" | "minimal" | "empty" | "off_topic",
  "signals": [
    {
      "signalId": "the_signal_id",
      "confidence": "clear" | "partial" | "absent" | "unclear",
      "evidence": "EXACT verbatim quote from the answer (must exist as-is in the text)",
      "reasoning": "Why you assigned this confidence level"
    }
  ]
}`;

// =============================================================================
// PROMPT BUILDER
// =============================================================================

/**
 * Build the user prompt for signal extraction.
 */
export function buildExtractionPrompt(input: SignalExtractionInput): string {
  // Build target signals section with descriptions
  const signalsSection = input.targetSignals
    .map((signalId) => {
      const meta = SIGNAL_METADATA[signalId];
      return `- **${signalId}**: ${meta.description}`;
    })
    .join("\n");

  return `## Question Asked
${input.questionText}

## Target Signals to Evaluate
${signalsSection}

## Candidate's Answer
${input.answerText}

## Job Context
- Domain: ${input.jobContext.domain}
- Experience Level: ${input.jobContext.experienceLevel}
- Risk Level: ${input.jobContext.riskLevel}

## Instructions
Evaluate ONLY the target signals listed above. For each signal, determine the confidence level based on the candidate's answer. Extract specific evidence from the answer to support your evaluation.

Return your evaluation as JSON.`;
}

// =============================================================================
// EVIDENCE VALIDATION
// =============================================================================

/**
 * Validate and correct evidence text to ensure it exists in the answer.
 * If evidence doesn't exist verbatim, attempt to find the closest match.
 *
 * @param evidence - The evidence text from LLM
 * @param answerText - The original answer text
 * @returns Corrected evidence or undefined if no match found
 */
export function validateEvidence(evidence: string | undefined, answerText: string): string | undefined {
  if (!evidence || !answerText) {
    return undefined;
  }

  // Normalize whitespace for comparison
  const normalizedAnswer = answerText.replace(/\s+/g, " ").trim();
  const normalizedEvidence = evidence.replace(/\s+/g, " ").trim();

  // Check if evidence exists exactly (case-insensitive search, case-preserving result)
  const lowerAnswer = normalizedAnswer.toLowerCase();
  const lowerEvidence = normalizedEvidence.toLowerCase();

  if (lowerAnswer.includes(lowerEvidence)) {
    // Find the actual case-preserved substring
    const startIdx = lowerAnswer.indexOf(lowerEvidence);
    return normalizedAnswer.slice(startIdx, startIdx + normalizedEvidence.length);
  }

  // Try to find a close match by removing common LLM additions like leading "I"
  // Pattern: LLM adds "I " at the start to make grammatically correct
  if (normalizedEvidence.toLowerCase().startsWith("i ")) {
    const withoutI = normalizedEvidence.slice(2);
    const lowerWithoutI = withoutI.toLowerCase();
    if (lowerAnswer.includes(lowerWithoutI)) {
      const startIdx = lowerAnswer.indexOf(lowerWithoutI);
      return normalizedAnswer.slice(startIdx, startIdx + withoutI.length);
    }
  }

  // Try finding the longest common substring if evidence is reasonably long
  if (normalizedEvidence.length >= 20) {
    const bestMatch = findLongestCommonSubstring(normalizedAnswer, normalizedEvidence);
    // Only use if match is at least 60% of original evidence length
    if (bestMatch && bestMatch.length >= normalizedEvidence.length * 0.6) {
      return bestMatch;
    }
  }

  // Return undefined if no good match found - the evidence is likely paraphrased
  return undefined;
}

/**
 * Find the longest common substring between two strings.
 */
function findLongestCommonSubstring(str1: string, str2: string): string {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  // Use a sliding window approach for efficiency
  let longestMatch = "";

  for (let i = 0; i < s2.length; i++) {
    for (let j = i + longestMatch.length; j <= s2.length; j++) {
      const substring = s2.slice(i, j);
      if (s1.includes(substring)) {
        // Get the actual case-preserved substring from str1
        const startIdx = s1.indexOf(substring);
        longestMatch = str1.slice(startIdx, startIdx + substring.length);
      } else {
        break;
      }
    }
  }

  return longestMatch;
}

// =============================================================================
// RESPONSE PARSING
// =============================================================================

/**
 * Valid response quality values.
 */
const VALID_RESPONSE_QUALITIES: ResponseQuality[] = [
  "substantial",
  "minimal",
  "empty",
  "off_topic",
];

/**
 * Valid confidence values.
 */
const VALID_CONFIDENCES: SignalConfidence[] = ["clear", "partial", "absent", "unclear"];

/**
 * Parse and validate the LLM extraction response.
 */
export function parseExtractionResponse(
  responseText: string,
  targetSignals: SignalId[]
): LLMExtractionResponse {
  // Try to extract JSON from the response
  let jsonText = responseText.trim();

  // Handle markdown code blocks
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch?.[1]) {
    jsonText = jsonMatch[1].trim();
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${jsonText.slice(0, 200)}`);
  }

  // Validate structure
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("LLM response is not an object");
  }

  const response = parsed as Record<string, unknown>;

  // Validate responseQuality
  const responseQuality = response.responseQuality;
  if (
    typeof responseQuality !== "string" ||
    !VALID_RESPONSE_QUALITIES.includes(responseQuality as ResponseQuality)
  ) {
    throw new Error(`Invalid responseQuality: ${String(responseQuality)}`);
  }

  // Validate signals array
  const signals = response.signals;
  if (!Array.isArray(signals)) {
    throw new Error("signals must be an array");
  }

  // Validate each signal
  const validatedSignals: LLMExtractionResponse["signals"] = [];
  const targetSignalSet = new Set(targetSignals);

  for (const signal of signals) {
    if (typeof signal !== "object" || signal === null) {
      throw new Error("Each signal must be an object");
    }

    const s = signal as Record<string, unknown>;

    // Validate signalId
    if (typeof s.signalId !== "string") {
      throw new Error("signalId must be a string");
    }

    // Only include signals that were in the target list
    if (!targetSignalSet.has(s.signalId as SignalId)) {
      console.warn(`LLM returned signal not in target list: ${s.signalId}`);
      continue;
    }

    // Validate confidence
    if (
      typeof s.confidence !== "string" ||
      !VALID_CONFIDENCES.includes(s.confidence as SignalConfidence)
    ) {
      throw new Error(`Invalid confidence for ${s.signalId}: ${String(s.confidence)}`);
    }

    const validatedSignal: LLMExtractionResponse["signals"][number] = {
      signalId: s.signalId,
      confidence: s.confidence as SignalConfidence,
    };
    if (typeof s.evidence === "string") {
      validatedSignal.evidence = s.evidence;
    }
    if (typeof s.reasoning === "string") {
      validatedSignal.reasoning = s.reasoning;
    }
    validatedSignals.push(validatedSignal);
  }

  // Ensure all target signals are represented
  const returnedSignalIds = new Set(validatedSignals.map((s) => s.signalId));
  for (const targetSignal of targetSignals) {
    if (!returnedSignalIds.has(targetSignal)) {
      // Add missing signal with "unclear" confidence
      validatedSignals.push({
        signalId: targetSignal,
        confidence: "unclear",
        reasoning: "Signal not evaluated by LLM",
      } as LLMExtractionResponse["signals"][number]);
    }
  }

  return {
    responseQuality: responseQuality as ResponseQuality,
    signals: validatedSignals,
  };
}

// =============================================================================
// MAIN EXTRACTION FUNCTION
// =============================================================================

/**
 * Extract signals from a single answer using LLM.
 *
 * @param client - LLM client for making API calls
 * @param input - Extraction input with question, answer, and context
 * @param answerId - ID of the answer being processed
 * @param options - Optional configuration
 * @returns Extraction result with signals and confidence levels
 */
export async function extractSignalsFromAnswer(
  client: LLMClient,
  input: SignalExtractionInput,
  answerId: string,
  options?: { maxRetries?: number }
): Promise<AnswerExtractionResult> {
  const maxRetries = options?.maxRetries ?? 2;

  // Handle empty/minimal answers without LLM call
  const answerLength = input.answerText.trim().length;
  if (answerLength === 0) {
    return {
      answerId,
      archetypeId: input.archetypeId,
      responseQuality: "empty",
      signals: input.targetSignals.map((signalId) => ({
        signalId,
        confidence: "unclear" as SignalConfidence,
        reasoning: "Answer is empty",
      })),
      extractedAt: new Date().toISOString(),
    };
  }

  // Very short answers (< 20 words) are likely minimal
  const wordCount = input.answerText.trim().split(/\s+/).length;
  if (wordCount < 20) {
    return {
      answerId,
      archetypeId: input.archetypeId,
      responseQuality: "empty",
      signals: input.targetSignals.map((signalId) => ({
        signalId,
        confidence: "unclear" as SignalConfidence,
        reasoning: "Answer is too short to evaluate",
      })),
      extractedAt: new Date().toISOString(),
    };
  }

  // Build prompt
  const prompt = buildExtractionPrompt(input);

  let lastError: Error | null = null;
  let result: LLMExtractionResponse | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.complete({
        system: SIGNAL_EXTRACTION_SYSTEM_PROMPT,
        user: prompt,
        temperature: 0, // Consistency over creativity
        maxTokens: 2048, // Increased for Groq/Llama which may need more tokens
      });

      result = parseExtractionResponse(response, input.targetSignals);
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        console.warn(
          `Signal extraction failed for answer ${answerId}, retrying (${attempt + 1}/${maxRetries}): ${lastError.message}`
        );
      }
    }
  }

  if (!result) {
    throw lastError ?? new Error("Failed to extract signals");
  }

  // Convert to AnswerExtractionResult with evidence validation
  const extractedSignals: ExtractedSignal[] = result.signals.map((s) => {
    const extracted: ExtractedSignal = {
      signalId: s.signalId as SignalId,
      confidence: s.confidence,
    };
    if (s.evidence !== undefined) {
      // Validate and correct evidence to ensure it exists in the answer
      const validatedEvidence = validateEvidence(s.evidence, input.answerText);
      if (validatedEvidence) {
        extracted.evidence = validatedEvidence;
      }
      // If validation fails, omit evidence rather than keep incorrect text
    }
    if (s.reasoning !== undefined) {
      extracted.reasoning = s.reasoning;
    }
    return extracted;
  });

  return {
    answerId,
    archetypeId: input.archetypeId,
    responseQuality: result.responseQuality,
    signals: extractedSignals,
    extractedAt: new Date().toISOString(),
  };
}
