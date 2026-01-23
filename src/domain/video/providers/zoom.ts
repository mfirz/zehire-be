/**
 * Zoom Video Provider
 * ===================
 * Implementation of VideoCallProvider for Zoom API.
 */

import type {
  VideoCallProvider,
  VideoTokens,
  VideoMeetingInput,
  VideoMeeting,
  ZoomEnv,
} from "../types";

interface ZoomTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface ZoomMeetingResponse {
  id: number;
  join_url: string;
  start_url: string;
  password?: string;
  pstn_password?: string;
}

export class ZoomProvider implements VideoCallProvider {
  readonly type = "zoom" as const;

  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(env: ZoomEnv) {
    this.clientId = env.ZOOM_CLIENT_ID;
    this.clientSecret = env.ZOOM_CLIENT_SECRET;
    this.redirectUri = env.ZOOM_REDIRECT_URI;
  }

  /**
   * Zoom requires org-level OAuth connection.
   */
  requiresOrgAuth(): boolean {
    return true;
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
    });
    return `https://zoom.us/oauth/authorize?${params}`;
  }

  async exchangeCodeForTokens(code: string): Promise<VideoTokens> {
    // Zoom uses Basic auth with client_id:client_secret
    const credentials = btoa(`${this.clientId}:${this.clientSecret}`);

    const response = await fetch("https://zoom.us/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    const data = (await response.json()) as ZoomTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }

  async refreshAccessToken(tokens: VideoTokens): Promise<VideoTokens> {
    const credentials = btoa(`${this.clientId}:${this.clientSecret}`);

    const response = await fetch("https://zoom.us/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh access token: ${error}`);
    }

    const data = (await response.json()) as ZoomTokenResponse;
    return {
      ...tokens,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || tokens.refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }

  needsRefresh(tokens: VideoTokens): boolean {
    const expiresAt = new Date(tokens.expiresAt);
    // Refresh if expires in less than 5 minutes
    return expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  }

  async createMeeting(tokens: VideoTokens, input: VideoMeetingInput): Promise<VideoMeeting> {
    const durationMinutes = Math.round(
      (input.endTime.getTime() - input.startTime.getTime()) / 60000
    );

    const response = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: input.title,
        type: 2, // Scheduled meeting
        start_time: input.startTime.toISOString(),
        duration: durationMinutes,
        timezone: input.timezone,
        agenda: input.description,
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: true,
          waiting_room: false,
          meeting_invitees: input.attendees.map((a) => ({ email: a.email })),
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create meeting: ${error}`);
    }

    const data = (await response.json()) as ZoomMeetingResponse;
    return {
      id: data.id.toString(),
      joinUrl: data.join_url,
      hostUrl: data.start_url,
      password: data.password,
      dialIn: data.pstn_password,
    };
  }

  async deleteMeeting(tokens: VideoTokens, meetingId: string): Promise<void> {
    const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    // 204 No Content is expected, 404 means already deleted (acceptable)
    if (!response.ok && response.status !== 404) {
      const error = await response.text();
      throw new Error(`Failed to delete meeting: ${error}`);
    }
  }

  async updateMeeting(
    tokens: VideoTokens,
    meetingId: string,
    input: Partial<VideoMeetingInput>
  ): Promise<VideoMeeting> {
    const body: Record<string, unknown> = {};
    if (input.title) body.topic = input.title;
    if (input.description) body.agenda = input.description;
    if (input.startTime) body.start_time = input.startTime.toISOString();
    if (input.startTime && input.endTime) {
      body.duration = Math.round(
        (input.endTime.getTime() - input.startTime.getTime()) / 60000
      );
    }
    if (input.timezone) body.timezone = input.timezone;

    const updateResponse = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      throw new Error(`Failed to update meeting: ${error}`);
    }

    // Zoom PATCH doesn't return full meeting, fetch it
    const getResponse = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    if (!getResponse.ok) {
      const error = await getResponse.text();
      throw new Error(`Failed to get meeting after update: ${error}`);
    }

    const data = (await getResponse.json()) as ZoomMeetingResponse;
    return {
      id: data.id.toString(),
      joinUrl: data.join_url,
      hostUrl: data.start_url,
      password: data.password,
    };
  }
}
