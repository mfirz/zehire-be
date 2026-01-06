/**
 * Zehire Backend Worker
 * =====================
 * Main entry point for Cloudflare Workers.
 *
 * Exports:
 * - default: Hono app for HTTP requests
 * - queue: Handler for Cloudflare Queue messages
 */

import type { MessageBatch } from "@cloudflare/workers-types";
import app from "./app";
import { handleQueue } from "./queue/consumer";
import type { Env, JobQueueMessage } from "./types/bindings";

export default {
  // HTTP request handler (Hono app)
  fetch: app.fetch,

  // Queue message handler
  async queue(batch: MessageBatch<JobQueueMessage>, env: Env): Promise<void> {
    await handleQueue(batch, env);
  },
};
