/**
 * Signal Extraction Service
 * =========================
 * Orchestrates signal extraction for applications.
 *
 * Handles:
 * - Batch extraction for all answers in an application
 * - Signal aggregation
 * - Decision posture computation (placeholder for Phase 2)
 */

import type { D1Database } from "@cloudflare/workers-types";

import { ApplicationRepository } from "../applications/repository";
import { JobRepository } from "../jobs/repository";
import type { RenderedQuestionOutput } from "../jobs/schemas";
import type { JobContext } from "../jobs/archetypes/types";
import type { LLMClient } from "../jobs/archetypes/inference";

import { extractSignalsFromAnswer } from "./extractor";
import { computeSignalState } from "./aggregator";
import type { AnswerExtractionResult, SignalStateResult } from "./types";

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class SignalExtractionService {
  private applicationRepository: ApplicationRepository;
  private jobRepository: JobRepository;

  constructor(db: D1Database) {
    this.applicationRepository = new ApplicationRepository(db);
    this.jobRepository = new JobRepository(db);
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

    if (!job.questions || !job.job_context) {
      throw new Error(`Job ${application.jobId} missing questions or context`);
    }

    // Parse questions and job context from JSON
    const questions = JSON.parse(job.questions) as RenderedQuestionOutput[];
    const jobContext = JSON.parse(job.job_context) as JobContext;

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
   * Complete signal extraction pipeline for an application.
   *
   * 1. Extract signals from all answers
   * 2. Compute signal state (aggregation + critical analysis + conflicts)
   * 3. Save results to DB
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
    signalState: SignalStateResult;
  }> {
    try {
      // Get the application to access job context
      const application = await this.applicationRepository.findById(applicationId);
      if (!application) {
        throw new Error(`Application not found: ${applicationId}`);
      }

      // Get the job to access primary signals
      const job = await this.jobRepository.findById(application.jobId);
      if (!job?.job_context) {
        throw new Error(`Job ${application.jobId} missing job context`);
      }

      const jobContext = JSON.parse(job.job_context) as JobContext;

      // Extract signals from all answers
      const results = await this.extractSignalsForApplication(client, applicationId, options);

      // Compute full signal state (aggregation + critical analysis + conflicts)
      const signalState = computeSignalState({
        applicationId,
        extractions: results,
        primarySignals: jobContext.primarySignals,
      });

      // Save signal state to DB (posture is computed inside saveSignalState)
      await this.applicationRepository.saveSignalState(applicationId, signalState);

      return { results, signalState };
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
