/**
 * CV Contradiction Detector
 * =========================
 * Detects contradictions between candidate answer claims and CV data.
 *
 * Contradiction Types:
 * - Title mismatch: Claims a title not found in CV
 * - Duration mismatch: Claims longer tenure than CV shows
 * - Team size claims: Claims managing teams without management titles
 * - Company mismatch: Claims working at company not in CV
 *
 * Conservative approach:
 * - Only flag clear contradictions
 * - Don't flag skills (CVs are often incomplete)
 * - Don't flag soft claims (too subjective)
 */

import type { LLMClient } from "../jobs/archetypes/inference";
import type { CVWorkExperience } from "./summarizer";

// =============================================================================
// TYPES
// =============================================================================

/**
 * A detected contradiction between answer claims and CV evidence.
 */
export interface CVContradiction {
  /** What the candidate claimed in their answer */
  claim: string;

  /** What the CV shows (or doesn't show) */
  cvEvidence: string;

  /** Severity: warning (material) or info (minor) */
  severity: "warning" | "info";
}

/**
 * Result of contradiction detection.
 */
export interface ContradictionDetectionResult {
  success: boolean;
  contradictions: CVContradiction[];
  error?: string;
}

/**
 * Input for contradiction detection.
 */
export interface ContradictionDetectionInput {
  /** All answer texts from the application (combined) */
  answerTexts: Array<{
    questionText: string;
    answerText: string;
  }>;

  /** Structured CV data */
  cvData: {
    workExperiences: CVWorkExperience[];
    totalYearsExperience: number | null;
    hasManagementExperience: boolean;
  };
}

// =============================================================================
// LLM PROMPT
// =============================================================================

const CONTRADICTION_DETECTION_PROMPT = `You are an expert at detecting factual inconsistencies between what candidates claim in interview answers and what their CV shows.

Your task:
1. Extract FACTUAL CLAIMS from the candidate's answers (not opinions or soft skills)
2. Compare each claim against the CV data provided
3. Identify any contradictions

What counts as a contradiction:
- Claims a job title they never held (e.g., "As Engineering Manager..." but CV shows no management titles)
- Claims longer tenure than CV shows (e.g., "5 years at Google" but CV shows 18 months)
- Claims team size without evidence (e.g., "Led team of 15" but CV shows IC roles only)
- Claims company experience not in CV (e.g., mentions working at Amazon but Amazon not in CV)

What does NOT count as a contradiction:
- Skills mentioned but not in CV (CVs are often incomplete)
- Soft skill claims (too subjective to verify)
- Dates off by a few months (normal discrepancy)
- Claims about non-work experiences (education, personal projects)
- Current role claims (CV might be outdated)

Return a JSON array of contradictions. Each contradiction must have:
- claim: The specific factual claim from the answer (quote or paraphrase)
- cvEvidence: What the CV shows (or "Not found in CV")
- severity: "warning" for material contradictions, "info" for minor ones

Material (warning):
- Claims management experience without management titles
- Claims years of experience significantly higher than CV shows
- Claims job titles they clearly never held

Minor (info):
- Company names with slight variations
- Duration off by 6-12 months
- Historical roles not in CV (could be before CV's range)

If NO contradictions found, return an empty array [].

Return ONLY valid JSON array. No explanation or markdown.`;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Format CV data for the LLM prompt.
 */
function formatCVDataForPrompt(cvData: ContradictionDetectionInput["cvData"]): string {
  const lines: string[] = [];

  lines.push("=== CV SUMMARY ===");
  lines.push(`Total years of experience: ${cvData.totalYearsExperience ?? "Unknown"}`);
  lines.push(`Has management experience: ${cvData.hasManagementExperience ? "Yes" : "No"}`);
  lines.push("");

  lines.push("=== WORK HISTORY ===");
  if (cvData.workExperiences.length === 0) {
    lines.push("No work experience found in CV");
  } else {
    for (const exp of cvData.workExperiences) {
      const duration = exp.durationMonths
        ? `(${Math.round(exp.durationMonths / 12 * 10) / 10} years)`
        : "";
      const dates = [exp.startDate, exp.endDate ?? "present"].filter(Boolean).join(" - ");
      lines.push(`- ${exp.title} at ${exp.company} | ${dates} ${duration}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format answers for the LLM prompt.
 */
function formatAnswersForPrompt(
  answers: ContradictionDetectionInput["answerTexts"]
): string {
  const lines: string[] = [];

  lines.push("=== CANDIDATE ANSWERS ===");
  for (let i = 0; i < answers.length; i++) {
    const { questionText, answerText } = answers[i]!;
    lines.push(`\nQuestion ${i + 1}: ${questionText}`);
    lines.push(`Answer: ${answerText}`);
  }

  return lines.join("\n");
}

/**
 * Parse and validate LLM response.
 */
function parseLLMResponse(response: string): CVContradiction[] {
  try {
    // Try to extract JSON array from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      // Empty array case - no JSON found might mean no contradictions
      if (response.includes("[]") || response.toLowerCase().includes("no contradiction")) {
        return [];
      }
      console.error("[Contradiction Detector] No JSON array found in response");
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed)) {
      console.error("[Contradiction Detector] Response is not an array");
      return [];
    }

    // Validate and sanitize each contradiction
    const contradictions: CVContradiction[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;

      const claim = item.claim;
      const cvEvidence = item.cvEvidence;
      const severity = item.severity;

      // Validate required fields
      if (typeof claim !== "string" || claim.trim().length === 0) continue;
      if (typeof cvEvidence !== "string" || cvEvidence.trim().length === 0) continue;

      // Validate severity
      const validSeverity = severity === "warning" || severity === "info" ? severity : "info";

      contradictions.push({
        claim: claim.trim().slice(0, 500), // Limit length
        cvEvidence: cvEvidence.trim().slice(0, 500),
        severity: validSeverity,
      });
    }

    return contradictions;
  } catch (error) {
    console.error("[Contradiction Detector] Failed to parse LLM response:", error);
    return [];
  }
}

// =============================================================================
// MAIN DETECTION FUNCTION
// =============================================================================

/**
 * Detect contradictions between candidate answers and CV data.
 *
 * @param client - LLM client for API calls
 * @param input - Answer texts and CV data
 * @returns Detection result with contradictions
 */
export async function detectContradictions(
  client: LLMClient,
  input: ContradictionDetectionInput
): Promise<ContradictionDetectionResult> {
  // Skip if no CV data
  if (input.cvData.workExperiences.length === 0) {
    return {
      success: true,
      contradictions: [],
    };
  }

  // Skip if no answers
  if (input.answerTexts.length === 0) {
    return {
      success: true,
      contradictions: [],
    };
  }

  // Build the prompt
  const cvSection = formatCVDataForPrompt(input.cvData);
  const answersSection = formatAnswersForPrompt(input.answerTexts);

  const userPrompt = `${cvSection}\n\n${answersSection}\n\nIdentify any factual contradictions between the answers and CV.`;

  try {
    const response = await client.complete({
      system: CONTRADICTION_DETECTION_PROMPT,
      user: userPrompt,
      temperature: 0.1, // Low temperature for consistent analysis
    });

    const contradictions = parseLLMResponse(response);

    console.log(
      `[Contradiction Detector] Found ${contradictions.length} contradictions`
    );

    return {
      success: true,
      contradictions,
    };
  } catch (error) {
    return {
      success: false,
      contradictions: [],
      error: `Contradiction detection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
