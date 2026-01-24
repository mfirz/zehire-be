/**
 * OAuth Callback Routes
 * =====================
 * Handles OAuth callbacks for calendar and video provider connections.
 *
 * Endpoints:
 * - GET /oauth/callback - Handle OAuth callback from providers
 *
 * The callback URL should be set in provider settings (e.g., Google Cloud Console)
 * as: https://your-backend.workers.dev/oauth/callback
 */

import { Hono } from "hono";

import { InterviewerRepository } from "../../domain/interviewers";
import { CalendarService, createCalendarProvider } from "../../domain/calendar";
import type { Env } from "../../types/bindings";

interface OAuthState {
  token?: string; // Interviewer magic token (for calendar OAuth)
  orgId?: string; // Org ID (for video OAuth)
  provider: string;
}

const oauthRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /oauth/callback
 *
 * Handle OAuth callback from Google/Outlook/etc.
 * Exchanges authorization code for tokens and stores them.
 */
oauthRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  const error = c.req.query("error");

  // Get frontend URL for redirects
  const frontendUrl = c.env.APP_BASE_URL || "http://localhost:9977";

  // Handle OAuth errors from provider
  if (error) {
    console.error(`[OAuth] Provider returned error: ${error}`);
    return c.redirect(`${frontendUrl}/oauth/error?error=${encodeURIComponent(error)}`);
  }

  if (!code || !stateParam) {
    console.error("[OAuth] Missing code or state parameter");
    return c.redirect(`${frontendUrl}/oauth/error?error=missing_params`);
  }

  // Decode state
  let state: OAuthState;
  try {
    state = JSON.parse(atob(stateParam)) as OAuthState;
  } catch {
    console.error("[OAuth] Failed to decode state parameter");
    return c.redirect(`${frontendUrl}/oauth/error?error=invalid_state`);
  }

  const { token, provider } = state;

  // Currently only interviewer calendar OAuth is supported
  if (!token) {
    console.error("[OAuth] No interviewer token in state");
    return c.redirect(`${frontendUrl}/oauth/error?error=missing_token`);
  }

  // Validate interviewer token
  const interviewerRepo = new InterviewerRepository(c.env.DB);
  const interviewer = await interviewerRepo.findByMagicToken(token);

  if (!interviewer) {
    console.error("[OAuth] Invalid or expired interviewer token");
    return c.redirect(`${frontendUrl}/oauth/error?error=invalid_token`);
  }

  try {
    // Create calendar provider and exchange code for tokens
    const calendarProvider = createCalendarProvider(
      provider as "google" | "outlook",
      c.env as unknown as Record<string, string>
    );

    // Exchange authorization code for tokens
    const tokens = await calendarProvider.exchangeCodeForTokens(code);

    // Create calendar service for token encryption
    const calendarService = new CalendarService(c.env as unknown as Record<string, string>);

    // Encrypt tokens for storage
    const encryptedTokens = await calendarService.encryptTokensForStorage(tokens);

    // Update interviewer with calendar connection
    await interviewerRepo.updateCalendarConnection(interviewer.id, {
      calendarProvider: provider as "google" | "outlook",
      calendarConnected: true,
      calendarTokens: encryptedTokens,
      calendarId: "primary", // Default to primary calendar
      connectedAt: new Date().toISOString(),
    });

    console.log(`[OAuth] Successfully connected ${provider} calendar for interviewer ${interviewer.id}`);

    // Redirect to success page (interviewer portal)
    return c.redirect(`${frontendUrl}/i/${token}?calendar_connected=true`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`[OAuth] Failed to exchange code: ${errorMessage}`);
    return c.redirect(
      `${frontendUrl}/i/${token}?calendar_error=${encodeURIComponent(errorMessage)}`
    );
  }
});

export default oauthRoutes;
