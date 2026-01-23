/**
 * Zehire Backend Worker
 * =====================
 * Main entry point for Cloudflare Workers.
 *
 * Exports:
 * - default: Hono app for HTTP requests
 * - queue: Handler for Cloudflare Queue messages
 * - scheduled: Handler for Cron Triggers
 */

import type { MessageBatch, ScheduledEvent } from "@cloudflare/workers-types";
import app from "./app";
import { handleQueue } from "./queue/consumer";
import { handleScheduled } from "./scheduled";
import type { Env, JobQueueMessage } from "./types/bindings";

export default {
  // HTTP request handler (Hono app)
  fetch: app.fetch,

  // Queue message handler
  async queue(batch: MessageBatch<JobQueueMessage>, env: Env): Promise<void> {
    await handleQueue(batch, env);
  },

  // Scheduled handler (Cron Triggers)
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    await handleScheduled(event, env);
  },
};
