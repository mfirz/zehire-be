import { Hono } from "hono";
import type { Env } from "../../../types/bindings";
import type { AuthVariables } from "../../../types/bindings";
import { AssessmentService } from "../../../domain/assessments/service";
import { SetJobAssessmentInputSchema } from "../../../domain/assessments/types";

const jobAssessment = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// GET /v1/jobs/:jobId/assessment — Get the assessment linked to this job
jobAssessment.get("/:jobId/assessment", async (c) => {
  const jobId = c.req.param("jobId");

  const service = new AssessmentService(c.env.DB);
  const result = await service.getJobAssessment(jobId);

  if (!result.success) {
    return c.json({ error: result.error.message, code: result.error.code }, 400);
  }

  if (result.data === null) {
    return c.json({ assessment: null });
  }

  return c.json(result.data);
});

// PUT /v1/jobs/:jobId/assessment — Set/replace the assessment for this job
jobAssessment.put("/:jobId/assessment", async (c) => {
  const user = c.get("user");
  const jobId = c.req.param("jobId");
  const body = await c.req.json();

  const parsed = SetJobAssessmentInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message, code: "VALIDATION_ERROR" }, 400);
  }

  const service = new AssessmentService(c.env.DB);
  const result = await service.setJobAssessment(jobId, parsed.data.assessmentId, user.orgId);

  if (!result.success) {
    const status = result.error.code === "ASSESSMENT_NOT_FOUND" ? 404
      : result.error.code === "ASSESSMENT_ARCHIVED" ? 409
      : 400;
    return c.json({ error: result.error.message, code: result.error.code }, status);
  }

  return c.json(result.data);
});

// DELETE /v1/jobs/:jobId/assessment — Remove assessment from job
jobAssessment.delete("/:jobId/assessment", async (c) => {
  const jobId = c.req.param("jobId");

  const service = new AssessmentService(c.env.DB);
  const result = await service.removeJobAssessment(jobId);

  if (!result.success) {
    return c.json({ error: result.error.message, code: result.error.code }, 400);
  }

  return c.json({ success: true });
});

export default jobAssessment;
