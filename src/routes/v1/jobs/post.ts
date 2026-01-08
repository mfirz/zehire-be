/**
 * POST /v1/jobs
 * =============
 * Create a new job as a draft.
 *
 * Requires JWT authentication. Organization ID is extracted from the JWT.
 *
 * Unlike the old API, this does NOT automatically queue for processing.
 * The job is created with questionsStatus='none' and must be explicitly
 * queued via POST /v1/jobs/:id/generate.
 *
 * Cache invalidation: After creating a job, the org's jobs_list_version
 * is incremented to automatically invalidate cached job lists.
 */

import type { Context } from "hono";
import {
  CreateJobInputSchema,
  JobRepository,
  JobService,
  OrgRepository,
} from "../../../domain/jobs";
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
export async function createJob(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>
): Promise<Response> {
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
  const service = new JobService(repository, orgRepository, c.env.JOB_QUEUE, c.env.DB);

  // Create job as draft (no auto-queue)
  const result = await service.createJob(input, user.orgId);

  // Increment jobs_list_version to invalidate cached job lists
  await orgRepository.incrementJobsListVersion(user.orgId);

  // Return 201 Created (draft created, not queued)
  return c.json(result, 201);
}
