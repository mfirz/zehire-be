/**
 * GET /v1/jobs/:id
 * ================
 * Get job status and results (if completed).
 *
 * Requires JWT authentication.
 *
 * Caching Strategy:
 * - Only completed/failed jobs are cached (immutable states)
 * - Pending/processing jobs are never cached (status will change)
 * - Cache key includes job ID for uniqueness
 * - No version invalidation needed - terminal states don't change
 *
 * Response varies by status:
 * - pending: Basic job info, waiting for processing
 * - processing: Job is being processed
 * - completed: Full results including questions (cached)
 * - failed: Error details (cached)
 */

import type { Context } from "hono";
import { JobRepository, JobService } from "../../../domain/jobs";
import type { AuthVariables, Env, JobStatus } from "../../../types/bindings";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Cache for 1 year (effectively forever for immutable completed/failed jobs) */
const CACHE_MAX_AGE_SECONDS = 31536000;

/** Statuses that are terminal and can be cached */
const CACHEABLE_STATUSES: JobStatus[] = ["completed", "failed"];

// =============================================================================
// HANDLER
// =============================================================================

export async function getJob(c: Context<{ Bindings: Env; Variables: AuthVariables }>): Promise<Response> {
  const jobId = c.req.param("id");

  if (!jobId) {
    return c.json({ error: "Job ID is required" }, 400);
  }

  // Try cache first for this job
  const cache = caches.default;
  const cacheKey = buildCacheKey(jobId);
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    return cachedResponse;
  }

  // Cache miss - fetch from database
  const repository = new JobRepository(c.env.DB);
  const service = new JobService(repository, c.env.JOB_QUEUE);

  const result = await service.getJobStatus(jobId);

  if (!result) {
    return c.json({ error: "Job not found" }, 404);
  }

  // Only cache terminal states (completed/failed)
  if (CACHEABLE_STATUSES.includes(result.status)) {
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

  // Non-terminal states: return without caching
  return c.json(result, 200);
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build cache key for a specific job.
 *
 * Uses a synthetic internal URL for Cloudflare Cache API.
 * Since completed/failed jobs are immutable, no version is needed.
 */
function buildCacheKey(jobId: string): Request {
  return new Request(`https://cache.zehire.internal/jobs/${jobId}`);
}
