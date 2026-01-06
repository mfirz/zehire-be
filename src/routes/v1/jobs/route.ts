/**
 * Jobs Routes
 * ===========
 * Route definitions for /v1/jobs endpoints.
 */

import { Hono } from "hono";
import { apiKeyAuth } from "../../../middleware/auth";
import type { Env } from "../../../types/bindings";
import { getJob } from "./get";
import { createJob } from "./post";

const jobs = new Hono<{ Bindings: Env }>();

// Apply API key auth to all jobs routes
jobs.use("/*", apiKeyAuth);

// POST /v1/jobs - Create a new job
jobs.post("/", createJob);

// GET /v1/jobs/:id - Get job status and results
jobs.get("/:id", getJob);

export default jobs;
