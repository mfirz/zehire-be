/**
 * Zehire Job Context Inference
 * ============================
 * Uses LLM to infer JobContext from job title and description.
 *
 * This is called during POST /jobs to determine which archetypes
 * to activate for context questions.
 */
// =============================================================================
// FULL PIPELINE
// =============================================================================
import { resolveArchetypes, type ResolveArchetypesOptions } from "./resolver";
import type { ArchetypeResolutionResult, JobContext, SignalId } from "./types";
import {
  COLLABORATION_LEVELS,
  DECISION_IMPACTS,
  EXPERIENCE_LEVELS,
  JOB_DOMAINS,
  RISK_LEVELS,
  SIGNAL_IDS,
} from "./types";

// =============================================================================
// INPUT TYPES
// =============================================================================

/**
 * Raw job posting input from recruiter.
 */
export interface JobPostingInput {
  /** Job title (e.g., "Senior Software Engineer") */
  title: string;

  /** Full job description */
  description: string;

  /** Optional: Company name for additional context */
  companyName?: string;

  /** Optional: Department or team */
  department?: string;

  /** Optional: Location (can affect regulatory context) */
  location?: string;
}

// =============================================================================
// LLM PROMPT
// =============================================================================

/**
 * System prompt for job context inference.
 */
export const JOB_CONTEXT_SYSTEM_PROMPT = `You are a job analysis system. Analyze job postings and output structured JSON.

CRITICAL RULES:
1. Output ONLY valid JSON - no explanations, no comments, no text before or after
2. Do not include any reasoning or notes inside the JSON
3. Each key must appear exactly once
4. Use only the exact values specified in the schema

Key principles:
- Infer from explicit statements first, then from implicit signals
- When uncertain, choose moderate/middle values (medium risk, mid experience)
- primarySignals should be ordered by importance to the role (max 5)
- regulatedEnvironment = true only for healthcare, finance, legal, government, or roles explicitly mentioning compliance/regulation`;

/**
 * Build the user prompt with job details and expected schema.
 */
export function buildInferencePrompt(input: JobPostingInput): string {
  const jobDetails = [
    `Job Title: ${input.title}`,
    `Description: ${input.description}`,
    input.companyName ? `Company: ${input.companyName}` : null,
    input.department ? `Department: ${input.department}` : null,
    input.location ? `Location: ${input.location}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return `Analyze this job posting and return a JSON object with the following structure:

${jobDetails}

---

Return JSON matching this exact schema:

{
  "domain": one of [${JOB_DOMAINS.map((d) => `"${d}"`).join(", ")}],
  "specialization": string or null (specific area within domain, e.g., "backend", "pediatrics", "M&A"),
  "riskLevel": one of [${RISK_LEVELS.map((r) => `"${r}"`).join(", ")}],
  "decisionImpact": one of [${DECISION_IMPACTS.map((d) => `"${d}"`).join(", ")}],
  "primarySignals": array of 3-5 from [${SIGNAL_IDS.map((s) => `"${s}"`).join(", ")}] ordered by importance,
  "collaborationRequired": one of [${COLLABORATION_LEVELS.map((c) => `"${c}"`).join(", ")}],
  "customerFacing": boolean,
  "peopleManagement": boolean,
  "regulatedEnvironment": boolean,
  "experienceLevel": one of [${EXPERIENCE_LEVELS.map((e) => `"${e}"`).join(", ")}]
}

Guidelines for inference:

DOMAIN: Match to the primary industry/function of the role.

RISK LEVEL:
- "low": Mistakes are easily reversible, limited blast radius
- "medium": Mistakes have moderate consequences, may affect team/project
- "high": Mistakes can cause significant harm (financial loss, safety, legal, reputation)

DECISION IMPACT:
- "low": Day-to-day operational decisions
- "business": Affects business outcomes, revenue, strategy
- "financial": Direct financial decisions or fiduciary responsibility
- "human_life": Healthcare, safety-critical systems, emergency services
- "regulatory": Legal, compliance, audit, government

PRIMARY SIGNALS (choose 3-5 from this exact list):
- "decision_under_uncertainty"
- "tradeoff_awareness"
- "risk_reasoning"
- "ethical_awareness"
- "technical_depth"
- "system_thinking"
- "communication_clarity"
- "stakeholder_management"
- "accountability"
- "learning_from_failure"

EXPERIENCE LEVEL:
- "entry": 0-2 years, junior, associate, intern
- "mid": 3-6 years, mid-level, no "senior" in title
- "senior": 7+ years, senior, staff, principal, lead
- "executive": Director, VP, C-level, Head of

COLLABORATION: Based on team interaction, cross-functional work mentioned.

CUSTOMER FACING: True if role interacts with external customers/clients.

PEOPLE MANAGEMENT: True if role manages direct reports.

REGULATED ENVIRONMENT: True for healthcare, finance, legal, government, or explicit compliance/regulatory mentions.

OUTPUT FORMAT: Return ONLY the raw JSON object. No markdown, no code blocks, no explanations.`;
}

// =============================================================================
// RESPONSE VALIDATION
// =============================================================================

/**
 * Validate and parse LLM response into JobContext.
 * Throws if response is invalid.
 */
export function parseJobContextResponse(response: string): JobContext {
  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = response.trim();

  // Log raw response for debugging
  console.log(`[Inference] Raw response length: ${response.length} chars`);
  console.log(`[Inference] Raw response: ${response}`);

  // Use capture group approach - more robust than replace
  // First try to match complete code blocks (with closing backticks)
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch?.[1]) {
    jsonStr = jsonMatch[1].trim();
    console.log(`[Inference] Extracted from complete code block`);
  } else {
    // Handle truncated responses where closing backticks are missing
    const openMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*)/);
    if (openMatch?.[1]) {
      jsonStr = openMatch[1].trim();
      console.log(`[Inference] Extracted from unclosed code block`);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.log(`[Inference] JSON parse failed. Extracted JSON (${jsonStr.length} chars): ${jsonStr}`);
    throw new Error(`Invalid JSON in LLM response: ${response.slice(0, 200)}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("LLM response is not an object");
  }

  const obj = parsed as Record<string, unknown>;

  // Validate each field
  const domain = validateEnum(obj.domain, JOB_DOMAINS, "domain");
  const riskLevel = validateEnum(obj.riskLevel, RISK_LEVELS, "riskLevel");
  const experienceLevel = validateEnum(obj.experienceLevel, EXPERIENCE_LEVELS, "experienceLevel");
  const collaborationRequired = validateEnum(
    obj.collaborationRequired,
    COLLABORATION_LEVELS,
    "collaborationRequired"
  );
  const decisionImpact = validateEnum(obj.decisionImpact, DECISION_IMPACTS, "decisionImpact");

  const primarySignals = validateSignalArray(obj.primarySignals);

  const customerFacing = validateBoolean(obj.customerFacing, "customerFacing");
  const peopleManagement = validateBoolean(obj.peopleManagement, "peopleManagement");
  const regulatedEnvironment = validateBoolean(obj.regulatedEnvironment, "regulatedEnvironment");

  const specialization =
    obj.specialization === null || obj.specialization === undefined
      ? null
      : typeof obj.specialization === "string"
        ? obj.specialization
        : null;

  return {
    domain,
    specialization,
    riskLevel,
    decisionImpact,
    primarySignals,
    collaborationRequired,
    customerFacing,
    peopleManagement,
    regulatedEnvironment,
    experienceLevel,
  };
}

function validateEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`Invalid ${field}: "${value}". Must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function validateBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${field}: expected boolean, got ${typeof value}`);
  }
  return value;
}

function validateSignalArray(value: unknown): SignalId[] {
  if (!Array.isArray(value)) {
    throw new Error("primarySignals must be an array");
  }

  // Filter to only valid signals (LLMs sometimes hallucinate invalid ones)
  const signals: SignalId[] = [];
  for (const item of value) {
    if (typeof item === "string" && SIGNAL_IDS.includes(item as SignalId)) {
      signals.push(item as SignalId);
    } else {
      console.warn(`[Inference] Filtered out invalid signal: "${item}"`);
    }
  }

  // Ensure we have at least 1 valid signal after filtering
  if (signals.length < 1) {
    throw new Error("primarySignals must have at least 1 valid signal after filtering");
  }

  // Cap at 5 signals
  return signals.slice(0, 5);
}

// =============================================================================
// INFERENCE FUNCTION
// =============================================================================

/**
 * LLM client interface — implement this with your LLM provider.
 */
export interface LLMClient {
  complete(params: {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;
}

/**
 * Infer JobContext from a job posting using LLM.
 *
 * @example
 * ```typescript
 * const client: LLMClient = {
 *   async complete({ system, user }) {
 *     const response = await anthropic.messages.create({
 *       model: "claude-sonnet-4-20250514",
 *       max_tokens: 1024,
 *       system,
 *       messages: [{ role: "user", content: user }],
 *     })
 *     return response.content[0].text
 *   }
 * }
 *
 * const jobContext = await inferJobContext(client, {
 *   title: "Senior Software Engineer",
 *   description: "We're looking for a senior engineer to lead our backend team...",
 * })
 * ```
 */
export async function inferJobContext(
  client: LLMClient,
  input: JobPostingInput
): Promise<JobContext> {
  const userPrompt = buildInferencePrompt(input);

  const response = await client.complete({
    system: JOB_CONTEXT_SYSTEM_PROMPT,
    user: userPrompt,
    temperature: 0, // Deterministic for consistency
    maxTokens: 2048, // Increased for Groq/Llama which may need more tokens
  });

  return parseJobContextResponse(response);
}

/**
 * Complete pipeline: Job posting → JobContext → Resolved Archetypes
 *
 * This is the main entry point for POST /jobs archetype resolution.
 *
 * @example
 * ```typescript
 * const result = await resolveArchetypesFromJobPosting(client, {
 *   title: "ICU Nurse",
 *   description: "Join our intensive care unit team...",
 * })
 *
 * // result.jobContext — inferred context
 * // result.archetypes — selected archetypes for context questions
 * ```
 */
export async function resolveArchetypesFromJobPosting(
  client: LLMClient,
  input: JobPostingInput,
  options?: Omit<ResolveArchetypesOptions, "jobContext">
): Promise<ArchetypeResolutionResult> {
  const jobContext = await inferJobContext(client, input);

  return resolveArchetypes({
    jobContext,
    ...options,
  });
}
