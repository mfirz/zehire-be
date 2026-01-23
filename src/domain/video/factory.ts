/**
 * Video Provider Factory
 * ======================
 * Creates the appropriate video provider based on type.
 */

import type { VideoCallProvider, VideoProviderType } from "./types";
import { ZoomProvider } from "./providers/zoom";
import { CalendarNativeProvider } from "./providers/calendar-native";

/**
 * Allowed video provider types including calendar_native.
 */
export type VideoProviderTypeWithNative = VideoProviderType | "calendar_native";

/**
 * Create a video provider instance.
 *
 * @param type - The video provider type
 * @param env - Environment variables containing OAuth credentials
 * @returns VideoCallProvider instance
 * @throws Error if required environment variables are missing
 */
export function createVideoProvider(
  type: VideoProviderTypeWithNative,
  env: Record<string, string | undefined>
): VideoCallProvider {
  switch (type) {
    case "zoom": {
      const clientId = env.ZOOM_CLIENT_ID;
      const clientSecret = env.ZOOM_CLIENT_SECRET;
      const redirectUri = env.ZOOM_REDIRECT_URI;

      if (!clientId || !clientSecret || !redirectUri) {
        throw new Error(
          "Zoom OAuth requires ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, and ZOOM_REDIRECT_URI"
        );
      }

      return new ZoomProvider({
        ZOOM_CLIENT_ID: clientId,
        ZOOM_CLIENT_SECRET: clientSecret,
        ZOOM_REDIRECT_URI: redirectUri,
      });
    }
    case "calendar_native":
    case "google_meet":
    case "teams":
      // All calendar-native variants use the same provider
      return new CalendarNativeProvider();
    default:
      throw new Error(`Unknown video provider: ${type}`);
  }
}
