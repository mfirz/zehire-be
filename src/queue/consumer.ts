/**
 * Job Queue Consumer
 * ==================
 * Processes job messages from Cloudflare Queue.
 *
 * This consumer:
 * 1. Receives job IDs from the queue
 * 2. Fetches job details from D1
 * 3. Runs the LLM pipeline (inference → archetypes → questions)
 * 4. Updates job status in D1
 *
 * Built-in retry with exponential backoff (max 3 retries).
 * Failed messages go to dead-letter queue for debugging.
 */

import type { MessageBatch } from "@cloudflare/workers-types";
import { JobProcessor } from "../domain/jobs/processor";
import { JobRepository, OrgRepository } from "../domain/jobs/repository";
import { createLLMClient } from "../lib/llm";
import type { Env, JobQueueMessage } from "../types/bindings";

/**
 * Queue consumer handler.
 * Called by Cloudflare Workers runtime when messages are available.
 *
 * Handles two types of messages:
 * - questions (default): Generate interview questions
 * - pipeline: Generate hiring pipeline recommendation
 */
export async function handleQueue(batch: MessageBatch<JobQueueMessage>, env: Env): Promise<void> {
  const repository = new JobRepository(env.DB);
  const orgRepository = new OrgRepository(env.DB);
  const llmClient = createLLMClient({ env });
  const processor = new JobProcessor(repository, orgRepository, llmClient);

  for (const message of batch.messages) {
    const { jobId, createdAt, type } = message.body;
    const messageType = type ?? "questions"; // Default to questions for backwards compatibility

    console.log(`[Queue] Processing ${messageType} for job ${jobId} (queued at ${createdAt})`);

    try {
      // Dispatch based on message type
      if (messageType === "pipeline") {
        await processor.processPipelineJob(jobId);
      } else {
        await processor.processJob(jobId);
      }

      // Acknowledge successful processing
      message.ack();

      console.log(`[Queue] Job ${jobId} ${messageType} completed successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Queue] Job ${jobId} ${messageType} failed: ${errorMessage}`);

      // Check if this is a database lock error - add delay before retry
      const isDbLockError =
        errorMessage.includes("1031") ||
        errorMessage.includes("SQLITE_BUSY") ||
        errorMessage.includes("database is locked") ||
        errorMessage.includes("Database busy");

      if (isDbLockError) {
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
