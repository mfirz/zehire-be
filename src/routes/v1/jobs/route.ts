/**
 * Jobs Routes
 * ===========
 * Route definitions for /v1/jobs endpoints.
 *
 * All endpoints require JWT authentication.
 * User claims are available via `c.get("user")` in handlers.
 */

import { Hono } from "hono";
import { jwtAuth } from "../../../middleware/auth";
import type { AuthVariables, Env } from "../../../types/bindings";
import { getJob } from "./get";
import { listJobs } from "./list";
import { createJob } from "./post";

const jobs = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Apply JWT auth to all jobs routes
jobs.use("/*", jwtAuth);

// GET /v1/jobs - List jobs (paginated, cached)
jobs.get("/", listJobs);

// POST /v1/jobs - Create a new job
jobs.post("/", createJob);

// GET /v1/jobs/:id - Get job status and results
jobs.get("/:id", getJob);

export default jobs;
