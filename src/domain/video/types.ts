/**
 * Video Call Provider Types
 * =========================
 * Provider-agnostic types for video call integrations.
 */

/**
 * Supported video provider types.
 */
export type VideoProviderType = "zoom" | "google_meet" | "teams";

/**
 * OAuth tokens for video provider access.
 * Stored encrypted at rest in org record.
 */
export interface VideoTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO datetime
  // Provider-specific fields stored here
  [key: string]: unknown;
}

/**
 * Input for creating a video meeting.
 */
export interface VideoMeetingInput {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  attendees: Array<{ email: string; name?: string }>;
}

/**
 * A video meeting returned from creation/update.
 */
export interface VideoMeeting {
  id: string;
  joinUrl: string; // For all participants
  hostUrl?: string | undefined; // Some providers have separate host URL
  password?: string | undefined; // Some providers require password
  dialIn?: string | undefined; // Phone dial-in info
}

/**
 * Video call provider interface.
 * All video providers must implement this interface.
 */
export interface VideoCallProvider {
  readonly type: VideoProviderType;

  /**
   * Check if this provider requires org-level OAuth.
   * calendar_native providers return false (use interviewer's calendar tokens).
   */
  requiresOrgAuth(): boolean;

  /**
   * Get OAuth authorization URL (for standalone providers like Zoom).
   */
  getAuthorizationUrl(state: string): string;

  /**
   * Exchange authorization code for tokens.
   */
  exchangeCodeForTokens(code: string): Promise<VideoTokens>;

  /**
   * Refresh expired access token.
   */
  refreshAccessToken(tokens: VideoTokens): Promise<VideoTokens>;

  /**
   * Check if tokens need refresh.
   */
  needsRefresh(tokens: VideoTokens): boolean;

  /**
   * Create a video meeting.
   */
  createMeeting(tokens: VideoTokens, input: VideoMeetingInput): Promise<VideoMeeting>;

  /**
   * Delete a video meeting.
   */
  deleteMeeting(tokens: VideoTokens, meetingId: string): Promise<void>;

  /**
   * Update a video meeting.
   */
  updateMeeting(
    tokens: VideoTokens,
    meetingId: string,
    input: Partial<VideoMeetingInput>
  ): Promise<VideoMeeting>;
}

/**
 * Environment variables required for Zoom provider.
 */
export interface ZoomEnv {
  ZOOM_CLIENT_ID: string;
  ZOOM_CLIENT_SECRET: string;
  ZOOM_REDIRECT_URI: string;
}
