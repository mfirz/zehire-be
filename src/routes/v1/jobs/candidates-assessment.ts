import { Hono } from "hono";
import type { Env } from "../../../types/bindings";
import type { AuthVariables } from "../../../types/bindings";
import { AssessmentService } from "../../../domain/assessments/service";
import { EvaluateInputSchema, CancelInputSchema } from "../../../domain/assessments/types";
import { ApplicationRepository } from "../../../domain/applications";
import { JobRepository } from "../../../domain/jobs/repository";
import { createEmailGatewayFromEnv } from "../../../modules/email";
import {
  formatRecruiterAssessmentResponse,
  formatInviteResponse,
  formatEvaluateResponse,
  formatCancelResponse,
} from "../../helpers/assessment-response";

const candidatesAssessment = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// POST /v1/jobs/:jobId/candidates/:applicationId/assessment/invite — Invite candidate
candidatesAssessment.post("/:jobId/candidates/:applicationId/assessment/invite", async (c) => {
  const { jobId, applicationId } = c.req.param();

  // Verify job is open (published or paused)
  const jobRepo = new JobRepository(c.env.DB);
  const job = await jobRepo.findById(jobId);

  if (!job || (job.status !== "published" && job.status !== "paused")) {
    return c.json({ error: "Job is not open", code: "JOB_NOT_OPEN" }, 400);
  }

  const service = new AssessmentService(c.env.DB);
  const result = await service.inviteCandidate(applicationId, jobId);

  if (!result.success) {
    const status = result.error.code === "ALREADY_INVITED" ? 409
      : result.error.code === "NO_ASSESSMENT" ? 404
      : 400;
    return c.json({ error: result.error.message, code: result.error.code }, status);
  }

  // Send assessment invite email (fire-and-forget)
  try {
    const applicationRepo = new ApplicationRepository(c.env.DB);
    const jobRepo = new JobRepository(c.env.DB);

    const [application, job, jobAssessment] = await Promise.all([
      applicationRepo.findById(applicationId),
      jobRepo.findById(jobId),
      service.getJobAssessment(jobId),
    ]);

    if (application && job) {
      const assessmentName =
        jobAssessment.success && jobAssessment.data
          ? jobAssessment.data.definition.name
          : "Assessment";
      const portalUrl = `${c.env.APP_BASE_URL}/assess/${result.data.token}`;

      const emailGateway = createEmailGatewayFromEnv(c.env);
      await emailGateway.sendAssessmentInvite({
        email: application.candidateEmail,
        name: application.candidateName,
        jobTitle: job.title,
        companyName: job.companyName ?? "Company",
        assessmentName,
        portalUrl,
        scheduleDeadline: result.data.scheduleDeadline,
      });
    }
  } catch (error) {
    // Log but don't fail - assessment is created, email can be resent
    console.error("Failed to send assessment invite email:", error);
  }

  return c.json({ data: formatInviteResponse(result.data) }, 201);
});

// GET /v1/jobs/:jobId/candidates/:applicationId/assessment — Get candidate's assessment
candidatesAssessment.get("/:jobId/candidates/:applicationId/assessment", async (c) => {
  const { jobId, applicationId } = c.req.param();

  const service = new AssessmentService(c.env.DB);
  const result = await service.getCandidateAssessment(applicationId);

  if (!result.success) {
    if (result.error.code === "NOT_FOUND") {
      return c.json({ data: null });
    }
    return c.json({ error: result.error.message, code: result.error.code }, 400);
  }

  // Fetch job assessment definition for parts info
  const jobAssessment = await service.getJobAssessment(jobId);
  const defName = jobAssessment.success && jobAssessment.data
    ? jobAssessment.data.definition.name
    : "Assessment";
  const defParts = jobAssessment.success && jobAssessment.data
    ? jobAssessment.data.parts
    : [];

  return c.json({
    data: formatRecruiterAssessmentResponse(
      result.data.assessment,
      defName,
      defParts,
      result.data.files,
    ),
  });
});

// POST /v1/jobs/:jobId/candidates/:applicationId/assessment/resend-invite — Resend assessment invite email
candidatesAssessment.post("/:jobId/candidates/:applicationId/assessment/resend-invite", async (c) => {
  const { jobId, applicationId } = c.req.param();

  const service = new AssessmentService(c.env.DB);
  const getResult = await service.getCandidateAssessment(applicationId);

  if (!getResult.success) {
    return c.json({ error: getResult.error.message, code: getResult.error.code }, 404);
  }

  const { assessment } = getResult.data;

  // Only allow resend when candidate hasn't acted yet
  if (assessment.status !== "invited" && assessment.status !== "schedule_expired") {
    return c.json({
      error: "Cannot resend invite — candidate has already progressed beyond the invite stage",
      code: "INVALID_STATUS",
    }, 409);
  }

  const applicationRepo = new ApplicationRepository(c.env.DB);
  const jobRepo = new JobRepository(c.env.DB);

  const [application, job, jobAssessment] = await Promise.all([
    applicationRepo.findById(applicationId),
    jobRepo.findById(jobId),
    service.getJobAssessment(jobId),
  ]);

  if (!application || !job) {
    return c.json({ error: "Application or job not found", code: "NOT_FOUND" }, 404);
  }

  const assessmentName =
    jobAssessment.success && jobAssessment.data
      ? jobAssessment.data.definition.name
      : "Assessment";
  const portalUrl = `${c.env.APP_BASE_URL}/assess/${assessment.token}`;

  const emailGateway = createEmailGatewayFromEnv(c.env);
  try {
    await emailGateway.sendAssessmentInvite({
      email: application.candidateEmail,
      name: application.candidateName,
      jobTitle: job.title,
      companyName: job.companyName ?? "Company",
      assessmentName,
      portalUrl,
      scheduleDeadline: assessment.scheduleDeadline,
    });
  } catch (error) {
    console.error("Failed to resend assessment invite email:", error);
    return c.json({ error: "Failed to send email", code: "EMAIL_SEND_FAILED" }, 500);
  }

  return c.json({ success: true, message: "Assessment invite resent successfully" });
});

// POST /v1/jobs/:jobId/candidates/:applicationId/assessment/evaluate — Evaluate assessment
candidatesAssessment.post("/:jobId/candidates/:applicationId/assessment/evaluate", async (c) => {
  const user = c.get("user");
  const { applicationId } = c.req.param();
  const body = await c.req.json();

  const parsed = EvaluateInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message, code: "VALIDATION_ERROR" }, 400);
  }

  const service = new AssessmentService(c.env.DB);
  const result = await service.evaluateAssessment(applicationId, user.userId, parsed.data);

  if (!result.success) {
    const status = result.error.code === "NOT_SUBMITTED" ? 409
      : result.error.code === "NOT_FOUND" ? 404
      : 400;
    return c.json({ error: result.error.message, code: result.error.code }, status);
  }

  return c.json({ data: formatEvaluateResponse(result.data) });
});

// POST /v1/jobs/:jobId/candidates/:applicationId/assessment/cancel — Cancel assessment
candidatesAssessment.post("/:jobId/candidates/:applicationId/assessment/cancel", async (c) => {
  const { applicationId } = c.req.param();
  const body = await c.req.json().catch(() => ({}));

  const parsed = CancelInputSchema.safeParse(body);

  const service = new AssessmentService(c.env.DB);
  const result = await service.cancelAssessment(applicationId, parsed.success ? parsed.data.reason : undefined);

  if (!result.success) {
    const status = result.error.code === "ALREADY_CANCELLED" ? 409
      : result.error.code === "ALREADY_SUBMITTED" ? 409
      : result.error.code === "NOT_FOUND" ? 404
      : 400;
    return c.json({ error: result.error.message, code: result.error.code }, status);
  }

  // Re-fetch to get updated assessment with cancelledAt/cancelReason
  const refetch = await service.getCandidateAssessment(applicationId);
  if (!refetch.success) {
    return c.json({ error: refetch.error.message, code: refetch.error.code }, 500);
  }

  return c.json({ data: formatCancelResponse(refetch.data.assessment) });
});

export default candidatesAssessment;
