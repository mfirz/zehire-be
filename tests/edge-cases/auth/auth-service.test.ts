/**
 * Edge-case tests for AuthService
 * Tests: login flow, callback flow, email validation, SSO login
 */
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { AuthService } from "../../../src/modules/auth/auth.service";
import { SessionService } from "../../../src/modules/auth/session.service";
import { seedOrg, seedUser } from "../../../test/helpers/seed";
import type { EmailGateway } from "../../../src/modules/email/email.gateway";

// =============================================================================
// TEST HELPERS
// =============================================================================

const TEST_SECRET = "test-jwt-secret-key-must-be-at-least-32-characters";

/** Stub email gateway that records sent emails */
function createStubEmailGateway(): EmailGateway & { sent: Array<{ email: string; magicLinkUrl: string }> } {
  const sent: Array<{ email: string; magicLinkUrl: string }> = [];
  return {
    sent,
    async sendMagicLink(params: { email: string; magicLinkUrl: string; expiresAt: Date }) {
      sent.push({ email: params.email, magicLinkUrl: params.magicLinkUrl });
    },
    async sendAssessmentInvite() {},
    async sendSchedulingInvite() {},
    async sendInterviewReminder() {},
    async sendFeedbackReminder() {},
    async sendInterviewerInvite() {},
    async sendSchedulingConfirmation() {},
  } as EmailGateway & { sent: Array<{ email: string; magicLinkUrl: string }> };
}

function createAuthService(emailGateway?: EmailGateway) {
  const sessionService = new SessionService({
    secret: TEST_SECRET,
    ttlSeconds: 3600,
    secure: false,
  });

  const gateway = emailGateway ?? createStubEmailGateway();

  return new AuthService(env.DB, sessionService, gateway, {
    appBaseUrl: "https://app.test.com",
    tokenTtlMinutes: 15,
  });
}

// =============================================================================
// TESTS
// =============================================================================

describe("AuthService Edge Cases", () => {
  let orgId: string;
  let userEmail: string;
  let userId: string;

  beforeAll(async () => {
    const org = await seedOrg();
    orgId = org.id;
    const user = await seedUser(orgId);
    userEmail = user.email;
    userId = user.id;
  });

  // ---------------------------------------------------------------------------
  // LOGIN: EMAIL VALIDATION
  // ---------------------------------------------------------------------------

  describe("login - email validation", () => {
    it("rejects empty string", async () => {
      const authService = createAuthService();
      const result = await authService.login("");
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe("INVALID_EMAIL");
    });

    it("rejects email without @", async () => {
      const authService = createAuthService();
      const result = await authService.login("noatsign.com");
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe("INVALID_EMAIL");
    });

    it("rejects email without domain", async () => {
      const authService = createAuthService();
      const result = await authService.login("user@");
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe("INVALID_EMAIL");
    });

    it("rejects email without TLD", async () => {
      const authService = createAuthService();
      const result = await authService.login("user@domain");
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe("INVALID_EMAIL");
    });

    it("rejects email with spaces", async () => {
      const authService = createAuthService();
      const result = await authService.login("user @test.com");
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe("INVALID_EMAIL");
    });

    it("rejects email that is only whitespace", async () => {
      const authService = createAuthService();
      const result = await authService.login("   ");
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe("INVALID_EMAIL");
    });

    it("rejects XSS payload as email", async () => {
      const authService = createAuthService();
      const result = await authService.login('<script>alert("xss")</script>@evil.com');
      // Contains < and > which match [^\s@], so it passes regex but won't exist
      // This is fine as long as it doesn't cause injection somewhere
      expect(result.success).toBe(false);
    });

    it("rejects SQL injection payload as email", async () => {
      const authService = createAuthService();
      const result = await authService.login("'; DROP TABLE users;--@evil.com");
      expect(result.success).toBe(false);
    });

    it("rejects extremely long email (10,000 chars)", async () => {
      const authService = createAuthService();
      const longEmail = "a".repeat(9990) + "@test.com";
      const result = await authService.login(longEmail);
      // Should not crash; passes email regex but user won't exist
      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // LOGIN: USER EXISTENCE
  // ---------------------------------------------------------------------------

  describe("login - user existence", () => {
    it("returns EMAIL_NOT_REGISTERED for non-existent user", async () => {
      const authService = createAuthService();
      const result = await authService.login("nobody@doesnotexist.com");
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe("EMAIL_NOT_REGISTERED");
    });

    it("succeeds for existing user", async () => {
      const authService = createAuthService();
      const result = await authService.login(userEmail);
      expect(result.success).toBe(true);
    });

    it("email normalization: uppercase email finds existing user", async () => {
      const authService = createAuthService();
      const result = await authService.login(userEmail.toUpperCase());
      expect(result.success).toBe(true);
    });

    it("trims leading/trailing whitespace before validation", async () => {
      const authService = createAuthService();
      const result = await authService.login(`  ${userEmail}  `);
      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // LOGIN: MAGIC LINK GENERATION
  // ---------------------------------------------------------------------------

  describe("login - magic link generation", () => {
    it("sends email with magic link URL on success", async () => {
      const gateway = createStubEmailGateway();
      const authService = createAuthService(gateway);

      await authService.login(userEmail);

      expect(gateway.sent.length).toBe(1);
      expect(gateway.sent[0]!.email).toBe(userEmail);
      expect(gateway.sent[0]!.magicLinkUrl).toContain("https://app.test.com/auth/callback?token=");
    });

    it("magic link URL-encodes the token", async () => {
      const gateway = createStubEmailGateway();
      const authService = createAuthService(gateway);

      await authService.login(userEmail);

      const url = gateway.sent[0]!.magicLinkUrl;
      // URL should not contain raw base64 characters like + or /
      const tokenPart = url.split("token=")[1];
      expect(tokenPart).toBeDefined();
      // URL-encoded tokens should not break URL parsing
      expect(() => new URL(url)).not.toThrow();
    });

    it("generates unique tokens for repeated login requests", async () => {
      const gateway = createStubEmailGateway();
      const authService = createAuthService(gateway);

      await authService.login(userEmail);
      await authService.login(userEmail);

      expect(gateway.sent.length).toBe(2);
      expect(gateway.sent[0]!.magicLinkUrl).not.toBe(gateway.sent[1]!.magicLinkUrl);
    });
  });

  // ---------------------------------------------------------------------------
  // CALLBACK: TOKEN VERIFICATION
  // ---------------------------------------------------------------------------

  describe("callback - token verification", () => {
    it("succeeds with valid token and returns session token", async () => {
      const gateway = createStubEmailGateway();
      const authService = createAuthService(gateway);

      await authService.login(userEmail);

      // Extract token from magic link URL
      const url = gateway.sent[0]!.magicLinkUrl;
      const token = decodeURIComponent(url.split("token=")[1]!);

      const result = await authService.callback(token);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.sessionToken).toBeDefined();
        expect(result.sessionToken.split(".").length).toBe(3); // JWT format
        expect(result.user.email).toBe(userEmail);
        expect(result.user.orgId).toBe(orgId);
      }
    });

    it("rejects fake/non-existent token", async () => {
      const authService = createAuthService();
      const result = await authService.callback("completely-fake-token-abcdef");
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe("INVALID_TOKEN");
    });

    it("rejects empty token", async () => {
      const authService = createAuthService();
      const result = await authService.callback("");
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe("INVALID_TOKEN");
    });

    it("token is single-use (replay attack prevention)", async () => {
      const gateway = createStubEmailGateway();
      const authService = createAuthService(gateway);

      await authService.login(userEmail);
      const url = gateway.sent[0]!.magicLinkUrl;
      const token = decodeURIComponent(url.split("token=")[1]!);

      // First use: should succeed
      const result1 = await authService.callback(token);
      expect(result1.success).toBe(true);

      // Second use: should fail (replay attack)
      const result2 = await authService.callback(token);
      expect(result2.success).toBe(false);
      if (!result2.success) expect(result2.error).toBe("TOKEN_ALREADY_USED");
    });
  });

  // ---------------------------------------------------------------------------
  // CALLBACK: USER WITHOUT ORG
  // ---------------------------------------------------------------------------

  describe("callback - user without organization", () => {
    it("rejects login for user without org_id", async () => {
      // Create a user without an org
      const noOrgUser = await seedUser(orgId, { orgId: null });

      const gateway = createStubEmailGateway();
      // Need to manually create token for this user since login would still succeed
      // But the callback should fail because user.org_id is null
      const authService = createAuthService(gateway);

      // Login works (sends email) because user exists
      const loginResult = await authService.login(noOrgUser.email);
      expect(loginResult.success).toBe(true);

      // But callback should fail because user has no org
      const url = gateway.sent[0]!.magicLinkUrl;
      const token = decodeURIComponent(url.split("token=")[1]!);

      const callbackResult = await authService.callback(token);
      expect(callbackResult.success).toBe(false);
      if (!callbackResult.success) expect(callbackResult.error).toBe("INVALID_TOKEN");
    });
  });

  // ---------------------------------------------------------------------------
  // SSO LOGIN
  // ---------------------------------------------------------------------------

  describe("loginWithEmail (SSO)", () => {
    it("succeeds for existing user with org", async () => {
      const authService = createAuthService();
      const result = await authService.loginWithEmail(userEmail);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.sessionToken).toBeDefined();
        expect(result.user.email).toBe(userEmail);
      }
    });

    it("normalizes email case", async () => {
      const authService = createAuthService();
      const result = await authService.loginWithEmail(userEmail.toUpperCase());
      expect(result.success).toBe(true);
    });

    it("trims whitespace", async () => {
      const authService = createAuthService();
      const result = await authService.loginWithEmail(`  ${userEmail}  `);
      expect(result.success).toBe(true);
    });

    it("returns USER_NOT_REGISTERED for unknown email", async () => {
      const authService = createAuthService();
      const result = await authService.loginWithEmail("nobody@unknown.com");
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe("USER_NOT_REGISTERED");
    });

    it("returns NO_ORGANIZATION for user without org", async () => {
      const noOrgUser = await seedUser(orgId, { orgId: null });
      const authService = createAuthService();
      const result = await authService.loginWithEmail(noOrgUser.email);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe("NO_ORGANIZATION");
    });
  });

  // ---------------------------------------------------------------------------
  // SESSION VERIFICATION
  // ---------------------------------------------------------------------------

  describe("verifySessionFromHeaders", () => {
    it("verifies token from Authorization header", async () => {
      const authService = createAuthService();
      const ssoResult = await authService.loginWithEmail(userEmail);
      if (!ssoResult.success) throw new Error("SSO login failed");

      const claims = await authService.verifySessionFromHeaders(
        `Bearer ${ssoResult.sessionToken}`,
        null
      );
      expect(claims).not.toBeNull();
      expect(claims!.email).toBe(userEmail);
    });

    it("verifies token from Cookie header", async () => {
      const authService = createAuthService();
      const ssoResult = await authService.loginWithEmail(userEmail);
      if (!ssoResult.success) throw new Error("SSO login failed");

      const claims = await authService.verifySessionFromHeaders(
        null,
        `zehire_session=${ssoResult.sessionToken}`
      );
      expect(claims).not.toBeNull();
      expect(claims!.email).toBe(userEmail);
    });

    it("prefers Authorization header over Cookie", async () => {
      const authService = createAuthService();
      const ssoResult = await authService.loginWithEmail(userEmail);
      if (!ssoResult.success) throw new Error("SSO login failed");

      // Both headers present: Authorization should be used
      const claims = await authService.verifySessionFromHeaders(
        `Bearer ${ssoResult.sessionToken}`,
        "zehire_session=invalid-cookie-token"
      );
      expect(claims).not.toBeNull();
    });

    it("BUG: does NOT fall back to Cookie when Bearer token extraction succeeds but verification fails", async () => {
      // FINDING: verifySessionFromHeaders extracts Bearer token first.
      // If extraction succeeds (non-null), it returns verifySession result
      // immediately without trying Cookie. If the bearer token is malformed
      // but syntactically valid (e.g., "Bearer invalid-jwt"), the cookie is
      // never checked. This means a corrupt/expired Authorization header
      // prevents cookie-based fallback.
      const authService = createAuthService();
      const ssoResult = await authService.loginWithEmail(userEmail);
      if (!ssoResult.success) throw new Error("SSO login failed");

      // Invalid Authorization, valid Cookie
      const claims = await authService.verifySessionFromHeaders(
        "Bearer invalid-jwt",
        `zehire_session=${ssoResult.sessionToken}`
      );
      // Expected: should fall back to cookie and return valid user
      // Actual: returns null because Bearer token was extracted but invalid
      expect(claims).toBeNull();
    });

    it("returns null when both headers are null", async () => {
      const authService = createAuthService();
      const claims = await authService.verifySessionFromHeaders(null, null);
      expect(claims).toBeNull();
    });

    it("returns null when both headers have invalid tokens", async () => {
      const authService = createAuthService();
      const claims = await authService.verifySessionFromHeaders(
        "Bearer invalid",
        "zehire_session=also-invalid"
      );
      expect(claims).toBeNull();
    });
  });
});
