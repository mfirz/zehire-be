/**
 * Google SSO Provider
 * ===================
 * Implements SSO authentication using Google OAuth 2.0.
 *
 * Flow:
 * 1. User clicks "Sign in with Google"
 * 2. Redirect to Google authorization URL
 * 3. User authorizes, Google redirects back with code
 * 4. Exchange code for access token
 * 5. Fetch user email from Google userinfo endpoint
 * 6. Look up user by email and create session
 *
 * Docs: https://developers.google.com/identity/protocols/oauth2/web-server
 */

import type { SSOProvider, SSOProviderConfig } from "../types";

// =============================================================================
// TYPES
// =============================================================================

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  id_token?: string;
}

interface GoogleUserInfoResponse {
  id: string;
  email: string;
  verified_email: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

// =============================================================================
// GOOGLE SSO PROVIDER
// =============================================================================

export class GoogleSSOProvider implements SSOProvider {
  readonly type = "google" as const;

  // Google OAuth 2.0 endpoints
  private readonly authUrl = "https://accounts.google.com/o/oauth2/v2/auth";
  private readonly tokenUrl = "https://oauth2.googleapis.com/token";
  private readonly userInfoUrl = "https://www.googleapis.com/oauth2/v2/userinfo";

  // Required scopes for SSO (minimal: just need email)
  private readonly scopes = ["openid", "email"];

  constructor(private readonly config: SSOProviderConfig) {}

  /**
   * Generate Google OAuth authorization URL.
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: this.scopes.join(" "),
      state: state,
      // Use select_account to allow choosing between multiple Google accounts
      prompt: "select_account",
      // Request email verification status
      access_type: "online",
    });

    return `${this.authUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token.
   */
  async exchangeCodeForTokens(code: string): Promise<{ accessToken: string }> {
    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[GoogleSSO] Token exchange failed:", errorText);
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    const data = (await response.json()) as GoogleTokenResponse;

    return {
      accessToken: data.access_token,
    };
  }

  /**
   * Get user email from Google userinfo endpoint.
   */
  async getUserEmail(accessToken: string): Promise<string> {
    const response = await fetch(this.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[GoogleSSO] Userinfo fetch failed:", errorText);
      throw new Error(`Failed to fetch user info: ${response.status}`);
    }

    const userInfo = (await response.json()) as GoogleUserInfoResponse;

    // Ensure email is verified
    if (!userInfo.verified_email) {
      throw new Error("Email not verified with Google");
    }

    if (!userInfo.email) {
      throw new Error("No email in Google response");
    }

    return userInfo.email.toLowerCase();
  }
}
