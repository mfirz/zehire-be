/**
 * POST /v1/jobs/:id/publish
 * =========================
 * Publish a draft job.
 *
 * Requires JWT authentication.
 *
 * Prerequisites:
 * - Job must be in draft status
 * - Questions must be completed (questionsStatus = 'completed')
 *
 * Effects:
 * - Generates a unique public slug
 * - Sets status to 'published'
 * - Starts billing (when billing is implemented)
 */

import type { Context } from "hono";
import { JobRepository, JobService, OrgRepository } from "../../../domain/jobs";
import type { AuthVariables, Env } from "../../../types/bindings";

export async function publishJob(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>
): Promise<Response> {
  const jobId = c.req.param("id");
  const user = c.get("user");
  const orgId = user.orgId;

  if (!jobId) {
    return c.json({ error: "Job ID is required" }, 400);
  }

  // Create services
  const repository = new JobRepository(c.env.DB);
  const orgRepository = new OrgRepository(c.env.DB);
  const service = new JobService(repository, orgRepository, c.env.JOB_QUEUE, c.env.DB);

  // Publish job
  const result = await service.publishJob(jobId, orgId);

  if (!result.success) {
    const statusCode = result.error.code === "NOT_FOUND" ? 404 : 400;
    return c.json({ error: result.error }, statusCode);
  }

  return c.json(result.data, 200);
}
