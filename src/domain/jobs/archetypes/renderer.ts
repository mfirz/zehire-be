/**
 * Zehire Question Renderer
 * ========================
 * Uses LLM to render actual questions from archetypes.
 *
 * Flow: Archetype + JobContext → LLM → Rendered Question
 *
 * Each archetype produces exactly one question, tailored to the
 * specific job context while respecting rendering constraints.
 */
import { DEFAULT_RENDERING_CONSTRAINTS } from "./constants"
import type { LLMClient } from "./inference"
// =============================================================================
// FULL PIPELINE
// =============================================================================

import {
  resolveArchetypesFromJobPosting,
  type JobPostingInput,
} from "./inference"
import type {
  Archetype,
  JobContext,
  RenderingConstraints,
  QuestionFormat,
  SignalId,
} from "./types"
import { FORMAT_METADATA, SIGNAL_METADATA } from "./types"

// =============================================================================
// OUTPUT TYPES
// =============================================================================

/**
 * A rendered question ready to show to candidates.
 */
export interface RenderedQuestion {
  /** Source archetype ID */
  archetypeId: string

  /** The actual question text */
  questionText: string

  /** Signals this question is designed to extract */
  signals: SignalId[]

  /** Hint for minimum answer length (shown to candidate) */
  minAnswerWords?: number

  /** Internal metadata for evaluation */
  metadata: {
    category: string
    formats: QuestionFormat[]
    renderingConstraints: RenderingConstraints
  }
}

/**
 * Result of rendering questions for a job.
 */
export interface RenderQuestionsResult {
  /** Job context used for rendering */
  jobContext: JobContext

  /** Rendered questions in order */
  questions: RenderedQuestion[]

  /** Timestamp of rendering */
  renderedAt: string
}

// =============================================================================
// LLM PROMPT
// =============================================================================

/**
 * System prompt for question rendering.
 */
export const QUESTION_RENDER_SYSTEM_PROMPT = `You are a question writer for Zehire, a hiring platform. Your task is to write context questions that help evaluate candidates without ranking or scoring them.

Your questions must:
1. Be clear, specific, and job-relevant
2. Invite genuine reflection, not rehearsed answers
3. Follow the specified format (experience-based, reflection, etc.)
4. Respect all rendering constraints
5. Be professional but warm in tone

Your questions must NOT:
1. Be answerable with yes/no (unless explicitly allowed)
2. Be generic or applicable to any job
3. Lead the candidate toward a "correct" answer
4. Be compound questions (multiple questions in one)
5. Use jargon the candidate might not understand

Write questions that reveal how candidates think, not just what they've done.`

/**
 * Build the prompt for rendering a single question.
 */
export function buildQuestionRenderPrompt(
  archetype: Archetype,
  jobContext: JobContext
): string {
  const formatInstructions = archetype.formats
    .map(
      (f) => `- ${FORMAT_METADATA[f].label}: ${FORMAT_METADATA[f].instruction}`
    )
    .join("\n")

  const signalDescriptions = archetype.signals
    .map(
      (s) => `- ${SIGNAL_METADATA[s].label}: ${SIGNAL_METADATA[s].description}`
    )
    .join("\n")

  const constraints = buildConstraintInstructions(
    archetype.renderingConstraints
  )

  return `Write a single interview question for this role and archetype.

## Job Context
- Title/Domain: ${jobContext.domain}${jobContext.specialization ? ` (${jobContext.specialization})` : ""}
- Experience Level: ${jobContext.experienceLevel}
- Risk Level: ${jobContext.riskLevel}
- Customer Facing: ${jobContext.customerFacing}
- People Management: ${jobContext.peopleManagement}
- Regulated Environment: ${jobContext.regulatedEnvironment}

## Archetype
- ID: ${archetype.id}
- Purpose: ${archetype.description}

## Signals to Extract
${signalDescriptions}

## Question Format
Use one of these formats:
${formatInstructions}

## Constraints
${constraints}

## Output
Return ONLY the question text. No preamble, no explanation, no quotes around it.
Just the question itself, ready to show to a candidate.`
}

/**
 * Build human-readable constraint instructions.
 */
function buildConstraintInstructions(
  constraints: RenderingConstraints
): string {
  const rules: string[] = []

  if (constraints.requiresRealExample) {
    rules.push("- MUST ask about a real past experience (not hypothetical)")
  }

  if (constraints.forbidYesNo) {
    rules.push("- MUST NOT be answerable with yes/no")
  }

  if (constraints.singleQuestion) {
    rules.push("- MUST be exactly one question (no multi-part questions)")
  }

  if (constraints.forbidPureTheory) {
    rules.push(
      "- MUST NOT allow purely theoretical answers — require concrete examples"
    )
  }

  if (constraints.minAnswerWords) {
    rules.push(
      `- Should invite a response of at least ${constraints.minAnswerWords} words`
    )
  }

  if (constraints.maxQuestionLength) {
    rules.push(
      `- Question must be under ${constraints.maxQuestionLength} characters`
    )
  }

  if (rules.length === 0) {
    rules.push("- No specific constraints")
  }

  return rules.join("\n")
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate a rendered question against its constraints.
 */
export function validateRenderedQuestion(
  questionText: string,
  constraints: RenderingConstraints
): { valid: boolean; issues: string[] } {
  const issues: string[] = []

  // Check max length
  if (
    constraints.maxQuestionLength &&
    questionText.length > constraints.maxQuestionLength
  ) {
    issues.push(
      `Question exceeds max length: ${questionText.length} > ${constraints.maxQuestionLength}`
    )
  }

  // Check for yes/no patterns (basic heuristic)
  if (constraints.forbidYesNo) {
    const yesNoPatterns = [
      /^(do|did|does|are|is|was|were|have|has|had|can|could|would|will|should)\s+you\b/i,
      /^(have|has)\s+you\s+ever\b/i,
    ]
    for (const pattern of yesNoPatterns) {
      if (pattern.test(questionText.trim())) {
        issues.push("Question appears to be yes/no format")
        break
      }
    }
  }

  // Check for multiple questions (basic heuristic)
  if (constraints.singleQuestion) {
    const questionMarks = (questionText.match(/\?/g) || []).length
    if (questionMarks > 1) {
      issues.push(
        `Multiple questions detected: ${questionMarks} question marks`
      )
    }
  }

  // Check if it's too short to be meaningful
  if (questionText.trim().length < 20) {
    issues.push("Question is too short")
  }

  return {
    valid: issues.length === 0,
    issues,
  }
}

// =============================================================================
// SINGLE QUESTION RENDERER
// =============================================================================

/**
 * Render a single question from an archetype.
 */
export async function renderQuestion(
  client: LLMClient,
  archetype: Archetype,
  jobContext: JobContext,
  options?: {
    maxRetries?: number
  }
): Promise<RenderedQuestion> {
  const maxRetries = options?.maxRetries ?? 2

  let lastError: Error | null = null
  let questionText: string | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const prompt = buildQuestionRenderPrompt(archetype, jobContext)

    const response = await client.complete({
      system: QUESTION_RENDER_SYSTEM_PROMPT,
      user: prompt,
      temperature: attempt * 0.2, // Increase temperature on retries for variety
      maxTokens: 512,
    })

    questionText = response.trim()

    // Remove quotes if LLM wrapped the question
    if (
      (questionText.startsWith('"') && questionText.endsWith('"')) ||
      (questionText.startsWith("'") && questionText.endsWith("'"))
    ) {
      questionText = questionText.slice(1, -1)
    }

    const validation = validateRenderedQuestion(
      questionText,
      archetype.renderingConstraints
    )

    if (validation.valid) {
      break
    }

    lastError = new Error(`Validation failed: ${validation.issues.join(", ")}`)

    if (attempt < maxRetries) {
      console.warn(
        `Question validation failed for ${archetype.id}, retrying (${attempt + 1}/${maxRetries}): ${validation.issues.join(", ")}`
      )
    }
  }

  if (!questionText) {
    throw lastError ?? new Error("Failed to render question")
  }

  return {
    archetypeId: archetype.id,
    questionText,
    signals: archetype.signals,
    ...(archetype.renderingConstraints.minAnswerWords && {
      minAnswerWords: archetype.renderingConstraints.minAnswerWords,
    }),
    metadata: {
      category: archetype.category,
      formats: archetype.formats, // Primary format used
      renderingConstraints: archetype.renderingConstraints,
    },
  }
}

// =============================================================================
// BATCH RENDERER
// =============================================================================

export interface RenderQuestionsOptions {
  /** LLM client for rendering */
  client: LLMClient

  /** Archetypes to render (from resolveArchetypes) */
  archetypes: Archetype[]

  /** Job context for tailoring questions */
  jobContext: JobContext

  /** Max retries per question (default: 2) */
  maxRetries?: number

  /** Render in parallel (default: false for rate limiting) */
  parallel?: boolean
}

/**
 * Render questions for all archetypes.
 *
 * @example
 * ```typescript
 * const resolution = await resolveArchetypesFromJobPosting(client, jobPosting)
 *
 * const rendered = await renderQuestions({
 *   client,
 *   archetypes: resolution.archetypes,
 *   jobContext: resolution.jobContext,
 * })
 *
 * // rendered.questions — array of questions to show candidates
 * ```
 */
export async function renderQuestions(
  options: RenderQuestionsOptions
): Promise<RenderQuestionsResult> {
  const {
    client,
    archetypes,
    jobContext,
    maxRetries = 2,
    parallel = false,
  } = options

  let questions: RenderedQuestion[]

  if (parallel) {
    // Parallel rendering (faster, but may hit rate limits)
    questions = await Promise.all(
      archetypes.map((archetype) =>
        renderQuestion(client, archetype, jobContext, { maxRetries })
      )
    )
  } else {
    // Sequential rendering (slower, but safer for rate limits)
    questions = []
    for (const archetype of archetypes) {
      const question = await renderQuestion(client, archetype, jobContext, {
        maxRetries,
      })
      questions.push(question)
    }
  }

  return {
    jobContext,
    questions,
    renderedAt: new Date().toISOString(),
  }
}

/**
 * Complete pipeline: Job posting → Questions
 *
 * This is the highest-level function for POST /jobs.
 *
 * @example
 * ```typescript
 * const result = await generateQuestionsForJob(client, {
 *   title: "Senior Software Engineer",
 *   description: "We're looking for...",
 * })
 *
 * // Store with job:
 * // - result.jobContext
 * // - result.archetypes
 * // - result.questions
 * ```
 */
export async function generateQuestionsForJob(
  client: LLMClient,
  jobPosting: JobPostingInput,
  options?: {
    maxRetries?: number
    parallel?: boolean
  }
): Promise<{
  jobContext: JobContext
  archetypes: Archetype[]
  questions: RenderedQuestion[]
  resolvedAt: string
  renderedAt: string
}> {
  // Step 1: Infer context and resolve archetypes
  const resolution = await resolveArchetypesFromJobPosting(client, jobPosting)

  // Step 2: Render questions
  const rendered = await renderQuestions({
    client,
    archetypes: resolution.archetypes,
    jobContext: resolution.jobContext,
    ...(options?.maxRetries !== undefined && {
      maxRetries: options.maxRetries,
    }),
    ...(options?.parallel !== undefined && { parallel: options.parallel }),
  })

  return {
    jobContext: resolution.jobContext,
    archetypes: resolution.archetypes,
    questions: rendered.questions,
    resolvedAt: resolution.resolvedAt,
    renderedAt: rendered.renderedAt,
  }
}
