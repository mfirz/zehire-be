/**
 * Rate Limiting Middleware
 * ========================
 * D1-based rate limiting for auth endpoints.
 *
 * Tracks request counts per key (email) per time window in the rate_limits table.
 * Returns 429 Too Many Requests with Retry-After header when limit is exceeded.
 */

import type { Context, Next } from "hono";
import { createDb, rateLimits, eq, and, lt } from "../db";
import type { Env } from "../types/bindings";

interface RateLimitConfig {
  /** Maximum number of requests allowed per window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Function to extract the rate limit key from the request (e.g., email from body) */
  keyExtractor: (c: Context<{ Bindings: Env }>) => Promise<string | null>;
}

/**
 * Create a rate limiting middleware with the given configuration.
 *
 * Uses D1 to track request counts per key per time window.
 * Expired entries are cleaned up opportunistically on each request.
 */
export function createRateLimiter(config: RateLimitConfig) {
  return async function rateLimitMiddleware(
    c: Context<{ Bindings: Env }>,
    next: Next
  ): Promise<Response | void> {
    const key = await config.keyExtractor(c);

    // If we can't extract a key, skip rate limiting (let downstream validation handle it)
    if (!key) {
      return next();
    }

    const db = createDb(c.env.DB);
    const now = new Date();

    // Calculate current window start (floor to windowSeconds boundary)
    const windowStart = new Date(
      Math.floor(now.getTime() / (config.windowSeconds * 1000)) * (config.windowSeconds * 1000)
    );
    const windowKey = windowStart.toISOString();
    const expiresAt = new Date(windowStart.getTime() + config.windowSeconds * 2 * 1000).toISOString();

    // Opportunistically clean up expired entries (non-blocking best-effort)
    try {
      c.executionCtx.waitUntil(
        db.delete(rateLimits).where(lt(rateLimits.expiresAt, now.toISOString())).catch(() => {})
      );
    } catch {
      // executionCtx may not be available in test environments
    }

    // Check current count for this key + window
    const existing = await db
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(and(eq(rateLimits.key, key), eq(rateLimits.window, windowKey)))
      .get();

    if (existing && existing.count >= config.maxRequests) {
      // Calculate seconds until current window expires
      const windowEnd = windowStart.getTime() + config.windowSeconds * 1000;
      const retryAfter = Math.ceil((windowEnd - now.getTime()) / 1000);

      return c.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Please try again later.",
          },
        },
        429,
        {
          "Retry-After": String(Math.max(retryAfter, 1)),
        }
      );
    }

    // Increment counter: insert or update
    if (existing) {
      await db
        .update(rateLimits)
        .set({ count: existing.count + 1 })
        .where(and(eq(rateLimits.key, key), eq(rateLimits.window, windowKey)));
    } else {
      await db.insert(rateLimits).values({
        key,
        window: windowKey,
        count: 1,
        expiresAt,
      });
    }

    return next();
  };
}

/**
 * Pre-configured rate limiter for the login endpoint.
 * Limits to 3 login attempts per email per 60-second window.
 */
export const loginRateLimiter = createRateLimiter({
  maxRequests: 3,
  windowSeconds: 60,
  keyExtractor: async (c) => {
    try {
      // Clone the request so the body can be read again by downstream handlers
      const body = await c.req.raw.clone().json();
      const email = body?.email;
      if (typeof email === "string" && email.length > 0) {
        return `login:${email.toLowerCase().trim()}`;
      }
      return null;
    } catch {
      // If body parsing fails, skip rate limiting (downstream will return 400)
      return null;
    }
  },
});
