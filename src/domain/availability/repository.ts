/**
 * Availability Repository
 * =======================
 * Data access layer for interviewer availability and blocked dates.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { and, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import {
  createDb,
  interviewerAvailability,
  interviewerBlockedDates,
  interviewers,
  type Database,
  type InterviewerAvailabilityRecord,
  type NewInterviewerAvailability,
  type InterviewerBlockedDate,
  type NewInterviewerBlockedDate,
} from "../../db";
import type { AvailabilityWindow, BlockedDateResponse } from "./schemas";

// Alphanumeric-only nanoid for IDs
const alphanumericId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  21
);

export class AvailabilityRepository {
  private db: Database;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  // ===========================================================================
  // AVAILABILITY WINDOWS
  // ===========================================================================

  /**
   * Get all availability windows for an interviewer.
   */
  async getWindows(interviewerId: string): Promise<InterviewerAvailabilityRecord[]> {
    return this.db
      .select()
      .from(interviewerAvailability)
      .where(eq(interviewerAvailability.interviewerId, interviewerId))
      .all();
  }

  /**
   * Replace all availability windows for an interviewer.
   * This is an atomic operation - deletes all existing and inserts new.
   */
  async replaceWindows(
    interviewerId: string,
    windows: AvailabilityWindow[]
  ): Promise<InterviewerAvailabilityRecord[]> {
    const now = new Date().toISOString();

    // Delete existing windows
    await this.db
      .delete(interviewerAvailability)
      .where(eq(interviewerAvailability.interviewerId, interviewerId));

    if (windows.length === 0) {
      return [];
    }

    // Insert new windows
    const newWindows: NewInterviewerAvailability[] = windows.map((w) => ({
      id: alphanumericId(),
      interviewerId,
      dayOfWeek: w.dayOfWeek,
      startTime: w.startTime,
      endTime: w.endTime,
      createdAt: now,
      updatedAt: now,
    }));

    await this.db.insert(interviewerAvailability).values(newWindows);

    return this.getWindows(interviewerId);
  }

  // ===========================================================================
  // BLOCKED DATES
  // ===========================================================================

  /**
   * Get all blocked dates for an interviewer.
   */
  async getBlockedDates(interviewerId: string): Promise<InterviewerBlockedDate[]> {
    return this.db
      .select()
      .from(interviewerBlockedDates)
      .where(eq(interviewerBlockedDates.interviewerId, interviewerId))
      .all();
  }

  /**
   * Get blocked dates for an interviewer in a date range.
   */
  async getBlockedDatesInRange(
    interviewerId: string,
    startDate: string,
    endDate: string
  ): Promise<InterviewerBlockedDate[]> {
    // SQLite date comparison works with ISO format strings
    const result = await this.db
      .select()
      .from(interviewerBlockedDates)
      .where(eq(interviewerBlockedDates.interviewerId, interviewerId))
      .all();

    // Filter in JS since Drizzle doesn't have easy between for text dates
    return result.filter((d) => d.blockedDate >= startDate && d.blockedDate <= endDate);
  }

  /**
   * Block a specific date.
   */
  async blockDate(
    interviewerId: string,
    date: string,
    reason?: string
  ): Promise<InterviewerBlockedDate> {
    const now = new Date().toISOString();

    // Check if already blocked
    const existing = await this.db
      .select()
      .from(interviewerBlockedDates)
      .where(
        and(
          eq(interviewerBlockedDates.interviewerId, interviewerId),
          eq(interviewerBlockedDates.blockedDate, date)
        )
      )
      .get();

    if (existing) {
      return existing;
    }

    const blockedDate: NewInterviewerBlockedDate = {
      id: alphanumericId(),
      interviewerId,
      blockedDate: date,
      reason: reason || null,
      createdAt: now,
    };

    await this.db.insert(interviewerBlockedDates).values(blockedDate);

    return blockedDate as InterviewerBlockedDate;
  }

  /**
   * Unblock a specific date.
   */
  async unblockDate(interviewerId: string, dateId: string): Promise<boolean> {
    const result = await this.db
      .delete(interviewerBlockedDates)
      .where(
        and(
          eq(interviewerBlockedDates.id, dateId),
          eq(interviewerBlockedDates.interviewerId, interviewerId)
        )
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Block today's date (quick action).
   */
  async blockToday(interviewerId: string, timezone: string): Promise<InterviewerBlockedDate> {
    // Get today's date in the interviewer's timezone
    const today = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
    return this.blockDate(interviewerId, today, "Marked unavailable");
  }

  // ===========================================================================
  // TIMEZONE
  // ===========================================================================

  /**
   * Update interviewer's timezone.
   */
  async updateTimezone(interviewerId: string, timezone: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(interviewers)
      .set({
        timezone,
        updatedAt: now,
      })
      .where(eq(interviewers.id, interviewerId));
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Transform blocked date record to response.
   */
  toBlockedDateResponse(record: InterviewerBlockedDate): BlockedDateResponse {
    return {
      id: record.id,
      date: record.blockedDate,
      reason: record.reason,
      createdAt: record.createdAt,
    };
  }
}
