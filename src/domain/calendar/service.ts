/**
 * Calendar Service
 * ================
 * Orchestration layer for calendar operations across different providers.
 * Handles token refresh, multi-interviewer scheduling, and provider selection.
 */

import type {
  CalendarProvider,
  CalendarTokens,
  BusyPeriod,
  CalendarEventInput,
  CalendarEvent,
} from "./types";
import { createCalendarProvider } from "./factory";
import type { Interviewer } from "../../db";
import { encryptTokens, decryptTokens } from "../../lib/crypto";

export class CalendarService {
  private env: Record<string, string | undefined>;
  private encryptionKey: string;

  constructor(env: Record<string, string | undefined>) {
    this.env = env;
    const encKey = env.TOKEN_ENCRYPTION_KEY;

    if (!encKey) {
      throw new Error("TOKEN_ENCRYPTION_KEY is required for CalendarService");
    }

    this.encryptionKey = encKey;
  }

  /**
   * Get provider for an interviewer.
   */
  private getProvider(interviewer: Interviewer): CalendarProvider {
    if (!interviewer.calendarProvider) {
      throw new Error("Interviewer has no calendar connected");
    }
    return createCalendarProvider(interviewer.calendarProvider as "google" | "outlook" | "apple", this.env);
  }

  /**
   * Decrypt and return tokens from interviewer record.
   */
  async getTokens(interviewer: Interviewer): Promise<CalendarTokens> {
    if (!interviewer.calendarTokens) {
      throw new Error("Interviewer has no calendar tokens");
    }
    return decryptTokens<CalendarTokens>(interviewer.calendarTokens, this.encryptionKey);
  }

  /**
   * Encrypt tokens for storage.
   */
  async encryptTokensForStorage(tokens: CalendarTokens): Promise<string> {
    return encryptTokens(tokens, this.encryptionKey);
  }

  /**
   * Get tokens, refreshing if needed.
   */
  private async getValidTokens(
    interviewer: Interviewer,
    provider: CalendarProvider,
    updateTokens: (tokens: CalendarTokens) => Promise<void>
  ): Promise<CalendarTokens> {
    const tokens = await this.getTokens(interviewer);

    if (provider.needsRefresh(tokens)) {
      const newTokens = await provider.refreshAccessToken(tokens);
      await updateTokens(newTokens);
      return newTokens;
    }

    return tokens;
  }

  /**
   * Get free/busy for multiple interviewers (handles different providers).
   *
   * @param interviewers - List of interviewers to check
   * @param startDate - Start of date range
   * @param endDate - End of date range
   * @param updateTokens - Callback to persist refreshed tokens
   * @returns Map of interviewer ID to busy periods
   */
  async getFreeBusy(
    interviewers: Interviewer[],
    startDate: Date,
    endDate: Date,
    updateTokens: (interviewerId: string, tokens: CalendarTokens) => Promise<void>
  ): Promise<Map<string, BusyPeriod[]>> {
    const results = new Map<string, BusyPeriod[]>();

    await Promise.all(
      interviewers.map(async (interviewer) => {
        // Skip interviewers without connected calendars
        if (!interviewer.calendarConnected || !interviewer.calendarProvider) {
          results.set(interviewer.id, []);
          return;
        }

        try {
          const provider = this.getProvider(interviewer);
          const tokens = await this.getValidTokens(interviewer, provider, (t) =>
            updateTokens(interviewer.id, t)
          );
          const busy = await provider.getFreeBusy(
            tokens,
            interviewer.calendarId || "primary",
            startDate,
            endDate
          );
          results.set(interviewer.id, busy);
        } catch (error) {
          console.error(`Failed to get free/busy for ${interviewer.id}:`, error);
          // Return empty to indicate we couldn't check (interviewer appears fully free)
          results.set(interviewer.id, []);
        }
      })
    );

    return results;
  }

  /**
   * Create calendar events for all participants.
   * Creates the primary event with video call on the first interviewer's calendar,
   * then creates linked events for other interviewers.
   *
   * @param interviewers - List of interviewers to create events for
   * @param event - Event details
   * @param updateTokens - Callback to persist refreshed tokens
   * @returns Map of interviewer ID to created calendar events
   */
  async createEvents(
    interviewers: Interviewer[],
    event: CalendarEventInput,
    updateTokens: (interviewerId: string, tokens: CalendarTokens) => Promise<void>
  ): Promise<Map<string, CalendarEvent>> {
    const results = new Map<string, CalendarEvent>();

    // Filter to only interviewers with connected calendars
    const connectedInterviewers = interviewers.filter(
      (i): i is Interviewer & { calendarProvider: NonNullable<Interviewer["calendarProvider"]> } =>
        i.calendarConnected === true && i.calendarProvider !== null
    );

    if (connectedInterviewers.length === 0) {
      console.warn("No interviewers have connected calendars");
      return results;
    }

    // We've verified length > 0, so first element exists
    const primaryInterviewer = connectedInterviewers[0]!;
    const otherInterviewers = connectedInterviewers.slice(1);

    try {
      const provider = this.getProvider(primaryInterviewer);
      const tokens = await this.getValidTokens(primaryInterviewer, provider, (t) =>
        updateTokens(primaryInterviewer.id, t)
      );
      const calendarEvent = await provider.createEvent(
        tokens,
        primaryInterviewer.calendarId || "primary",
        event
      );
      results.set(primaryInterviewer.id, calendarEvent);

      // For other interviewers, create events without video call (include link in description)
      const eventWithVideo: CalendarEventInput = {
        ...event,
        description: calendarEvent.videoCallLink
          ? `${event.description}\n\nVideo Call: ${calendarEvent.videoCallLink}`
          : event.description,
        createVideoCall: false, // Don't create duplicate video calls
      };

      // Create on other interviewers' calendars
      await Promise.all(
        otherInterviewers.map(async (interviewer) => {
          try {
            const p = this.getProvider(interviewer);
            const t = await this.getValidTokens(interviewer, p, (tk) =>
              updateTokens(interviewer.id, tk)
            );
            const evt = await p.createEvent(t, interviewer.calendarId || "primary", eventWithVideo);
            results.set(interviewer.id, evt);
          } catch (error) {
            console.error(`Failed to create event for ${interviewer.id}:`, error);
            // Continue with other interviewers
          }
        })
      );
    } catch (error) {
      console.error(`Failed to create primary event for ${primaryInterviewer.id}:`, error);
      throw error; // Primary event failure is critical
    }

    return results;
  }

  /**
   * Delete calendar events for all participants.
   *
   * @param interviewers - List of interviewers
   * @param eventIds - Map of interviewer ID to event ID
   * @param updateTokens - Callback to persist refreshed tokens
   */
  async deleteEvents(
    interviewers: Interviewer[],
    eventIds: Map<string, string>,
    updateTokens: (interviewerId: string, tokens: CalendarTokens) => Promise<void>
  ): Promise<void> {
    await Promise.all(
      interviewers.map(async (interviewer) => {
        const eventId = eventIds.get(interviewer.id);
        if (!eventId || !interviewer.calendarConnected || !interviewer.calendarProvider) {
          return;
        }

        try {
          const provider = this.getProvider(interviewer);
          const tokens = await this.getValidTokens(interviewer, provider, (t) =>
            updateTokens(interviewer.id, t)
          );
          await provider.deleteEvent(tokens, interviewer.calendarId || "primary", eventId);
        } catch (error) {
          console.error(`Failed to delete event for ${interviewer.id}:`, error);
          // Continue with other interviewers
        }
      })
    );
  }

  /**
   * Update calendar events for all participants.
   *
   * @param interviewers - List of interviewers
   * @param eventIds - Map of interviewer ID to event ID
   * @param event - Updated event details
   * @param updateTokens - Callback to persist refreshed tokens
   * @returns Map of interviewer ID to updated calendar events
   */
  async updateEvents(
    interviewers: Interviewer[],
    eventIds: Map<string, string>,
    event: Partial<CalendarEventInput>,
    updateTokens: (interviewerId: string, tokens: CalendarTokens) => Promise<void>
  ): Promise<Map<string, CalendarEvent>> {
    const results = new Map<string, CalendarEvent>();

    await Promise.all(
      interviewers.map(async (interviewer) => {
        const eventId = eventIds.get(interviewer.id);
        if (!eventId || !interviewer.calendarConnected || !interviewer.calendarProvider) {
          return;
        }

        try {
          const provider = this.getProvider(interviewer);
          const tokens = await this.getValidTokens(interviewer, provider, (t) =>
            updateTokens(interviewer.id, t)
          );
          const updatedEvent = await provider.updateEvent(
            tokens,
            interviewer.calendarId || "primary",
            eventId,
            event
          );
          results.set(interviewer.id, updatedEvent);
        } catch (error) {
          console.error(`Failed to update event for ${interviewer.id}:`, error);
          // Continue with other interviewers
        }
      })
    );

    return results;
  }
}
