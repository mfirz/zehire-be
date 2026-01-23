/**
 * Outlook Calendar Provider
 * =========================
 * Implementation of CalendarProvider for Microsoft Graph API (Outlook/Office 365).
 *
 * Uses Microsoft identity platform v2.0 for OAuth.
 * Works with both personal Microsoft accounts and work/school (Azure AD) accounts.
 */

import type {
  CalendarProvider,
  CalendarTokens,
  BusyPeriod,
  CalendarEventInput,
  CalendarEvent,
  OAuthConfig,
  OutlookCalendarEnv,
} from "../types";

// =============================================================================
// Microsoft Graph API Response Types
// =============================================================================

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface MicrosoftScheduleResponse {
  value: Array<{
    scheduleId: string;
    scheduleItems: Array<{
      status: string;
      start: { dateTime: string; timeZone: string };
      end: { dateTime: string; timeZone: string };
    }>;
  }>;
}

interface MicrosoftEventResponse {
  id: string;
  webLink: string;
  onlineMeeting?: {
    joinUrl: string;
  };
}

interface MicrosoftErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

// =============================================================================
// Outlook Calendar Provider
// =============================================================================

export class OutlookCalendarProvider implements CalendarProvider {
  readonly type = "outlook" as const;

  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  // Microsoft identity platform endpoints
  // Using "common" tenant for multi-tenant SaaS (supports both personal and work accounts)
  private static readonly AUTH_URL =
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
  private static readonly TOKEN_URL =
    "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  private static readonly GRAPH_URL = "https://graph.microsoft.com/v1.0";

  // Required scopes for calendar operations
  private static readonly SCOPES = [
    "offline_access", // Required for refresh tokens
    "Calendars.ReadWrite", // Read/write calendar events
    "OnlineMeetings.ReadWrite", // Create Teams meetings
  ];

  constructor(env: OutlookCalendarEnv) {
    this.clientId = env.OUTLOOK_CLIENT_ID;
    this.clientSecret = env.OUTLOOK_CLIENT_SECRET;
    this.redirectUri = env.OUTLOOK_REDIRECT_URI;
  }

  getOAuthConfig(): OAuthConfig {
    return {
      authUrl: OutlookCalendarProvider.AUTH_URL,
      tokenUrl: OutlookCalendarProvider.TOKEN_URL,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      scopes: OutlookCalendarProvider.SCOPES,
      redirectUri: this.redirectUri,
    };
  }

  getAuthorizationUrl(state: string): string {
    const config = this.getOAuthConfig();
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: config.scopes.join(" "),
      response_mode: "query",
      prompt: "consent", // Force consent to get refresh token
      state,
    });
    return `${config.authUrl}?${params}`;
  }

  async exchangeCodeForTokens(code: string): Promise<CalendarTokens> {
    const config = this.getOAuthConfig();

    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
        scope: config.scopes.join(" "),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    const data = (await response.json()) as MicrosoftTokenResponse;

    if (!data.refresh_token) {
      throw new Error(
        "No refresh token received. Ensure offline_access scope is requested and prompt=consent is set."
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }

  async refreshAccessToken(tokens: CalendarTokens): Promise<CalendarTokens> {
    const config = this.getOAuthConfig();

    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: "refresh_token",
        scope: config.scopes.join(" "),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh access token: ${error}`);
    }

    const data = (await response.json()) as MicrosoftTokenResponse;

    return {
      ...tokens,
      accessToken: data.access_token,
      // Microsoft may return a new refresh token
      refreshToken: data.refresh_token || tokens.refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }

  needsRefresh(tokens: CalendarTokens): boolean {
    const expiresAt = new Date(tokens.expiresAt);
    const now = new Date();
    // Refresh if expires in less than 5 minutes
    return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
  }

  async getFreeBusy(
    tokens: CalendarTokens,
    _calendarId: string, // Outlook uses user's primary calendar
    startDate: Date,
    endDate: Date
  ): Promise<BusyPeriod[]> {
    // Microsoft Graph uses getSchedule endpoint for free/busy
    // For the authenticated user, we query their own schedule
    const response = await fetch(
      `${OutlookCalendarProvider.GRAPH_URL}/me/calendar/getSchedule`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schedules: [""], // Empty string = current user
          startTime: {
            dateTime: startDate.toISOString(),
            timeZone: "UTC",
          },
          endTime: {
            dateTime: endDate.toISOString(),
            timeZone: "UTC",
          },
          availabilityViewInterval: 30, // 30-minute slots
        }),
      }
    );

    if (!response.ok) {
      const errorData = (await response.json()) as MicrosoftErrorResponse;
      throw new Error(
        `Failed to get free/busy: ${errorData.error?.message || response.statusText}`
      );
    }

    const data = (await response.json()) as MicrosoftScheduleResponse;

    // Extract busy periods from the response
    const busyPeriods: BusyPeriod[] = [];
    for (const schedule of data.value) {
      for (const item of schedule.scheduleItems) {
        // Only include busy/tentative items
        if (item.status === "busy" || item.status === "tentative") {
          busyPeriods.push({
            start: item.start.dateTime,
            end: item.end.dateTime,
          });
        }
      }
    }

    return busyPeriods;
  }

  async createEvent(
    tokens: CalendarTokens,
    _calendarId: string, // Outlook uses user's primary calendar
    event: CalendarEventInput
  ): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {
      subject: event.summary,
      body: {
        contentType: "text",
        content: event.description,
      },
      start: {
        dateTime: event.startTime,
        timeZone: event.timezone,
      },
      end: {
        dateTime: event.endTime,
        timeZone: event.timezone,
      },
      attendees: event.attendees.map((a) => ({
        emailAddress: {
          address: a.email,
          name: a.name || a.email,
        },
        type: "required",
      })),
    };

    // Add Teams meeting if requested
    if (event.createVideoCall) {
      body.isOnlineMeeting = true;
      body.onlineMeetingProvider = "teamsForBusiness";
    }

    const response = await fetch(`${OutlookCalendarProvider.GRAPH_URL}/me/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as MicrosoftErrorResponse;
      throw new Error(
        `Failed to create event: ${errorData.error?.message || response.statusText}`
      );
    }

    const data = (await response.json()) as MicrosoftEventResponse;

    return {
      id: data.id,
      link: data.webLink,
      videoCallLink: data.onlineMeeting?.joinUrl,
    };
  }

  async deleteEvent(
    tokens: CalendarTokens,
    _calendarId: string,
    eventId: string
  ): Promise<void> {
    const response = await fetch(
      `${OutlookCalendarProvider.GRAPH_URL}/me/events/${eventId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
        },
      }
    );

    // 204 No Content is expected, 404 means already deleted (acceptable)
    if (!response.ok && response.status !== 404) {
      const errorData = (await response.json()) as MicrosoftErrorResponse;
      throw new Error(
        `Failed to delete event: ${errorData.error?.message || response.statusText}`
      );
    }
  }

  async updateEvent(
    tokens: CalendarTokens,
    _calendarId: string,
    eventId: string,
    event: Partial<CalendarEventInput>
  ): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {};

    if (event.summary) {
      body.subject = event.summary;
    }
    if (event.description) {
      body.body = {
        contentType: "text",
        content: event.description,
      };
    }
    if (event.startTime && event.timezone) {
      body.start = {
        dateTime: event.startTime,
        timeZone: event.timezone,
      };
    }
    if (event.endTime && event.timezone) {
      body.end = {
        dateTime: event.endTime,
        timeZone: event.timezone,
      };
    }

    const response = await fetch(
      `${OutlookCalendarProvider.GRAPH_URL}/me/events/${eventId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorData = (await response.json()) as MicrosoftErrorResponse;
      throw new Error(
        `Failed to update event: ${errorData.error?.message || response.statusText}`
      );
    }

    const data = (await response.json()) as MicrosoftEventResponse;

    return {
      id: data.id,
      link: data.webLink,
      videoCallLink: data.onlineMeeting?.joinUrl,
    };
  }
}
