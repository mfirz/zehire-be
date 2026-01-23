/**
 * Calendar Provider Factory
 * =========================
 * Creates the appropriate calendar provider based on type.
 */

import type { CalendarProvider, CalendarProviderType } from "./types";
import { GoogleCalendarProvider } from "./providers/google";

/**
 * Create a calendar provider instance.
 *
 * @param type - The calendar provider type
 * @param env - Environment variables containing OAuth credentials
 * @returns CalendarProvider instance
 * @throws Error if required environment variables are missing
 */
export function createCalendarProvider(
  type: CalendarProviderType,
  env: Record<string, string | undefined>
): CalendarProvider {
  switch (type) {
    case "google": {
      const clientId = env.GOOGLE_CLIENT_ID;
      const clientSecret = env.GOOGLE_CLIENT_SECRET;
      const redirectUri = env.GOOGLE_REDIRECT_URI;

      if (!clientId || !clientSecret || !redirectUri) {
        throw new Error(
          "Google Calendar OAuth requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI"
        );
      }

      return new GoogleCalendarProvider({
        GOOGLE_CLIENT_ID: clientId,
        GOOGLE_CLIENT_SECRET: clientSecret,
        GOOGLE_REDIRECT_URI: redirectUri,
      });
    }
    case "outlook":
      // Future: OutlookCalendarProvider
      throw new Error("Outlook Calendar provider not yet implemented");
    case "apple":
      // Future: AppleCalendarProvider
      throw new Error("Apple Calendar provider not yet implemented");
    default:
      throw new Error(`Unknown calendar provider: ${type}`);
  }
}
