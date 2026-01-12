/**
 * GET /v1/jobs
 * ============
 * List jobs for the authenticated organization with cursor-based pagination.
 *
 * Requires JWT authentication. Organization ID is extracted from the JWT.
 *
 * Caching Strategy:
 * - Uses Cloudflare edge cache with versioned cache keys
 * - Cache key includes: URL, orgId, jobs_list_version
 * - Cache is "forever" (1 year max-age)
 * - Cache is automatically invalidated when POST /jobs increments version
 *
 * Query Parameters:
 * - limit: number of items per page (default: 20, max: 50)
 * - cursor: opaque cursor for pagination
 *
 * Note: Capacity status has been moved to GET /v1/capacity
 */

import type { Context } from "hono";
import { CACHE_DOMAIN, CACHE_TTL, CACHE_VERSIONS } from "../../../config/cache";
import {
  JobRepository,
  OrgRepository,
  type JobListResponse,
} from "../../../domain/jobs";
import { JOB_STATUSES, type AuthVariables, type Env, type JobStatus } from "../../../types/bindings";

/** Default page size */
const DEFAULT_LIMIT = 20;

/** Maximum page size */
const MAX_LIMIT = 50;

// =============================================================================
// HANDLER
// =============================================================================

export async function listJobs(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>
): Promise<Response> {
  const user = c.get("user");
  const orgId = user.orgId;

  // Parse query parameters
  const url = new URL(c.req.url);
  const limitParam = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor");
  const statusParam = url.searchParams.get("status");

  const limit = limitParam
    ? Math.min(Math.max(1, parseInt(limitParam, 10) || DEFAULT_LIMIT), MAX_LIMIT)
    : DEFAULT_LIMIT;

  // Validate status filter if provided
  let status: JobStatus | undefined;
  if (statusParam) {
    if (JOB_STATUSES.includes(statusParam as JobStatus)) {
      status = statusParam as JobStatus;
    } else {
      return c.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: `Invalid status filter. Must be one of: ${JOB_STATUSES.join(", ")}`,
          },
        },
        400
      );
    }
  }

  // Get org repository for cache versioning
  const orgRepository = new OrgRepository(c.env.DB);
  const jobsListVersion = await orgRepository.getJobsListVersion(orgId);

  // Construct cache key with version
  // When version changes, this becomes a different cache key = automatic invalidation
  const cacheKey = buildCacheKey(url, orgId, jobsListVersion);

  // Try cache first
  const cache = caches.default;
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    return new Response(cachedResponse.body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Cache miss - query database
  const repository = new JobRepository(c.env.DB);
  const { jobs, nextCursor } = await repository.list(orgId, {
    limit,
    ...(cursor ? { cursor } : {}),
    ...(status ? { status } : {}),
  });

  // Build response
  const responseBody: JobListResponse = {
    data: jobs,
    page: {
      nextCursor,
    },
  };

  // Create response with cache headers
  const response = c.json(responseBody, 200);

  // Clone and add cache headers for storage
  const responseToCache = new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${CACHE_TTL.jobsList}`,
    },
  });

  // Store in cache (non-blocking)
  c.executionCtx.waitUntil(cache.put(cacheKey, responseToCache));

  // Return response to client
  return response;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build cache key including org ID, data version, and API version.
 *
 * Cloudflare Cache API matches on URL only, not headers.
 * We use a synthetic internal URL that encodes org, versions, and query params.
 *
 * Cache invalidation happens when:
 * - jobsListVersion increments (job data changed)
 * - CACHE_VERSIONS.jobsList increments (API schema changed)
 *
 * User-facing URL: GET /v1/jobs?limit=20
 * Cache key URL:   https://cache.zehire.internal/jobs-list/v2/org_123/5?limit=20
 */
function buildCacheKey(url: URL, orgId: string, jobsListVersion: number): Request {
  const cacheKeyUrl = `https://${CACHE_DOMAIN}/jobs-list/v${CACHE_VERSIONS.jobsList}/${orgId}/${jobsListVersion}${url.search}`;
  return new Request(cacheKeyUrl);
}
