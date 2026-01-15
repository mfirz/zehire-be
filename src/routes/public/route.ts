/**
 * Public Routes
 * =============
 * Public-facing endpoints that don't require authentication.
 *
 * Used for:
 * - Candidate-facing job pages
 * - Application submissions (with optional CV via multipart)
 */

import { Hono } from "hono";
import type { Env } from "../../types/bindings";
import publicJobs from "./jobs/route";

const publicRoutes = new Hono<{ Bindings: Env }>();

// Public jobs (includes apply endpoints)
publicRoutes.route("/jobs", publicJobs);

export default publicRoutes;
