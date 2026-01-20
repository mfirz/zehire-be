/**
 * Candidates Routes
 * =================
 * Cross-application lookup by candidate email.
 *
 * Endpoints:
 * - GET /v1/candidates/lookup?email=xxx - Cross-application lookup by email
 */

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { CVService } from "../../../domain/cv";
import { JobRepository } from "../../../domain/jobs";
import { jwtAuth } from "../../../middleware/auth";
import type { AuthVariables, Env } from "../../../types/bindings";

const candidatesRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

// Apply JWT auth
candidatesRoutes.use("/*", jwtAuth);

// =============================================================================
// CROSS-APPLICATION LOOKUP ENDPOINT
// =============================================================================

const CandidateLookupSchema = z.object({
  email: z.string().email("Valid email is required"),
});

/**
 * GET /v1/candidates/lookup?email=xxx
 *
 * Look up all applications by a candidate email.
 * Returns all applications across all jobs in the organization.
 *
 * This endpoint enables:
 * - Cross-application visibility for same-email candidates
 * - Understanding candidate history across multiple roles
 * - Viewing all CVs/applications from the same person
 */
candidatesRoutes.get(
  "/lookup",
  zValidator("query", CandidateLookupSchema),
  async (c) => {
    const { email } = c.req.valid("query");
    const user = c.get("user");

    const cvService = new CVService(c.env.DB, c.env.CV_BUCKET);
    const jobRepo = new JobRepository(c.env.DB);

    // Find all applications by email
    const result = await cvService.findApplicationsByEmail(email);

    if (!result || result.totalApplications === 0) {
      return c.json({
        email,
        totalApplications: 0,
        applications: [],
      });
    }

    // Filter to only applications for jobs in user's org
    const filteredApplications = [];

    for (const app of result.applications) {
      const job = await jobRepo.findById(app.jobId);
      if (job && job.orgId === user.orgId) {
        filteredApplications.push(app);
      }
    }

    return c.json({
      email,
      totalApplications: filteredApplications.length,
      applications: filteredApplications,
    });
  }
);

export default candidatesRoutes;
