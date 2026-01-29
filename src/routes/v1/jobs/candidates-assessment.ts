import { Hono } from "hono";
import type { Env } from "../../../types/bindings";
import type { AuthVariables } from "../../../types/bindings";
import { AssessmentService } from "../../../domain/assessments/service";
import { EvaluateInputSchema, CancelInputSchema } from "../../../domain/assessments/types";

const candidatesAssessment = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// POST /v1/jobs/:jobId/candidates/:applicationId/assessment/invite — Invite candidate
candidatesAssessment.post("/:jobId/candidates/:applicationId/assessment/invite", async (c) => {
  const { jobId, applicationId } = c.req.param();

  const service = new AssessmentService(c.env.DB);
  const result = await service.inviteCandidate(applicationId, jobId);

  if (!result.success) {
    const status = result.error.code === "ALREADY_INVITED" ? 409
      : result.error.code === "NO_ASSESSMENT" ? 404
      : 400;
    return c.json({ error: result.error.message, code: result.error.code }, status);
  }

  return c.json(result.data, 201);
});

// GET /v1/jobs/:jobId/candidates/:applicationId/assessment — Get candidate's assessment
candidatesAssessment.get("/:jobId/candidates/:applicationId/assessment", async (c) => {
  const { applicationId } = c.req.param();

  const service = new AssessmentService(c.env.DB);
  const result = await service.getCandidateAssessment(applicationId);

  if (!result.success) {
    if (result.error.code === "NOT_FOUND") {
      return c.json({ error: result.error.message, code: result.error.code }, 404);
    }
    return c.json({ error: result.error.message, code: result.error.code }, 400);
  }

  return c.json(result.data);
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
  const getResult = await service.getCandidateAssessment(applicationId);
  if (!getResult.success) {
    return c.json({ error: getResult.error.message, code: getResult.error.code }, 404);
  }

  const result = await service.evaluateAssessment(getResult.data.assessment.id, user.userId, parsed.data);

  if (!result.success) {
    const status = result.error.code === "NOT_SUBMITTED" ? 409 : 400;
    return c.json({ error: result.error.message, code: result.error.code }, status);
  }

  return c.json(result.data);
});

// POST /v1/jobs/:jobId/candidates/:applicationId/assessment/cancel — Cancel assessment
candidatesAssessment.post("/:jobId/candidates/:applicationId/assessment/cancel", async (c) => {
  const { applicationId } = c.req.param();
  const body = await c.req.json().catch(() => ({}));

  const parsed = CancelInputSchema.safeParse(body);

  const service = new AssessmentService(c.env.DB);
  const getResult = await service.getCandidateAssessment(applicationId);
  if (!getResult.success) {
    return c.json({ error: getResult.error.message, code: getResult.error.code }, 404);
  }

  const result = await service.cancelAssessment(getResult.data.assessment.id, parsed.success ? parsed.data.reason : undefined);

  if (!result.success) {
    const status = result.error.code === "ALREADY_CANCELLED" ? 409
      : result.error.code === "ALREADY_SUBMITTED" ? 409
      : 400;
    return c.json({ error: result.error.message, code: result.error.code }, status);
  }

  return c.json({ success: true });
});

export default candidatesAssessment;
