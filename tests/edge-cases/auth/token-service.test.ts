/**
 * Edge-case tests for TokenService
 * Tests: token generation, validation, expiry, single-use, cleanup
 */
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { TokenService } from "../../../src/modules/auth/token.service";
import { seedOrg, seedUser } from "../../../test/helpers/seed";

describe("TokenService Edge Cases", () => {
  let tokenService: TokenService;
  let userId: string;

  beforeAll(async () => {
    const org = await seedOrg();
    const user = await seedUser(org.id);
    userId = user.id;
  });

  beforeEach(() => {
    tokenService = new TokenService(env.DB, { ttlMinutes: 15 });
  });

  // ---------------------------------------------------------------------------
  // TOKEN GENERATION
  // ---------------------------------------------------------------------------

  describe("createToken", () => {
    it("generates unique tokens for same user", async () => {
      const token1 = await tokenService.createToken(userId);
      const token2 = await tokenService.createToken(userId);

      expect(token1.rawToken).not.toBe(token2.rawToken);
      expect(token1.tokenHash).not.toBe(token2.tokenHash);
    });

    it("raw token has sufficient entropy (at least 32 bytes base64url)", async () => {
      const { rawToken } = await tokenService.createToken(userId);
      // 32 bytes -> 43 base64url chars (without padding)
      expect(rawToken.length).toBeGreaterThanOrEqual(43);
    });

    it("raw token is URL-safe (no +, /, = chars)", async () => {
      // Generate multiple to increase chance of catching encoding issues
      for (let i = 0; i < 10; i++) {
        const { rawToken } = await tokenService.createToken(userId);
        expect(rawToken).not.toMatch(/[+/=]/);
      }
    });

    it("token hash differs from raw token", async () => {
      const { rawToken, tokenHash } = await tokenService.createToken(userId);
      expect(rawToken).not.toBe(tokenHash);
    });

    it("expiry is set correctly based on TTL config", async () => {
      const ttlMinutes = 15;
      const before = Date.now();
      const { expiresAt } = await tokenService.createToken(userId);
      const after = Date.now();

      const expectedMin = before + ttlMinutes * 60 * 1000;
      const expectedMax = after + ttlMinutes * 60 * 1000;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it("works with 1-minute TTL", async () => {
      const shortService = new TokenService(env.DB, { ttlMinutes: 1 });
      const { rawToken } = await shortService.createToken(userId);
      const result = await shortService.validateToken(rawToken);
      expect(result.valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // TOKEN VALIDATION
  // ---------------------------------------------------------------------------

  describe("validateToken", () => {
    it("validates a freshly created token", async () => {
      const { rawToken } = await tokenService.createToken(userId);
      const result = await tokenService.validateToken(rawToken);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.userId).toBe(userId);
      }
    });

    it("rejects non-existent token (NOT_FOUND)", async () => {
      const result = await tokenService.validateToken("completely-fake-token-value");
      expect(result).toEqual({ valid: false, reason: "NOT_FOUND" });
    });

    it("rejects empty string token", async () => {
      const result = await tokenService.validateToken("");
      expect(result).toEqual({ valid: false, reason: "NOT_FOUND" });
    });

    it("rejects token with unicode characters", async () => {
      const result = await tokenService.validateToken("token-with-emoji-🔑-and-中文");
      expect(result).toEqual({ valid: false, reason: "NOT_FOUND" });
    });

    it("rejects extremely long token (10,000 chars)", async () => {
      const longToken = "a".repeat(10000);
      const result = await tokenService.validateToken(longToken);
      expect(result).toEqual({ valid: false, reason: "NOT_FOUND" });
    });

    it("rejects token after it has been used (ALREADY_USED / single-use)", async () => {
      const { rawToken } = await tokenService.createToken(userId);

      // First use: valid
      const result1 = await tokenService.validateToken(rawToken);
      expect(result1.valid).toBe(true);

      // Invalidate (simulates callback completing)
      await tokenService.invalidateToken(rawToken);

      // Second use: already used
      const result2 = await tokenService.validateToken(rawToken);
      expect(result2).toEqual({ valid: false, reason: "ALREADY_USED" });
    });

    it("rejects expired token", async () => {
      // Create token with already-expired TTL
      // We'll directly insert an expired token into the DB
      const rawToken = "expired-test-token-value-1234567890";
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(rawToken)
      );
      const hashArray = new Uint8Array(hashBuffer);
      const tokenHash = btoa(String.fromCharCode(...hashArray))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      const pastDate = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min ago
      await env.DB.prepare(
        `INSERT INTO magic_link_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind("expired-token-id", userId, tokenHash, pastDate, new Date().toISOString())
        .run();

      const result = await tokenService.validateToken(rawToken);
      expect(result).toEqual({ valid: false, reason: "EXPIRED" });
    });
  });

  // ---------------------------------------------------------------------------
  // TOKEN INVALIDATION
  // ---------------------------------------------------------------------------

  describe("invalidateToken", () => {
    it("invalidating already-used token is idempotent", async () => {
      const { rawToken } = await tokenService.createToken(userId);
      await tokenService.invalidateToken(rawToken);
      // Second invalidation should not throw
      await tokenService.invalidateToken(rawToken);

      const result = await tokenService.validateToken(rawToken);
      expect(result).toEqual({ valid: false, reason: "ALREADY_USED" });
    });

    it("invalidating non-existent token does not throw", async () => {
      // Should be a no-op
      await expect(
        tokenService.invalidateToken("does-not-exist-token")
      ).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // CLEANUP
  // ---------------------------------------------------------------------------

  describe("cleanupExpiredTokens", () => {
    it("removes expired tokens", async () => {
      // Insert an expired token directly
      const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
      await env.DB.prepare(
        `INSERT INTO magic_link_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind("cleanup-expired-id", userId, "cleanup-hash-1", pastDate, new Date().toISOString())
        .run();

      const removed = await tokenService.cleanupExpiredTokens();
      expect(removed).toBeGreaterThanOrEqual(1);

      // Verify it's gone
      const row = await env.DB.prepare(
        "SELECT id FROM magic_link_tokens WHERE id = ?"
      )
        .bind("cleanup-expired-id")
        .first();
      expect(row).toBeNull();
    });

    it("removes used tokens", async () => {
      const { rawToken } = await tokenService.createToken(userId);
      await tokenService.invalidateToken(rawToken);

      const removed = await tokenService.cleanupExpiredTokens();
      expect(removed).toBeGreaterThanOrEqual(1);
    });

    it("preserves valid unexpired tokens", async () => {
      const { rawToken } = await tokenService.createToken(userId);

      await tokenService.cleanupExpiredTokens();

      const result = await tokenService.validateToken(rawToken);
      expect(result.valid).toBe(true);
    });
  });
});
