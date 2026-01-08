/**
 * POST /v1/jobs/:id/close
 * =======================
 * Close a job permanently.
 *
 * Requires JWT authentication.
 *
 * Prerequisites:
 * - Job must be in published or paused status
 *
 * Effects:
 * - Sets status to 'closed'
 * - Permanently hides from public view
 * - Permanently stops billing (when billing is implemented)
 *
 * Note: Closed jobs cannot be reopened. They remain for historical records.
 */

import type { Context } from "hono";
import { JobRepository, JobService, OrgRepository } from "../../../domain/jobs";
import type { AuthVariables, Env } from "../../../types/bindings";

export async function closeJob(
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

  // Close job
  const result = await service.closeJob(jobId, orgId);

  if (!result.success) {
    const statusCode = result.error.code === "NOT_FOUND" ? 404 : 400;
    return c.json({ error: result.error }, statusCode);
  }

  return c.json(result.data, 200);
}
