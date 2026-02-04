import { Hono } from "hono";
import type { Env } from "../../types/bindings";
import { assessAuth, type AssessmentAuthVariables } from "../../middleware/assess-auth";
import { AssessmentService } from "../../domain/assessments/service";
import { JobRepository } from "../../domain/jobs/repository";
import { ScheduleInputSchema } from "../../domain/assessments/types";
import {
  formatPortalResponse,
  formatScheduleResponse,
  formatRescheduleResponse,
  formatStartResponse,
  formatUploadResponse,
  formatSubmitResponse,
} from "../helpers/assessment-response";

type AssessEnv = { Bindings: Env; Variables: AssessmentAuthVariables };

const assess = new Hono<AssessEnv>();

// Apply token auth to all routes
assess.use("/:token/*", assessAuth);
assess.use("/:token", assessAuth);

// GET /assess/:token — View assessment portal
assess.get("/:token", async (c) => {
  const token = c.req.param("token");

  const service = new AssessmentService(c.env.DB);
  const result = await service.getAssessmentByToken(token);

  if (!result.success) {
    const status = result.error.code === "NOT_FOUND" ? 404 : 400;
    return c.json({ error: result.error.message, code: result.error.code }, status);
  }

  // Fetch job for company/jobTitle
  const jobRepo = new JobRepository(c.env.DB);
  const job = await jobRepo.findById(result.data.assessment.jobId);

  return c.json({
    data: formatPortalResponse(
      result.data.assessment,
      result.data.definition,
      result.data.parts,
      result.data.scheduling,
      result.data.files,
      { title: job?.title ?? "Position", companyName: job?.companyName ?? null },
    ),
  });
});

// POST /assess/:token/schedule — Schedule assessment
assess.post("/:token/schedule", async (c) => {
  const token = c.req.param("token");
  const body = await c.req.json();

  const parsed = ScheduleInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message, code: "VALIDATION_ERROR" }, 400);
  }

  const service = new AssessmentService(c.env.DB);
  const result = await service.scheduleAssessment(token, parsed.data);

  if (!result.success) {
    const status = result.error.code === "ALREADY_SCHEDULED" ? 409
      : result.error.code === "PAST_SCHEDULE_DEADLINE" ? 410
      : result.error.code === "EXPIRED" ? 410
      : 400;
    return c.json({ error: result.error.message, code: result.error.code }, status);
  }

  return c.json({ data: formatScheduleResponse(result.data) });
});

// POST /assess/:token/reschedule — Reschedule assessment
assess.post("/:token/reschedule", async (c) => {
  const token = c.req.param("token");
  const body = await c.req.json();

  const parsed = ScheduleInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message, code: "VALIDATION_ERROR" }, 400);
  }

  const service = new AssessmentService(c.env.DB);
  const result = await service.rescheduleAssessment(token, parsed.data);

  if (!result.success) {
    const status = result.error.code === "NO_RESCHEDULES_LEFT" ? 409
      : result.error.code === "NOT_SCHEDULED" ? 409
      : result.error.code === "PAST_SCHEDULE_DEADLINE" ? 410
      : 400;
    return c.json({ error: result.error.message, code: result.error.code }, status);
  }

  // Fetch scheduling config for maxReschedules
  const jobAssessment = await service.getJobAssessment(result.data.jobId);
  const maxReschedules = jobAssessment.success && jobAssessment.data
    ? jobAssessment.data.scheduling.maxReschedules
    : 2;

  return c.json({ data: formatRescheduleResponse(result.data, maxReschedules) });
});

// POST /assess/:token/start — Start the assessment (transition to in_progress)
assess.post("/:token/start", async (c) => {
  const token = c.req.param("token");

  const service = new AssessmentService(c.env.DB);
  const result = await service.startAssessment(token);

  if (!result.success) {
    const status = result.error.code === "EXPIRED" ? 410 : 400;
    return c.json({ error: result.error.message, code: result.error.code }, status);
  }

  return c.json({ data: formatStartResponse(result.data) });
});

// POST /assess/:token/parts/:partId/files — Upload file
assess.post("/:token/parts/:partId/files", async (c) => {
  const token = c.req.param("token");
  const partId = c.req.param("partId");

  const formData = await c.req.formData();
  const rawFile = formData.get("file");

  if (!rawFile || typeof rawFile === "string") {
    return c.json({ error: "File is required", code: "VALIDATION_ERROR" }, 400);
  }

  // Cloudflare Workers FormData returns File objects at runtime,
  // but the default workers-types declares get() as string | null.
  const file = rawFile as unknown as File;

  const service = new AssessmentService(c.env.DB);
  const result = await service.uploadFile(
    token,
    partId,
    {
      name: file.name,
      size: file.size,
      type: file.type,
      stream: file.stream(),
    },
    c.env.CV_BUCKET
  );

  if (!result.success) {
    const status = result.error.code === "FILE_TOO_LARGE" ? 413
      : result.error.code === "INVALID_FILE_TYPE" ? 415
      : result.error.code === "EXPIRED" ? 410
      : result.error.code === "NOT_IN_PROGRESS" ? 409
      : result.error.code === "PART_NOT_FOUND" ? 404
      : 400;
    return c.json({ error: result.error.message, code: result.error.code }, status);
  }

  return c.json({ data: formatUploadResponse(result.data) }, 201);
});

// DELETE /assess/:token/parts/:partId/files/:fileId — Delete file
assess.delete("/:token/parts/:partId/files/:fileId", async (c) => {
  const token = c.req.param("token");
  const partId = c.req.param("partId");
  const fileId = c.req.param("fileId");

  const service = new AssessmentService(c.env.DB);
  const result = await service.deleteFile(token, partId, fileId, c.env.CV_BUCKET);

  if (!result.success) {
    const status = result.error.code === "FILE_NOT_FOUND" ? 404
      : result.error.code === "NOT_IN_PROGRESS" ? 409
      : 400;
    return c.json({ error: result.error.message, code: result.error.code }, status);
  }

  return c.json({ message: "File deleted" });
});

// POST /assess/:token/submit — Submit assessment
assess.post("/:token/submit", async (c) => {
  const token = c.req.param("token");

  const service = new AssessmentService(c.env.DB);
  const result = await service.submitAssessment(token);

  if (!result.success) {
    const status = result.error.code === "MISSING_PARTS" ? 400
      : result.error.code === "NOT_IN_PROGRESS" ? 409
      : result.error.code === "EXPIRED" ? 410
      : 400;
    return c.json({ error: result.error.message, code: result.error.code }, status);
  }

  return c.json({ data: formatSubmitResponse(result.data) });
});

export default assess;
