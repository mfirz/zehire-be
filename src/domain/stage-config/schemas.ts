/**
 * Stage Configuration Schemas
 * ===========================
 * Zod schemas for interview stage configuration.
 */

import { z } from "zod";

// =============================================================================
// STAGE CONFIG SCHEMAS
// =============================================================================

/**
 * Schema for updating stage configuration.
 */
export const UpdateStageConfigSchema = z.object({
  mode: z.enum(["any_one", "all_required"]).optional(),
  durationMinutes: z.number().min(15).max(240).optional(),
  bufferMinutes: z.number().min(0).max(60).optional(),
});

export type UpdateStageConfigInput = z.infer<typeof UpdateStageConfigSchema>;

// =============================================================================
// INTERVIEWER ASSIGNMENT SCHEMAS
// =============================================================================

/**
 * Schema for assigning an interviewer to a stage.
 */
export const AssignInterviewerSchema = z.object({
  interviewerId: z.string().min(1),
});

export type AssignInterviewerInput = z.infer<typeof AssignInterviewerSchema>;

// =============================================================================
// RESPONSE TYPES
// =============================================================================

/**
 * Interviewer summary for stage config response.
 */
export interface InterviewerSummary {
  id: string;
  email: string;
  name: string | null;
  calendarConnected: boolean;
}

/**
 * Stage configuration response.
 */
export interface StageConfigResponse {
  stageId: string;
  mode: "any_one" | "all_required";
  durationMinutes: number;
  bufferMinutes: number;
  interviewers: InterviewerSummary[];
}

/**
 * Available slot for preview.
 */
export interface AvailableSlot {
  date: string;       // "2025-01-28"
  time: string;       // "14:00"
  endTime: string;    // "14:45"
  interviewerIds: string[];
}

/**
 * Availability preview response.
 */
export interface AvailabilityPreviewResponse {
  stageId: string;
  mode: "any_one" | "all_required";
  durationMinutes: number;
  startDate: string;
  endDate: string;
  slotsPerDay: Record<string, number>;  // { "2025-01-28": 4, "2025-01-29": 6 }
  totalSlots: number;
  interviewerAvailability: Array<{
    id: string;
    name: string | null;
    slotsContributed: number;
    calendarConnected: boolean;
  }>;
}
