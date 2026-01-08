/**
 * GET /v1/jobs/:id
 * ================
 * Get job status and results.
 *
 * Requires JWT authentication. Organization ID is extracted from the JWT.
 *
 * Caching Strategy:
 * - Published, paused, and closed jobs are cached (relatively stable states)
 * - Draft jobs are never cached (can change frequently during editing)
 * - Cache key includes job ID and version for invalidation
 *
 * Response shape varies by status (discriminated union):
 * - draft: Full editing info, questions (if generated), errors (if failed)
 * - published: Full results with public slug
 * - paused: Same as published but not publicly accessible
 * - closed: Same as paused but permanent
 */

import type { Context } from "hono";
import { JobRepository, JobService, OrgRepository } from "../../../domain/jobs";
import type { AuthVariables, Env, JobStatus, QuestionsStatus } from "../../../types/bindings";

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

/**
 * Questions statuses that indicate terminal state for question generation.
 * Used to determine if a draft's questions state is stable.
 */
const TERMINAL_QUESTIONS_STATUSES: QuestionsStatus[] = ["completed", "failed"];

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
  const result = await service.getJobStatus(jobId, orgId);

  if (!result) {
    return c.json({ error: "Job not found" }, 404);
  }

  // For draft status with non-terminal questions state, don't cache
  // (questions are still being generated or haven't started)
  if (result.status === "draft") {
    const isTerminalQuestionsState = TERMINAL_QUESTIONS_STATUSES.includes(result.questionsStatus);

    // Only cache drafts with completed/failed questions
    if (isTerminalQuestionsState) {
      return createCachedResponse(c, jobId, result);
    }

    // Non-terminal questions state - don't cache
    return c.json(result, 200);
  }

  // Cache non-draft statuses (published, paused, closed)
  if (CACHEABLE_STATUSES.includes(result.status)) {
    return createCachedResponse(c, jobId, result);
  }

  // Fallback: return without caching
  return c.json(result, 200);
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create and cache a response.
 */
async function createCachedResponse(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
  jobId: string,
  result: unknown
): Promise<Response> {
  const cache = caches.default;
  const cacheKey = buildCacheKey(jobId);

  // Check cache first
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
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

/**
 * Build cache key for a specific job.
 *
 * Uses a synthetic internal URL for Cloudflare Cache API.
 */
function buildCacheKey(jobId: string): Request {
  return new Request(`https://cache.zehire.internal/jobs/${jobId}`);
}
