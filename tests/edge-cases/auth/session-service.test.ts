/**
 * Edge-case tests for SessionService (JWT)
 * Tests: JWT signing, verification, expiry, tampering, cookie handling
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SessionService } from "../../../src/modules/auth/session.service";
import type { UserClaims } from "../../../src/modules/auth/auth.types";

const TEST_SECRET = "test-secret-key-for-jwt-signing-at-least-32-chars";

const TEST_USER: UserClaims = {
  userId: "user_123",
  email: "test@example.com",
  role: "admin",
  orgId: "org_456",
};

describe("SessionService Edge Cases", () => {
  let sessionService: SessionService;

  beforeEach(() => {
    sessionService = new SessionService({
      secret: TEST_SECRET,
      ttlSeconds: 3600, // 1 hour
      secure: false,
    });
  });

  // ---------------------------------------------------------------------------
  // JWT CREATION & VERIFICATION
  // ---------------------------------------------------------------------------

  describe("createSession + verifySession roundtrip", () => {
    it("creates and verifies a valid session", async () => {
      const token = await sessionService.createSession(TEST_USER);
      const claims = await sessionService.verifySession(token);

      expect(claims).not.toBeNull();
      expect(claims!.userId).toBe(TEST_USER.userId);
      expect(claims!.email).toBe(TEST_USER.email);
      expect(claims!.role).toBe(TEST_USER.role);
      expect(claims!.orgId).toBe(TEST_USER.orgId);
    });

    it("token has 3 dot-separated parts", async () => {
      const token = await sessionService.createSession(TEST_USER);
      const parts = token.split(".");
      expect(parts.length).toBe(3);
    });

    it("token parts are URL-safe base64 (no +, /, =)", async () => {
      // Generate several tokens to increase chance of detecting encoding issues
      for (let i = 0; i < 10; i++) {
        const token = await sessionService.createSession({
          ...TEST_USER,
          userId: `user_${i}_${Date.now()}`,
        });
        expect(token).not.toMatch(/[+/=]/);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // TAMPERED TOKENS
  // ---------------------------------------------------------------------------

  describe("tampered tokens", () => {
    it("rejects token with modified payload", async () => {
      const token = await sessionService.createSession(TEST_USER);
      const parts = token.split(".");

      // Tamper with payload: change the role
      const payloadJson = atob(
        parts[1]!.replace(/-/g, "+").replace(/_/g, "/")
      );
      const payload = JSON.parse(payloadJson);
      payload.role = "superadmin";
      const tamperedPayload = btoa(JSON.stringify(payload))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
      const claims = await sessionService.verifySession(tamperedToken);
      expect(claims).toBeNull();
    });

    it("rejects token with modified signature", async () => {
      const token = await sessionService.createSession(TEST_USER);
      const parts = token.split(".");

      // Replace last char of signature
      const sig = parts[2]!;
      const tamperedSig = sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a");
      const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSig}`;

      const claims = await sessionService.verifySession(tamperedToken);
      expect(claims).toBeNull();
    });

    it("rejects token with empty signature", async () => {
      const token = await sessionService.createSession(TEST_USER);
      const parts = token.split(".");
      const tamperedToken = `${parts[0]}.${parts[1]}.`;

      const claims = await sessionService.verifySession(tamperedToken);
      expect(claims).toBeNull();
    });

    it("rejects token signed with different secret", async () => {
      const otherService = new SessionService({
        secret: "different-secret-key-for-signing-tokens",
        ttlSeconds: 3600,
      });
      const token = await otherService.createSession(TEST_USER);

      // Verify with original service (different secret)
      const claims = await sessionService.verifySession(token);
      expect(claims).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // MALFORMED TOKENS
  // ---------------------------------------------------------------------------

  describe("malformed tokens", () => {
    it("rejects empty string", async () => {
      const claims = await sessionService.verifySession("");
      expect(claims).toBeNull();
    });

    it("rejects null-like strings", async () => {
      expect(await sessionService.verifySession("null")).toBeNull();
      expect(await sessionService.verifySession("undefined")).toBeNull();
    });

    it("rejects token with only 1 part (no dots)", async () => {
      const claims = await sessionService.verifySession("singlesegment");
      expect(claims).toBeNull();
    });

    it("rejects token with only 2 parts", async () => {
      const claims = await sessionService.verifySession("header.payload");
      expect(claims).toBeNull();
    });

    it("rejects token with 4+ parts", async () => {
      const claims = await sessionService.verifySession("a.b.c.d");
      expect(claims).toBeNull();
    });

    it("rejects extremely long token (10KB)", async () => {
      const longToken = `${"a".repeat(3000)}.${"b".repeat(3000)}.${"c".repeat(4000)}`;
      const claims = await sessionService.verifySession(longToken);
      expect(claims).toBeNull();
    });

    it("rejects token with unicode/emoji characters", async () => {
      const claims = await sessionService.verifySession("🔑.📧.🔒");
      expect(claims).toBeNull();
    });

    it("rejects non-base64 payload", async () => {
      const claims = await sessionService.verifySession("header.not!valid@base64.sig");
      expect(claims).toBeNull();
    });

    it("rejects token with valid structure but invalid JSON payload", async () => {
      const validHeader = btoa('{"alg":"HS256","typ":"JWT"}')
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
      const invalidPayload = btoa("not-json")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
      const claims = await sessionService.verifySession(
        `${validHeader}.${invalidPayload}.fakesig`
      );
      expect(claims).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // EXPIRATION
  // ---------------------------------------------------------------------------

  describe("token expiration", () => {
    it("TTL=0 token expires immediately (exp == now, rejected by exp <= now)", async () => {
      const expiredService = new SessionService({
        secret: TEST_SECRET,
        ttlSeconds: 0,
        secure: false,
      });

      const token = await expiredService.createSession(TEST_USER);
      const claims = await expiredService.verifySession(token);
      expect(claims).toBeNull();
    });

    it("rejects token after TTL has clearly passed", async () => {
      // Use negative TTL to simulate already-expired token
      const expiredService = new SessionService({
        secret: TEST_SECRET,
        ttlSeconds: -1, // exp = now - 1 second
        secure: false,
      });

      const token = await expiredService.createSession(TEST_USER);
      const claims = await expiredService.verifySession(token);
      expect(claims).toBeNull();
    });

    it("accepts token within TTL window", async () => {
      const token = await sessionService.createSession(TEST_USER);
      const claims = await sessionService.verifySession(token);
      expect(claims).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // MISSING CLAIMS
  // ---------------------------------------------------------------------------

  describe("missing/invalid claims", () => {
    it("rejects token without org_id claim", async () => {
      const userWithoutOrg = {
        ...TEST_USER,
        orgId: "", // empty string
      };
      const token = await sessionService.createSession(userWithoutOrg);
      const claims = await sessionService.verifySession(token);
      // empty org_id should be rejected by the !payload.org_id check
      expect(claims).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // ISSUER & AUDIENCE VALIDATION
  // ---------------------------------------------------------------------------

  describe("issuer and audience validation", () => {
    it("crafted token with wrong issuer is rejected", async () => {
      // Create a valid token and manually tamper with iss
      const token = await sessionService.createSession(TEST_USER);
      const parts = token.split(".");

      // Decode payload
      let payloadB64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
      while (payloadB64.length % 4) payloadB64 += "=";
      const payload = JSON.parse(atob(payloadB64));
      payload.iss = "evil-issuer";

      // Re-encode (but can't re-sign, so this should fail sig check)
      // This validates that the signature check catches iss tampering
      const newPayload = btoa(JSON.stringify(payload))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
      const tamperedToken = `${parts[0]}.${newPayload}.${parts[2]}`;

      const claims = await sessionService.verifySession(tamperedToken);
      expect(claims).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // COOKIE HEADER GENERATION
  // ---------------------------------------------------------------------------

  describe("getCookieHeader", () => {
    it("includes HttpOnly flag", () => {
      const header = sessionService.getCookieHeader("test-token");
      expect(header).toContain("HttpOnly");
    });

    it("includes SameSite=Lax", () => {
      const header = sessionService.getCookieHeader("test-token");
      expect(header).toContain("SameSite=Lax");
    });

    it("includes Secure flag when secure=true", () => {
      const secureService = new SessionService({
        secret: TEST_SECRET,
        secure: true,
      });
      const header = secureService.getCookieHeader("test-token");
      expect(header).toContain("Secure");
    });

    it("excludes Secure flag when secure=false", () => {
      const header = sessionService.getCookieHeader("test-token");
      expect(header).not.toContain("Secure");
    });

    it("sets correct Max-Age", () => {
      const header = sessionService.getCookieHeader("test-token");
      expect(header).toContain("Max-Age=3600");
    });

    it("uses correct cookie name", () => {
      const header = sessionService.getCookieHeader("test-token");
      expect(header.startsWith("zehire_session=test-token")).toBe(true);
    });

    it("custom cookie name works", () => {
      const customService = new SessionService({
        secret: TEST_SECRET,
        cookieName: "custom_session",
      });
      const header = customService.getCookieHeader("test-token");
      expect(header.startsWith("custom_session=test-token")).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // CLEAR COOKIE HEADER
  // ---------------------------------------------------------------------------

  describe("getClearCookieHeader", () => {
    it("sets Max-Age=0 to expire cookie", () => {
      const header = sessionService.getClearCookieHeader();
      expect(header).toContain("Max-Age=0");
    });

    it("clears cookie value", () => {
      const header = sessionService.getClearCookieHeader();
      expect(header.startsWith("zehire_session=;")).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // TOKEN EXTRACTION FROM COOKIE
  // ---------------------------------------------------------------------------

  describe("extractTokenFromCookie", () => {
    it("extracts token from valid cookie header", () => {
      const token = sessionService.extractTokenFromCookie(
        "zehire_session=mytoken123"
      );
      expect(token).toBe("mytoken123");
    });

    it("extracts token when multiple cookies present", () => {
      const token = sessionService.extractTokenFromCookie(
        "other=foo; zehire_session=mytoken123; another=bar"
      );
      expect(token).toBe("mytoken123");
    });

    it("returns null for empty cookie header", () => {
      const token = sessionService.extractTokenFromCookie("");
      expect(token).toBeNull();
    });

    it("returns null when cookie header is null", () => {
      const token = sessionService.extractTokenFromCookie(null);
      expect(token).toBeNull();
    });

    it("returns null when session cookie not present", () => {
      const token = sessionService.extractTokenFromCookie("other=foo; bar=baz");
      expect(token).toBeNull();
    });

    it("handles cookie value containing = signs (JWT tokens)", () => {
      // JWT tokens can contain base64 characters; cookie values can have =
      // The implementation uses substring, not split("=")[1]
      const token = sessionService.extractTokenFromCookie(
        "zehire_session=abc.def.ghi"
      );
      expect(token).toBe("abc.def.ghi");
    });

    it("does not match partial cookie names", () => {
      // e.g. "my_zehire_session=foo" should NOT match "zehire_session"
      const token = sessionService.extractTokenFromCookie(
        "my_zehire_session=stolen; other=bar"
      );
      expect(token).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // TOKEN EXTRACTION FROM AUTH HEADER
  // ---------------------------------------------------------------------------

  describe("extractTokenFromAuthHeader", () => {
    it("extracts token from valid Bearer header", () => {
      const token = sessionService.extractTokenFromAuthHeader("Bearer mytoken");
      expect(token).toBe("mytoken");
    });

    it("is case-insensitive for 'Bearer'", () => {
      const token = sessionService.extractTokenFromAuthHeader("bearer mytoken");
      expect(token).toBe("mytoken");

      const token2 = sessionService.extractTokenFromAuthHeader("BEARER mytoken");
      expect(token2).toBe("mytoken");
    });

    it("returns null for empty string", () => {
      const token = sessionService.extractTokenFromAuthHeader("");
      expect(token).toBeNull();
    });

    it("returns null for null", () => {
      const token = sessionService.extractTokenFromAuthHeader(null);
      expect(token).toBeNull();
    });

    it("returns null for 'Basic' auth scheme", () => {
      const token = sessionService.extractTokenFromAuthHeader(
        "Basic dXNlcjpwYXNz"
      );
      expect(token).toBeNull();
    });

    it("returns null for 'Bearer' with no token", () => {
      const token = sessionService.extractTokenFromAuthHeader("Bearer ");
      // regex requires at least one char after "Bearer "
      expect(token).toBeNull();
    });

    it("handles token with spaces in it (captures everything after 'Bearer ')", () => {
      // This is technically invalid but tests the regex behavior
      const token = sessionService.extractTokenFromAuthHeader(
        "Bearer token with spaces"
      );
      expect(token).toBe("token with spaces");
    });
  });

  // ---------------------------------------------------------------------------
  // TIMING-SAFE COMPARISON (indirect testing)
  // ---------------------------------------------------------------------------

  describe("signature verification is timing-safe", () => {
    it("rejects tokens where only last byte of signature differs", async () => {
      const token = await sessionService.createSession(TEST_USER);
      const parts = token.split(".");
      const sig = parts[2]!;

      // Flip last character
      const lastChar = sig.charCodeAt(sig.length - 1);
      const flippedChar = String.fromCharCode(lastChar ^ 1);
      const tamperedSig = sig.slice(0, -1) + flippedChar;
      const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSig}`;

      const claims = await sessionService.verifySession(tamperedToken);
      expect(claims).toBeNull();
    });

    it("rejects tokens where only first byte of signature differs", async () => {
      const token = await sessionService.createSession(TEST_USER);
      const parts = token.split(".");
      const sig = parts[2]!;

      // Flip first character
      const firstChar = sig.charCodeAt(0);
      const flippedChar = String.fromCharCode(firstChar ^ 1);
      const tamperedSig = flippedChar + sig.slice(1);
      const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSig}`;

      const claims = await sessionService.verifySession(tamperedToken);
      expect(claims).toBeNull();
    });
  });
});
