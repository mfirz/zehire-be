/**
 * Scheduling Schemas
 * ==================
 * Zod schemas for candidate scheduling and interview feedback.
 */

import { z } from "zod";

import { SIGNAL_IDS, type SignalId as ArchetypeSignalId } from "../jobs/archetypes/types";

// =============================================================================
// BOOKING SCHEMAS
// =============================================================================

/**
 * Schema for booking an interview slot.
 */
export const BookSlotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM format"),
  timezone: z.string().min(1, "Timezone is required"),
});

export type BookSlotInput = z.infer<typeof BookSlotSchema>;

/**
 * Schema for rescheduling an interview.
 */
export const RescheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM format"),
  timezone: z.string().min(1, "Timezone is required"),
});

export type RescheduleInput = z.infer<typeof RescheduleSchema>;

/**
 * Schema for cancelling an interview.
 */
export const CancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type CancelInput = z.infer<typeof CancelSchema>;

// =============================================================================
// FEEDBACK SCHEMAS
// =============================================================================

/**
 * Action-oriented recommendation.
 * NOT a quality judgment — just "is it safe to proceed?"
 */
export const RecommendationValues = ["advance", "hold", "pass"] as const;
export type Recommendation = (typeof RecommendationValues)[number];

/**
 * Signal observation confidence levels.
 */
export const ObservationValues = ["clear", "partial", "absent", "unclear"] as const;
export type Observation = (typeof ObservationValues)[number];

/**
 * Re-export canonical signal IDs from archetypes.
 * These are Zehire's 10 core signals used across the system.
 */
export const SignalIds = SIGNAL_IDS;
export type SignalId = ArchetypeSignalId;

/**
 * Single signal observation in feedback.
 */
export const SignalObservationSchema = z.object({
  signal: z.enum(SignalIds),
  observation: z.enum(ObservationValues),
  evidence: z.string().min(10, "Evidence must be at least 10 characters"),
});

export type SignalObservation = z.infer<typeof SignalObservationSchema>;

/**
 * Complete interview feedback submission.
 */
export const SubmitFeedbackSchema = z.object({
  recommendation: z.enum(RecommendationValues),
  recommendationReason: z.string().min(10, "Reason must be at least 10 characters"),
  observations: z
    .array(SignalObservationSchema)
    .min(1, "At least one signal observation is required"),
  summary: z.string().max(1000).optional(),
});

export type SubmitFeedbackInput = z.infer<typeof SubmitFeedbackSchema>;

// =============================================================================
// RESPONSE TYPES
// =============================================================================

/**
 * Scheduling page data response.
 */
export interface SchedulingPageResponse {
  job: {
    title: string;
    company: string | null;
  };
  stage: {
    name: string;
    durationMinutes: number;
  };
  interviewers: Array<{ name: string | null }>;
  candidate: {
    name: string;
    email: string;
  };
}

/**
 * Available slots response.
 */
export interface SlotsResponse {
  timezone: string;
  slots: Array<{
    date: string;
    times: string[];
  }>;
}

/**
 * Booking confirmation response.
 */
export interface BookingResponse {
  success: boolean;
  interview: {
    id: string;
    scheduledAt: string;
    durationMinutes: number;
    videoCallLink: string | null;
    interviewers: string[];
    addToCalendar: {
      google: string;
      outlook: string;
      ical: string;
    };
  };
  message: string;
}

/**
 * Stored feedback content (JSON in database).
 */
export interface FeedbackContent {
  recommendation: Recommendation;
  recommendationReason: string;
  observations: SignalObservation[];
  summary?: string | undefined;
}
