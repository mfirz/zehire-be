/**
 * PATCH /v1/jobs/:id
 * ==================
 * Update a draft job's content.
 *
 * Requires JWT authentication. Only draft jobs can be updated.
 *
 * If title or description changes, questions are reset to 'none'
 * and must be regenerated.
 */

import type { Context } from "hono";
import {
  JobRepository,
  JobService,
  OrgRepository,
  UpdateJobInputSchema,
} from "../../../domain/jobs";
import type { AuthVariables, Env } from "../../../types/bindings";

export async function updateJob(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>
): Promise<Response> {
  const jobId = c.req.param("id");
  const user = c.get("user");
  const orgId = user.orgId;

  if (!jobId) {
    return c.json({ error: "Job ID is required" }, 400);
  }

  // Parse and validate request body
  const body: unknown = await c.req.json();
  const parseResult = UpdateJobInputSchema.safeParse(body);

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

  // Create services
  const repository = new JobRepository(c.env.DB);
  const orgRepository = new OrgRepository(c.env.DB);
  const service = new JobService(repository, orgRepository, c.env.JOB_QUEUE, c.env.DB);

  // Update job
  const result = await service.updateJob(jobId, orgId, input);

  if (!result.success) {
    const statusCode = result.error.code === "NOT_FOUND" ? 404 : 400;
    return c.json({ error: result.error }, statusCode);
  }

  return c.json(result.data, 200);
}
