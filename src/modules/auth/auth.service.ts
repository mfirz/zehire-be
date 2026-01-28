/**
 * Auth Service
 * ============
 * Orchestrates the magic link authentication flow.
 *
 * Flow:
 * 1. User submits email via POST /auth/login
 * 2. Service validates email and checks user exists
 * 3. Service generates magic link token
 * 4. Service calls email gateway to send magic link
 * 5. User clicks magic link → GET /auth/callback?token=...
 * 6. Service validates token and creates session
 * 7. Service returns session cookie
 */

import type { EmailGateway } from "../email/email.gateway";
import type { CallbackResult, LoginResult, UserClaims, UserRole, UserRow } from "./auth.types";
import type { SSOLoginResult } from "./sso/types";
import { SessionService } from "./session.service";
import { TokenService } from "./token.service";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Callback for non-blocking background work.
 */
type WaitUntilFn = (promise: Promise<unknown>) => void;

export interface AuthServiceConfig {
  /** Base URL for magic link (e.g., "https://app.zehire.com") */
  appBaseUrl: string;
  /** Token TTL in minutes */
  tokenTtlMinutes: number;
  /** Optional callback for non-blocking background work (e.g., email sending) */
  waitUntil?: WaitUntilFn | undefined;
}

// =============================================================================
// AUTH SERVICE CLASS
// =============================================================================

export class AuthService {
  private readonly tokenService: TokenService;

  constructor(
    private readonly db: D1Database,
    private readonly sessionService: SessionService,
    private readonly emailGateway: EmailGateway,
    private readonly config: AuthServiceConfig
  ) {
    this.tokenService = new TokenService(db, {
      ttlMinutes: config.tokenTtlMinutes,
    });
  }

  // ===========================================================================
  // LOGIN
  // ===========================================================================

  /**
   * Initiate magic link login flow.
   *
   * @param email - User email address
   * @returns Success or error result
   */
  async login(email: string): Promise<LoginResult> {
    // Validate email format
    if (!this.isValidEmail(email)) {
      return { success: false, error: "INVALID_EMAIL" };
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists
    const user = await this.findUserByEmail(normalizedEmail);
    if (!user) {
      return { success: false, error: "EMAIL_NOT_REGISTERED" };
    }

    // Generate magic link token
    const { rawToken, expiresAt } = await this.tokenService.createToken(user.id);

    // Build magic link URL
    const magicLinkUrl = `${this.config.appBaseUrl}/auth/callback?token=${encodeURIComponent(rawToken)}`;

    // Send magic link email (non-blocking if waitUntil is provided)
    const emailPromise = this.emailGateway.sendMagicLink({
      email: normalizedEmail,
      magicLinkUrl,
      expiresAt,
    });

    if (this.config.waitUntil) {
      // Non-blocking: response returns immediately, email sends in background
      this.config.waitUntil(emailPromise);
    } else {
      // Blocking: wait for email to be sent (useful for testing)
      await emailPromise;
    }

    console.log(`[AuthService] Magic link initiated for ${normalizedEmail}`);

    return { success: true };
  }

  // ===========================================================================
  // CALLBACK
  // ===========================================================================

  /**
   * Complete magic link authentication.
   *
   * @param token - Raw token from magic link URL
   * @returns Session token or error result
   */
  async callback(token: string): Promise<CallbackResult> {
    // Validate token
    const validationResult = await this.tokenService.validateToken(token);

    if (!validationResult.valid) {
      switch (validationResult.reason) {
        case "NOT_FOUND":
          return { success: false, error: "INVALID_TOKEN" };
        case "EXPIRED":
          return { success: false, error: "TOKEN_EXPIRED" };
        case "ALREADY_USED":
          return { success: false, error: "TOKEN_ALREADY_USED" };
      }
    }

    // Get user
    const user = await this.findUserById(validationResult.userId);
    if (!user) {
      // User was deleted after token was created
      return { success: false, error: "INVALID_TOKEN" };
    }

    // Invalidate token (single-use)
    await this.tokenService.invalidateToken(token);

    // Verify user has an organization
    if (!user.org_id) {
      return { success: false, error: "INVALID_TOKEN" };
    }

    // Create user claims
    const userClaims: UserClaims = {
      userId: user.id,
      email: user.email,
      role: user.role,
      orgId: user.org_id,
    };

    // Create session
    const sessionToken = await this.sessionService.createSession(userClaims);

    console.log(`[AuthService] User ${user.email} authenticated successfully`);

    return {
      success: true,
      user: userClaims,
      sessionToken,
    };
  }

  // ===========================================================================
  // SESSION HELPERS
  // ===========================================================================

  /**
   * Get cookie header for session token.
   */
  getSessionCookieHeader(sessionToken: string): string {
    return this.sessionService.getCookieHeader(sessionToken);
  }

  /**
   * Get cookie header to clear session.
   */
  getClearSessionCookieHeader(): string {
    return this.sessionService.getClearCookieHeader();
  }

  /**
   * Verify session from cookie.
   */
  async verifySession(cookieHeader: string | null): Promise<UserClaims | null> {
    const token = this.sessionService.extractTokenFromCookie(cookieHeader);
    if (!token) {
      return null;
    }
    return this.sessionService.verifySession(token);
  }

  /**
   * Verify session from Authorization header or Cookie.
   * Tries Authorization header first, falls back to Cookie.
   */
  async verifySessionFromHeaders(
    authHeader: string | null,
    cookieHeader: string | null
  ): Promise<UserClaims | null> {
    // Try Authorization header first (Bearer token)
    const bearerToken = this.sessionService.extractTokenFromAuthHeader(authHeader);
    if (bearerToken) {
      return this.sessionService.verifySession(bearerToken);
    }

    // Fall back to Cookie
    const cookieToken = this.sessionService.extractTokenFromCookie(cookieHeader);
    if (cookieToken) {
      return this.sessionService.verifySession(cookieToken);
    }

    return null;
  }

  // ===========================================================================
  // SSO LOGIN
  // ===========================================================================

  /**
   * Login user by email address (for SSO providers).
   * Does not send magic link - directly creates session if user exists.
   *
   * @param email - User email from SSO provider
   * @returns Session token or error
   */
  async loginWithEmail(email: string): Promise<SSOLoginResult> {
    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Find user by email
    const user = await this.findUserByEmail(normalizedEmail);

    if (!user) {
      return { success: false, error: "USER_NOT_REGISTERED" };
    }

    // Verify user has an organization
    if (!user.org_id) {
      return { success: false, error: "NO_ORGANIZATION" };
    }

    // Create user claims
    const userClaims: UserClaims = {
      userId: user.id,
      email: user.email,
      role: user.role,
      orgId: user.org_id,
    };

    // Create session
    const sessionToken = await this.sessionService.createSession(userClaims);

    console.log(`[AuthService] SSO login successful for ${normalizedEmail}`);

    return {
      success: true,
      sessionToken,
      user: userClaims,
    };
  }

  // ===========================================================================
  // USER LOOKUP METHODS
  // ===========================================================================

  /**
   * Find user by email address.
   */
  async findUserByEmail(email: string): Promise<UserRow | null> {
    const result = await this.db
      .prepare("SELECT id, email, name, role, org_id, created_at, updated_at FROM users WHERE email = ?")
      .bind(email)
      .first<UserRow>();

    return result ?? null;
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Find user by ID.
   */
  private async findUserById(userId: string): Promise<UserRow | null> {
    const result = await this.db
      .prepare("SELECT id, email, name, role, org_id, created_at, updated_at FROM users WHERE id = ?")
      .bind(userId)
      .first<UserRow>();

    return result ?? null;
  }

  /**
   * Validate email format.
   */
  private isValidEmail(email: string): boolean {
    // Simple email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

// =============================================================================
// USER REPOSITORY (for admin operations)
// =============================================================================

export class UserRepository {
  constructor(private readonly db: D1Database) {}

  /**
   * Create a new user.
   */
  async create(
    email: string,
    orgId: string,
    role: UserRole = "recruiter",
    name?: string
  ): Promise<UserRow> {
    const { nanoid } = await import("nanoid");
    const id = nanoid();
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO users (id, email, name, role, org_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, email.toLowerCase().trim(), name ?? null, role, orgId, now, now)
      .run();

    return {
      id,
      email: email.toLowerCase().trim(),
      name: name ?? null,
      role,
      org_id: orgId,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Find user by email.
   */
  async findByEmail(email: string): Promise<UserRow | null> {
    const result = await this.db
      .prepare("SELECT id, email, name, role, org_id, created_at, updated_at FROM users WHERE email = ?")
      .bind(email.toLowerCase().trim())
      .first<UserRow>();

    return result ?? null;
  }

  /**
   * Check if user exists by email.
   */
  async exists(email: string): Promise<boolean> {
    const result = await this.db
      .prepare("SELECT 1 FROM users WHERE email = ?")
      .bind(email.toLowerCase().trim())
      .first();

    return result !== null;
  }
}
