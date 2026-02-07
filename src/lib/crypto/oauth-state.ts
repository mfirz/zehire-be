/**
 * OAuth State Signing
 * ===================
 * HMAC-SHA256 signing for OAuth state parameters to prevent tampering.
 *
 * Security:
 * - Uses Web Crypto API (available in Cloudflare Workers)
 * - HMAC-SHA256 ensures state integrity
 * - Constant-time comparison prevents timing attacks
 * - State is base64-encoded with embedded signature
 */

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Create an HMAC-signed OAuth state parameter.
 *
 * Encodes the payload as JSON, signs it with HMAC-SHA256,
 * and returns a base64-encoded string containing both payload and signature.
 *
 * @param payload - The state data to sign
 * @param secret - Secret key for HMAC signing (e.g., AUTH_JWT_SECRET)
 * @returns Base64-encoded signed state string
 */
export async function createSignedState(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const payloadJson = JSON.stringify(payload);
  const signature = await hmacSign(payloadJson, secret);
  return btoa(JSON.stringify({ p: payloadJson, s: signature }));
}

/**
 * Verify and decode an HMAC-signed OAuth state parameter.
 *
 * Decodes the base64 string, verifies the HMAC-SHA256 signature,
 * and returns the original payload if valid.
 *
 * @param state - Base64-encoded signed state string
 * @param secret - Secret key for HMAC verification (must match signing key)
 * @returns The verified payload, or null if invalid/tampered
 */
export async function verifySignedState<T = Record<string, unknown>>(
  state: string,
  secret: string,
): Promise<T | null> {
  try {
    const decoded = JSON.parse(atob(state)) as { p: string; s: string };

    if (!decoded.p || !decoded.s) {
      return null;
    }

    const expectedSignature = await hmacSign(decoded.p, secret);

    if (!timingSafeEqual(decoded.s, expectedSignature)) {
      return null;
    }

    return JSON.parse(decoded.p) as T;
  } catch {
    return null;
  }
}

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/**
 * Create HMAC-SHA256 signature using Web Crypto API.
 */
async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  return bytesToBase64Url(new Uint8Array(signature));
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

/**
 * Convert bytes to URL-safe base64 string.
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
