/**
 * Pipeline Routes
 * ===============
 * GET /v1/jobs/:id/pipeline - Get pipeline details
 * PATCH /v1/jobs/:id/pipeline - Update pipeline configuration
 * POST /v1/jobs/:id/pipeline/reset - Reset pipeline to AI recommendation
 *
 * Requires JWT authentication. Pipeline is only editable for draft jobs.
 */

import type { Context } from "hono";
import { JobRepository, JobService, OrgRepository } from "../../../domain/jobs";
import {
  PipelineConfigSchema,
  PipelineRecommendationSchema,
  PipelineUpdateSchema,
} from "../../../domain/pipeline/types";
import type { AuthVariables, Env } from "../../../types/bindings";

/**
 * GET /v1/jobs/:id/pipeline
 * Get pipeline recommendation and configuration for a job.
 */
export async function getPipeline(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>
): Promise<Response> {
  const jobId = c.req.param("id");
  const user = c.get("user");
  const orgId = user.orgId;

  if (!jobId) {
    return c.json({ error: "Job ID is required" }, 400);
  }

  // Fetch job
  const repository = new JobRepository(c.env.DB);
  const job = await repository.findByIdAndOrg(jobId, orgId);

  if (!job) {
    return c.json({ error: { code: "NOT_FOUND", message: "Job not found" } }, 404);
  }

  // Check if pipeline has been generated
  if (job.pipeline_status === "none" || job.pipeline_status === "pending") {
    return c.json(
      {
        pipelineStatus: job.pipeline_status,
        recommendation: null,
        config: null,
      },
      200
    );
  }

  if (job.pipeline_status === "processing") {
    return c.json(
      {
        pipelineStatus: "processing",
        recommendation: null,
        config: null,
      },
      200
    );
  }

  if (job.pipeline_status === "failed") {
    return c.json(
      {
        pipelineStatus: "failed",
        recommendation: null,
        config: null,
        error: job.pipeline_error,
        errorCode: job.pipeline_error_code,
      },
      200
    );
  }

  // Pipeline is completed - parse and return data
  const recommendation = job.pipeline_recommendation
    ? PipelineRecommendationSchema.parse(JSON.parse(job.pipeline_recommendation))
    : null;

  const config = job.pipeline ? PipelineConfigSchema.parse(JSON.parse(job.pipeline)) : null;

  return c.json(
    {
      pipelineStatus: job.pipeline_status,
      recommendation,
      config,
      generatedAt: job.pipeline_generated_at,
    },
    200
  );
}

/**
 * PATCH /v1/jobs/:id/pipeline
 * Update pipeline configuration (recruiter edits).
 */
export async function updatePipeline(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>
): Promise<Response> {
  const jobId = c.req.param("id");
  const user = c.get("user");
  const orgId = user.orgId;

  if (!jobId) {
    return c.json({ error: "Job ID is required" }, 400);
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } }, 400);
  }

  const parseResult = PipelineUpdateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid pipeline update",
          details: parseResult.error.errors,
        },
      },
      400
    );
  }

  // Create services
  const repository = new JobRepository(c.env.DB);
  const orgRepository = new OrgRepository(c.env.DB);
  const service = new JobService(repository, orgRepository, c.env.JOB_QUEUE, c.env.DB);

  // Update pipeline config
  const result = await service.updatePipelineConfig(jobId, orgId, parseResult.data);

  if (!result.success) {
    const statusCode =
      result.error.code === "NOT_FOUND"
        ? 404
        : result.error.code === "INVALID_STATE" || result.error.code === "PIPELINE_NOT_READY"
          ? 400
          : 500;

    return c.json({ error: result.error }, statusCode);
  }

  return c.json(result.data, 200);
}

/**
 * POST /v1/jobs/:id/pipeline/reset
 * Reset pipeline configuration to AI recommendation.
 *
 * This regenerates the initial config from the existing recommendation
 * without calling the LLM. Instant, free, and doesn't count against limits.
 */
export async function resetPipeline(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>
): Promise<Response> {
  const jobId = c.req.param("id");
  const user = c.get("user");
  const orgId = user.orgId;

  if (!jobId) {
    return c.json({ error: "Job ID is required" }, 400);
  }

  // Create services
  const repository = new JobRepository(c.env.DB);
  const orgRepository = new OrgRepository(c.env.DB);
  const service = new JobService(repository, orgRepository, c.env.JOB_QUEUE, c.env.DB);

  // Reset pipeline config
  const result = await service.resetPipelineConfig(jobId, orgId);

  if (!result.success) {
    const statusCode =
      result.error.code === "NOT_FOUND"
        ? 404
        : result.error.code === "INVALID_STATE" || result.error.code === "PIPELINE_NOT_READY"
          ? 400
          : 500;

    return c.json({ error: result.error }, statusCode);
  }

  return c.json(result.data, 200);
}
