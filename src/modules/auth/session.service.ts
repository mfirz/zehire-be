/**
 * Session Service
 * ===============
 * Handles JWT-based session management.
 *
 * Session Strategy: Signed JWT (stateless)
 *
 * Why JWT over opaque session IDs:
 * - Stateless: No database/KV lookup for every request
 * - Self-contained: Role and user info in the token
 * - Simpler: Works well with Cloudflare Workers edge runtime
 * - Scalable: No session store to manage
 *
 * Security:
 * - HMAC-SHA256 signature
 * - HttpOnly cookie (not accessible via JavaScript)
 * - Secure flag (HTTPS only in production)
 * - SameSite=Lax (CSRF protection while allowing magic link navigation)
 * - Short-lived tokens with configurable TTL
 */

import type { SessionConfig, SessionPayload, UserClaims } from "./auth.types";

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_COOKIE_NAME = "zehire_session";
const DEFAULT_SESSION_TTL_SECONDS = 24 * 60 * 60; // 24 hours

// =============================================================================
// SESSION SERVICE CLASS
// =============================================================================

export class SessionService {
  private readonly config: SessionConfig;

  constructor(config: Partial<SessionConfig> & { secret: string }) {
    this.config = {
      secret: config.secret,
      ttlSeconds: config.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS,
      cookieName: config.cookieName ?? DEFAULT_COOKIE_NAME,
      secure: config.secure ?? true,
    };
  }

  /**
   * Create a new session token for a user.
   *
   * @param user - User claims to encode in the JWT
   * @returns Signed JWT token
   */
  async createSession(user: UserClaims): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    const payload: SessionPayload = {
      sub: user.userId,
      iss: "zehire",
      aud: "zehire-api",
      email: user.email,
      role: user.role,
      org_id: user.orgId,
      iat: now,
      exp: now + this.config.ttlSeconds,
    };

    return this.signJwt(payload);
  }

  /**
   * Verify and decode a session token.
   *
   * @param token - JWT token to verify
   * @returns User claims if valid, null if invalid/expired
   */
  async verifySession(token: string): Promise<UserClaims | null> {
    try {
      const payload = await this.verifyJwt(token);

      if (!payload) {
        return null;
      }

      // Verify issuer and audience
      if (payload.iss !== "zehire" || payload.aud !== "zehire-api") {
        return null;
      }

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        return null;
      }

      // Reject tokens without org_id (old tokens before multi-tenancy)
      if (!payload.org_id) {
        return null;
      }

      return {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        orgId: payload.org_id,
      };
    } catch {
      return null;
    }
  }

  /**
   * Generate Set-Cookie header value for the session.
   *
   * @param token - JWT token
   * @returns Cookie header value
   */
  getCookieHeader(token: string): string {
    const parts = [
      `${this.config.cookieName}=${token}`,
      "HttpOnly",
      "Path=/",
      `SameSite=Lax`,
      `Max-Age=${this.config.ttlSeconds}`,
    ];

    if (this.config.secure) {
      parts.push("Secure");
    }

    return parts.join("; ");
  }

  /**
   * Generate Set-Cookie header value to clear the session.
   *
   * @returns Cookie header value that clears the session
   */
  getClearCookieHeader(): string {
    const parts = [
      `${this.config.cookieName}=`,
      "HttpOnly",
      "Path=/",
      "SameSite=Lax",
      "Max-Age=0",
    ];

    if (this.config.secure) {
      parts.push("Secure");
    }

    return parts.join("; ");
  }

  /**
   * Extract session token from cookie header.
   *
   * @param cookieHeader - Cookie header value
   * @returns Token if found, null otherwise
   */
  extractTokenFromCookie(cookieHeader: string | null): string | null {
    if (!cookieHeader) {
      return null;
    }

    const cookies = cookieHeader.split(";").map((c) => c.trim());
    const sessionCookie = cookies.find((c) => c.startsWith(`${this.config.cookieName}=`));

    if (!sessionCookie) {
      return null;
    }

    return sessionCookie.substring(this.config.cookieName.length + 1);
  }

  /**
   * Extract JWT from Authorization header.
   *
   * Expects format: Bearer <token>
   *
   * @param authHeader - Authorization header value
   * @returns Token if found and valid format, null otherwise
   */
  extractTokenFromAuthHeader(authHeader: string | null): string | null {
    if (!authHeader) {
      return null;
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || !match[1]) {
      return null;
    }

    return match[1];
  }

  // ===========================================================================
  // PRIVATE JWT METHODS
  // ===========================================================================

  /**
   * Sign a JWT payload using HMAC-SHA256.
   */
  private async signJwt(payload: SessionPayload): Promise<string> {
    const header = { alg: "HS256", typ: "JWT" };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));

    const data = `${encodedHeader}.${encodedPayload}`;
    const signature = await this.hmacSign(data);

    return `${data}.${signature}`;
  }

  /**
   * Verify a JWT and return the payload.
   */
  private async verifyJwt(token: string): Promise<SessionPayload | null> {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const encodedHeader = parts[0];
    const encodedPayload = parts[1];
    const signature = parts[2];

    // TypeScript safety check (already guaranteed by length check above)
    if (!encodedHeader || !encodedPayload || !signature) {
      return null;
    }

    const data = `${encodedHeader}.${encodedPayload}`;

    // Verify signature
    const expectedSignature = await this.hmacSign(data);
    if (!this.timingSafeEqual(signature, expectedSignature)) {
      return null;
    }

    // Decode payload
    try {
      const payloadJson = this.base64UrlDecode(encodedPayload);
      return JSON.parse(payloadJson) as SessionPayload;
    } catch {
      return null;
    }
  }

  /**
   * Create HMAC-SHA256 signature.
   */
  private async hmacSign(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.config.secret);
    const messageData = encoder.encode(data);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", key, messageData);
    return this.bytesToBase64Url(new Uint8Array(signature));
  }

  /**
   * Base64 URL encode a string.
   */
  private base64UrlEncode(str: string): string {
    const base64 = btoa(str);
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  /**
   * Base64 URL decode a string.
   */
  private base64UrlDecode(str: string): string {
    // Restore standard base64
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding if needed
    while (base64.length % 4) {
      base64 += "=";
    }
    return atob(base64);
  }

  /**
   * Convert bytes to URL-safe base64 string.
   */
  private bytesToBase64Url(bytes: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  /**
   * Constant-time string comparison to prevent timing attacks.
   */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}
