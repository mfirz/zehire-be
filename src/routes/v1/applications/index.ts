/**
 * Applications Routes (v1)
 * ========================
 * Recruiter-facing endpoints for managing applications.
 *
 * Endpoints:
 * - GET /:applicationId - Get full application details
 * - PATCH /:applicationId - Update application status
 * - GET /:applicationId/posture - Get decision posture
 * - GET /:applicationId/cv - Download CV file
 *
 * All endpoints require authentication and verify job ownership.
 */

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { ApplicationRepository, CvService } from "../../../domain/applications";
import { CreateNoteSchema, UpdateApplicationSchema } from "../../../domain/applications/schemas";
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
 * Get full application details including answers, signals, and navigation context.
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

  // Get navigation context (prev/next by posture)
  const navigation = await applicationRepository.getNavigationContext(applicationId, application.jobId);

  // Transform response for frontend
  return c.json({
    ...application,
    // Replace internal cvPath with public-facing cvUrl
    cvPath: undefined,
    hasCv: !!application.cvPath,
    cvUrl: application.cvPath ? `/v1/applications/${applicationId}/cv` : null,
    // Navigation context for prev/next buttons
    navigation,
  });
});

/**
 * PATCH /v1/applications/:applicationId
 *
 * Update application status and/or triage status.
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

    // Get current application for logging old values
    const current = await applicationRepository.findById(applicationId);

    if (!current) {
      return c.json({ error: "Application not found" }, 404);
    }

    // Verify user's org owns the job
    const job = await jobRepository.findByIdAndOrg(current.jobId, orgId);

    if (!job) {
      return c.json({ error: "Application not found" }, 404);
    }

    // Build update object, only including defined values
    const updates: { status?: string; triageStatus?: "SHORTLIST" | "MAYBE" | "WEAK" } = {};
    if (input.status !== undefined) {
      updates.status = input.status;
    }
    if (input.triageStatus !== undefined) {
      updates.triageStatus = input.triageStatus;
    }

    // Update status and/or triage status
    const updated = await applicationRepository.updateStatus(applicationId, updates);

    if (!updated) {
      return c.json({ error: "Failed to update application" }, 500);
    }

    // Log events for timeline
    if (input.status && input.status !== current.status) {
      await applicationRepository.logEvent(applicationId, "status_change", {
        actorId: user.userId,
        actorName: user.email,
        oldValue: current.status,
        newValue: input.status,
      });
    }

    if (input.triageStatus && input.triageStatus !== current.triageStatus) {
      await applicationRepository.logEvent(applicationId, "triage_change", {
        actorId: user.userId,
        actorName: user.email,
        oldValue: current.triageStatus || null,
        newValue: input.triageStatus,
      });
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

// =============================================================================
// NOTES ENDPOINTS
// =============================================================================

/**
 * GET /v1/applications/:applicationId/notes
 *
 * Get all notes for an application.
 */
applicationsRoute.get("/:applicationId/notes", async (c) => {
  const applicationId = c.req.param("applicationId")!;
  const user = c.get("user");
  const orgId = user.orgId;

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

  const notes = await applicationRepository.getNotes(applicationId);

  return c.json({ notes });
});

/**
 * POST /v1/applications/:applicationId/notes
 *
 * Add a note to an application.
 */
applicationsRoute.post(
  "/:applicationId/notes",
  zValidator("json", CreateNoteSchema),
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

    // Create note
    const note = await applicationRepository.createNote(
      applicationId,
      user.userId,
      user.email, // Use email as author name for now
      input.content
    );

    // Log event
    await applicationRepository.logEvent(applicationId, "note_added", {
      actorId: user.userId,
      actorName: user.email,
      metadata: { noteId: note.id },
    });

    return c.json(note, 201);
  }
);

/**
 * DELETE /v1/applications/:applicationId/notes/:noteId
 *
 * Delete a note. Only the author can delete their own notes.
 */
applicationsRoute.delete("/:applicationId/notes/:noteId", async (c) => {
  const applicationId = c.req.param("applicationId")!;
  const noteId = c.req.param("noteId")!;
  const user = c.get("user");
  const orgId = user.orgId;

  const applicationRepository = new ApplicationRepository(c.env.DB);
  const jobRepository = new JobRepository(c.env.DB);

  // Get note with its application ID
  const noteData = await applicationRepository.getNoteWithAppId(noteId);

  if (!noteData || noteData.applicationId !== applicationId) {
    return c.json({ error: "Note not found" }, 404);
  }

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

  // Delete note (only author can delete)
  const deleted = await applicationRepository.deleteNote(noteId, user.userId);

  if (!deleted) {
    return c.json({ error: "Note not found or you are not the author" }, 404);
  }

  // Log event
  await applicationRepository.logEvent(applicationId, "note_deleted", {
    actorId: user.userId,
    actorName: user.email,
    metadata: { noteId },
  });

  return c.body(null, 204);
});

// =============================================================================
// TIMELINE ENDPOINT
// =============================================================================

/**
 * GET /v1/applications/:applicationId/timeline
 *
 * Get activity timeline for an application.
 */
applicationsRoute.get("/:applicationId/timeline", async (c) => {
  const applicationId = c.req.param("applicationId")!;
  const user = c.get("user");
  const orgId = user.orgId;

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

  const events = await applicationRepository.getTimeline(applicationId);

  return c.json({ events });
});

// =============================================================================
// CV ENDPOINTS
// =============================================================================

/**
 * GET /v1/applications/:applicationId/cv
 *
 * Download the CV for an application.
 * Streams the file directly from R2.
 */
applicationsRoute.get("/:applicationId/cv", async (c) => {
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

  // Check if CV exists
  if (!application.cvPath) {
    return c.json({ error: "No CV uploaded for this application" }, 404);
  }

  // Get CV from R2
  const cvService = new CvService(c.env.CV_BUCKET, applicationRepository);
  const cvObject = await cvService.get(application.cvPath);

  if (!cvObject) {
    return c.json({ error: "CV file not found" }, 404);
  }

  // Stream the file
  return new Response(cvObject.body, {
    headers: {
      "Content-Type": cvObject.httpMetadata?.contentType || "application/pdf",
      "Content-Disposition": `attachment; filename="${application.cvFilename || "cv.pdf"}"`,
      "Content-Length": cvObject.size.toString(),
    },
  });
});

export default applicationsRoute;
