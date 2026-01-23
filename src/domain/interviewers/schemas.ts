/**
 * Interviewer Schemas
 * ===================
 * Zod schemas and types for interviewer management.
 */

import { z } from "zod";

// =============================================================================
// INPUT SCHEMAS
// =============================================================================

/**
 * Schema for creating/inviting an interviewer.
 */
export const CreateInterviewerSchema = z.object({
  email: z.string().email("Valid email is required"),
  name: z.string().min(1, "Name is required").max(200).optional(),
});

export type CreateInterviewerInput = z.infer<typeof CreateInterviewerSchema>;

/**
 * Schema for updating an interviewer.
 */
export const UpdateInterviewerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  timezone: z.string().optional(),
  status: z.enum(["invited", "active", "inactive"]).optional(),
});

export type UpdateInterviewerInput = z.infer<typeof UpdateInterviewerSchema>;

/**
 * Schema for bulk inviting interviewers.
 */
export const BulkInviteInterviewersSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(20),
});

export type BulkInviteInterviewersInput = z.infer<typeof BulkInviteInterviewersSchema>;

// =============================================================================
// RESPONSE SCHEMAS
// =============================================================================

/**
 * Interviewer response for list/detail views.
 */
export const InterviewerResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  timezone: z.string(),
  status: z.enum(["invited", "active", "inactive"]),
  calendarConnected: z.boolean(),
  calendarProvider: z.enum(["google", "outlook", "apple"]).nullable(),
  invitedAt: z.string().nullable(),
  connectedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type InterviewerResponse = z.infer<typeof InterviewerResponseSchema>;

/**
 * Interviewer list response.
 */
export const InterviewerListResponseSchema = z.object({
  interviewers: z.array(InterviewerResponseSchema),
  total: z.number(),
});

export type InterviewerListResponse = z.infer<typeof InterviewerListResponseSchema>;

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Magic link expiry duration in days.
 * Interviewer magic links are long-lived since they're for ongoing access.
 */
export const MAGIC_LINK_EXPIRY_DAYS = 90;

/**
 * Magic token length.
 */
export const MAGIC_TOKEN_LENGTH = 64;
