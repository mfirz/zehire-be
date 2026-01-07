/**
 * Auth Routes
 * ===========
 * HTTP endpoints for magic link authentication.
 *
 * Endpoints:
 * - POST /auth/login  - Initiate magic link login
 * - GET  /auth/callback - Complete magic link authentication
 * - POST /auth/logout - Clear session (optional)
 * - GET  /auth/me     - Get current user (optional)
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../types/bindings";
import { createEmailGatewayFromEnv } from "../email/email.gateway";
import { AuthService } from "./auth.service";
import { SessionService } from "./session.service";

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
  auth.post("/login", async (c) => {
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

    const user = await authService.verifySessionFromHeaders(authHeader, cookieHeader);

    if (!user) {
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

    return c.json({
      user: {
        id: user.userId,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
      },
    });
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
  };
  return messages[code] ?? "An error occurred";
}
