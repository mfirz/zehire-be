/**
 * POST /v1/jobs/:id/generate
 * ==========================
 * Queue a job for question generation.
 *
 * Requires JWT authentication. Only draft jobs can generate questions.
 *
 * Rate limited:
 * - Maximum 20 regenerations per job
 * - 10 minute cooldown between regenerations
 *
 * Returns 202 Accepted when successfully queued.
 */

import type { Context } from "hono";
import { JobRepository, JobService, OrgRepository } from "../../../domain/jobs";
import type { AuthVariables, Env } from "../../../types/bindings";

export async function generateQuestions(
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
  const result = await service.generateQuestions(jobId, orgId);

  if (!result.success) {
    // Rate limit errors return 429
    if (
      result.error.code === "REGENERATION_LIMIT_REACHED" ||
      result.error.code === "REGENERATION_COOLDOWN"
    ) {
      const response = c.json({ error: result.error }, 429);

      // Add Retry-After header for cooldown errors
      if (result.error.code === "REGENERATION_COOLDOWN") {
        response.headers.set("Retry-After", result.error.retryAfter.toString());
      }

      return response;
    }

    const statusCode = result.error.code === "NOT_FOUND" ? 404 : 400;
    return c.json({ error: result.error }, statusCode);
  }

  return c.json(result.data, 202);
}
