/**
 * Public Jobs Routes
 * ==================
 * Public-facing endpoints for candidates.
 *
 * No authentication required.
 *
 * Endpoints:
 * - GET /:slug - Get public job by slug
 * - POST /:slug/apply - Submit application (all answers required)
 * - POST /:slug/apply/draft - Save progress (Save & Continue)
 * - GET /:slug/apply/draft/:draftId - Resume saved progress
 */

import { Hono } from "hono";
import type { Env } from "../../../types/bindings";
import applyRoutes from "./apply";
import { getPublicJob } from "./get";

const publicJobs = new Hono<{ Bindings: Env }>();

// GET /public/jobs/:slug - Get public job by slug
publicJobs.get("/:slug", getPublicJob);

// Mount apply routes at /:slug (handles /apply, /apply/draft, etc.)
publicJobs.route("/:slug", applyRoutes);

export default publicJobs;
