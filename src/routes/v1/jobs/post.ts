/**
 * POST /v1/jobs
 * =============
 * Create a new job and queue for async processing.
 *
 * Requires JWT authentication. User ID is extracted from the JWT.
 *
 * Returns immediately with job ID. Client should poll GET /v1/jobs/:id
 * to check processing status and retrieve results.
 */

import type { Context } from "hono";
import { CreateJobInputSchema, JobRepository, JobService } from "../../../domain/jobs";
import type { AuthVariables, Env } from "../../../types/bindings";

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
export async function createJob(c: Context<{ Bindings: Env; Variables: AuthVariables }>): Promise<Response> {
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
  const service = new JobService(repository, c.env.JOB_QUEUE);

  // Create job and queue for processing
  const result = await service.createJob(input);

  // Return 202 Accepted (processing queued, not complete)
  return c.json(result, 202);
}
