/**
 * Cache Configuration
 * ===================
 * Centralized cache version management for all cached endpoints.
 *
 * WHEN TO BUMP VERSIONS:
 * - Bump an endpoint's version when making breaking changes to its response schema
 * - Examples: removing fields, renaming fields, changing field types
 * - Non-breaking changes (adding optional fields) don't require version bumps
 *
 * HOW IT WORKS:
 * - Cache keys include the version number
 * - Bumping the version creates new cache keys
 * - Old cached responses are automatically bypassed (different key)
 * - Old cache entries expire naturally based on their TTL
 */

/**
 * Per-endpoint cache versions.
 *
 * Bump the specific endpoint version when making breaking changes to that endpoint.
 */
export const CACHE_VERSIONS = {
  /**
   * GET /v1/jobs - List jobs for organization
   *
   * Version history:
   * - v1: Initial version
   * - v2: Removed `capacity` field (moved to GET /v1/capacity)
   * - v3: Added `salaryMin`, `salaryMax`, `salaryCurrency` fields
   */
  jobsList: 3,

  /**
   * GET /public/jobs/:slug - Public job details for candidates
   *
   * Version history:
   * - v1: Initial version
   * - v2: Changed questions `id` to `archetypeId` for apply endpoint compatibility
   */
  publicJob: 2,
} as const;

/**
 * Cache TTL configurations (in seconds).
 */
export const CACHE_TTL = {
  /** Jobs list: 1 year (effectively forever, invalidated by version change) */
  jobsList: 31536000,

  /** Public job: 1 hour (published jobs are stable but may be paused/closed) */
  publicJob: 3600,
} as const;

/**
 * Internal cache domain for synthetic cache keys.
 */
export const CACHE_DOMAIN = "cache.zehire.internal";
