/**
 * Job Applications Route
 * ======================
 * List applications for a specific job.
 *
 * Endpoint:
 * - GET /:jobId/applications - List all applications for a job
 *
 * Requires authentication and job ownership verification.
 */

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { ApplicationRepository } from "../../../domain/applications/repository";
import { ListApplicationsQuerySchema } from "../../../domain/applications/schemas";
import { JobRepository } from "../../../domain/jobs/repository";
import { jwtAuth } from "../../../middleware/auth";
import type { AuthVariables, Env } from "../../../types/bindings";

const jobApplicationsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

// Apply JWT auth to all job applications routes
jobApplicationsRoute.use("/*", jwtAuth);

/**
 * GET /v1/jobs/:jobId/applications
 *
 * List all applications for a job.
 * Supports filtering by status, signalsStatus, and posture.
 * User's org must own the job.
 */
jobApplicationsRoute.get(
  "/:jobId/applications",
  zValidator("query", ListApplicationsQuerySchema),
  async (c) => {
    const jobId = c.req.param("jobId")!;
    const user = c.get("user");
    const orgId = user.orgId;
    const query = c.req.valid("query");

    const jobRepository = new JobRepository(c.env.DB);
    const applicationRepository = new ApplicationRepository(c.env.DB);

    // Verify job exists and user's org owns it
    const job = await jobRepository.findByIdAndOrg(jobId, orgId);

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    // Get applications
    const { applications, total } = await applicationRepository.listByJobId(jobId, query);

    return c.json({
      applications,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + applications.length < total,
      },
    });
  }
);

export default jobApplicationsRoute;
