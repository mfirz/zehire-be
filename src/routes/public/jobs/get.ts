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
 * Caching Strategy:
 * - Uses Workers Cache API with 1-hour TTL
 * - On cache hit, validates job is still published via D1 (fast indexed query)
 * - This ensures paused/closed jobs return 404 immediately across all PoPs
 * - D1 check cost: ~$0.10 per 100M requests (negligible)
 */

import type { Context } from "hono";
import { buildPublicJobCacheKey, CACHE_TTL } from "../../../config/cache";
import { JobRepository, JobService, OrgRepository } from "../../../domain/jobs";
import type { Env } from "../../../types/bindings";

// =============================================================================
// HANDLER
// =============================================================================

export async function getPublicJob(c: Context<{ Bindings: Env }>): Promise<Response> {
  const slug = c.req.param("slug");

  if (!slug) {
    return c.json({ error: "Job slug is required" }, 400);
  }

  const repository = new JobRepository(c.env.DB);
  const cache = caches.default;
  const cacheKey = buildPublicJobCacheKey(slug);

  // Try cache first
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    // Validate job is still published (fast D1 indexed query)
    // This ensures paused/closed jobs return 404 immediately
    const isPublished = await repository.isSlugPublished(slug);

    if (!isPublished) {
      // Job was paused/closed - delete stale cache and return 404
      c.executionCtx.waitUntil(cache.delete(cacheKey));
      return c.json({ error: "Job not found" }, 404);
    }

    return cachedResponse;
  }

  // Cache miss - fetch full job data
  const orgRepository = new OrgRepository(c.env.DB);
  const service = new JobService(repository, orgRepository, c.env.JOB_QUEUE, c.env.DB);

  const result = await service.getPublicJob(slug);

  if (!result) {
    return c.json({ error: "Job not found" }, 404);
  }

  // Create cacheable response
  const responseToCache = new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${CACHE_TTL.publicJob}`,
    },
  });

  // Store in cache (non-blocking)
  c.executionCtx.waitUntil(cache.put(cacheKey, responseToCache.clone()));

  return responseToCache;
}

