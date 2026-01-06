/**
 * GET /v1/jobs/:id
 * ================
 * Get job status and results (if completed).
 *
 * Response varies by status:
 * - pending: Basic job info, waiting for processing
 * - processing: Job is being processed
 * - completed: Full results including questions
 * - failed: Error details
 */

import type { Context } from "hono";
import { JobRepository, JobService } from "../../../domain/jobs";
import type { Env } from "../../../types/bindings";

export async function getJob(c: Context<{ Bindings: Env }>): Promise<Response> {
  const jobId = c.req.param("id");

  if (!jobId) {
    return c.json({ error: "Job ID is required" }, 400);
  }

  // Create service with dependencies
  const repository = new JobRepository(c.env.DB);
  const service = new JobService(repository, c.env.JOB_QUEUE);

  // Get job status
  const result = await service.getJobStatus(jobId);

  if (!result) {
    return c.json({ error: "Job not found" }, 404);
  }

  // Return appropriate status code based on job state
  switch (result.status) {
    case "pending":
    case "processing":
      // 200 OK - request successful, but job not complete
      // Client should continue polling
      return c.json(result, 200);

    case "completed":
      // 200 OK - job complete with results
      return c.json(result, 200);

    case "failed":
      // 200 OK - job exists but failed
      // Using 200 because the GET request succeeded; the job itself failed
      return c.json(result, 200);
  }
}
