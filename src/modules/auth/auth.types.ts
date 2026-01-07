/**
 * Authentication Types
 * ====================
 * Type definitions for the authentication module.
 */

// =============================================================================
// ROLES
// =============================================================================

export const USER_ROLES = ["admin", "recruiter"] as const;

export type UserRole = (typeof USER_ROLES)[number];

// =============================================================================
// USER
// =============================================================================

/**
 * User record as stored in the database.
 */
export interface UserRow {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

/**
 * User data for session/JWT claims.
 */
export interface UserClaims {
  userId: string;
  email: string;
  role: UserRole;
}

// =============================================================================
// MAGIC LINK TOKEN
// =============================================================================

/**
 * Magic link token record as stored in the database.
 */
export interface MagicLinkTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

/**
 * Result of token validation.
 */
export type TokenValidationResult =
  | { valid: true; userId: string }
  | { valid: false; reason: "NOT_FOUND" | "EXPIRED" | "ALREADY_USED" };

// =============================================================================
// SESSION
// =============================================================================

/**
 * JWT payload structure.
 */
export interface SessionPayload {
  /** Subject (user ID) */
  sub: string;
  /** Issuer */
  iss: "zehire";
  /** Audience */
  aud: "zehire-api";
  /** User email */
  email: string;
  /** User role */
  role: UserRole;
  /** Issued at (Unix timestamp) */
  iat: number;
  /** Expiration (Unix timestamp) */
  exp: number;
}

/**
 * Session configuration.
 */
export interface SessionConfig {
  /** Secret key for signing JWTs */
  secret: string;
  /** Session TTL in seconds */
  ttlSeconds: number;
  /** Cookie name */
  cookieName: string;
  /** Whether to use secure cookies (HTTPS only) */
  secure: boolean;
}

// =============================================================================
// AUTH SERVICE
// =============================================================================

/**
 * Login request input.
 */
export interface LoginInput {
  email: string;
}

/**
 * Login result.
 */
export type LoginResult =
  | { success: true }
  | { success: false; error: "INVALID_EMAIL" | "EMAIL_NOT_REGISTERED" };

/**
 * Callback result.
 */
export type CallbackResult =
  | { success: true; user: UserClaims; sessionToken: string }
  | { success: false; error: "INVALID_TOKEN" | "TOKEN_EXPIRED" | "TOKEN_ALREADY_USED" };

// =============================================================================
// AUTH ERRORS
// =============================================================================

export const AUTH_ERROR_CODES = [
  "INVALID_EMAIL",
  "EMAIL_NOT_REGISTERED",
  "INVALID_TOKEN",
  "TOKEN_EXPIRED",
  "TOKEN_ALREADY_USED",
  "UNAUTHORIZED",
  "FORBIDDEN",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];
