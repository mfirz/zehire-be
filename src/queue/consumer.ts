/**
 * Job Queue Consumer
 * ==================
 * Processes job messages from Cloudflare Queue.
 *
 * This consumer handles:
 * 1. questions (default): Generate interview questions
 * 2. pipeline: Generate hiring pipeline recommendation
 * 3. evaluate_application: Extract signals from application answers
 * 4. process_cv: Extract and summarize CV content
 *
 * Built-in retry with exponential backoff (max 3 retries).
 * Failed messages go to dead-letter queue for debugging.
 */

import type { MessageBatch } from "@cloudflare/workers-types";
import { ApplicationRepository } from "../domain/applications/repository";
import { CVService } from "../domain/cv";
import { JobProcessor } from "../domain/jobs/processor";
import { JobRepository, OrgRepository } from "../domain/jobs/repository";
import { SignalExtractionService } from "../domain/signals/service";
import { createLLMClient } from "../lib/llm";
import type {
  ApplicationEvaluationMessage,
  CVProcessingMessage,
  Env,
  JobProcessingMessage,
  JobQueueMessage,
} from "../types/bindings";

/**
 * Check if this is a database lock error.
 */
function isDbLockError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return (
    errorMessage.includes("1031") ||
    errorMessage.includes("SQLITE_BUSY") ||
    errorMessage.includes("database is locked") ||
    errorMessage.includes("Database busy")
  );
}

/**
 * Process application evaluation (signal extraction).
 * Runs full pipeline: extraction → aggregation → posture computation.
 */
async function processApplicationEvaluation(
  msg: ApplicationEvaluationMessage,
  env: Env
): Promise<void> {
  const { applicationId, jobId } = msg;
  const applicationRepository = new ApplicationRepository(env.DB);
  const llmClient = createLLMClient({ env });
  // Pass CV_BUCKET to enable CV contradiction detection
  const signalService = new SignalExtractionService(env.DB, env.CV_BUCKET);

  console.log(`[Queue] Starting signal extraction for application ${applicationId} (job ${jobId})`);

  try {
    // Run full signal extraction pipeline:
    // 1. Fetch application and answers
    // 2. Extract signals from each answer via LLM
    // 3. Aggregate signals across all answers
    // 4. Analyze critical signals
    // 5. Detect answer-to-answer conflicts
    // 6. Detect CV-to-answer contradictions
    // 7. Compute decision posture
    // 8. Save results to DB
    const { posture } = await signalService.processApplication(llmClient, applicationId, {
      parallel: false, // Sequential to avoid rate limits
      maxRetries: 2,
    });

    // Mark as completed
    await applicationRepository.updateSignalsStatus(applicationId, "completed");

    console.log(
      `[Queue] Signal extraction completed for application ${applicationId}: posture=${posture.posture}`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Queue] Signal extraction failed for application ${applicationId}: ${errorMessage}`);

    // Mark as failed with error details
    await applicationRepository.updateSignalsStatus(applicationId, "failed", {
      message: errorMessage,
      code: "EXTRACTION_FAILED",
    });

    throw error; // Re-throw to trigger retry
  }
}

/**
 * Process CV extraction and summarization.
 * Extracts text from PDF/DOCX and structures it using LLM.
 */
async function processCVExtraction(
  msg: CVProcessingMessage,
  env: Env
): Promise<void> {
  const { applicationId } = msg;
  const llmClient = createLLMClient({ env });
  const cvService = new CVService(env.DB, env.CV_BUCKET);

  console.log(`[Queue] Starting CV processing for application ${applicationId}`);

  try {
    const result = await cvService.processCV(llmClient, applicationId);

    if (result.success) {
      console.log(`[Queue] CV processing completed for application ${applicationId}`);
    } else {
      console.log(`[Queue] CV processing skipped/failed for application ${applicationId}: ${result.error}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Queue] CV processing failed for application ${applicationId}: ${errorMessage}`);

    throw error; // Re-throw to trigger retry
  }
}

/**
 * Queue consumer handler.
 * Called by Cloudflare Workers runtime when messages are available.
 */
export async function handleQueue(batch: MessageBatch<JobQueueMessage>, env: Env): Promise<void> {
  const repository = new JobRepository(env.DB);
  const orgRepository = new OrgRepository(env.DB);
  const llmClient = createLLMClient({ env });
  const processor = new JobProcessor(repository, orgRepository, llmClient, env.DB);

  for (const message of batch.messages) {
    const body = message.body;
    const messageType = body.type ?? "questions";

    try {
      // Dispatch based on message type
      if (messageType === "evaluate_application") {
        const evalMsg = body as ApplicationEvaluationMessage;
        console.log(
          `[Queue] Processing evaluate_application for application ${evalMsg.applicationId} (queued at ${evalMsg.createdAt})`
        );

        await processApplicationEvaluation(evalMsg, env);

        message.ack();
        console.log(`[Queue] Application ${evalMsg.applicationId} evaluation completed`);
      } else if (messageType === "process_cv") {
        const cvMsg = body as CVProcessingMessage;
        console.log(
          `[Queue] Processing process_cv for application ${cvMsg.applicationId} (queued at ${cvMsg.createdAt})`
        );

        await processCVExtraction(cvMsg, env);

        message.ack();
        console.log(`[Queue] Application ${cvMsg.applicationId} CV processing completed`);
      } else if (messageType === "pipeline") {
        const jobMsg = body as JobProcessingMessage;
        console.log(`[Queue] Processing pipeline for job ${jobMsg.jobId} (queued at ${jobMsg.createdAt})`);

        await processor.processPipelineJob(jobMsg.jobId);

        message.ack();
        console.log(`[Queue] Job ${jobMsg.jobId} pipeline completed successfully`);
      } else {
        // Default: questions
        const jobMsg = body as JobProcessingMessage;
        console.log(`[Queue] Processing questions for job ${jobMsg.jobId} (queued at ${jobMsg.createdAt})`);

        await processor.processJob(jobMsg.jobId);

        message.ack();
        console.log(`[Queue] Job ${jobMsg.jobId} questions completed successfully`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      let identifier: string;

      if (messageType === "evaluate_application") {
        identifier = `application ${(body as ApplicationEvaluationMessage).applicationId}`;
      } else if (messageType === "process_cv") {
        identifier = `application ${(body as CVProcessingMessage).applicationId}`;
      } else {
        identifier = `job ${(body as JobProcessingMessage).jobId}`;
      }

      console.error(`[Queue] ${identifier} ${messageType} failed: ${errorMessage}`);

      if (isDbLockError(error)) {
        // Delay retry by 10 seconds to let database recover
        console.log(`[Queue] Database lock detected, retrying in 10s...`);
        message.retry({ delaySeconds: 10 });
      } else {
        // Retry immediately for other errors
        message.retry();
      }
    }
  }
}
