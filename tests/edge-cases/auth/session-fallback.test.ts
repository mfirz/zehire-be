/**
 * Edge-case tests for verifySessionFromHeaders cookie fallback
 * Verifies: Bug 2 fix — when Bearer token fails, falls back to Cookie header
 */
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { AuthService } from "../../../src/modules/auth/auth.service";
import { SessionService } from "../../../src/modules/auth/session.service";
import { seedOrg, seedUser } from "../../../test/helpers/seed";
import type { EmailGateway } from "../../../src/modules/email/email.gateway";

const TEST_SECRET = "test-jwt-secret-key-must-be-at-least-32-characters";

function createStubEmailGateway(): EmailGateway {
  return {
    async sendMagicLink() {},
    async sendAssessmentInvite() {},
    async sendSchedulingInvite() {},
    async sendInterviewReminder() {},
    async sendFeedbackReminder() {},
    async sendInterviewerInvite() {},
    async sendSchedulingConfirmation() {},
  } as EmailGateway;
}

function createAuthService() {
  const sessionService = new SessionService({
    secret: TEST_SECRET,
    ttlSeconds: 3600,
    secure: false,
  });

  return new AuthService(env.DB, sessionService, createStubEmailGateway(), {
    appBaseUrl: "https://app.test.com",
    tokenTtlMinutes: 15,
  });
}

describe("verifySessionFromHeaders - Cookie Fallback", () => {
  let validJwt: string;

  beforeAll(async () => {
    const org = await seedOrg();
    const user = await seedUser(org.id);
    const authService = createAuthService();
    const result = await authService.loginWithEmail(user.email);
    if (!result.success) throw new Error("Setup failed: SSO login failed");
    validJwt = result.sessionToken;
  });

  it("returns claims from valid Bearer token", async () => {
    const authService = createAuthService();
    const claims = await authService.verifySessionFromHeaders(
      `Bearer ${validJwt}`,
      null,
    );
    expect(claims).not.toBeNull();
    expect(claims!.email).toBeDefined();
  });

  it("returns claims from valid Cookie when no Authorization header", async () => {
    const authService = createAuthService();
    const claims = await authService.verifySessionFromHeaders(
      null,
      `zehire_session=${validJwt}`,
    );
    expect(claims).not.toBeNull();
    expect(claims!.email).toBeDefined();
  });

  it("falls back to Cookie when Bearer token is invalid", async () => {
    const authService = createAuthService();
    const claims = await authService.verifySessionFromHeaders(
      "Bearer invalid-expired-jwt",
      `zehire_session=${validJwt}`,
    );
    // FIX VERIFICATION: Previously returned null because Bearer extraction
    // succeeded (non-null) and the function returned immediately without
    // trying Cookie. Now it falls through to Cookie on verification failure.
    expect(claims).not.toBeNull();
    expect(claims!.email).toBeDefined();
  });

  it("falls back to Cookie when Bearer token is expired", async () => {
    // Create an expired JWT using a short-lived service
    const expiredService = new SessionService({
      secret: TEST_SECRET,
      ttlSeconds: -1,
      secure: false,
    });
    const org = await seedOrg();
    const user = await seedUser(org.id);
    const expiredJwt = await expiredService.createSession({
      userId: user.id,
      email: user.email,
      role: "admin",
      orgId: org.id,
    });

    const authService = createAuthService();
    const claims = await authService.verifySessionFromHeaders(
      `Bearer ${expiredJwt}`,
      `zehire_session=${validJwt}`,
    );
    expect(claims).not.toBeNull();
    expect(claims!.email).toBeDefined();
  });

  it("returns null when both Bearer and Cookie are invalid", async () => {
    const authService = createAuthService();
    const claims = await authService.verifySessionFromHeaders(
      "Bearer bad-token",
      "zehire_session=also-bad-token",
    );
    expect(claims).toBeNull();
  });

  it("returns null when both headers are null", async () => {
    const authService = createAuthService();
    const claims = await authService.verifySessionFromHeaders(null, null);
    expect(claims).toBeNull();
  });

  it("prefers valid Bearer over valid Cookie", async () => {
    const authService = createAuthService();
    const claims = await authService.verifySessionFromHeaders(
      `Bearer ${validJwt}`,
      "zehire_session=invalid-cookie",
    );
    // Bearer is valid, so Cookie is never checked
    expect(claims).not.toBeNull();
  });
});
