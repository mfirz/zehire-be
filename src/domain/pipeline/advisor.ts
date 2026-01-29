/**
 * Pipeline Advisor Service
 * ========================
 * Uses LLM to generate hiring pipeline recommendations based on job details.
 *
 * The pipeline includes:
 * - Assessment recommendations (type, provider, what to test)
 * - Interview panel structure (rounds, duration, interviewer profiles)
 * - Evaluation criteria (must-have, nice-to-have, red flags)
 */

import type { LLMClient } from "../jobs/archetypes/inference";
import {
  PipelineRecommendationSchema,
  type PipelineConfig,
  type PipelineRecommendation,
} from "./types";

// =============================================================================
// INPUT TYPES
// =============================================================================

/**
 * Input for pipeline generation.
 */
export interface PipelineGenerationInput {
  /** Job title */
  title: string;

  /** Full job description */
  description: string;

  /** Optional: Company name for context */
  companyName?: string;
}

// =============================================================================
// LLM PROMPT
// =============================================================================

/**
 * System prompt for pipeline recommendation.
 */
export const PIPELINE_ADVISOR_SYSTEM_PROMPT = `You are a hiring pipeline advisor for Zehire, an AI-powered hiring platform. Your task is to analyze job postings and recommend an optimal hiring pipeline.

You must output valid JSON matching the schema exactly. Be practical and focused — your recommendations directly shape the hiring process.

Key principles:
- Recommend assessments only when they add real value for the role
- Interview rounds should be efficient but thorough
- Evaluation criteria should be specific and actionable
- Consider the role's seniority and domain when recommending`;

/**
 * Build the user prompt for pipeline generation.
 */
export function buildPipelinePrompt(input: PipelineGenerationInput): string {
  const jobDetails = [
    `Job Title: ${input.title}`,
    `Description: ${input.description}`,
    input.companyName ? `Company: ${input.companyName}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return `Analyze this job posting and recommend a hiring pipeline:

${jobDetails}

---

Return JSON matching this exact schema:

{
  "assessment": {
    "recommended": boolean (true if technical/skills assessment adds value),
    "reason": string (why assessment is or isn't recommended),
    "suggestedType": string (e.g., "coding challenge", "case study", "portfolio review", "none"),
    "suggestedProviders": array of strings (e.g., ["takehome", "none"]),
    "whatToTest": array of strings (specific skills/competencies to assess)
  },
  "interviewPanel": {
    "rounds": [
      {
        "name": string (e.g., "Technical Screen", "System Design", "Culture Fit"),
        "duration": number (minutes, typically 30, 45, or 60),
        "interviewerProfile": string (who should conduct this, e.g., "Senior Engineer", "Engineering Manager"),
        "focus": string (what this round evaluates)
      }
    ],
    "totalTime": string (e.g., "3 hours across 4 rounds")
  },
  "evaluationCriteria": {
    "mustHave": array of strings (non-negotiable requirements),
    "niceToHave": array of strings (preferred but not required),
    "redFlags": array of strings (warning signs to watch for)
  }
}

Guidelines:

ASSESSMENT:
- "recommended": true for technical roles, specialized skills, or roles where skills are hard to verify in interviews
- "recommended": false for entry-level, executive, or roles where interview performance is sufficient
- "suggestedProviders": Pick 1-2 most relevant providers. Use "none" if not recommended.
- "whatToTest": Be specific (e.g., "React component architecture" not just "frontend skills")

INTERVIEW ROUNDS:
- Typical structure: Phone Screen (30min) → Technical (60min) → Team/Culture (45min) → Final (30-45min)
- Senior roles may need additional rounds (system design, leadership)
- Entry-level can be shorter (2-3 rounds)
- Each round should have distinct focus — avoid overlap

EVALUATION CRITERIA:
- "mustHave": 3-5 absolute requirements (technical skills, experience level, certifications)
- "niceToHave": 3-5 differentiators (domain experience, specific tools, soft skills)
- "redFlags": 3-5 warning signs (job hopping patterns, skill gaps, attitude issues)

Return only the JSON object, no explanation.`;
}

// =============================================================================
// RESPONSE PARSING
// =============================================================================

/**
 * Parse and validate LLM response into PipelineRecommendation.
 * Throws if response is invalid.
 */
export function parsePipelineResponse(response: string): PipelineRecommendation {
  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = response.trim();

  // Use capture group approach - more robust than replace
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch?.[1]) {
    jsonStr = jsonMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Invalid JSON in pipeline response: ${response.slice(0, 200)}`);
  }

  // Validate against Zod schema
  const result = PipelineRecommendationSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new Error(`Invalid pipeline recommendation: ${errors}`);
  }

  return result.data;
}

// =============================================================================
// CONFIG GENERATION
// =============================================================================

/**
 * Generate initial PipelineConfig from PipelineRecommendation.
 * This creates the editable config that recruiters can customize.
 */
export function generateInitialConfig(recommendation: PipelineRecommendation): PipelineConfig {
  const interviewRounds = recommendation.interviewPanel.rounds.map((round, index) => ({
    id: `round-${index + 1}`,
    name: round.name,
    duration: round.duration,
    interviewerIds: [], // Recruiter assigns specific interviewers
    focus: round.focus,
  }));

  return {
    interviewRounds,
    totalDurationMinutes: interviewRounds.reduce((sum, round) => sum + round.duration, 0),
  };
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Result of pipeline generation.
 */
export interface PipelineGenerationResult {
  /** LLM-generated recommendation */
  recommendation: PipelineRecommendation;

  /** Initial editable config derived from recommendation */
  config: PipelineConfig;
}

/**
 * Generate hiring pipeline recommendation from job details.
 *
 * @example
 * ```typescript
 * const llmClient = createLLMClient({ env: c.env });
 * const result = await generatePipelineRecommendation(llmClient, {
 *   title: "Senior Software Engineer",
 *   description: "We're looking for a senior engineer...",
 * });
 *
 * // result.recommendation — LLM output
 * // result.config — initial editable config
 * ```
 */
export async function generatePipelineRecommendation(
  client: LLMClient,
  input: PipelineGenerationInput
): Promise<PipelineGenerationResult> {
  const userPrompt = buildPipelinePrompt(input);

  const response = await client.complete({
    system: PIPELINE_ADVISOR_SYSTEM_PROMPT,
    user: userPrompt,
    temperature: 0.3, // Slight creativity for recommendations, but mostly deterministic
    maxTokens: 2048, // Pipeline responses can be longer than job context
  });

  const recommendation = parsePipelineResponse(response);
  const config = generateInitialConfig(recommendation);

  return { recommendation, config };
}
