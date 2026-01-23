/**
 * Video Call Service
 * ==================
 * Orchestration layer for video call operations.
 * Handles provider selection, token management, and meeting lifecycle.
 */

import type { VideoTokens, VideoMeetingInput, VideoMeeting } from "./types";
import { createVideoProvider, type VideoProviderTypeWithNative } from "./factory";
import { CalendarService, type CalendarEventInput, type CalendarTokens } from "../calendar";
import type { Interviewer, Org } from "../../db";
import { encryptTokens, decryptTokens } from "../../lib/crypto";

export class VideoCallService {
  private env: Record<string, string | undefined>;
  private encryptionKey: string;
  private calendarService: CalendarService;

  constructor(env: Record<string, string | undefined>) {
    this.env = env;
    const encKey = env.TOKEN_ENCRYPTION_KEY;
    this.calendarService = new CalendarService(env);

    if (!encKey) {
      throw new Error("TOKEN_ENCRYPTION_KEY is required for VideoCallService");
    }

    this.encryptionKey = encKey;
  }

  /**
   * Decrypt org's video tokens.
   */
  async getOrgTokens(org: Org): Promise<VideoTokens | null> {
    if (!org.videoTokens) {
      return null;
    }
    return decryptTokens<VideoTokens>(org.videoTokens, this.encryptionKey);
  }

  /**
   * Encrypt tokens for storage.
   */
  async encryptTokensForStorage(tokens: VideoTokens): Promise<string> {
    return encryptTokens(tokens, this.encryptionKey);
  }

  /**
   * Create a video meeting based on org's video provider setting.
   *
   * For standalone providers (Zoom), creates a meeting directly.
   * For calendar_native, delegates to CalendarService to create event with video.
   *
   * @param org - Organization with video provider settings
   * @param interviewer - Primary interviewer (for calendar-native)
   * @param input - Meeting details
   * @param updateOrgTokens - Callback to persist refreshed org tokens
   * @param updateInterviewerTokens - Callback to persist refreshed interviewer tokens
   * @returns VideoMeeting with join URL and related info
   */
  async createMeeting(
    org: Org,
    interviewer: Interviewer,
    input: VideoMeetingInput,
    updateOrgTokens: (tokens: VideoTokens) => Promise<void>,
    updateInterviewerTokens: (tokens: CalendarTokens) => Promise<void>
  ): Promise<VideoMeeting> {
    const providerType = org.videoCallProvider || "calendar_native";

    // Calendar-native: use interviewer's calendar to create event with video
    if (providerType === "calendar_native") {
      return this.createMeetingViaCalendar(interviewer, input, updateInterviewerTokens);
    }

    // Standalone provider (Zoom, etc.)
    return this.createMeetingDirect(org, input, updateOrgTokens);
  }

  /**
   * Create meeting via calendar integration (Google Meet, Teams).
   */
  private async createMeetingViaCalendar(
    interviewer: Interviewer,
    input: VideoMeetingInput,
    updateTokens: (tokens: CalendarTokens) => Promise<void>
  ): Promise<VideoMeeting> {
    if (!interviewer.calendarConnected || !interviewer.calendarProvider) {
      throw new Error(
        "Interviewer must have a connected calendar for calendar-native video calls"
      );
    }

    // Convert VideoMeetingInput to CalendarEventInput
    const calendarEvent: CalendarEventInput = {
      summary: input.title,
      description: input.description || "",
      startTime: input.startTime.toISOString(),
      endTime: input.endTime.toISOString(),
      timezone: input.timezone,
      attendees: input.attendees,
      createVideoCall: true, // This triggers video call creation
    };

    // Create event on interviewer's calendar
    const events = await this.calendarService.createEvents(
      [interviewer],
      calendarEvent,
      async (interviewerId, tokens) => {
        if (interviewerId === interviewer.id) {
          await updateTokens(tokens);
        }
      }
    );

    const event = events.get(interviewer.id);
    if (!event || !event.videoCallLink) {
      throw new Error("Failed to create video call via calendar");
    }

    return {
      id: event.id,
      joinUrl: event.videoCallLink,
    };
  }

  /**
   * Create meeting directly with standalone provider (Zoom).
   */
  private async createMeetingDirect(
    org: Org,
    input: VideoMeetingInput,
    updateTokens: (tokens: VideoTokens) => Promise<void>
  ): Promise<VideoMeeting> {
    const providerType = (org.videoCallProvider || "zoom") as VideoProviderTypeWithNative;

    if (!org.videoTokens) {
      throw new Error(`No ${providerType} connection found. Connect via org settings.`);
    }

    const provider = createVideoProvider(providerType, this.env);
    let tokens = await this.getOrgTokens(org);

    if (!tokens) {
      throw new Error(`Failed to decrypt ${providerType} tokens`);
    }

    // Refresh tokens if needed
    if (provider.needsRefresh(tokens)) {
      tokens = await provider.refreshAccessToken(tokens);
      await updateTokens(tokens);
    }

    return provider.createMeeting(tokens, input);
  }

  /**
   * Delete a video meeting.
   *
   * For calendar-native, this should be handled via CalendarService.deleteEvents().
   * For standalone providers, deletes the meeting directly.
   */
  async deleteMeeting(
    org: Org,
    meetingId: string,
    updateTokens: (tokens: VideoTokens) => Promise<void>
  ): Promise<void> {
    const providerType = (org.videoCallProvider || "calendar_native") as VideoProviderTypeWithNative;

    if (providerType === "calendar_native") {
      throw new Error(
        "Calendar-native meeting deletion should be done via CalendarService.deleteEvents()"
      );
    }

    if (!org.videoTokens) {
      throw new Error(`No ${providerType} connection found`);
    }

    const provider = createVideoProvider(providerType, this.env);
    let tokens = await this.getOrgTokens(org);

    if (!tokens) {
      throw new Error(`Failed to decrypt ${providerType} tokens`);
    }

    // Refresh tokens if needed
    if (provider.needsRefresh(tokens)) {
      tokens = await provider.refreshAccessToken(tokens);
      await updateTokens(tokens);
    }

    await provider.deleteMeeting(tokens, meetingId);
  }

  /**
   * Update a video meeting.
   *
   * For calendar-native, this should be handled via CalendarService.updateEvents().
   * For standalone providers, updates the meeting directly.
   */
  async updateMeeting(
    org: Org,
    meetingId: string,
    input: Partial<VideoMeetingInput>,
    updateTokens: (tokens: VideoTokens) => Promise<void>
  ): Promise<VideoMeeting> {
    const providerType = (org.videoCallProvider || "calendar_native") as VideoProviderTypeWithNative;

    if (providerType === "calendar_native") {
      throw new Error(
        "Calendar-native meeting updates should be done via CalendarService.updateEvents()"
      );
    }

    if (!org.videoTokens) {
      throw new Error(`No ${providerType} connection found`);
    }

    const provider = createVideoProvider(providerType, this.env);
    let tokens = await this.getOrgTokens(org);

    if (!tokens) {
      throw new Error(`Failed to decrypt ${providerType} tokens`);
    }

    // Refresh tokens if needed
    if (provider.needsRefresh(tokens)) {
      tokens = await provider.refreshAccessToken(tokens);
      await updateTokens(tokens);
    }

    return provider.updateMeeting(tokens, meetingId, input);
  }
}
