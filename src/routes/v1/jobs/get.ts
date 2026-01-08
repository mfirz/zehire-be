/**
 * GET /v1/jobs/:id
 * ================
 * Get job status and results.
 *
 * Requires JWT authentication. Organization ID is extracted from the JWT.
 *
 * Caching Strategy:
 * - Published, paused, and closed jobs get cache headers (immutable states)
 * - Draft jobs are never cached (can change via edits or regeneration)
 *
 * Response shape varies by status (discriminated union):
 * - draft: Full editing info, questions (if generated), errors (if failed)
 * - published: Full results with public slug
 * - paused: Same as published but not publicly accessible
 * - closed: Same as paused but permanent
 */

import type { Context } from "hono";
import { JobRepository, JobService, OrgRepository } from "../../../domain/jobs";
import type { AuthVariables, Env, JobStatus } from "../../../types/bindings";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Cache for 1 hour (published/paused/closed jobs are stable but can be modified) */
const CACHE_MAX_AGE_SECONDS = 3600;

/**
 * Statuses that are stable enough to cache.
 * Draft is excluded because it changes frequently during editing.
 */
const CACHEABLE_STATUSES: JobStatus[] = ["published", "paused", "closed"];


// =============================================================================
// HANDLER
// =============================================================================

export async function getJob(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>
): Promise<Response> {
  const jobId = c.req.param("id");
  const user = c.get("user");
  const orgId = user.orgId;

  if (!jobId) {
    return c.json({ error: "Job ID is required" }, 400);
  }

  // Create services
  const repository = new JobRepository(c.env.DB);
  const orgRepository = new OrgRepository(c.env.DB);
  const service = new JobService(repository, orgRepository, c.env.JOB_QUEUE);

  // Fetch job (scoped to org for authorization)
  // We ALWAYS fetch fresh data because:
  // 1. Authorization check requires DB lookup anyway
  // 2. Job state can change (regeneration, status updates)
  // 3. Cache is only for edge/CDN optimization, not for skipping DB
  const result = await service.getJobStatus(jobId, orgId);

  if (!result) {
    return c.json({ error: "Job not found" }, 404);
  }

  // Determine if response should have cache headers for CDN/edge caching
  // Only published/paused/closed jobs are cached (immutable states)
  const shouldCache = isCacheableState(result.status);

  if (shouldCache) {
    return c.json(result, 200, {
      "Cache-Control": `private, max-age=${CACHE_MAX_AGE_SECONDS}`,
    });
  }

  // Non-cacheable state - no cache headers
  return c.json(result, 200, {
    "Cache-Control": "no-store",
  });
}

/**
 * Determine if a job state is stable enough to cache.
 *
 * Only published, paused, and closed jobs are cacheable.
 * Drafts are never cached because they can change at any time
 * (content updates, question regeneration, etc.)
 */
function isCacheableState(status: JobStatus): boolean {
  return CACHEABLE_STATUSES.includes(status);
}

