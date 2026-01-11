/**
 * POST /v1/jobs/:id/generate-pipeline
 * ====================================
 * Queue a job for pipeline generation.
 *
 * Requires JWT authentication. Only draft jobs can generate pipeline.
 *
 * Pipeline can only be generated once per job. To generate a new pipeline,
 * edit the job title or description (which resets the status).
 *
 * Returns 202 Accepted when successfully queued.
 */

import type { Context } from "hono";
import { JobRepository, JobService, OrgRepository } from "../../../domain/jobs";
import type { AuthVariables, Env } from "../../../types/bindings";

export async function generatePipeline(
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

  // Queue for generation
  const result = await service.generatePipeline(jobId, orgId);

  if (!result.success) {
    const statusCode = result.error.code === "NOT_FOUND" ? 404 : 400;
    return c.json({ error: result.error }, statusCode);
  }

  return c.json(result.data, 202);
}
