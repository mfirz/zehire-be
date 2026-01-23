/**
 * Jobs Routes
 * ===========
 * Route definitions for /v1/jobs endpoints.
 *
 * All endpoints require JWT authentication.
 * User claims are available via `c.get("user")` in handlers.
 *
 * Lifecycle endpoints:
 * - POST /:id/generate - Queue questions for generation
 * - POST /:id/publish  - Publish draft (starts billing)
 * - POST /:id/pause    - Pause published job (stops billing)
 * - POST /:id/resume   - Resume paused job (restarts billing)
 * - POST /:id/close    - Close job permanently
 */

import { Hono } from "hono";
import { jwtAuth } from "../../../middleware/auth";
import type { AuthVariables, Env } from "../../../types/bindings";
import { closeJob } from "./close";
import { deleteJob } from "./delete";
import { generateQuestions } from "./generate";
import { generatePipeline } from "./generate-pipeline";
import { getJob } from "./get";
import { listJobs } from "./list";
import { pauseJob } from "./pause";
import { getPipeline, resetPipeline, updatePipeline } from "./pipeline";
import { createJob } from "./post";
import { publishJob } from "./publish";
import { resumeJob } from "./resume";
import {
  getStageConfig,
  updateStageConfig,
  listStageInterviewers,
  assignStageInterviewer,
  removeStageInterviewer,
  previewStageAvailability,
} from "./stages";
import { updateJob } from "./update";

const jobs = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Apply JWT auth to all jobs routes
jobs.use("/*", jwtAuth);

// ===========================================================================
// CRUD OPERATIONS
// ===========================================================================

// GET /v1/jobs - List jobs (paginated, cached)
jobs.get("/", listJobs);

// POST /v1/jobs - Create a new job as draft
jobs.post("/", createJob);

// GET /v1/jobs/:id - Get job status and results
jobs.get("/:id", getJob);

// PATCH /v1/jobs/:id - Update draft job content
jobs.patch("/:id", updateJob);

// DELETE /v1/jobs/:id - Delete draft job
jobs.delete("/:id", deleteJob);

// ===========================================================================
// LIFECYCLE ACTIONS
// ===========================================================================

// POST /v1/jobs/:id/generate - Queue for question generation
jobs.post("/:id/generate", generateQuestions);

// POST /v1/jobs/:id/generate-pipeline - Queue for pipeline generation
jobs.post("/:id/generate-pipeline", generatePipeline);

// GET /v1/jobs/:id/pipeline - Get pipeline details
jobs.get("/:id/pipeline", getPipeline);

// PATCH /v1/jobs/:id/pipeline - Update pipeline configuration
jobs.patch("/:id/pipeline", updatePipeline);

// POST /v1/jobs/:id/pipeline/reset - Reset pipeline to AI recommendation
jobs.post("/:id/pipeline/reset", resetPipeline);

// POST /v1/jobs/:id/publish - Publish draft (requires completed questions AND pipeline)
jobs.post("/:id/publish", publishJob);

// POST /v1/jobs/:id/pause - Pause published job
jobs.post("/:id/pause", pauseJob);

// POST /v1/jobs/:id/resume - Resume paused job
jobs.post("/:id/resume", resumeJob);

// POST /v1/jobs/:id/close - Close job permanently
jobs.post("/:id/close", closeJob);

// ===========================================================================
// STAGE CONFIGURATION
// ===========================================================================

// GET /v1/jobs/:id/stages/:stageId/config - Get stage config
jobs.get("/:id/stages/:stageId/config", getStageConfig);

// PUT /v1/jobs/:id/stages/:stageId/config - Update stage config
jobs.put("/:id/stages/:stageId/config", updateStageConfig);

// GET /v1/jobs/:id/stages/:stageId/interviewers - List assigned interviewers
jobs.get("/:id/stages/:stageId/interviewers", listStageInterviewers);

// POST /v1/jobs/:id/stages/:stageId/interviewers - Assign interviewer
jobs.post("/:id/stages/:stageId/interviewers", assignStageInterviewer);

// DELETE /v1/jobs/:id/stages/:stageId/interviewers/:interviewerId - Remove interviewer
jobs.delete("/:id/stages/:stageId/interviewers/:interviewerId", removeStageInterviewer);

// GET /v1/jobs/:id/stages/:stageId/availability - Preview available slots
jobs.get("/:id/stages/:stageId/availability", previewStageAvailability);

export default jobs;
