/**
 * Calendar-Native Video Provider
 * ==============================
 * A special provider that delegates video call creation to the CalendarProvider.
 *
 * When org.videoCallProvider is "calendar_native", video calls are created
 * through the interviewer's calendar integration (Google Meet for Google Calendar,
 * Teams for Outlook Calendar).
 *
 * This provider implements the VideoCallProvider interface but throws for most
 * methods, since the actual video call creation is handled by CalendarProvider.createEvent()
 * with createVideoCall: true.
 */

import type {
  VideoCallProvider,
  VideoTokens,
  VideoMeetingInput,
  VideoMeeting,
} from "../types";

export class CalendarNativeProvider implements VideoCallProvider {
  /**
   * The type is "google_meet" or "teams" based on the interviewer's calendar,
   * but we use a generic type here since it varies.
   */
  readonly type = "google_meet" as const;

  /**
   * Calendar-native providers do NOT require org-level OAuth.
   * They use the interviewer's calendar tokens.
   */
  requiresOrgAuth(): boolean {
    return false;
  }

  // ===========================================================================
  // OAuth methods - Not used for calendar-native
  // ===========================================================================

  getAuthorizationUrl(): string {
    throw new Error(
      "Calendar-native provider uses interviewer's calendar OAuth. " +
        "Connect calendar through /i/:token/connect/:provider instead."
    );
  }

  exchangeCodeForTokens(): Promise<VideoTokens> {
    throw new Error(
      "Calendar-native provider uses interviewer's calendar OAuth. " +
        "Connect calendar through /i/:token/connect/:provider instead."
    );
  }

  refreshAccessToken(): Promise<VideoTokens> {
    throw new Error(
      "Calendar-native provider uses interviewer's calendar OAuth. " +
        "Token refresh is handled by CalendarService."
    );
  }

  needsRefresh(): boolean {
    // Refresh is handled by CalendarService when getting calendar tokens
    return false;
  }

  // ===========================================================================
  // Meeting methods - Should use CalendarProvider instead
  // ===========================================================================

  async createMeeting(_tokens: VideoTokens, _input: VideoMeetingInput): Promise<VideoMeeting> {
    throw new Error(
      "Calendar-native video calls are created through CalendarProvider.createEvent() " +
        "with createVideoCall: true. Use CalendarService.createEvents() instead."
    );
  }

  async deleteMeeting(): Promise<void> {
    throw new Error(
      "Calendar-native video calls are deleted through CalendarProvider.deleteEvent(). " +
        "Use CalendarService.deleteEvents() instead."
    );
  }

  async updateMeeting(): Promise<VideoMeeting> {
    throw new Error(
      "Calendar-native video calls are updated through CalendarProvider.updateEvent(). " +
        "Use CalendarService.updateEvents() instead."
    );
  }
}
