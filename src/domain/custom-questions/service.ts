/**
 * Custom Questions Service
 * ========================
 * Business logic for custom questions management and signal suggestion.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { SIGNAL_IDS, SIGNAL_METADATA, type SignalId } from "../jobs/archetypes/types";
import type { JobContext } from "../jobs/archetypes/types";
import { CustomQuestionsRepository } from "./repository";
import type {
  CreateCustomQuestionInput,
  CustomQuestionOutput,
  PublicCustomQuestionOutput,
  SuggestSignalsInput,
  SuggestSignalsOutput,
  UpdateCustomQuestionInput,
} from "./schemas";

// =============================================================================
// SERVICE CLASS
// =============================================================================

type LLMClient = {
  complete: (opts: { system: string; user: string; temperature?: number }) => Promise<string>;
};

export class CustomQuestionsService {
  private repo: CustomQuestionsRepository;
  private llmClient: LLMClient | undefined;

  constructor(d1: D1Database, llmClient?: LLMClient) {
    this.repo = new CustomQuestionsRepository(d1);
    this.llmClient = llmClient;
  }

  // ===========================================================================
  // CRUD OPERATIONS
  // ===========================================================================

  /**
   * Create a new custom question.
   */
  async createQuestion(
    jobId: string,
    input: CreateCustomQuestionInput
  ): Promise<CustomQuestionOutput> {
    const question = await this.repo.create(jobId, input);
    return this.repo.toOutput(question);
  }

  /**
   * Get a custom question by ID.
   */
  async getQuestion(id: string): Promise<CustomQuestionOutput | null> {
    const question = await this.repo.findById(id);
    if (!question) return null;
    return this.repo.toOutput(question);
  }

  /**
   * Get a custom question by ID and job ID (for authorization).
   */
  async getQuestionForJob(id: string, jobId: string): Promise<CustomQuestionOutput | null> {
    const question = await this.repo.findByIdAndJob(id, jobId);
    if (!question) return null;
    return this.repo.toOutput(question);
  }

  /**
   * List all custom questions for a job.
   */
  async listQuestions(jobId: string): Promise<CustomQuestionOutput[]> {
    const questions = await this.repo.listByJobId(jobId);
    return questions.map((q) => this.repo.toOutput(q));
  }

  /**
   * List custom questions for public display (candidate-facing).
   * Excludes internal fields like targetSignals and expectedAnswer.
   */
  async listPublicQuestions(jobId: string): Promise<PublicCustomQuestionOutput[]> {
    const questions = await this.repo.listByJobId(jobId);
    return questions.map((q) => ({
      id: q.id,
      category: q.category,
      answerType: q.answerType,
      questionText: q.questionText,
      required: q.required,
      orderIndex: q.orderIndex,
      options: q.options ? JSON.parse(q.options) : null,
      minValue: q.minValue,
      maxValue: q.maxValue,
    }));
  }

  /**
   * Update a custom question.
   */
  async updateQuestion(
    id: string,
    input: UpdateCustomQuestionInput
  ): Promise<CustomQuestionOutput | null> {
    const question = await this.repo.update(id, input);
    if (!question) return null;
    return this.repo.toOutput(question);
  }

  /**
   * Delete a custom question.
   */
  async deleteQuestion(id: string): Promise<boolean> {
    return this.repo.delete(id);
  }

  /**
   * Reorder questions for a job.
   */
  async reorderQuestions(jobId: string, questionIds: string[]): Promise<void> {
    await this.repo.reorder(jobId, questionIds);
  }

  // ===========================================================================
  // SIGNAL SUGGESTION
  // ===========================================================================

  /**
   * Suggest signals for a question using LLM.
   */
  async suggestSignals(input: SuggestSignalsInput): Promise<SuggestSignalsOutput> {
    if (!this.llmClient) {
      // Fallback to rule-based suggestion if no LLM client
      return this.suggestSignalsRuleBased(input.questionText);
    }

    const systemPrompt = this.buildSignalSuggestionSystemPrompt();
    const userPrompt = this.buildSignalSuggestionUserPrompt(
      input.questionText,
      input.jobContext as JobContext | undefined
    );

    try {
      const response = await this.llmClient.complete({
        system: systemPrompt,
        user: userPrompt,
        temperature: 0.3,
      });

      return this.parseSignalSuggestionResponse(response);
    } catch (error) {
      // Fallback to rule-based on error
      console.error("LLM signal suggestion failed:", error);
      return this.suggestSignalsRuleBased(input.questionText);
    }
  }

  /**
   * Rule-based signal suggestion fallback.
   */
  private suggestSignalsRuleBased(questionText: string): SuggestSignalsOutput {
    const text = questionText.toLowerCase();
    const signals: SignalId[] = [];

    // Decision-related keywords
    if (
      text.includes("decision") ||
      text.includes("decide") ||
      text.includes("chose") ||
      text.includes("uncertain")
    ) {
      signals.push("decision_under_uncertainty");
    }

    // Tradeoff keywords
    if (
      text.includes("tradeoff") ||
      text.includes("trade-off") ||
      text.includes("balance") ||
      text.includes("prioritize") ||
      text.includes("competing")
    ) {
      signals.push("tradeoff_awareness");
    }

    // Risk keywords
    if (
      text.includes("risk") ||
      text.includes("consequence") ||
      text.includes("mitiga")
    ) {
      signals.push("risk_reasoning");
    }

    // Ethics keywords
    if (
      text.includes("ethic") ||
      text.includes("moral") ||
      text.includes("right thing") ||
      text.includes("integrity")
    ) {
      signals.push("ethical_awareness");
    }

    // Technical keywords
    if (
      text.includes("technical") ||
      text.includes("implement") ||
      text.includes("architect") ||
      text.includes("debug") ||
      text.includes("code")
    ) {
      signals.push("technical_depth");
    }

    // System thinking keywords
    if (
      text.includes("system") ||
      text.includes("impact") ||
      text.includes("downstream") ||
      text.includes("holistic")
    ) {
      signals.push("system_thinking");
    }

    // Communication keywords
    if (
      text.includes("explain") ||
      text.includes("communicate") ||
      text.includes("present") ||
      text.includes("convey")
    ) {
      signals.push("communication_clarity");
    }

    // Stakeholder keywords
    if (
      text.includes("stakeholder") ||
      text.includes("manager") ||
      text.includes("team") ||
      text.includes("disagree") ||
      text.includes("align")
    ) {
      signals.push("stakeholder_management");
    }

    // Accountability keywords
    if (
      text.includes("accountab") ||
      text.includes("responsib") ||
      text.includes("own") ||
      text.includes("mistake")
    ) {
      signals.push("accountability");
    }

    // Failure/learning keywords
    if (
      text.includes("fail") ||
      text.includes("learn") ||
      text.includes("mistake") ||
      text.includes("improve") ||
      text.includes("setback")
    ) {
      signals.push("learning_from_failure");
    }

    // Remove duplicates and limit to 3
    const uniqueSignals = [...new Set(signals)].slice(0, 3);

    return {
      signals: uniqueSignals.length > 0 ? uniqueSignals : ["accountability"], // Default
      confidence: uniqueSignals.length >= 2 ? "medium" : "low",
      reasoning:
        uniqueSignals.length > 0
          ? `Detected keywords related to: ${uniqueSignals.map((s) => SIGNAL_METADATA[s].label).join(", ")}`
          : "No strong signal keywords detected. Consider rephrasing the question to target specific judgment areas.",
    };
  }

  /**
   * Build system prompt for signal suggestion.
   */
  private buildSignalSuggestionSystemPrompt(): string {
    const signalList = SIGNAL_IDS.map(
      (id) => `- ${id}: ${SIGNAL_METADATA[id].description}`
    ).join("\n");

    return `You are an expert at analyzing interview questions to determine which evaluative signals they assess.

Available signals:
${signalList}

Your task:
1. Analyze the question to understand what it's really asking candidates to demonstrate
2. Select 1-3 signals that this question would best evaluate
3. Rate your confidence (high/medium/low) based on how clearly the question maps to signals
4. Provide brief reasoning

Rules:
- Only select signals the question DIRECTLY evaluates
- If the question is too vague or doesn't evaluate judgment, return empty signals
- Prefer fewer, more accurate signals over many weak matches

Respond in JSON format:
{
  "signals": ["signal_id_1", "signal_id_2"],
  "confidence": "high" | "medium" | "low",
  "reasoning": "Brief explanation"
}`;
  }

  /**
   * Build user prompt for signal suggestion.
   */
  private buildSignalSuggestionUserPrompt(
    questionText: string,
    jobContext?: JobContext
  ): string {
    let prompt = `Question to analyze:\n"${questionText}"`;

    if (jobContext) {
      prompt += `\n\nJob context:
- Domain: ${jobContext.domain}
- Risk level: ${jobContext.riskLevel}
- Primary signals for role: ${jobContext.primarySignals.join(", ")}`;
    }

    return prompt;
  }

  /**
   * Parse LLM response for signal suggestion.
   */
  private parseSignalSuggestionResponse(response: string): SuggestSignalsOutput {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate signals
      const validSignals = (parsed.signals || []).filter((s: string) =>
        SIGNAL_IDS.includes(s as SignalId)
      ) as SignalId[];

      // Validate confidence
      const confidence = ["high", "medium", "low"].includes(parsed.confidence)
        ? (parsed.confidence as "high" | "medium" | "low")
        : "low";

      return {
        signals: validSignals.slice(0, 5),
        confidence,
        reasoning: parsed.reasoning || "Analysis complete.",
      };
    } catch (error) {
      console.error("Failed to parse signal suggestion response:", error);
      return {
        signals: [],
        confidence: "low",
        reasoning: "Failed to analyze question. Please try again.",
      };
    }
  }

  // ===========================================================================
  // VALIDATION HELPERS
  // ===========================================================================

  /**
   * Validate that all required custom questions are answered.
   */
  async validateAnswers(
    jobId: string,
    answers: Array<{ questionId: string; value: unknown }>
  ): Promise<{ valid: boolean; errors: string[] }> {
    const questions = await this.repo.listByJobId(jobId);
    const errors: string[] = [];

    // Build answer map
    const answerMap = new Map(answers.map((a) => [a.questionId, a.value]));

    for (const question of questions) {
      const answer = answerMap.get(question.id);

      // Check required
      if (question.required && (answer === null || answer === undefined || answer === "")) {
        errors.push(`Question "${question.questionText.slice(0, 50)}..." is required`);
        continue;
      }

      // Skip validation if not required and no answer
      if (!answer) continue;

      // Validate by type
      switch (question.answerType) {
        case "free_text":
          if (typeof answer !== "string" || answer.length < 50) {
            errors.push(`Question "${question.questionText.slice(0, 50)}..." requires at least 50 characters`);
          }
          break;

        case "yes_no":
          if (answer !== "yes" && answer !== "no") {
            errors.push(`Question "${question.questionText.slice(0, 50)}..." must be yes or no`);
          }
          break;

        case "single_choice":
          const singleOptions = question.options ? JSON.parse(question.options) : [];
          if (!singleOptions.includes(answer)) {
            errors.push(`Invalid option for "${question.questionText.slice(0, 50)}..."`);
          }
          break;

        case "multiple_choice":
          if (!Array.isArray(answer)) {
            errors.push(`Question "${question.questionText.slice(0, 50)}..." requires multiple selections`);
          } else {
            const multiOptions = question.options ? JSON.parse(question.options) : [];
            for (const v of answer) {
              if (!multiOptions.includes(v)) {
                errors.push(`Invalid option "${v}" for "${question.questionText.slice(0, 50)}..."`);
              }
            }
          }
          break;

        case "number":
          if (typeof answer !== "number") {
            errors.push(`Question "${question.questionText.slice(0, 50)}..." requires a number`);
          } else {
            if (question.minValue !== null && answer < question.minValue) {
              errors.push(`Value must be at least ${question.minValue}`);
            }
            if (question.maxValue !== null && answer > question.maxValue) {
              errors.push(`Value must be at most ${question.maxValue}`);
            }
          }
          break;

        case "url":
          if (typeof answer !== "string" || !this.isValidUrl(answer)) {
            errors.push(`Question "${question.questionText.slice(0, 50)}..." requires a valid URL`);
          }
          break;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if a string is a valid URL.
   */
  private isValidUrl(str: string): boolean {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  }
}
