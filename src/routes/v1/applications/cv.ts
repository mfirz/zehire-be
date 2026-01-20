/**
 * CV Routes
 * =========
 * Endpoints for CV structured data retrieval.
 *
 * Endpoints:
 * - GET /v1/applications/:id/cv/summary - Get structured CV summary
 * - POST /v1/applications/:id/cv/reprocess - Reprocess CV (trigger re-extraction)
 *
 * Note: File download is at GET /v1/applications/:id/cv (in index.ts)
 */

import { Hono } from "hono";

import { ApplicationRepository } from "../../../domain/applications/repository";
import { CVService } from "../../../domain/cv";
import { JobRepository } from "../../../domain/jobs";
import { createLLMClient } from "../../../lib/llm";
import { jwtAuth } from "../../../middleware/auth";
import type { AuthVariables, Env } from "../../../types/bindings";

const cvRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

// Apply JWT auth to all CV routes
cvRoutes.use("/*", jwtAuth);

// =============================================================================
// CV SUMMARY ENDPOINT
// =============================================================================

/**
 * GET /v1/applications/:id/cv/summary
 *
 * Get structured CV summary for an application.
 * Returns work experiences, education, skills, and derived fields.
 */
cvRoutes.get("/:id/cv/summary", async (c) => {
  const applicationId = c.req.param("id")!;
  const user = c.get("user");

  const applicationRepo = new ApplicationRepository(c.env.DB);
  const jobRepo = new JobRepository(c.env.DB);
  const cvService = new CVService(c.env.DB, c.env.CV_BUCKET);

  // Get application and verify ownership
  const application = await applicationRepo.findById(applicationId);

  if (!application) {
    return c.json({ error: "Application not found" }, 404);
  }

  // Verify user's org owns the job
  const job = await jobRepo.findById(application.jobId);

  if (!job || job.orgId !== user.orgId) {
    return c.json({ error: "Application not found" }, 404);
  }

  // Get CV summary
  const cvSummary = await cvService.getCVSummary(applicationId);

  if (!cvSummary) {
    return c.json({ error: "CV data not found" }, 404);
  }

  return c.json(cvSummary);
});

// =============================================================================
// CV REPROCESS ENDPOINT
// =============================================================================

/**
 * POST /v1/applications/:id/cv/reprocess
 *
 * Trigger CV reprocessing for an application.
 * Queues a new CV processing job.
 */
cvRoutes.post("/:id/cv/reprocess", async (c) => {
  const applicationId = c.req.param("id")!;
  const user = c.get("user");

  const applicationRepo = new ApplicationRepository(c.env.DB);
  const jobRepo = new JobRepository(c.env.DB);
  const cvService = new CVService(c.env.DB, c.env.CV_BUCKET);
  const llmClient = createLLMClient({ env: c.env });

  // Get application and verify ownership
  const application = await applicationRepo.findById(applicationId);

  if (!application) {
    return c.json({ error: "Application not found" }, 404);
  }

  // Verify user's org owns the job
  const job = await jobRepo.findById(application.jobId);

  if (!job || job.orgId !== user.orgId) {
    return c.json({ error: "Application not found" }, 404);
  }

  // Check if application has a CV
  if (!application.cvPath) {
    return c.json({ error: "No CV uploaded for this application" }, 400);
  }

  // Reprocess CV synchronously (could also queue it)
  const result = await cvService.reprocessCV(llmClient, applicationId);

  if (!result.success) {
    return c.json(
      {
        error: "CV reprocessing failed",
        details: result.error,
      },
      500
    );
  }

  return c.json({
    success: true,
    message: "CV reprocessed successfully",
  });
});

export default cvRoutes;
