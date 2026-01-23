/**
 * Calendar Provider Types
 * =======================
 * Provider-agnostic types for calendar integrations.
 */

/**
 * Supported calendar provider types.
 */
export type CalendarProviderType = "google" | "outlook" | "apple";

/**
 * OAuth configuration for a calendar provider.
 */
export interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  redirectUri: string;
}

/**
 * OAuth tokens for calendar access.
 * Stored encrypted at rest.
 */
export interface CalendarTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO datetime
  // Provider-specific fields stored here
  [key: string]: unknown;
}

/**
 * A period during which the user is busy.
 */
export interface BusyPeriod {
  start: string; // ISO datetime
  end: string; // ISO datetime
}

/**
 * Input for creating a calendar event.
 */
export interface CalendarEventInput {
  summary: string;
  description: string;
  startTime: string; // ISO datetime
  endTime: string; // ISO datetime
  timezone: string;
  attendees: Array<{ email: string; name?: string }>;
  /** When true, creates a video call (Google Meet/Teams) on the event */
  createVideoCall?: boolean;
}

/**
 * A calendar event returned from creation/update.
 */
export interface CalendarEvent {
  id: string;
  link: string; // Calendar event link (HTML link to view event)
  videoCallLink?: string | undefined; // Video call link if created
}

/**
 * Calendar provider interface.
 * All calendar providers must implement this interface.
 */
export interface CalendarProvider {
  readonly type: CalendarProviderType;

  /**
   * Get OAuth configuration for this provider.
   */
  getOAuthConfig(): OAuthConfig;

  /**
   * Build the OAuth authorization URL.
   */
  getAuthorizationUrl(state: string): string;

  /**
   * Exchange authorization code for tokens.
   */
  exchangeCodeForTokens(code: string): Promise<CalendarTokens>;

  /**
   * Refresh expired access token.
   */
  refreshAccessToken(tokens: CalendarTokens): Promise<CalendarTokens>;

  /**
   * Check if tokens need refresh.
   */
  needsRefresh(tokens: CalendarTokens): boolean;

  /**
   * Get free/busy information for a date range.
   */
  getFreeBusy(
    tokens: CalendarTokens,
    calendarId: string,
    startDate: Date,
    endDate: Date
  ): Promise<BusyPeriod[]>;

  /**
   * Create a calendar event.
   */
  createEvent(
    tokens: CalendarTokens,
    calendarId: string,
    event: CalendarEventInput
  ): Promise<CalendarEvent>;

  /**
   * Delete a calendar event.
   */
  deleteEvent(
    tokens: CalendarTokens,
    calendarId: string,
    eventId: string
  ): Promise<void>;

  /**
   * Update a calendar event.
   */
  updateEvent(
    tokens: CalendarTokens,
    calendarId: string,
    eventId: string,
    event: Partial<CalendarEventInput>
  ): Promise<CalendarEvent>;
}

/**
 * Environment variables required for Google Calendar provider.
 */
export interface GoogleCalendarEnv {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
}

/**
 * Environment variables required for Outlook Calendar provider.
 */
export interface OutlookCalendarEnv {
  OUTLOOK_CLIENT_ID: string;
  OUTLOOK_CLIENT_SECRET: string;
  OUTLOOK_REDIRECT_URI: string;
}
