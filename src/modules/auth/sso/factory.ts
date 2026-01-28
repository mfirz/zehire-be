/**
 * SSO Provider Factory
 * ====================
 * Creates SSO provider instances based on provider type.
 *
 * To add a new provider:
 * 1. Import the new provider class
 * 2. Add env vars to Env interface
 * 3. Add case to switch statement
 */

import type { Env } from "../../../types/bindings";
import type { SSOProvider, SSOProviderType } from "./types";
import { GoogleSSOProvider } from "./providers/google";

// =============================================================================
// SUPPORTED PROVIDERS
// =============================================================================

/**
 * Set of currently supported SSO providers.
 * Used for validation in routes.
 */
export const SUPPORTED_SSO_PROVIDERS = new Set<SSOProviderType>(["google"]);

/**
 * Check if a provider type is supported.
 */
export function isSupportedSSOProvider(type: string): type is SSOProviderType {
  return SUPPORTED_SSO_PROVIDERS.has(type as SSOProviderType);
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create an SSO provider instance for the given type.
 *
 * @param type - Provider type (google, microsoft, github)
 * @param env - Worker environment bindings
 * @returns Configured SSO provider instance
 * @throws Error if provider is not supported or not configured
 */
export function createSSOProvider(type: SSOProviderType, env: Env): SSOProvider {
  switch (type) {
    case "google":
      return createGoogleProvider(env);

    // Future providers:
    // case "microsoft":
    //   return createMicrosoftProvider(env);
    // case "github":
    //   return createGitHubProvider(env);

    default:
      throw new Error(`Unsupported SSO provider: ${type}`);
  }
}

// =============================================================================
// PROVIDER CREATORS
// =============================================================================

function createGoogleProvider(env: Env): GoogleSSOProvider {
  // Google SSO reuses existing Google OAuth credentials
  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID is required for Google SSO");
  }
  if (!env.GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_SECRET is required for Google SSO");
  }
  if (!env.GOOGLE_SSO_REDIRECT_URI) {
    throw new Error("GOOGLE_SSO_REDIRECT_URI is required for Google SSO");
  }

  return new GoogleSSOProvider({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_SSO_REDIRECT_URI,
  });
}

// Future: Add createMicrosoftProvider, createGitHubProvider
