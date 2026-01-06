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
import { JobRepository } from "../domain/jobs/repository";
import { JobProcessor } from "../domain/jobs/processor";
import { createLLMClient } from "../lib/llm";
import type { Env, JobQueueMessage } from "../types/bindings";

/**
 * Queue consumer handler.
 * Called by Cloudflare Workers runtime when messages are available.
 */
export async function handleQueue(
  batch: MessageBatch<JobQueueMessage>,
  env: Env
): Promise<void> {
  const repository = new JobRepository(env.DB);
  const llmClient = createLLMClient({ env });
  const processor = new JobProcessor(repository, llmClient);

  for (const message of batch.messages) {
    const { jobId, createdAt } = message.body;

    console.log(`[Queue] Processing job ${jobId} (queued at ${createdAt})`);

    try {
      await processor.processJob(jobId);

      // Acknowledge successful processing
      message.ack();

      console.log(`[Queue] Job ${jobId} completed successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Queue] Job ${jobId} failed: ${errorMessage}`);

      // Retry the message (will go to DLQ after max retries)
      message.retry();
    }
  }
}
