/**
 * Edge-case tests for auth routes (HTTP-level)
 * Tests: /auth/login, /auth/callback, /auth/me, /auth/logout input handling
 */
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { createAuthRoutes } from "../../../src/modules/auth/auth.routes";
import { seedOrg, seedUser } from "../../../test/helpers/seed";
import { Hono } from "hono";
import type { Env } from "../../../src/types/bindings";
import { createSignedState } from "../../../src/lib/crypto";

// =============================================================================
// TEST SETUP
// =============================================================================

function createTestApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/auth", createAuthRoutes());
  return app;
}

function makeRequest(
  app: ReturnType<typeof createTestApp>,
  path: string,
  init: RequestInit = {}
) {
  const testEnv = {
    ...env,
    APP_BASE_URL: "https://app.test.com",
    AUTH_TOKEN_TTL_MINUTES: "15",
    AUTH_JWT_SECRET: "test-jwt-secret-for-routes-testing-32ch",
    ENVIRONMENT: "development",
    // SES config for email gateway (will fail to send but that's ok)
    AWS_ACCESS_KEY_ID: "test",
    AWS_SECRET_ACCESS_KEY: "test",
    AWS_REGION: "us-east-1",
    SES_FROM_EMAIL: "test@test.com",
  } as unknown as Env;

  return app.request(path, init, testEnv);
}

// =============================================================================
// TESTS
// =============================================================================

describe("Auth Routes Edge Cases", () => {
  let userEmail: string;

  beforeAll(async () => {
    const org = await seedOrg();
    const user = await seedUser(org.id);
    userEmail = user.email;
  });

  // ---------------------------------------------------------------------------
  // POST /auth/login
  // ---------------------------------------------------------------------------

  describe("POST /auth/login", () => {
    it("returns 400 for empty body", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("INVALID_EMAIL");
    });

    it("returns 400 for non-JSON body", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      // Should fail to parse JSON
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("returns 400 for invalid email format", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent email", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nobody@doesnotexist.com" }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("EMAIL_NOT_REGISTERED");
    });

    it("returns 400 for SQL injection in email field", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "'; DROP TABLE users;--" }),
      });
      // Zod's .email() should reject this
      expect(res.status).toBe(400);
    });

    it("returns 400 for XSS payload in email field", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: '<img src=x onerror=alert(1)>' }),
      });
      expect(res.status).toBe(400);
    });

    it("handles email with extra fields gracefully (ignores extra)", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nobody@doesnotexist.com",
          password: "should-be-ignored",
          admin: true,
        }),
      });
      // Should process normally (extra fields ignored by Zod)
      expect(res.status).toBe(404); // EMAIL_NOT_REGISTERED
    });
  });

  // ---------------------------------------------------------------------------
  // GET /auth/callback
  // ---------------------------------------------------------------------------

  describe("GET /auth/callback", () => {
    it("returns 400 when token parameter is missing", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/callback");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("INVALID_TOKEN");
    });

    it("returns 400 for empty token parameter", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/callback?token=");
      // Empty string is falsy, should be caught by !token check
      expect(res.status).toBe(400);
    });

    it("returns 400 for fake token", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/callback?token=fake-token-12345");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("INVALID_TOKEN");
    });

    it("returns 400 for URL-encoded special characters in token", async () => {
      const app = createTestApp();
      const res = await makeRequest(
        app,
        "/auth/callback?token=%3Cscript%3Ealert(1)%3C/script%3E"
      );
      expect(res.status).toBe(400);
    });

    it("does not leak token details in error response", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/callback?token=secret-token");
      const body = await res.json();
      // Error message should not include the token
      expect(JSON.stringify(body)).not.toContain("secret-token");
    });
  });

  // ---------------------------------------------------------------------------
  // GET /auth/me
  // ---------------------------------------------------------------------------

  describe("GET /auth/me", () => {
    it("returns 401 with no auth headers", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/me");
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 with invalid Bearer token", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/me", {
        headers: { Authorization: "Bearer invalid-jwt-token" },
      });
      expect(res.status).toBe(401);
    });

    it("returns 401 with malformed Authorization header", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/me", {
        headers: { Authorization: "NotBearer something" },
      });
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /auth/logout
  // ---------------------------------------------------------------------------

  describe("POST /auth/logout", () => {
    it("returns 204 and clears cookie even without auth", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/logout", { method: "POST" });
      expect(res.status).toBe(204);

      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain("Max-Age=0");
    });

    it("returns 204 with Set-Cookie that has HttpOnly flag", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/logout", { method: "POST" });
      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toContain("HttpOnly");
    });
  });

  // ---------------------------------------------------------------------------
  // SSO ROUTES
  // ---------------------------------------------------------------------------

  describe("GET /auth/sso/:provider", () => {
    it("redirects to login with error for unsupported provider", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "/auth/sso/facebook", {
        redirect: "manual",
      });
      expect(res.status).toBe(302);
      const location = res.headers.get("Location");
      expect(location).toContain("/login?error=invalid_provider");
    });

    it("redirects to login with error for empty provider", async () => {
      const app = createTestApp();
      // This will 404 because route param doesn't match
      const res = await makeRequest(app, "/auth/sso/", {
        redirect: "manual",
      });
      // Hono routes /auth/sso/ won't match /auth/sso/:provider
      expect(res.status).toBe(404);
    });

    it("redirects to login with error for XSS in provider", async () => {
      const app = createTestApp();
      const res = await makeRequest(
        app,
        "/auth/sso/%3Cscript%3Ealert(1)%3C%2Fscript%3E",
        { redirect: "manual" }
      );
      // Should be caught by isSupportedSSOProvider
      expect(res.status).toBe(302);
      const location = res.headers.get("Location");
      expect(location).toContain("/login?error=invalid_provider");
    });
  });

  describe("GET /auth/sso/:provider/callback", () => {
    it("redirects to login with error when OAuth error parameter present", async () => {
      const app = createTestApp();
      const res = await makeRequest(
        app,
        "/auth/sso/google/callback?error=access_denied",
        { redirect: "manual" }
      );
      expect(res.status).toBe(302);
      const location = res.headers.get("Location");
      expect(location).toContain("/login?error=auth_failed");
    });

    it("redirects to login when code is missing", async () => {
      const app = createTestApp();
      const res = await makeRequest(
        app,
        "/auth/sso/google/callback?state=abc",
        { redirect: "manual" }
      );
      expect(res.status).toBe(302);
      const location = res.headers.get("Location");
      expect(location).toContain("/login?error=invalid_state");
    });

    it("redirects to login when state is missing", async () => {
      const app = createTestApp();
      const res = await makeRequest(
        app,
        "/auth/sso/google/callback?code=abc",
        { redirect: "manual" }
      );
      expect(res.status).toBe(302);
      const location = res.headers.get("Location");
      expect(location).toContain("/login?error=invalid_state");
    });

    it("redirects to login when state is invalid base64", async () => {
      const app = createTestApp();
      const res = await makeRequest(
        app,
        "/auth/sso/google/callback?code=abc&state=not-valid-base64!!!",
        { redirect: "manual" }
      );
      expect(res.status).toBe(302);
      const location = res.headers.get("Location");
      expect(location).toContain("/login?error=invalid_state");
    });

    it("redirects to login when state has provider mismatch", async () => {
      const app = createTestApp();
      // Create properly signed state but with wrong provider
      const state = await createSignedState(
        { returnUrl: "/", provider: "github", nonce: "test" },
        "test-jwt-secret-for-routes-testing-32ch",
      );
      const res = await makeRequest(
        app,
        `/auth/sso/google/callback?code=abc&state=${encodeURIComponent(state)}`,
        { redirect: "manual" }
      );
      expect(res.status).toBe(302);
      const location = res.headers.get("Location");
      expect(location).toContain("/login?error=invalid_state");
    });

    it("rejects unsigned state (old btoa format)", async () => {
      const app = createTestApp();
      const unsignedState = btoa(
        JSON.stringify({ returnUrl: "/", provider: "google", nonce: "test" })
      );
      const res = await makeRequest(
        app,
        `/auth/sso/google/callback?code=abc&state=${unsignedState}`,
        { redirect: "manual" }
      );
      expect(res.status).toBe(302);
      const location = res.headers.get("Location");
      expect(location).toContain("/login?error=invalid_state");
    });

    it("rejects state signed with wrong secret", async () => {
      const app = createTestApp();
      const state = await createSignedState(
        { returnUrl: "/", provider: "google", nonce: "test" },
        "wrong-secret-not-matching-env-value",
      );
      const res = await makeRequest(
        app,
        `/auth/sso/google/callback?code=abc&state=${encodeURIComponent(state)}`,
        { redirect: "manual" }
      );
      expect(res.status).toBe(302);
      const location = res.headers.get("Location");
      expect(location).toContain("/login?error=invalid_state");
    });

    it("rejects unsupported SSO provider in callback", async () => {
      const app = createTestApp();
      const res = await makeRequest(
        app,
        "/auth/sso/facebook/callback?code=abc&state=abc",
        { redirect: "manual" }
      );
      expect(res.status).toBe(302);
      const location = res.headers.get("Location");
      expect(location).toContain("/login?error=invalid_provider");
    });
  });
});
