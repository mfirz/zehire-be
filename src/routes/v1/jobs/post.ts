/**
 * POST /v1/jobs
 * =============
 * Create a new job and queue for async processing.
 *
 * Requires JWT authentication. Organization ID is extracted from the JWT.
 *
 * Returns immediately with job ID. Client should poll GET /v1/jobs/:id
 * to check processing status and retrieve results.
 *
 * Cache invalidation: After creating a job, the org's jobs_list_version
 * is incremented to automatically invalidate cached job lists.
 */

import type { Context } from "hono";
import { CreateJobInputSchema, JobRepository, JobService, OrgRepository } from "../../../domain/jobs";
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
  // Get authenticated user
  const user = c.get("user");

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

  // Create services with dependencies
  const repository = new JobRepository(c.env.DB);
  const orgRepository = new OrgRepository(c.env.DB);
  const service = new JobService(repository, c.env.JOB_QUEUE);

  // Create job and queue for processing (scoped to org)
  const result = await service.createJob(input, user.orgId);

  // Increment jobs_list_version to invalidate cached job lists
  await orgRepository.incrementJobsListVersion(user.orgId);

  // Return 202 Accepted (processing queued, not complete)
  return c.json(result, 202);
}
