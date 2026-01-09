/**
 * Assessment Providers Routes
 * ===========================
 * GET /v1/assessment-providers - List available assessment providers
 *
 * Requires JWT authentication.
 * Returns static list of assessment providers for pipeline configuration.
 */

import { Hono } from "hono";
import { assessmentProviders } from "../../domain/pipeline/providers";
import { jwtAuth } from "../../middleware/auth";
import type { AuthVariables, Env } from "../../types/bindings";

const assessmentProvidersRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Apply JWT auth
assessmentProvidersRoute.use("/*", jwtAuth);

/**
 * GET /v1/assessment-providers
 * List all available assessment providers.
 */
assessmentProvidersRoute.get("/", (c) => {
  return c.json({
    providers: assessmentProviders,
  });
});

export default assessmentProvidersRoute;
