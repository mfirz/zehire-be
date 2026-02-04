import { Hono } from "hono";
import type { Env } from "../../../types/bindings";
import type { AuthVariables } from "../../../types/bindings";
import { AssessmentService } from "../../../domain/assessments/service";
import { SetJobAssessmentInputSchema } from "../../../domain/assessments/types";
import { formatJobAssessmentResponse } from "../../helpers/assessment-response";

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
    return c.json({ data: null });
  }

  return c.json({
    data: formatJobAssessmentResponse(
      result.data.definition,
      result.data.parts,
      result.data.scheduling,
      result.data.isSnapshot,
      result.data.snapshotAt,
    ),
  });
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

  // Fetch full data after set
  const fullResult = await service.getJobAssessment(jobId);

  if (!fullResult.success || !fullResult.data) {
    return c.json({ error: "Failed to fetch assessment data", code: "INTERNAL_ERROR" }, 500);
  }

  return c.json({
    data: formatJobAssessmentResponse(
      fullResult.data.definition,
      fullResult.data.parts,
      fullResult.data.scheduling,
      fullResult.data.isSnapshot,
      fullResult.data.snapshotAt,
    ),
  });
});

// DELETE /v1/jobs/:jobId/assessment — Remove assessment from job
jobAssessment.delete("/:jobId/assessment", async (c) => {
  const jobId = c.req.param("jobId");

  const service = new AssessmentService(c.env.DB);
  const result = await service.removeJobAssessment(jobId);

  if (!result.success) {
    return c.json({ error: result.error.message, code: result.error.code }, 400);
  }

  return c.json({ message: "Assessment removed" });
});

export default jobAssessment;
