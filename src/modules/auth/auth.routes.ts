/**
 * Auth Routes
 * ===========
 * HTTP endpoints for authentication (magic link and SSO).
 *
 * Magic Link Endpoints:
 * - POST /auth/login  - Initiate magic link login
 * - GET  /auth/callback - Complete magic link authentication
 * - POST /auth/logout - Clear session
 * - GET  /auth/me     - Get current user
 *
 * SSO Endpoints:
 * - GET  /auth/sso/:provider - Initiate SSO login (e.g., /auth/sso/google)
 * - GET  /auth/sso/:provider/callback - Handle SSO callback
 *
 * OAuth Integration Endpoints:
 * - GET  /auth/calendar/:provider/callback - OAuth callback for calendar connection
 * - GET  /auth/video/:provider/callback - OAuth callback for video provider
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../types/bindings";
import { createEmailGatewayFromEnv } from "../email/email.gateway";
import { AuthService } from "./auth.service";
import { SessionService } from "./session.service";
import {
  createCalendarProvider,
  type CalendarProviderType,
  type CalendarTokens,
} from "../../domain/calendar";
import {
  createVideoProvider,
  type VideoProviderType,
  type VideoTokens,
} from "../../domain/video";
import { InterviewerRepository } from "../../domain/interviewers";
import { encryptTokens, createSignedState, verifySignedState } from "../../lib/crypto";
import { createDb, orgs } from "../../db";
import { eq } from "drizzle-orm";
import { createSSOProvider, isSupportedSSOProvider, type SSOProviderType } from "./sso";
import { loginRateLimiter } from "../../middleware/rate-limit";

// =============================================================================
// SCHEMAS
// =============================================================================

const LoginRequestSchema = z.object({
  email: z.string().email("Invalid email format"),
});

// =============================================================================
// ROUTE FACTORY
// =============================================================================

/**
 * Create auth routes with environment-specific configuration.
 */
export function createAuthRoutes(): Hono<{ Bindings: Env }> {
  const auth = new Hono<{ Bindings: Env }>();

  // ===========================================================================
  // POST /auth/login
  // ===========================================================================
  auth.post("/login", loginRateLimiter, async (c) => {
    // Parse and validate request body
    const body: unknown = await c.req.json();
    const parseResult = LoginRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return c.json(
        {
          error: {
            code: "INVALID_EMAIL",
            message: parseResult.error.errors[0]?.message ?? "Invalid email",
          },
        },
        400
      );
    }

    // Create auth service with waitUntil for non-blocking email delivery
    const authService = createAuthService(c.env, (promise) => c.executionCtx.waitUntil(promise));

    // Attempt login
    const result = await authService.login(parseResult.data.email);

    if (!result.success) {
      const statusCode = result.error === "EMAIL_NOT_REGISTERED" ? 404 : 400;
      return c.json(
        {
          error: {
            code: result.error,
            message: getErrorMessage(result.error),
          },
        },
        statusCode
      );
    }

    // Return 204 No Content on success
    return new Response(null, { status: 204 });
  });

  // ===========================================================================
  // GET /auth/callback
  // ===========================================================================
  auth.get("/callback", async (c) => {
    const token = c.req.query("token");

    if (!token) {
      return c.json(
        {
          error: {
            code: "INVALID_TOKEN",
            message: "Missing token parameter",
          },
        },
        400
      );
    }

    // Create auth service
    const authService = createAuthService(c.env);

    // Validate token and create session
    const result = await authService.callback(token);

    if (!result.success) {
      const statusCode = result.error === "TOKEN_EXPIRED" ? 410 : 400;
      return c.json(
        {
          error: {
            code: result.error,
            message: getErrorMessage(result.error),
          },
        },
        statusCode
      );
    }

    // Set session cookie
    const cookieHeader = authService.getSessionCookieHeader(result.sessionToken);

    // Return user info with session cookie
    return c.json(
      {
        user: {
          id: result.user.userId,
          email: result.user.email,
          role: result.user.role,
        },
      },
      200,
      {
        "Set-Cookie": cookieHeader,
      }
    );
  });

  // ===========================================================================
  // POST /auth/logout
  // ===========================================================================
  auth.post("/logout", (c) => {
    const authService = createAuthService(c.env);
    const clearCookie = authService.getClearSessionCookieHeader();

    return new Response(null, {
      status: 204,
      headers: {
        "Set-Cookie": clearCookie,
      },
    });
  });

  // ===========================================================================
  // GET /auth/me
  // ===========================================================================
  auth.get("/me", async (c) => {
    const authService = createAuthService(c.env);

    // Try Authorization header first, then Cookie
    const authHeader = c.req.header("Authorization") ?? null;
    const cookieHeader = c.req.header("Cookie") ?? null;

    const claims = await authService.verifySessionFromHeaders(authHeader, cookieHeader);

    if (!claims) {
      return c.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Not authenticated",
          },
        },
        401
      );
    }

    // Fetch user from DB to get latest data including name
    const user = await authService.findUserByEmail(claims.email);

    if (!user) {
      return c.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "User not found",
          },
        },
        401
      );
    }

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: user.org_id,
      },
    });
  });

  // ===========================================================================
  // GET /auth/calendar/:provider/callback
  // ===========================================================================
  auth.get("/calendar/:provider/callback", async (c) => {
    const providerType = c.req.param("provider") as CalendarProviderType;
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    // Handle OAuth error (user denied access)
    if (error) {
      const appBaseUrl = c.env.APP_BASE_URL || "";
      return c.redirect(`${appBaseUrl}/i/error?error=${encodeURIComponent(error)}`);
    }

    // Validate required parameters
    if (!code || !state) {
      return c.json(
        {
          error: {
            code: "INVALID_CALLBACK",
            message: "Missing code or state parameter",
          },
        },
        400
      );
    }

    try {
      // Verify HMAC signature and decode state
      const stateData = await verifySignedState<{ token: string; provider: CalendarProviderType }>(
        state,
        c.env.AUTH_JWT_SECRET,
      );

      if (!stateData) {
        return c.json(
          {
            error: {
              code: "INVALID_STATE",
              message: "Invalid or tampered state parameter",
            },
          },
          400
        );
      }

      // Verify provider matches
      if (stateData.provider !== providerType) {
        return c.json(
          {
            error: {
              code: "INVALID_STATE",
              message: "Provider mismatch in state",
            },
          },
          400
        );
      }

      // Validate interviewer token
      const repo = new InterviewerRepository(c.env.DB);
      const interviewer = await repo.findByMagicToken(stateData.token);

      if (!interviewer) {
        return c.json(
          {
            error: {
              code: "INVALID_TOKEN",
              message: "Invalid or expired interviewer token",
            },
          },
          401
        );
      }

      // Exchange code for tokens
      const provider = createCalendarProvider(
        providerType,
        c.env as unknown as Record<string, string>
      );
      const tokens = await provider.exchangeCodeForTokens(code);

      // Encrypt tokens for storage
      const encryptionKey = c.env.TOKEN_ENCRYPTION_KEY;
      if (!encryptionKey) {
        throw new Error("TOKEN_ENCRYPTION_KEY is required");
      }
      const encryptedTokens = await encryptTokens(tokens as CalendarTokens, encryptionKey);

      // Update interviewer with calendar connection
      await repo.updateCalendarConnection(interviewer.id, {
        calendarProvider: providerType,
        calendarConnected: true,
        calendarTokens: encryptedTokens,
        calendarId: "primary", // Default to primary calendar
        connectedAt: new Date().toISOString(),
      });

      // Redirect back to interviewer dashboard
      const appBaseUrl = c.env.APP_BASE_URL || "";
      return c.redirect(`${appBaseUrl}/i/${stateData.token}?calendar=connected`);
    } catch (err) {
      console.error("Calendar OAuth callback error:", err);

      // Try to redirect with error, but handle case where state is invalid
      const fallbackState = await verifySignedState<{ token: string }>(state, c.env.AUTH_JWT_SECRET);
      if (fallbackState?.token) {
        const appBaseUrl = c.env.APP_BASE_URL || "";
        return c.redirect(
          `${appBaseUrl}/i/${fallbackState.token}?error=${encodeURIComponent("Failed to connect calendar")}`
        );
      }
      return c.json(
        {
          error: {
            code: "OAUTH_ERROR",
            message: err instanceof Error ? err.message : "OAuth callback failed",
          },
        },
        500
      );
    }
  });

  // ===========================================================================
  // GET /auth/video/:provider/callback
  // ===========================================================================
  auth.get("/video/:provider/callback", async (c) => {
    const providerType = c.req.param("provider") as VideoProviderType;
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    // Handle OAuth error (user denied access)
    if (error) {
      const appBaseUrl = c.env.APP_BASE_URL || "";
      return c.redirect(`${appBaseUrl}/settings?video_error=${encodeURIComponent(error)}`);
    }

    // Validate required parameters
    if (!code || !state) {
      return c.json(
        {
          error: {
            code: "INVALID_CALLBACK",
            message: "Missing code or state parameter",
          },
        },
        400
      );
    }

    try {
      // Verify HMAC signature and decode state
      const stateData = await verifySignedState<{ orgId: string; provider: VideoProviderType }>(
        state,
        c.env.AUTH_JWT_SECRET,
      );

      if (!stateData) {
        return c.json(
          {
            error: {
              code: "INVALID_STATE",
              message: "Invalid or tampered state parameter",
            },
          },
          400
        );
      }

      // Verify provider matches
      if (stateData.provider !== providerType) {
        return c.json(
          {
            error: {
              code: "INVALID_STATE",
              message: "Provider mismatch in state",
            },
          },
          400
        );
      }

      // Verify org exists
      const db = createDb(c.env.DB);
      const org = await db.select().from(orgs).where(eq(orgs.id, stateData.orgId)).get();

      if (!org) {
        return c.json(
          {
            error: {
              code: "INVALID_ORG",
              message: "Organization not found",
            },
          },
          404
        );
      }

      // Exchange code for tokens
      const provider = createVideoProvider(
        providerType,
        c.env as unknown as Record<string, string>
      );
      const tokens = await provider.exchangeCodeForTokens(code);

      // Encrypt tokens for storage
      const encryptionKey = c.env.TOKEN_ENCRYPTION_KEY;
      if (!encryptionKey) {
        throw new Error("TOKEN_ENCRYPTION_KEY is required");
      }
      const encryptedTokens = await encryptTokens(tokens as VideoTokens, encryptionKey);

      const now = new Date().toISOString();

      // Update org with video connection
      await db
        .update(orgs)
        .set({
          videoCallProvider: providerType,
          videoTokens: encryptedTokens,
          videoConnectedAt: now,
          updatedAt: now,
        })
        .where(eq(orgs.id, stateData.orgId));

      // Redirect back to settings page
      const appBaseUrl = c.env.APP_BASE_URL || "";
      return c.redirect(`${appBaseUrl}/settings?video=connected`);
    } catch (err) {
      console.error("Video OAuth callback error:", err);

      // Try to redirect with error
      const appBaseUrl = c.env.APP_BASE_URL || "";
      return c.redirect(
        `${appBaseUrl}/settings?video_error=${encodeURIComponent("Failed to connect video provider")}`
      );
    }
  });

  // ===========================================================================
  // GET /auth/sso/:provider - Initiate SSO login
  // ===========================================================================
  auth.get("/sso/:provider", async (c) => {
    const providerType = c.req.param("provider");
    const returnUrl = c.req.query("returnUrl") || "/";
    const appBaseUrl = c.env.APP_BASE_URL || "";

    // Validate provider type
    if (!isSupportedSSOProvider(providerType)) {
      return c.redirect(`${appBaseUrl}/login?error=invalid_provider`);
    }

    try {
      // Create SSO provider
      const provider = createSSOProvider(providerType as SSOProviderType, c.env);

      // Generate HMAC-signed state for CSRF protection and integrity
      const state = await createSignedState(
        {
          returnUrl,
          provider: providerType,
          nonce: crypto.randomUUID(),
        },
        c.env.AUTH_JWT_SECRET,
      );

      // Redirect to provider authorization URL
      return c.redirect(provider.getAuthorizationUrl(state));
    } catch (err) {
      console.error("SSO initiation error:", err);
      return c.redirect(`${appBaseUrl}/login?error=sso_unavailable`);
    }
  });

  // ===========================================================================
  // GET /auth/sso/:provider/callback - Handle SSO callback
  // ===========================================================================
  auth.get("/sso/:provider/callback", async (c) => {
    const providerType = c.req.param("provider");
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");
    const appBaseUrl = c.env.APP_BASE_URL || "";

    // Handle OAuth error (user denied access)
    if (error) {
      console.error("SSO OAuth error:", error);
      return c.redirect(`${appBaseUrl}/login?error=auth_failed`);
    }

    // Validate provider type
    if (!isSupportedSSOProvider(providerType)) {
      return c.redirect(`${appBaseUrl}/login?error=invalid_provider`);
    }

    // Validate required parameters
    if (!code || !state) {
      return c.redirect(`${appBaseUrl}/login?error=invalid_state`);
    }

    try {
      // Verify HMAC signature and decode state
      const stateData = await verifySignedState<{
        returnUrl: string;
        provider: string;
        nonce: string;
      }>(state, c.env.AUTH_JWT_SECRET);

      if (!stateData) {
        return c.redirect(`${appBaseUrl}/login?error=invalid_state`);
      }

      // Verify provider matches state
      if (stateData.provider !== providerType) {
        return c.redirect(`${appBaseUrl}/login?error=invalid_state`);
      }

      // Create SSO provider
      const provider = createSSOProvider(providerType as SSOProviderType, c.env);

      // Exchange code for tokens
      const { accessToken } = await provider.exchangeCodeForTokens(code);

      // Get user email from provider
      const email = await provider.getUserEmail(accessToken);

      // Create auth service
      const authService = createAuthService(c.env);

      // Attempt to login with email
      const loginResult = await authService.loginWithEmail(email);

      if (!loginResult.success) {
        // Map error codes to user-friendly redirect params
        const errorParam =
          loginResult.error === "USER_NOT_REGISTERED"
            ? "user_not_registered"
            : "no_organization";
        return c.redirect(`${appBaseUrl}/login?error=${errorParam}`);
      }

      // Set session cookie and redirect to return URL
      const cookieHeader = authService.getSessionCookieHeader(loginResult.sessionToken);

      // Sanitize return URL to prevent open redirect
      const safeReturnUrl = getSafeReturnUrl(stateData.returnUrl, appBaseUrl);

      return new Response(null, {
        status: 302,
        headers: {
          Location: safeReturnUrl,
          "Set-Cookie": cookieHeader,
        },
      });
    } catch (err) {
      console.error("SSO callback error:", err);
      return c.redirect(`${appBaseUrl}/login?error=auth_failed`);
    }
  });

  return auth;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Callback for non-blocking background work.
 */
type WaitUntilFn = (promise: Promise<unknown>) => void;

/**
 * Create AuthService with environment configuration.
 *
 * @param env - Worker environment bindings
 * @param waitUntil - Optional callback for non-blocking background work (e.g., email sending)
 */
function createAuthService(env: Env, waitUntil?: WaitUntilFn): AuthService {
  // Validate required environment variables
  if (!env.APP_BASE_URL) {
    throw new Error("APP_BASE_URL is required");
  }
  if (!env.AUTH_TOKEN_TTL_MINUTES) {
    throw new Error("AUTH_TOKEN_TTL_MINUTES is required");
  }
  if (!env.AUTH_JWT_SECRET) {
    throw new Error("AUTH_JWT_SECRET is required");
  }

  const tokenTtlMinutes = parseInt(env.AUTH_TOKEN_TTL_MINUTES, 10);
  if (isNaN(tokenTtlMinutes) || tokenTtlMinutes <= 0) {
    throw new Error("AUTH_TOKEN_TTL_MINUTES must be a positive integer");
  }

  const sessionTtlMinutes = env.AUTH_SESSION_TTL_MINUTES
    ? parseInt(env.AUTH_SESSION_TTL_MINUTES, 10)
    : 1440; // Default 24 hours

  const isProduction = env.ENVIRONMENT === "production";

  const sessionService = new SessionService({
    secret: env.AUTH_JWT_SECRET,
    ttlSeconds: sessionTtlMinutes * 60,
    secure: isProduction,
  });

  const emailGateway = createEmailGatewayFromEnv(env);

  return new AuthService(env.DB, sessionService, emailGateway, {
    appBaseUrl: env.APP_BASE_URL,
    tokenTtlMinutes,
    waitUntil,
  });
}

/**
 * Get human-readable error message for auth errors.
 */
function getErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    INVALID_EMAIL: "Invalid email format",
    EMAIL_NOT_REGISTERED: "Email is not registered",
    INVALID_TOKEN: "Invalid or malformed token",
    TOKEN_EXPIRED: "Token has expired",
    TOKEN_ALREADY_USED: "Token has already been used",
    UNAUTHORIZED: "Not authenticated",
    FORBIDDEN: "Access denied",
    RATE_LIMITED: "Too many requests. Please try again later.",
  };
  return messages[code] ?? "An error occurred";
}

/**
 * Sanitize return URL to prevent open redirect attacks.
 * Only allows relative paths or paths to the same origin.
 */
function getSafeReturnUrl(returnUrl: string, appBaseUrl: string): string {
  // Default to root if no return URL
  if (!returnUrl) {
    return appBaseUrl;
  }

  // If it's a relative path (starts with /), it's safe
  if (returnUrl.startsWith("/") && !returnUrl.startsWith("//")) {
    return `${appBaseUrl}${returnUrl}`;
  }

  // If it's an absolute URL, verify it's the same origin
  try {
    const targetUrl = new URL(returnUrl);
    const baseUrl = new URL(appBaseUrl);

    if (targetUrl.origin === baseUrl.origin) {
      return returnUrl;
    }
  } catch {
    // Invalid URL, fall through to default
  }

  // Default to app root for any suspicious URLs
  return appBaseUrl;
}
