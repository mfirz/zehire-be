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
import type { JobContext, SignalId } from "../jobs/archetypes/types";
import type { LLMClient } from "../jobs/archetypes/inference";

import { extractSignalsFromAnswer } from "./extractor";
import type { AnswerExtractionResult, AggregatedSignalState, SignalConfidence } from "./types";

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
   * Aggregate signals from all extraction results.
   *
   * Combines signals across all answers to determine:
   * - Which signals are clearly present
   * - Which signals are partially demonstrated
   * - Which signals are missing (asked but not shown)
   * - Which signals were never asked about
   */
  aggregateSignals(
    results: AnswerExtractionResult[],
    allPossibleSignals: SignalId[]
  ): AggregatedSignalState {
    const signalDetails: Record<
      string,
      {
        bestConfidence: SignalConfidence;
        evaluationCount: number;
        evidence: string[];
      }
    > = {};

    // Track which signals were asked about
    const askedSignals = new Set<SignalId>();

    // Process each extraction result
    for (const result of results) {
      for (const signal of result.signals) {
        askedSignals.add(signal.signalId);

        let detail = signalDetails[signal.signalId];
        if (!detail) {
          detail = {
            bestConfidence: signal.confidence,
            evaluationCount: 0,
            evidence: [],
          };
          signalDetails[signal.signalId] = detail;
        }

        detail.evaluationCount++;

        // Upgrade confidence if better
        const confidenceRank: Record<SignalConfidence, number> = {
          clear: 4,
          partial: 3,
          unclear: 2,
          absent: 1,
        };

        if (confidenceRank[signal.confidence] > confidenceRank[detail.bestConfidence]) {
          detail.bestConfidence = signal.confidence;
        }

        // Collect evidence
        if (signal.evidence) {
          detail.evidence.push(signal.evidence);
        }
      }
    }

    // Categorize signals
    const present: SignalId[] = [];
    const partial: SignalId[] = [];
    const missing: SignalId[] = [];
    const notAsked: SignalId[] = [];

    for (const signalId of allPossibleSignals) {
      if (!askedSignals.has(signalId)) {
        notAsked.push(signalId);
        continue;
      }

      const detail = signalDetails[signalId];
      if (!detail) {
        missing.push(signalId);
        continue;
      }

      switch (detail.bestConfidence) {
        case "clear":
          present.push(signalId);
          break;
        case "partial":
          partial.push(signalId);
          break;
        case "absent":
        case "unclear":
          missing.push(signalId);
          break;
      }
    }

    return {
      present,
      partial,
      missing,
      notAsked,
      details: signalDetails,
    };
  }

  /**
   * Complete signal extraction pipeline for an application.
   *
   * 1. Extract signals from all answers
   * 2. Aggregate signals
   * 3. Save results to DB (posture computation deferred to Phase 2)
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
    aggregated: AggregatedSignalState;
  }> {
    try {
      // Extract signals
      const results = await this.extractSignalsForApplication(client, applicationId, options);

      // Get all possible signals from the extracted answers
      const allSignals = new Set<SignalId>();
      for (const result of results) {
        for (const signal of result.signals) {
          allSignals.add(signal.signalId);
        }
      }

      // Aggregate
      const aggregated = this.aggregateSignals(results, Array.from(allSignals));

      // Save aggregated results (posture placeholder until Phase 2)
      // For now, we'll use a simple rule: if any critical signal is missing, HIGH_UNCERTAINTY
      const criticalSignals: SignalId[] = [
        "decision_under_uncertainty",
        "accountability",
        "learning_from_failure",
      ];

      let posture: string;
      const criticalMissing = criticalSignals.filter((s) => aggregated.missing.includes(s));
      const criticalPresent = criticalSignals.filter((s) => aggregated.present.includes(s));

      if (criticalMissing.length >= 2) {
        posture = "HIGH_UNCERTAINTY";
      } else if (criticalPresent.length >= 2) {
        posture = "LOW_REGRET_RISK";
      } else {
        posture = "SOME_UNCERTAINTY";
      }

      await this.applicationRepository.saveSignalEvaluations(
        applicationId,
        {
          posture,
          present: aggregated.present,
          partial: aggregated.partial,
          missing: aggregated.missing,
          details: aggregated.details,
        },
        posture
      );

      return { results, aggregated };
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
