/**
 * Public Jobs Routes
 * ==================
 * Public-facing endpoints for candidates.
 *
 * No authentication required.
 */

import { Hono } from "hono";
import type { Env } from "../../../types/bindings";
import { getPublicJob } from "./get";

const publicJobs = new Hono<{ Bindings: Env }>();

// GET /public/jobs/:slug - Get public job by slug
publicJobs.get("/:slug", getPublicJob);

export default publicJobs;
