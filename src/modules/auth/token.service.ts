/**
 * Token Service
 * =============
 * Handles magic link token generation, hashing, and validation.
 *
 * Security measures:
 * - Tokens are cryptographically random (32 bytes)
 * - Tokens are stored as SHA-256 hashes (not plaintext)
 * - Tokens are single-use (invalidated after use)
 * - Tokens have configurable TTL
 */

import { nanoid } from "nanoid";
import type { MagicLinkTokenRow, TokenValidationResult } from "./auth.types";

// =============================================================================
// TYPES
// =============================================================================

export interface TokenServiceConfig {
  /** Token TTL in minutes */
  ttlMinutes: number;
}

export interface CreateTokenResult {
  /** Raw token to send in magic link (never stored) */
  rawToken: string;
  /** Token hash for storage */
  tokenHash: string;
  /** Expiration timestamp */
  expiresAt: Date;
}

// =============================================================================
// TOKEN SERVICE CLASS
// =============================================================================

export class TokenService {
  constructor(
    private readonly db: D1Database,
    private readonly config: TokenServiceConfig
  ) {}

  /**
   * Generate a new magic link token for a user.
   *
   * @param userId - User ID to create token for
   * @returns Raw token and metadata
   */
  async createToken(userId: string): Promise<CreateTokenResult> {
    // Generate cryptographically random token
    const rawToken = this.generateSecureToken();

    // Hash token for storage
    const tokenHash = await this.hashToken(rawToken);

    // Calculate expiration
    const expiresAt = new Date(Date.now() + this.config.ttlMinutes * 60 * 1000);

    // Generate token ID
    const tokenId = nanoid();

    // Store hashed token in database
    await this.db
      .prepare(
        `INSERT INTO magic_link_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(tokenId, userId, tokenHash, expiresAt.toISOString(), new Date().toISOString())
      .run();

    return {
      rawToken,
      tokenHash,
      expiresAt,
    };
  }

  /**
   * Validate a magic link token.
   *
   * @param rawToken - Raw token from magic link URL
   * @returns Validation result with user ID if valid
   */
  async validateToken(rawToken: string): Promise<TokenValidationResult> {
    // Hash the provided token
    const tokenHash = await this.hashToken(rawToken);

    // Find token in database
    const result = await this.db
      .prepare(
        `SELECT id, user_id, expires_at, used_at
         FROM magic_link_tokens
         WHERE token_hash = ?`
      )
      .bind(tokenHash)
      .first<Pick<MagicLinkTokenRow, "id" | "user_id" | "expires_at" | "used_at">>();

    if (!result) {
      return { valid: false, reason: "NOT_FOUND" };
    }

    // Check if already used
    if (result.used_at !== null) {
      return { valid: false, reason: "ALREADY_USED" };
    }

    // Check if expired
    const expiresAt = new Date(result.expires_at);
    if (expiresAt < new Date()) {
      return { valid: false, reason: "EXPIRED" };
    }

    return { valid: true, userId: result.user_id };
  }

  /**
   * Invalidate a token after use.
   * Marks the token as used to prevent reuse.
   *
   * @param rawToken - Raw token to invalidate
   */
  async invalidateToken(rawToken: string): Promise<void> {
    const tokenHash = await this.hashToken(rawToken);

    await this.db
      .prepare(
        `UPDATE magic_link_tokens
         SET used_at = ?
         WHERE token_hash = ? AND used_at IS NULL`
      )
      .bind(new Date().toISOString(), tokenHash)
      .run();
  }

  /**
   * Clean up expired tokens.
   * Call periodically to prevent table bloat.
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.db
      .prepare(
        `DELETE FROM magic_link_tokens
         WHERE expires_at < ? OR used_at IS NOT NULL`
      )
      .bind(new Date().toISOString())
      .run();

    return result.meta.changes;
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Generate a cryptographically secure random token.
   * Uses Web Crypto API available in Cloudflare Workers.
   */
  private generateSecureToken(): string {
    // Generate 32 random bytes
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);

    // Convert to URL-safe base64
    return this.bytesToBase64Url(bytes);
  }

  /**
   * Hash a token using SHA-256.
   * Uses Web Crypto API available in Cloudflare Workers.
   */
  private async hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return this.bytesToBase64Url(new Uint8Array(hashBuffer));
  }

  /**
   * Convert bytes to URL-safe base64 string.
   */
  private bytesToBase64Url(bytes: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...bytes));
    // Make URL-safe: replace + with -, / with _, remove =
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }
}
