/**
 * GET /public/jobs/:slug
 * ======================
 * Get public job details by slug for candidates.
 *
 * No authentication required.
 *
 * Only returns published jobs with a public slug.
 * Returns a limited view suitable for candidates:
 * - Job title, company, department, location
 * - Job description
 * - Interview questions (text only)
 *
 * Cached with long TTL since published jobs are relatively stable.
 */

import type { Context } from "hono";
import { JobRepository, JobService, OrgRepository } from "../../../domain/jobs";
import type { Env } from "../../../types/bindings";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Cache for 1 hour - published jobs are stable but may be paused/closed */
const CACHE_MAX_AGE_SECONDS = 3600;

// =============================================================================
// HANDLER
// =============================================================================

export async function getPublicJob(c: Context<{ Bindings: Env }>): Promise<Response> {
  const slug = c.req.param("slug");

  if (!slug) {
    return c.json({ error: "Job slug is required" }, 400);
  }

  // Try cache first
  const cache = caches.default;
  const cacheKey = buildCacheKey(slug);
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    return cachedResponse;
  }

  // Create services (no queue needed for read-only operation)
  const repository = new JobRepository(c.env.DB);
  const orgRepository = new OrgRepository(c.env.DB);
  // Queue and DB are required by service but not used for this operation
  const service = new JobService(repository, orgRepository, c.env.JOB_QUEUE, c.env.DB);

  // Fetch public job
  const result = await service.getPublicJob(slug);

  if (!result) {
    return c.json({ error: "Job not found" }, 404);
  }

  // Create cacheable response
  const responseToCache = new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${CACHE_MAX_AGE_SECONDS}`,
    },
  });

  // Store in cache (non-blocking)
  c.executionCtx.waitUntil(cache.put(cacheKey, responseToCache.clone()));

  return responseToCache;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build cache key for a public job.
 */
function buildCacheKey(slug: string): Request {
  return new Request(`https://cache.zehire.internal/public/jobs/${slug}`);
}
