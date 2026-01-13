/**
 * Applications Routes (v1)
 * ========================
 * Recruiter-facing endpoints for managing applications.
 *
 * Endpoints:
 * - GET /:applicationId - Get full application details
 * - PATCH /:applicationId - Update application status
 *
 * All endpoints require authentication and verify job ownership.
 */

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { ApplicationRepository } from "../../../domain/applications/repository";
import { UpdateApplicationSchema } from "../../../domain/applications/schemas";
import { JobRepository } from "../../../domain/jobs/repository";
import { jwtAuth } from "../../../middleware/auth";
import type { AuthVariables, Env } from "../../../types/bindings";

const applicationsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

// Apply JWT auth to all applications routes
applicationsRoute.use("/*", jwtAuth);

/**
 * GET /v1/applications/:applicationId
 *
 * Get full application details including answers and signals.
 * User's org must own the job this application belongs to.
 */
applicationsRoute.get("/:applicationId", async (c) => {
  const applicationId = c.req.param("applicationId")!;
  const user = c.get("user");
  const orgId = user.orgId;

  const applicationRepository = new ApplicationRepository(c.env.DB);
  const jobRepository = new JobRepository(c.env.DB);

  // Get application
  const application = await applicationRepository.getDetailById(applicationId);

  if (!application) {
    return c.json({ error: "Application not found" }, 404);
  }

  // Verify user's org owns the job
  const job = await jobRepository.findByIdAndOrg(application.jobId, orgId);

  if (!job) {
    return c.json({ error: "Application not found" }, 404);
  }

  return c.json(application);
});

/**
 * PATCH /v1/applications/:applicationId
 *
 * Update application status.
 * User's org must own the job this application belongs to.
 */
applicationsRoute.patch(
  "/:applicationId",
  zValidator("json", UpdateApplicationSchema),
  async (c) => {
    const applicationId = c.req.param("applicationId")!;
    const user = c.get("user");
    const orgId = user.orgId;
    const input = c.req.valid("json");

    const applicationRepository = new ApplicationRepository(c.env.DB);
    const jobRepository = new JobRepository(c.env.DB);

    // Get application's job_id
    const jobId = await applicationRepository.getJobId(applicationId);

    if (!jobId) {
      return c.json({ error: "Application not found" }, 404);
    }

    // Verify user's org owns the job
    const job = await jobRepository.findByIdAndOrg(jobId, orgId);

    if (!job) {
      return c.json({ error: "Application not found" }, 404);
    }

    // Update status
    const updated = await applicationRepository.updateStatus(applicationId, input.status);

    if (!updated) {
      return c.json({ error: "Failed to update application" }, 500);
    }

    return c.json(updated);
  }
);

/**
 * GET /v1/applications/:applicationId/posture
 *
 * Get the decision posture for an application.
 * Returns posture, reasons, signals, conflicts, and suggested actions.
 */
applicationsRoute.get("/:applicationId/posture", async (c) => {
  const applicationId = c.req.param("applicationId")!;
  const user = c.get("user");
  const orgId = user.orgId;

  const applicationRepository = new ApplicationRepository(c.env.DB);
  const jobRepository = new JobRepository(c.env.DB);

  // Get application
  const application = await applicationRepository.findById(applicationId);

  if (!application) {
    return c.json({ error: "Application not found" }, 404);
  }

  // Verify user's org owns the job
  const job = await jobRepository.findByIdAndOrg(application.jobId, orgId);

  if (!job) {
    return c.json({ error: "Application not found" }, 404);
  }

  // Check signals status
  if (!application.signalsStatus) {
    return c.json(
      {
        status: "not_started",
        message: "Signal extraction has not started",
      },
      202
    );
  }

  if (application.signalsStatus === "pending" || application.signalsStatus === "processing") {
    return c.json(
      {
        status: application.signalsStatus,
        message: "Signal extraction in progress",
      },
      202
    );
  }

  if (application.signalsStatus === "failed") {
    return c.json(
      {
        status: "failed",
        error: application.signalsErrorMessage,
        code: application.signalsErrorCode,
      },
      500
    );
  }

  // Get posture result
  const postureResult = await applicationRepository.getPostureResult<{
    posture: string;
    primaryReason: string;
    reasons: Array<{ code: string; message: string; severity: string }>;
    signalState: {
      aggregated: {
        present: string[];
        partial: string[];
        missing: string[];
      };
      criticalAnalysis: {
        gaps: Array<{ signalId: string }>;
      };
      conflicts: Array<{ signals: [string, string]; reason: string }>;
    };
    suggestedActions: string[];
  }>(applicationId);

  if (!postureResult) {
    return c.json({ error: "Posture not computed" }, 404);
  }

  // Format response for frontend
  return c.json({
    posture: postureResult.posture,
    primaryReason: postureResult.primaryReason,
    reasons: postureResult.reasons,
    signals: {
      present: postureResult.signalState.aggregated.present,
      partial: postureResult.signalState.aggregated.partial,
      missing: postureResult.signalState.aggregated.missing,
      criticalGaps: postureResult.signalState.criticalAnalysis.gaps.map((g) => g.signalId),
    },
    conflicts: postureResult.signalState.conflicts.map((conflict) => ({
      signals: conflict.signals,
      reason: conflict.reason,
    })),
    suggestedActions: postureResult.suggestedActions,
  });
});

export default applicationsRoute;
