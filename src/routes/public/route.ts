/**
 * Public Routes
 * =============
 * Public-facing endpoints that don't require authentication.
 *
 * Used for:
 * - Candidate-facing job pages
 * - Application submissions (future)
 */

import { Hono } from "hono";
import type { Env } from "../../types/bindings";
import publicJobs from "./jobs/route";

const publicRoutes = new Hono<{ Bindings: Env }>();

// Public jobs
publicRoutes.route("/jobs", publicJobs);

export default publicRoutes;
