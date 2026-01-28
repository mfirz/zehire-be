/**
 * SSO Provider Types
 * ==================
 * Type definitions for extensible SSO authentication.
 *
 * Design:
 * - Generic SSOProvider interface all providers implement
 * - Easy to add new providers (Microsoft, GitHub, etc.)
 * - Consistent error handling across providers
 */

// =============================================================================
// PROVIDER TYPES
// =============================================================================

/**
 * Supported SSO provider types.
 * Add new providers here as they're implemented.
 */
export type SSOProviderType = "google" | "microsoft" | "github";

/**
 * Configuration required for all SSO providers.
 */
export interface SSOProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// =============================================================================
// SSO PROVIDER INTERFACE
// =============================================================================

/**
 * Interface that all SSO providers must implement.
 *
 * To add a new provider:
 * 1. Create a new class implementing this interface
 * 2. Add the provider type to SSOProviderType
 * 3. Add the case to createSSOProvider factory
 */
export interface SSOProvider {
  /**
   * Provider type identifier.
   */
  readonly type: SSOProviderType;

  /**
   * Generate the authorization URL for OAuth redirect.
   *
   * @param state - State parameter for CSRF protection and return URL
   * @returns Full authorization URL to redirect the user to
   */
  getAuthorizationUrl(state: string): string;

  /**
   * Exchange authorization code for access token.
   *
   * @param code - Authorization code from OAuth callback
   * @returns Access token (we don't need refresh tokens for SSO)
   */
  exchangeCodeForTokens(code: string): Promise<{ accessToken: string }>;

  /**
   * Get user's email address using the access token.
   *
   * @param accessToken - Access token from token exchange
   * @returns User's verified email address
   */
  getUserEmail(accessToken: string): Promise<string>;
}

// =============================================================================
// LOGIN RESULT TYPES
// =============================================================================

/**
 * SSO login error codes.
 */
export type SSOLoginError = "USER_NOT_REGISTERED" | "NO_ORGANIZATION";

/**
 * Result of SSO login attempt.
 */
export type SSOLoginResult =
  | {
      success: true;
      sessionToken: string;
      user: {
        userId: string;
        email: string;
        role: string;
        orgId: string;
      };
    }
  | {
      success: false;
      error: SSOLoginError;
    };
