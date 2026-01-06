/**
 * POST /v1/jobs
 * =============
 * Create a new job and start async processing.
 *
 * Returns immediately with job ID. Client should poll GET /v1/jobs/:id
 * to check processing status and retrieve results.
 */

import type { Context } from "hono";
import { CreateJobInputSchema, JobRepository, JobService } from "../../../domain/jobs";
import { createLLMClient } from "../../../lib/llm";
import type { Env } from "../../../types/bindings";

/**
 * Request body for job creation.
 *
 * @example
 * ```json
 * {
 *   "title": "Senior Software Engineer",
 *   "description": "We are looking for a senior engineer to lead...",
 *   "companyName": "Acme Corp",
 *   "department": "Engineering",
 *   "location": "Remote"
 * }
 * ```
 */
export async function createJob(c: Context<{ Bindings: Env }>): Promise<Response> {
  // Parse and validate request body
  const body: unknown = await c.req.json();
  const parseResult = CreateJobInputSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json(
      {
        error: "Validation failed",
        details: parseResult.error.flatten().fieldErrors,
      },
      400
    );
  }

  const input = parseResult.data;

  // Create service with dependencies
  const repository = new JobRepository(c.env.DB);
  const llmClient = createLLMClient({ env: c.env });
  const service = new JobService(repository, llmClient);

  // Create job and start processing
  const result = await service.createJob(input, c.executionCtx);

  // Return 202 Accepted (processing started, not complete)
  return c.json(result, 202);
}
