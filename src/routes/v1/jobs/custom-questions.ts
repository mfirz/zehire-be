/**
 * Custom Questions Routes
 * =======================
 * CRUD operations for job custom questions.
 *
 * Endpoints:
 * - POST   /:jobId/custom-questions          Create custom question
 * - GET    /:jobId/custom-questions          List custom questions
 * - PUT    /:jobId/custom-questions/:qid     Update custom question
 * - DELETE /:jobId/custom-questions/:qid     Delete custom question
 * - POST   /:jobId/custom-questions/reorder  Reorder questions
 */

import type { D1Database } from "@cloudflare/workers-types";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import {
  CreateCustomQuestionSchema,
  CustomQuestionsService,
  ReorderQuestionsSchema,
  UpdateCustomQuestionSchema,
} from "../../../domain/custom-questions";
import { JobRepository } from "../../../domain/jobs/repository";
import { jwtAuth } from "../../../middleware/auth";
import type { AuthVariables, Env } from "../../../types/bindings";

const customQuestionsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

// Apply JWT auth to all custom questions routes
customQuestionsRoute.use("/*", jwtAuth);

// =============================================================================
// HELPER: Verify job ownership
// =============================================================================

async function verifyJobOwnership(
  c: { env: { DB: D1Database }; json: (body: unknown, status?: number) => Response },
  jobId: string,
  orgId: string
): Promise<{ job: Awaited<ReturnType<JobRepository["findByIdAndOrg"]>>; error?: Response }> {
  const jobRepository = new JobRepository(c.env.DB);
  const job = await jobRepository.findByIdAndOrg(jobId, orgId);

  if (!job) {
    return { job: null, error: c.json({ error: "Job not found" }, 404) };
  }

  return { job };
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /v1/jobs/:jobId/custom-questions
 * Create a new custom question for a job.
 */
customQuestionsRoute.post(
  "/:jobId/custom-questions",
  zValidator("json", CreateCustomQuestionSchema),
  async (c) => {
    const jobId = c.req.param("jobId")!;
    const user = c.get("user");
    const input = c.req.valid("json");

    const { job, error } = await verifyJobOwnership(c, jobId, user.orgId);
    if (error) return error;

    // Only allow adding questions to draft jobs
    if (job!.status !== "draft") {
      return c.json(
        { error: "Can only add questions to draft jobs" },
        400
      );
    }

    const service = new CustomQuestionsService(c.env.DB);
    const question = await service.createQuestion(jobId, input);

    return c.json(question, 201);
  }
);

/**
 * GET /v1/jobs/:jobId/custom-questions
 * List all custom questions for a job.
 */
customQuestionsRoute.get("/:jobId/custom-questions", async (c) => {
  const jobId = c.req.param("jobId")!;
  const user = c.get("user");

  const { error } = await verifyJobOwnership(c, jobId, user.orgId);
  if (error) return error;

  const service = new CustomQuestionsService(c.env.DB);
  const questions = await service.listQuestions(jobId);

  return c.json({ questions });
});

/**
 * GET /v1/jobs/:jobId/custom-questions/:qid
 * Get a specific custom question.
 */
customQuestionsRoute.get("/:jobId/custom-questions/:qid", async (c) => {
  const jobId = c.req.param("jobId")!;
  const qid = c.req.param("qid")!;
  const user = c.get("user");

  const { error } = await verifyJobOwnership(c, jobId, user.orgId);
  if (error) return error;

  const service = new CustomQuestionsService(c.env.DB);
  const question = await service.getQuestionForJob(qid, jobId);

  if (!question) {
    return c.json({ error: "Question not found" }, 404);
  }

  return c.json(question);
});

/**
 * PUT /v1/jobs/:jobId/custom-questions/:qid
 * Update a custom question.
 */
customQuestionsRoute.put(
  "/:jobId/custom-questions/:qid",
  zValidator("json", UpdateCustomQuestionSchema),
  async (c) => {
    const jobId = c.req.param("jobId")!;
    const qid = c.req.param("qid")!;
    const user = c.get("user");
    const input = c.req.valid("json");

    const { job, error } = await verifyJobOwnership(c, jobId, user.orgId);
    if (error) return error;

    // Only allow updating questions on draft jobs
    if (job!.status !== "draft") {
      return c.json(
        { error: "Can only update questions on draft jobs" },
        400
      );
    }

    const service = new CustomQuestionsService(c.env.DB);

    // Verify question belongs to this job
    const existing = await service.getQuestionForJob(qid, jobId);
    if (!existing) {
      return c.json({ error: "Question not found" }, 404);
    }

    const question = await service.updateQuestion(qid, input);

    return c.json(question);
  }
);

/**
 * DELETE /v1/jobs/:jobId/custom-questions/:qid
 * Delete a custom question.
 */
customQuestionsRoute.delete("/:jobId/custom-questions/:qid", async (c) => {
  const jobId = c.req.param("jobId")!;
  const qid = c.req.param("qid")!;
  const user = c.get("user");

  const { job, error } = await verifyJobOwnership(c, jobId, user.orgId);
  if (error) return error;

  // Only allow deleting questions on draft jobs
  if (job!.status !== "draft") {
    return c.json(
      { error: "Can only delete questions on draft jobs" },
      400
    );
  }

  const service = new CustomQuestionsService(c.env.DB);

  // Verify question belongs to this job
  const existing = await service.getQuestionForJob(qid, jobId);
  if (!existing) {
    return c.json({ error: "Question not found" }, 404);
  }

  await service.deleteQuestion(qid);

  return c.json({ success: true });
});

/**
 * POST /v1/jobs/:jobId/custom-questions/reorder
 * Reorder custom questions for a job.
 */
customQuestionsRoute.post(
  "/:jobId/custom-questions/reorder",
  zValidator("json", ReorderQuestionsSchema),
  async (c) => {
    const jobId = c.req.param("jobId")!;
    const user = c.get("user");
    const { questionIds } = c.req.valid("json");

    const { job, error } = await verifyJobOwnership(c, jobId, user.orgId);
    if (error) return error;

    // Only allow reordering questions on draft jobs
    if (job!.status !== "draft") {
      return c.json(
        { error: "Can only reorder questions on draft jobs" },
        400
      );
    }

    const service = new CustomQuestionsService(c.env.DB);
    await service.reorderQuestions(jobId, questionIds);

    // Return updated list
    const questions = await service.listQuestions(jobId);

    return c.json({ questions });
  }
);

export default customQuestionsRoute;
