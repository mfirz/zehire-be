/**
 * API Key Authentication Middleware
 * ==================================
 * Basic API key validation for protected routes.
 *
 * Expects: Authorization: Bearer <api_key>
 */

import type { Context, Next } from "hono";
import type { Env } from "../types/bindings";

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

  console.log("providedKey", providedKey, expectedKey);

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
