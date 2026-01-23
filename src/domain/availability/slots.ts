/**
 * Slot Calculation Engine
 * =======================
 * Calculates available interview slots based on:
 * - Interviewer availability windows
 * - Blocked dates
 * - Calendar free/busy data
 * - Interview duration
 * - Mode (any_one vs all_required)
 */

import type { BusyPeriod } from "../calendar";
import type { InterviewerAvailabilityRecord, InterviewerBlockedDate } from "../../db";
import { INTERVIEW_BUFFER_MINUTES } from "../scheduling/constants";

// =============================================================================
// TYPES
// =============================================================================

/**
 * An available time slot for scheduling.
 */
export interface TimeSlot {
  date: string; // "2025-01-28"
  time: string; // "14:00"
  endTime: string; // "14:45"
  interviewerIds: string[];
}

/**
 * Free/busy data for an interviewer.
 */
export interface InterviewerFreeBusy {
  interviewerId: string;
  busy: BusyPeriod[];
}

/**
 * Options for slot calculation.
 */
export interface SlotCalculationOptions {
  /** Availability windows for all interviewers */
  windows: InterviewerAvailabilityRecord[];
  /** Blocked dates for all interviewers */
  blockedDates: InterviewerBlockedDate[];
  /** Free/busy data from calendars */
  freeBusy: InterviewerFreeBusy[];
  /** Interview duration in minutes */
  durationMinutes: number;
  /** Mode: any_one = at least one interviewer, all_required = all must be free */
  mode: "any_one" | "all_required";
  /** Start date for slot generation */
  startDate: Date;
  /** End date for slot generation */
  endDate: Date;
  /** Timezone for date calculations */
  timezone: string;
}

// =============================================================================
// SLOT CALCULATION
// =============================================================================

/**
 * Calculate available interview slots.
 */
export function calculateSlots(options: SlotCalculationOptions): TimeSlot[] {
  const {
    windows,
    blockedDates,
    freeBusy,
    durationMinutes,
    mode,
    startDate,
    endDate,
    timezone,
  } = options;

  const slots: TimeSlot[] = [];
  const slotDuration = durationMinutes + INTERVIEW_BUFFER_MINUTES;

  // Group windows by interviewer
  const windowsByInterviewer = groupBy(windows, "interviewerId");

  // Group blocked dates by interviewer
  const blockedByInterviewer = groupBy(blockedDates, "interviewerId");

  // Get all unique interviewer IDs
  const interviewerIds = [...new Set(windows.map((w) => w.interviewerId))];

  // Iterate through each day in the range
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateStr = formatDate(currentDate, timezone);
    const dayOfWeek = getDayOfWeek(currentDate, timezone);

    if (mode === "all_required") {
      // All interviewers must be available
      const daySlots = calculateSlotsForAllRequired(
        dateStr,
        dayOfWeek,
        interviewerIds,
        windowsByInterviewer,
        blockedByInterviewer,
        freeBusy,
        slotDuration,
        durationMinutes,
        timezone
      );
      slots.push(...daySlots);
    } else {
      // Any one interviewer available
      const daySlots = calculateSlotsForAnyOne(
        dateStr,
        dayOfWeek,
        interviewerIds,
        windowsByInterviewer,
        blockedByInterviewer,
        freeBusy,
        slotDuration,
        durationMinutes,
        timezone
      );
      slots.push(...daySlots);
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Sort by date and time
  slots.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.time.localeCompare(b.time);
  });

  return slots;
}

/**
 * Calculate slots when ALL interviewers must be available.
 */
function calculateSlotsForAllRequired(
  dateStr: string,
  dayOfWeek: number,
  interviewerIds: string[],
  windowsByInterviewer: Map<string, InterviewerAvailabilityRecord[]>,
  blockedByInterviewer: Map<string, InterviewerBlockedDate[]>,
  freeBusy: InterviewerFreeBusy[],
  slotDuration: number,
  durationMinutes: number,
  _timezone: string
): TimeSlot[] {
  const slots: TimeSlot[] = [];

  // Check if any interviewer has this date blocked
  for (const interviewerId of interviewerIds) {
    const blocked = blockedByInterviewer.get(interviewerId) || [];
    if (blocked.some((b) => b.blockedDate === dateStr)) {
      return []; // Day is blocked for at least one required interviewer
    }
  }

  // Find intersection of all availability windows for this day
  let intersectedWindows: Array<{ start: string; end: string }> | null = null;

  for (const interviewerId of interviewerIds) {
    const interviewerWindows = windowsByInterviewer.get(interviewerId) || [];
    const dayWindows = interviewerWindows
      .filter((w) => w.dayOfWeek === dayOfWeek)
      .map((w) => ({ start: w.startTime, end: w.endTime }));

    if (dayWindows.length === 0) {
      return []; // This interviewer has no availability on this day
    }

    if (intersectedWindows === null) {
      intersectedWindows = dayWindows;
    } else {
      intersectedWindows = intersectTimeRanges(intersectedWindows, dayWindows);
    }

    if (intersectedWindows.length === 0) {
      return []; // No overlap
    }
  }

  if (!intersectedWindows) {
    return [];
  }

  // Generate slots from intersected windows
  for (const window of intersectedWindows) {
    const windowSlots = generateSlotsInWindow(dateStr, window.start, window.end, slotDuration, durationMinutes);

    // Filter out slots where any interviewer is busy
    for (const slot of windowSlots) {
      const slotStart = `${dateStr}T${slot.time}:00`;
      const slotEnd = `${dateStr}T${slot.endTime}:00`;

      const allFree = interviewerIds.every((interviewerId) => {
        const interviewerBusy = freeBusy.find((fb) => fb.interviewerId === interviewerId)?.busy || [];
        return !isOverlapping(slotStart, slotEnd, interviewerBusy);
      });

      if (allFree) {
        slots.push({
          date: dateStr,
          time: slot.time,
          endTime: slot.endTime,
          interviewerIds: [...interviewerIds],
        });
      }
    }
  }

  return slots;
}

/**
 * Calculate slots when ANY ONE interviewer is available.
 */
function calculateSlotsForAnyOne(
  dateStr: string,
  dayOfWeek: number,
  interviewerIds: string[],
  windowsByInterviewer: Map<string, InterviewerAvailabilityRecord[]>,
  blockedByInterviewer: Map<string, InterviewerBlockedDate[]>,
  freeBusy: InterviewerFreeBusy[],
  slotDuration: number,
  durationMinutes: number,
  _timezone: string
): TimeSlot[] {
  const slotMap = new Map<string, TimeSlot>(); // key: "time"

  for (const interviewerId of interviewerIds) {
    // Skip if this interviewer has the date blocked
    const blocked = blockedByInterviewer.get(interviewerId) || [];
    if (blocked.some((b) => b.blockedDate === dateStr)) {
      continue;
    }

    // Get windows for this day
    const interviewerWindows = windowsByInterviewer.get(interviewerId) || [];
    const dayWindows = interviewerWindows.filter((w) => w.dayOfWeek === dayOfWeek);

    // Get busy periods for this interviewer
    const interviewerBusy = freeBusy.find((fb) => fb.interviewerId === interviewerId)?.busy || [];

    for (const window of dayWindows) {
      const windowSlots = generateSlotsInWindow(
        dateStr,
        window.startTime,
        window.endTime,
        slotDuration,
        durationMinutes
      );

      for (const slot of windowSlots) {
        const slotStart = `${dateStr}T${slot.time}:00`;
        const slotEnd = `${dateStr}T${slot.endTime}:00`;

        // Check if this interviewer is free
        if (!isOverlapping(slotStart, slotEnd, interviewerBusy)) {
          const key = slot.time;
          const existing = slotMap.get(key);

          if (existing) {
            // Add this interviewer to existing slot
            if (!existing.interviewerIds.includes(interviewerId)) {
              existing.interviewerIds.push(interviewerId);
            }
          } else {
            // Create new slot
            slotMap.set(key, {
              date: dateStr,
              time: slot.time,
              endTime: slot.endTime,
              interviewerIds: [interviewerId],
            });
          }
        }
      }
    }
  }

  return [...slotMap.values()];
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Group array items by a key.
 */
function groupBy<T>(items: T[], key: keyof T): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const keyValue = String(item[key]);
    const existing = map.get(keyValue) || [];
    existing.push(item);
    map.set(keyValue, existing);
  }
  return map;
}

/**
 * Format date as YYYY-MM-DD in a timezone.
 */
function formatDate(date: Date, timezone: string): string {
  return date.toLocaleDateString("en-CA", { timeZone: timezone });
}

/**
 * Get day of week (0=Sunday) in a timezone.
 */
function getDayOfWeek(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const dayName = formatter.format(date);
  const days: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return days[dayName] ?? 0;
}

/**
 * Find intersection of two lists of time ranges.
 */
function intersectTimeRanges(
  ranges1: Array<{ start: string; end: string }>,
  ranges2: Array<{ start: string; end: string }>
): Array<{ start: string; end: string }> {
  const result: Array<{ start: string; end: string }> = [];

  for (const r1 of ranges1) {
    for (const r2 of ranges2) {
      const start = r1.start > r2.start ? r1.start : r2.start;
      const end = r1.end < r2.end ? r1.end : r2.end;

      if (start < end) {
        result.push({ start, end });
      }
    }
  }

  return result;
}

/**
 * Generate slots within a time window.
 */
function generateSlotsInWindow(
  _dateStr: string,
  windowStart: string,
  windowEnd: string,
  slotDuration: number,
  interviewDuration: number
): Array<{ time: string; endTime: string }> {
  const slots: Array<{ time: string; endTime: string }> = [];

  let currentMinutes = timeToMinutes(windowStart);
  const endMinutes = timeToMinutes(windowEnd);

  while (currentMinutes + interviewDuration <= endMinutes) {
    const time = minutesToTime(currentMinutes);
    const endTime = minutesToTime(currentMinutes + interviewDuration);

    slots.push({ time, endTime });

    currentMinutes += slotDuration; // Move by slot duration (interview + buffer)
  }

  return slots;
}

/**
 * Convert "HH:MM" to minutes since midnight.
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
}

/**
 * Convert minutes since midnight to "HH:MM".
 */
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

/**
 * Check if a slot overlaps with any busy period.
 */
function isOverlapping(slotStart: string, slotEnd: string, busy: BusyPeriod[]): boolean {
  for (const period of busy) {
    // Busy period: [period.start, period.end)
    // Slot: [slotStart, slotEnd)
    // Overlap if: slotStart < period.end && slotEnd > period.start
    if (slotStart < period.end && slotEnd > period.start) {
      return true;
    }
  }
  return false;
}
