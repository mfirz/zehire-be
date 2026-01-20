/**
 * Signal Extraction Service
 * =========================
 * Orchestrates signal extraction for applications.
 *
 * Handles:
 * - Batch extraction for all answers in an application (archetype + custom evaluative)
 * - Signal aggregation
 * - Decision posture computation
 */

import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

import { ApplicationRepository } from "../applications/repository";
import { CustomQuestionsRepository } from "../custom-questions/repository";
import { CVService } from "../cv/service";
import { JobRepository } from "../jobs/repository";
import type { RenderedQuestionOutput } from "../jobs/schemas";
import type { JobContext, SignalId } from "../jobs/archetypes/types";
import type { LLMClient } from "../jobs/archetypes/inference";

import { extractSignalsFromAnswer } from "./extractor";
import { computeSignalState } from "./aggregator";
import { computePosture } from "./posture";
import type { AnswerExtractionResult, CVContradiction, PostureResult } from "./types";

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class SignalExtractionService {
  private applicationRepository: ApplicationRepository;
  private jobRepository: JobRepository;
  private customQuestionsRepository: CustomQuestionsRepository;
  private cvService: CVService | null;

  constructor(db: D1Database, cvBucket?: R2Bucket) {
    this.applicationRepository = new ApplicationRepository(db);
    this.jobRepository = new JobRepository(db);
    this.customQuestionsRepository = new CustomQuestionsRepository(db);
    // CVService is optional - only created if cvBucket is provided
    this.cvService = cvBucket ? new CVService(db, cvBucket) : null;
  }

  /**
   * Extract signals for all answers in an application.
   *
   * @param client - LLM client for making API calls
   * @param applicationId - Application to process
   * @param options - Optional configuration
   * @returns Array of extraction results for each answer
   */
  async extractSignalsForApplication(
    client: LLMClient,
    applicationId: string,
    options?: {
      parallel?: boolean;
      maxRetries?: number;
    }
  ): Promise<AnswerExtractionResult[]> {
    const parallel = options?.parallel ?? false;
    const maxRetries = options?.maxRetries ?? 2;

    // 1. Get the application
    const application = await this.applicationRepository.findById(applicationId);
    if (!application) {
      throw new Error(`Application not found: ${applicationId}`);
    }

    // 2. Get the job to access questions and job context
    const job = await this.jobRepository.findById(application.jobId);
    if (!job) {
      throw new Error(`Job not found: ${application.jobId}`);
    }

    if (!job.questions || !job.jobContext) {
      throw new Error(`Job ${application.jobId} missing questions or context`);
    }

    // Parse questions and job context from JSON
    const questions = JSON.parse(job.questions) as RenderedQuestionOutput[];
    const jobContext = JSON.parse(job.jobContext) as JobContext;

    // 3. Get all answers for the application
    const answers = await this.applicationRepository.getAnswers(applicationId);
    if (answers.length === 0) {
      throw new Error(`No answers found for application: ${applicationId}`);
    }

    // 4. Create a map of archetypeId -> question for quick lookup
    const questionMap = new Map(questions.map((q) => [q.archetypeId, q]));

    // 5. Update application status to processing
    await this.applicationRepository.updateSignalsStatus(applicationId, "processing");

    // 6. Extract signals for each answer
    const extractionTasks = answers.map(async (answer) => {
      // Get the question for this answer's archetype
      const question = questionMap.get(answer.archetypeId);
      if (!question) {
        console.warn(
          `No question found for archetype ${answer.archetypeId} in application ${applicationId}`
        );
        // Return empty result for missing questions
        return {
          answerId: answer.id,
          archetypeId: answer.archetypeId,
          responseQuality: "empty" as const,
          signals: [],
          extractedAt: new Date().toISOString(),
        };
      }

      // Update answer status to processing
      await this.applicationRepository.updateAnswerExtractionStatus(answer.id, "processing");

      try {
        // Extract signals
        const result = await extractSignalsFromAnswer(
          client,
          {
            questionText: answer.questionText,
            archetypeId: answer.archetypeId,
            targetSignals: question.signals,
            answerText: answer.answerText ?? "",
            jobContext: {
              domain: jobContext.domain,
              experienceLevel: jobContext.experienceLevel,
              riskLevel: jobContext.riskLevel,
            },
          },
          answer.id,
          { maxRetries }
        );

        // Save extracted signals to DB
        await this.applicationRepository.saveExtractedSignals(
          answer.id,
          result.signals,
          result.responseQuality
        );

        return result;
      } catch (error) {
        console.error(`Failed to extract signals for answer ${answer.id}:`, error);
        await this.applicationRepository.updateAnswerExtractionStatus(answer.id, "failed");
        throw error;
      }
    });

    // Execute extractions (parallel or sequential)
    let results: AnswerExtractionResult[];
    if (parallel) {
      results = await Promise.all(extractionTasks);
    } else {
      results = [];
      for (const task of extractionTasks) {
        const result = await task;
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Extract signals from custom evaluative answers.
   *
   * @param client - LLM client for making API calls
   * @param applicationId - Application to process
   * @param jobContext - Job context for extraction
   * @param options - Optional configuration
   * @returns Array of extraction results for custom evaluative answers
   */
  async extractSignalsForCustomAnswers(
    client: LLMClient,
    applicationId: string,
    jobContext: JobContext,
    options?: {
      parallel?: boolean;
      maxRetries?: number;
    }
  ): Promise<AnswerExtractionResult[]> {
    const maxRetries = options?.maxRetries ?? 2;

    // Get custom answers with their questions
    const customAnswersWithQuestions =
      await this.customQuestionsRepository.getAnswersWithQuestions(applicationId);

    // Filter to only evaluative questions with pending extraction
    const evaluativeAnswers = customAnswersWithQuestions.filter(
      ({ question, answer }) =>
        question.category === "evaluative" &&
        answer.extractionStatus === "pending" &&
        answer.answerText // Has answer text
    );

    if (evaluativeAnswers.length === 0) {
      return [];
    }

    // Extract signals for each evaluative answer
    const extractionTasks = evaluativeAnswers.map(async ({ question, answer }) => {
      // Update answer status to processing
      await this.customQuestionsRepository.updateExtractionStatus(answer.id, "processing");

      try {
        // Parse target signals from question
        const targetSignals: SignalId[] = question.targetSignals
          ? JSON.parse(question.targetSignals)
          : [];

        if (targetSignals.length === 0) {
          console.warn(`Custom question ${question.id} has no target signals`);
          await this.customQuestionsRepository.updateExtractionStatus(answer.id, "completed");
          return {
            answerId: answer.id,
            archetypeId: `custom_${question.id}`,
            responseQuality: "empty" as const,
            signals: [],
            extractedAt: new Date().toISOString(),
          };
        }

        // Extract signals
        const result = await extractSignalsFromAnswer(
          client,
          {
            questionText: question.questionText,
            archetypeId: `custom_${question.id}`,
            targetSignals,
            answerText: answer.answerText ?? "",
            jobContext: {
              domain: jobContext.domain,
              experienceLevel: jobContext.experienceLevel,
              riskLevel: jobContext.riskLevel,
            },
          },
          answer.id,
          { maxRetries }
        );

        // Save extracted signals to custom_answers table
        await this.customQuestionsRepository.saveExtractedSignals(answer.id, result.signals);

        return result;
      } catch (error) {
        console.error(`Failed to extract signals for custom answer ${answer.id}:`, error);
        await this.customQuestionsRepository.updateExtractionStatus(answer.id, "failed");
        throw error;
      }
    });

    // Execute extractions (parallel or sequential)
    let results: AnswerExtractionResult[];
    if (options?.parallel) {
      results = await Promise.all(extractionTasks);
    } else {
      results = [];
      for (const task of extractionTasks) {
        const result = await task;
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Complete signal extraction pipeline for an application.
   *
   * 1. Extract signals from all archetype answers
   * 2. Extract signals from custom evaluative answers
   * 3. Compute signal state (aggregation + critical analysis + conflicts)
   * 4. Compute decision posture from signal state
   * 5. Save results to DB
   */
  async processApplication(
    client: LLMClient,
    applicationId: string,
    options?: {
      parallel?: boolean;
      maxRetries?: number;
    }
  ): Promise<{
    results: AnswerExtractionResult[];
    posture: PostureResult;
  }> {
    try {
      // Get the application to access job context
      const application = await this.applicationRepository.findById(applicationId);
      if (!application) {
        throw new Error(`Application not found: ${applicationId}`);
      }

      // Get the job to access primary signals and questions
      const job = await this.jobRepository.findById(application.jobId);
      if (!job?.jobContext) {
        throw new Error(`Job ${application.jobId} missing job context`);
      }

      const jobContext = JSON.parse(job.jobContext) as JobContext;

      // Extract signals from archetype answers
      const archetypeResults = await this.extractSignalsForApplication(
        client,
        applicationId,
        options
      );

      // Extract signals from custom evaluative answers
      const customResults = await this.extractSignalsForCustomAnswers(
        client,
        applicationId,
        jobContext,
        options
      );

      // Combine all extraction results
      const allResults = [...archetypeResults, ...customResults];

      // Run CV contradiction detection if CV service is available
      let cvContradictions: CVContradiction[] = [];
      if (this.cvService) {
        // Get all answer texts for contradiction detection
        const answers = await this.applicationRepository.getAnswers(applicationId);
        const answerTexts = answers.map((a) => ({
          questionText: a.questionText,
          answerText: a.answerText ?? "",
        }));

        // Get custom evaluative answers as well
        const customAnswersWithQuestions =
          await this.customQuestionsRepository.getAnswersWithQuestions(applicationId);
        const customAnswerTexts = customAnswersWithQuestions
          .filter(({ question }) => question.category === "evaluative")
          .map(({ question, answer }) => ({
            questionText: question.questionText,
            answerText: answer.answerText ?? "",
          }));

        const allAnswerTexts = [...answerTexts, ...customAnswerTexts];

        // Detect contradictions
        cvContradictions = await this.cvService.detectContradictions(
          client,
          applicationId,
          allAnswerTexts
        );
      }

      // Compute full signal state (aggregation + critical analysis + conflicts + CV contradictions)
      const signalState = computeSignalState({
        applicationId,
        extractions: allResults,
        primarySignals: jobContext.primarySignals,
        cvContradictions,
      });

      // Compute decision posture from signal state
      const posture = computePosture(signalState);

      // Save posture result to DB
      await this.applicationRepository.savePostureResult(applicationId, posture);

      return { results: allResults, posture };
    } catch (error) {
      // Mark application as failed
      await this.applicationRepository.updateSignalsStatus(applicationId, "failed", {
        message: error instanceof Error ? error.message : "Unknown error",
        code: "EXTRACTION_FAILED",
      });
      throw error;
    }
  }
}
