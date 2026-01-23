/**
 * Google Calendar Provider
 * ========================
 * Implementation of CalendarProvider for Google Calendar API.
 */

import type {
  CalendarProvider,
  CalendarTokens,
  BusyPeriod,
  CalendarEventInput,
  CalendarEvent,
  OAuthConfig,
  GoogleCalendarEnv,
} from "../types";

interface GoogleFreeBusyResponse {
  calendars: {
    [key: string]: {
      busy: Array<{ start: string; end: string }>;
    };
  };
}

interface GoogleEventResponse {
  id: string;
  htmlLink: string;
  conferenceData?: {
    entryPoints?: Array<{ uri: string }>;
  };
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export class GoogleCalendarProvider implements CalendarProvider {
  readonly type = "google" as const;

  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(env: GoogleCalendarEnv) {
    this.clientId = env.GOOGLE_CLIENT_ID;
    this.clientSecret = env.GOOGLE_CLIENT_SECRET;
    this.redirectUri = env.GOOGLE_REDIRECT_URI;
  }

  getOAuthConfig(): OAuthConfig {
    return {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      scopes: [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
      ],
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
      access_type: "offline",
      prompt: "consent",
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
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    const data = (await response.json()) as GoogleTokenResponse;

    if (!data.refresh_token) {
      throw new Error("No refresh token received. Ensure prompt=consent is set.");
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
        refresh_token: tokens.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh access token: ${error}`);
    }

    const data = (await response.json()) as GoogleTokenResponse;

    return {
      ...tokens,
      accessToken: data.access_token,
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
    calendarId: string,
    startDate: Date,
    endDate: Date
  ): Promise<BusyPeriod[]> {
    const calId = calendarId || "primary";

    const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        items: [{ id: calId }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get free/busy: ${error}`);
    }

    const data = (await response.json()) as GoogleFreeBusyResponse;
    return data.calendars[calId]?.busy || [];
  }

  async createEvent(
    tokens: CalendarTokens,
    calendarId: string,
    event: CalendarEventInput
  ): Promise<CalendarEvent> {
    const calId = calendarId || "primary";

    const body: Record<string, unknown> = {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startTime, timeZone: event.timezone },
      end: { dateTime: event.endTime, timeZone: event.timezone },
      attendees: event.attendees.map((a) => ({ email: a.email })),
    };

    if (event.createVideoCall) {
      body.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events`);
    if (event.createVideoCall) {
      url.searchParams.set("conferenceDataVersion", "1");
    }

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create event: ${error}`);
    }

    const data = (await response.json()) as GoogleEventResponse;
    return {
      id: data.id,
      link: data.htmlLink,
      videoCallLink: data.conferenceData?.entryPoints?.[0]?.uri,
    };
  }

  async deleteEvent(
    tokens: CalendarTokens,
    calendarId: string,
    eventId: string
  ): Promise<void> {
    const calId = calendarId || "primary";

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eventId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      }
    );

    // 204 No Content is expected, 404 means already deleted (acceptable)
    if (!response.ok && response.status !== 404) {
      const error = await response.text();
      throw new Error(`Failed to delete event: ${error}`);
    }
  }

  async updateEvent(
    tokens: CalendarTokens,
    calendarId: string,
    eventId: string,
    event: Partial<CalendarEventInput>
  ): Promise<CalendarEvent> {
    const calId = calendarId || "primary";

    const body: Record<string, unknown> = {};
    if (event.summary) body.summary = event.summary;
    if (event.description) body.description = event.description;
    if (event.startTime && event.timezone) {
      body.start = { dateTime: event.startTime, timeZone: event.timezone };
    }
    if (event.endTime && event.timezone) {
      body.end = { dateTime: event.endTime, timeZone: event.timezone };
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eventId}`,
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
      const error = await response.text();
      throw new Error(`Failed to update event: ${error}`);
    }

    const data = (await response.json()) as GoogleEventResponse;
    return {
      id: data.id,
      link: data.htmlLink,
      videoCallLink: data.conferenceData?.entryPoints?.[0]?.uri,
    };
  }
}
