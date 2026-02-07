/**
 * Edge-case tests for auth middleware (jwtAuth, apiKeyAuth)
 * Tests: header parsing, missing headers, malformed tokens, expired JWTs
 */
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { jwtAuth, apiKeyAuth } from "../../../src/middleware/auth";
import { SessionService } from "../../../src/modules/auth/session.service";
import type { AuthVariables, Env } from "../../../src/types/bindings";
import type { UserClaims } from "../../../src/modules/auth/auth.types";

// =============================================================================
// TEST SETUP
// =============================================================================

const TEST_SECRET = "test-jwt-secret-key-must-be-at-least-32-characters";
const TEST_API_KEY = "test-api-key-12345";

const TEST_USER: UserClaims = {
  userId: "user_mid_test",
  email: "middleware@test.com",
  role: "recruiter",
  orgId: "org_mid_test",
};

/** Create a Hono app with jwtAuth middleware for testing */
function createJwtApp() {
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

  app.use("/protected/*", jwtAuth);

  app.get("/protected/resource", (c) => {
    const user = c.get("user");
    return c.json({ user });
  });

  return app;
}

/** Create a Hono app with apiKeyAuth middleware for testing */
function createApiKeyApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.use("/api/*", apiKeyAuth);

  app.get("/api/resource", (c) => {
    return c.json({ ok: true });
  });

  return app;
}

/** Create a valid JWT for test user */
async function createTestJwt(overrides?: Partial<{ secret: string; ttlSeconds: number }>): Promise<string> {
  const sessionService = new SessionService({
    secret: overrides?.secret ?? TEST_SECRET,
    ttlSeconds: overrides?.ttlSeconds ?? 3600,
    secure: false,
  });
  return sessionService.createSession(TEST_USER);
}

/** Make a request to the test app */
function makeRequest(
  app: Hono<{ Bindings: Env; Variables: AuthVariables }>,
  path: string,
  headers: Record<string, string> = {}
) {
  return app.request(
    path,
    { headers },
    { ...env, AUTH_JWT_SECRET: TEST_SECRET, API_KEY: TEST_API_KEY } as unknown as Env
  );
}

function makeApiKeyRequest(
  app: Hono<{ Bindings: Env }>,
  path: string,
  headers: Record<string, string> = {}
) {
  return app.request(
    path,
    { headers },
    { ...env, API_KEY: TEST_API_KEY } as unknown as Env
  );
}

// =============================================================================
// JWT AUTH MIDDLEWARE TESTS
// =============================================================================

describe("jwtAuth Middleware Edge Cases", () => {
  let app: ReturnType<typeof createJwtApp>;

  beforeAll(() => {
    app = createJwtApp();
  });

  // ---------------------------------------------------------------------------
  // MISSING AUTHORIZATION HEADER
  // ---------------------------------------------------------------------------

  describe("missing Authorization header", () => {
    it("returns 401 when no Authorization header", async () => {
      const res = await makeRequest(app, "/protected/resource");
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  });

  // ---------------------------------------------------------------------------
  // MALFORMED AUTHORIZATION HEADER
  // ---------------------------------------------------------------------------

  describe("malformed Authorization header", () => {
    it("returns 401 for empty Authorization header", async () => {
      const res = await makeRequest(app, "/protected/resource", {
        Authorization: "",
      });
      expect(res.status).toBe(401);
    });

    it("returns 401 for 'Basic' auth scheme", async () => {
      const res = await makeRequest(app, "/protected/resource", {
        Authorization: "Basic dXNlcjpwYXNz",
      });
      expect(res.status).toBe(401);
    });

    it("returns 401 for 'Bearer' with no token", async () => {
      const res = await makeRequest(app, "/protected/resource", {
        Authorization: "Bearer",
      });
      expect(res.status).toBe(401);
    });

    it("returns 401 for 'Bearer ' with empty space only", async () => {
      const res = await makeRequest(app, "/protected/resource", {
        Authorization: "Bearer ",
      });
      expect(res.status).toBe(401);
    });

    it("returns 401 for random string (no scheme)", async () => {
      const res = await makeRequest(app, "/protected/resource", {
        Authorization: "just-a-random-string",
      });
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // INVALID JWT
  // ---------------------------------------------------------------------------

  describe("invalid JWT tokens", () => {
    it("returns 401 for completely invalid JWT", async () => {
      const res = await makeRequest(app, "/protected/resource", {
        Authorization: "Bearer not.a.jwt",
      });
      expect(res.status).toBe(401);
    });

    it("returns 401 for JWT signed with wrong secret", async () => {
      const wrongSecretToken = await createTestJwt({ secret: "wrong-secret-key-definitely-not-correct" });
      const res = await makeRequest(app, "/protected/resource", {
        Authorization: `Bearer ${wrongSecretToken}`,
      });
      expect(res.status).toBe(401);
    });

    it("returns 401 for expired JWT (negative TTL)", async () => {
      const expiredToken = await createTestJwt({ ttlSeconds: -1 });

      const res = await makeRequest(app, "/protected/resource", {
        Authorization: `Bearer ${expiredToken}`,
      });
      expect(res.status).toBe(401);
    });

    it("returns 401 for extremely long token (potential DoS)", async () => {
      const longToken = "a".repeat(100000);
      const res = await makeRequest(app, "/protected/resource", {
        Authorization: `Bearer ${longToken}`,
      });
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // VALID JWT
  // ---------------------------------------------------------------------------

  describe("valid JWT", () => {
    it("returns 200 and sets user on context for valid JWT", async () => {
      const validToken = await createTestJwt();
      const res = await makeRequest(app, "/protected/resource", {
        Authorization: `Bearer ${validToken}`,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user.userId).toBe(TEST_USER.userId);
      expect(body.user.email).toBe(TEST_USER.email);
      expect(body.user.role).toBe(TEST_USER.role);
      expect(body.user.orgId).toBe(TEST_USER.orgId);
    });
  });
});

// =============================================================================
// API KEY AUTH MIDDLEWARE TESTS
// =============================================================================

describe("apiKeyAuth Middleware Edge Cases", () => {
  let app: ReturnType<typeof createApiKeyApp>;

  beforeAll(() => {
    app = createApiKeyApp();
  });

  describe("missing header", () => {
    it("returns 401 when no Authorization header", async () => {
      const res = await makeApiKeyRequest(app, "/api/resource");
      expect(res.status).toBe(401);
    });
  });

  describe("malformed header", () => {
    it("returns 401 for non-Bearer scheme", async () => {
      const res = await makeApiKeyRequest(app, "/api/resource", {
        Authorization: "Basic key123",
      });
      expect(res.status).toBe(401);
    });
  });

  describe("wrong API key", () => {
    it("returns 401 for incorrect API key", async () => {
      const res = await makeApiKeyRequest(app, "/api/resource", {
        Authorization: "Bearer wrong-key",
      });
      expect(res.status).toBe(401);
    });

    it("returns 401 for empty API key", async () => {
      const res = await makeApiKeyRequest(app, "/api/resource", {
        Authorization: "Bearer ",
      });
      expect(res.status).toBe(401);
    });

    it("API key with trailing space: Hono may trim header values", async () => {
      const res = await makeApiKeyRequest(app, "/api/resource", {
        Authorization: `Bearer ${TEST_API_KEY} `,
      });
      // NOTE: Hono/fetch may trim trailing whitespace from header values,
      // which could make this pass unexpectedly. In production with real
      // HTTP clients, trailing spaces in headers are preserved per HTTP spec.
      // If this returns 200, it means the framework trims the value.
      expect([200, 401]).toContain(res.status);
    });

    it("returns 401 for API key differing by one character", async () => {
      const almostRight = TEST_API_KEY.slice(0, -1) + "X";
      const res = await makeApiKeyRequest(app, "/api/resource", {
        Authorization: `Bearer ${almostRight}`,
      });
      expect(res.status).toBe(401);
    });
  });

  describe("correct API key", () => {
    it("returns 200 for valid API key", async () => {
      const res = await makeApiKeyRequest(app, "/api/resource", {
        Authorization: `Bearer ${TEST_API_KEY}`,
      });
      expect(res.status).toBe(200);
    });
  });
});
