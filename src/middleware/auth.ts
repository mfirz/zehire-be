/**
 * Authentication Middleware
 * =========================
 * Middleware functions for API authentication.
 *
 * - jwtAuth: JWT-based authentication for protected endpoints
 * - apiKeyAuth: Legacy API key authentication (deprecated)
 */

import type { Context, Next } from "hono";
import { SessionService } from "../modules/auth/session.service";
import type { AuthVariables, Env } from "../types/bindings";

/**
 * Middleware that validates API key from Authorization header.
 *
 * @example
 * ```typescript
 * import { apiKeyAuth } from "@/middleware/auth";
 *
 * const app = new Hono<{ Bindings: Env }>();
 * app.use("/v1/*", apiKeyAuth);
 * ```
 */
export async function apiKeyAuth(
  c: Context<{ Bindings: Env }>,
  next: Next
): Promise<Response | void> {
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Missing Authorization header",
        },
      },
      401
    );
  }

  // Expect: Bearer <api_key>
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid Authorization header format. Expected: Bearer <api_key>",
        },
      },
      401
    );
  }

  const providedKey = match[1];
  const expectedKey = c.env.API_KEY;

  // Constant-time comparison to prevent timing attacks
  // providedKey is guaranteed to exist by the regex match above
  if (!providedKey || !expectedKey || !timingSafeEqual(providedKey, expectedKey)) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid API key",
        },
      },
      401
    );
  }

  await next();
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// =============================================================================
// JWT AUTHENTICATION MIDDLEWARE
// =============================================================================

/**
 * Middleware that validates JWT from Authorization header.
 *
 * Extracts and verifies JWT, then attaches user claims to the context.
 * Protected routes can access the authenticated user via `c.get("user")`.
 *
 * JWT Requirements:
 * - Header: Authorization: Bearer <jwt>
 * - Claims: sub (userId), iss (zehire), aud (zehire-api), exp, iat
 *
 * @example
 * ```typescript
 * import { jwtAuth } from "@/middleware/auth";
 *
 * const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
 * app.use("/v1/*", jwtAuth);
 *
 * app.get("/v1/me", (c) => {
 *   const user = c.get("user");
 *   return c.json({ userId: user.userId });
 * });
 * ```
 */
export async function jwtAuth(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
  next: Next
): Promise<Response | void> {
  const authHeader = c.req.header("Authorization");

  // Create session service with JWT secret
  const sessionService = new SessionService({
    secret: c.env.AUTH_JWT_SECRET,
  });

  // Extract token from Authorization header
  const token = sessionService.extractTokenFromAuthHeader(authHeader ?? null);

  if (!token) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid Authorization header. Expected: Bearer <jwt>",
        },
      },
      401
    );
  }

  // Verify JWT and extract claims
  const user = await sessionService.verifySession(token);

  if (!user) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or expired JWT",
        },
      },
      401
    );
  }

  // Attach user to context for downstream handlers
  c.set("user", user);

  await next();
}
