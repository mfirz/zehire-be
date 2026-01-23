/**
 * Availability Schemas
 * ====================
 * Zod schemas for availability management.
 */

import { z } from "zod";

// =============================================================================
// AVAILABILITY WINDOW SCHEMAS
// =============================================================================

/**
 * Single availability window (e.g., Monday 9:00-17:00)
 */
export const AvailabilityWindowSchema = z.object({
  dayOfWeek: z.number().min(0).max(6), // 0=Sunday, 6=Saturday
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM format"),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM format"),
});

export type AvailabilityWindow = z.infer<typeof AvailabilityWindowSchema>;

/**
 * Schema for updating all availability windows at once.
 * This is a PUT operation that replaces all existing windows.
 */
export const UpdateAvailabilitySchema = z.object({
  timezone: z.string().optional(), // e.g., "America/New_York"
  windows: z.array(AvailabilityWindowSchema),
});

export type UpdateAvailabilityInput = z.infer<typeof UpdateAvailabilitySchema>;

// =============================================================================
// BLOCKED DATE SCHEMAS
// =============================================================================

/**
 * Schema for blocking a date.
 */
export const BlockDateSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  reason: z.string().max(255).optional(),
});

export type BlockDateInput = z.infer<typeof BlockDateSchema>;

/**
 * Blocked date response.
 */
export interface BlockedDateResponse {
  id: string;
  date: string;
  reason: string | null;
  createdAt: string;
}

// =============================================================================
// AVAILABILITY RESPONSE
// =============================================================================

/**
 * Full availability response.
 */
export interface AvailabilityResponse {
  timezone: string;
  windows: Array<{
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;
  blockedDates: BlockedDateResponse[];
}
