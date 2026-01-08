/**
 * POST /v1/jobs/:id/resume
 * ========================
 * Resume a paused job.
 *
 * Requires JWT authentication.
 *
 * Prerequisites:
 * - Job must be in paused status
 *
 * Effects:
 * - Sets status back to 'published'
 * - Makes job publicly accessible again
 * - Restarts billing (when billing is implemented)
 */

import type { Context } from "hono";
import { JobRepository, JobService, OrgRepository } from "../../../domain/jobs";
import type { AuthVariables, Env } from "../../../types/bindings";

export async function resumeJob(
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
  const service = new JobService(repository, orgRepository, c.env.JOB_QUEUE);

  // Resume job
  const result = await service.resumeJob(jobId, orgId);

  if (!result.success) {
    const statusCode = result.error.code === "NOT_FOUND" ? 404 : 400;
    return c.json({ error: result.error }, statusCode);
  }

  return c.json(result.data, 200);
}
