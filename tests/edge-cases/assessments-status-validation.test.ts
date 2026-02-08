/**
 * GET /v1/assessments — Status query param validation
 * ====================================================
 * Tests that the `status` query parameter is validated at runtime,
 * returning 400 for invalid values instead of silently returning empty results.
 */
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import app from "../../src/app";
import { SessionService } from "../../src/modules/auth/session.service";
import type { Env } from "../../src/types/bindings";
import { seedOrg, seedUser } from "../../test/helpers/seed";

// =============================================================================
// TEST SETUP
// =============================================================================

const TEST_SECRET = "test-jwt-secret-key-must-be-at-least-32-characters";

let authToken: string;

beforeAll(async () => {
  const org = await seedOrg();
  const user = await seedUser(org.id);

  const sessionService = new SessionService({
    secret: TEST_SECRET,
    ttlSeconds: 3600,
    secure: false,
  });
  authToken = await sessionService.createSession({
    userId: user.id,
    email: user.email,
    role: user.role as "admin" | "recruiter",
    orgId: org.id,
  });
});

function request(path: string) {
  return app.request(
    path,
    { headers: { Authorization: `Bearer ${authToken}` } },
    { ...env, AUTH_JWT_SECRET: TEST_SECRET } as unknown as Env
  );
}

// =============================================================================
// STATUS PARAM VALIDATION TESTS
// =============================================================================

describe("GET /v1/assessments - status query param validation", () => {
  it("returns 200 when status is omitted", async () => {
    const res = await request("/v1/assessments");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
  });

  it("returns 200 for status=active", async () => {
    const res = await request("/v1/assessments?status=active");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
  });

  it("returns 200 for status=archived", async () => {
    const res = await request("/v1/assessments?status=archived");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
  });

  it("returns 400 for invalid status value", async () => {
    const res = await request("/v1/assessments?status=INVALID_VALUE");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toMatch(/status/i);
  });

  it("returns 400 for empty string status", async () => {
    const res = await request("/v1/assessments?status=");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for status with wrong casing", async () => {
    const res = await request("/v1/assessments?status=Active");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for status=deleted (plausible but invalid)", async () => {
    const res = await request("/v1/assessments?status=deleted");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});
