/**
 * Edge-case tests for login rate limiting
 * Tests: rate limit enforcement, Retry-After header, window reset, different emails
 */
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Hono } from "hono";
import { createRateLimiter } from "../../../src/middleware/rate-limit";
import { createDb, rateLimits } from "../../../src/db";
import type { Env } from "../../../src/types/bindings";

// =============================================================================
// TEST SETUP
// =============================================================================

const TEST_ENV = {
  ...env,
  APP_BASE_URL: "https://app.test.com",
  AUTH_TOKEN_TTL_MINUTES: "15",
  AUTH_JWT_SECRET: "test-jwt-secret-key-must-be-at-least-32-characters",
} as unknown as Env;

/** Create a simple test app with rate-limited POST endpoint */
function createRateLimitedApp(maxRequests = 3, windowSeconds = 60) {
  const app = new Hono<{ Bindings: Env }>();

  const rateLimiter = createRateLimiter({
    maxRequests,
    windowSeconds,
    keyExtractor: async (c) => {
      try {
        const body = await c.req.raw.clone().json();
        const email = body?.email;
        if (typeof email === "string" && email.length > 0) {
          return `login:${email.toLowerCase().trim()}`;
        }
        return null;
      } catch {
        return null;
      }
    },
  });

  app.post("/login", rateLimiter, async (c) => {
    const body = await c.req.json();
    return c.json({ message: "ok", email: body.email });
  });

  return app;
}

function postLogin(app: ReturnType<typeof createRateLimitedApp>, email: string) {
  return app.request(
    "/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    },
    TEST_ENV
  );
}

// =============================================================================
// TESTS
// =============================================================================

describe("Login Rate Limiting", () => {
  let app: ReturnType<typeof createRateLimitedApp>;

  beforeEach(async () => {
    // Clean up rate_limits table before each test
    const db = createDb(env.DB);
    await db.delete(rateLimits);

    app = createRateLimitedApp(3, 60);
  });

  // ---------------------------------------------------------------------------
  // ALLOWS REQUESTS WITHIN LIMIT
  // ---------------------------------------------------------------------------

  describe("allows requests within limit", () => {
    it("allows first request", async () => {
      const res = await postLogin(app, "user@test.com");
      expect(res.status).toBe(200);
    });

    it("allows up to maxRequests", async () => {
      for (let i = 0; i < 3; i++) {
        const res = await postLogin(app, "user@test.com");
        expect(res.status).toBe(200);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // BLOCKS REQUESTS OVER LIMIT
  // ---------------------------------------------------------------------------

  describe("blocks requests over limit", () => {
    it("returns 429 on 4th request within window", async () => {
      // Send 3 allowed requests
      for (let i = 0; i < 3; i++) {
        const res = await postLogin(app, "flood@test.com");
        expect(res.status).toBe(200);
      }

      // 4th should be blocked
      const res = await postLogin(app, "flood@test.com");
      expect(res.status).toBe(429);
    });

    it("returns RATE_LIMITED error code in response body", async () => {
      for (let i = 0; i < 3; i++) {
        await postLogin(app, "code@test.com");
      }

      const res = await postLogin(app, "code@test.com");
      const body = await res.json();
      expect(body.error.code).toBe("RATE_LIMITED");
      expect(body.error.message).toBeDefined();
    });

    it("includes Retry-After header in 429 response", async () => {
      for (let i = 0; i < 3; i++) {
        await postLogin(app, "header@test.com");
      }

      const res = await postLogin(app, "header@test.com");
      expect(res.status).toBe(429);

      const retryAfter = res.headers.get("Retry-After");
      expect(retryAfter).toBeDefined();

      const retrySeconds = parseInt(retryAfter!, 10);
      expect(retrySeconds).toBeGreaterThan(0);
      expect(retrySeconds).toBeLessThanOrEqual(60);
    });

    it("continues blocking after limit is exceeded", async () => {
      for (let i = 0; i < 3; i++) {
        await postLogin(app, "persist@test.com");
      }

      // 4th, 5th, 6th should all be blocked
      for (let i = 0; i < 3; i++) {
        const res = await postLogin(app, "persist@test.com");
        expect(res.status).toBe(429);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // RATE LIMITS ARE PER-EMAIL
  // ---------------------------------------------------------------------------

  describe("rate limits are per-email", () => {
    it("different emails have separate limits", async () => {
      // Exhaust limit for email A
      for (let i = 0; i < 3; i++) {
        await postLogin(app, "a@test.com");
      }
      const blockedA = await postLogin(app, "a@test.com");
      expect(blockedA.status).toBe(429);

      // Email B should still work
      const res = await postLogin(app, "b@test.com");
      expect(res.status).toBe(200);
    });

    it("email comparison is case-insensitive", async () => {
      // Use different cases for the same email
      await postLogin(app, "Case@Test.com");
      await postLogin(app, "CASE@TEST.COM");
      await postLogin(app, "case@test.com");

      // 4th request with any case should be blocked
      const res = await postLogin(app, "Case@test.com");
      expect(res.status).toBe(429);
    });
  });

  // ---------------------------------------------------------------------------
  // SKIPS RATE LIMITING FOR INVALID REQUESTS
  // ---------------------------------------------------------------------------

  describe("skips rate limiting for unparseable requests", () => {
    it("passes through when body is not JSON", async () => {
      const res = await app.request(
        "/login",
        {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "not json",
        },
        TEST_ENV
      );
      // Should reach the handler (which may fail on its own, but rate limiter didn't block it)
      // The downstream handler tries c.req.json() which will fail, but rate limiter passes through
      expect(res.status).not.toBe(429);
    });

    it("passes through when email is missing from body", async () => {
      const res = await app.request(
        "/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "test" }),
        },
        TEST_ENV
      );
      expect(res.status).not.toBe(429);
    });

    it("passes through when email is empty string", async () => {
      const res = await app.request(
        "/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "" }),
        },
        TEST_ENV
      );
      expect(res.status).not.toBe(429);
    });
  });

  // ---------------------------------------------------------------------------
  // CONFIGURABLE LIMITS
  // ---------------------------------------------------------------------------

  describe("respects configurable limits", () => {
    it("respects custom maxRequests of 1", async () => {
      const strictApp = createRateLimitedApp(1, 60);

      const first = await postLogin(strictApp, "strict@test.com");
      expect(first.status).toBe(200);

      const second = await postLogin(strictApp, "strict@test.com");
      expect(second.status).toBe(429);
    });
  });
});
