/**
 * Assessment Types
 * ================
 * Zod schemas and TypeScript types for the assessment system.
 *
 * Assessments are multi-part take-home evaluations assigned to candidates.
 * Each assessment has parts with instructions and evidence requirements.
 * Candidates schedule, complete, and submit evidence files for evaluation.
 */

import { z } from "zod";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Grace period after deadline before marking as expired */
export const ASSESSMENT_GRACE_PERIOD_MINUTES = 10;

/** Maximum file size for evidence uploads (50MB) */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** Length of secure assessment access tokens */
export const ASSESSMENT_TOKEN_LENGTH = 32;

/** Allowed file extensions for evidence uploads */
export const ALLOWED_FILE_TYPES = [
  ".zip",
  ".tar.gz",
  ".rar",
  ".7z",
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xlsx",
  ".xls",
  ".csv",
  ".png",
  ".jpg",
  ".jpeg",
  ".fig",
  ".sketch",
] as const;

/** Allowed MIME types for evidence uploads */
export const ALLOWED_MIME_TYPES = [
  "application/zip",
  "application/x-tar",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/gzip",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "image/png",
  "image/jpeg",
  "application/octet-stream", // For .fig, .sketch
] as const;

// =============================================================================
// SCHEDULING CONFIG
// =============================================================================

/**
 * Scheduling configuration for an assessment.
 * Controls deadlines and reschedule limits.
 */
export const SchedulingConfigSchema = z.object({
  scheduleWithinDays: z
    .number()
    .int({ message: "Schedule window must be a whole number of days" })
    .min(1, { message: "Schedule window must be at least 1 day" })
    .max(30, { message: "Schedule window cannot exceed 30 days" })
    .default(7),
  completeWithinHours: z
    .number()
    .int({ message: "Completion window must be a whole number of hours" })
    .min(1, { message: "Completion window must be at least 1 hour" })
    .max(168, { message: "Completion window cannot exceed 168 hours (7 days)" })
    .default(48),
  maxReschedules: z
    .number()
    .int({ message: "Max reschedules must be a whole number" })
    .min(0, { message: "Max reschedules cannot be negative" })
    .max(10, { message: "Max reschedules cannot exceed 10" })
    .default(2),
});

export type SchedulingConfig = z.infer<typeof SchedulingConfigSchema>;

// =============================================================================
// ASSESSMENT PART INPUT
// =============================================================================

/**
 * Input for creating or updating an assessment part.
 * - With id: updates an existing part
 * - Without id: creates a new part
 */
export const AssessmentPartInputSchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .min(1, { message: "Part name is required" })
    .max(200, { message: "Part name cannot exceed 200 characters" }),
  instructions: z
    .string()
    .min(1, { message: "Instructions are required" })
    .max(10000, {
      message: "Instructions cannot exceed 10,000 characters",
    }),
  evidenceDescription: z
    .string()
    .min(1, { message: "Evidence description is required" })
    .max(500, {
      message: "Evidence description cannot exceed 500 characters",
    }),
  required: z.boolean().default(true),
});

export type AssessmentPartInput = z.infer<typeof AssessmentPartInputSchema>;

// =============================================================================
// CREATE ASSESSMENT INPUT
// =============================================================================

/**
 * Input for creating a new assessment template.
 */
export const CreateAssessmentInputSchema = z.object({
  name: z
    .string()
    .min(1, { message: "Assessment name is required" })
    .max(200, { message: "Assessment name cannot exceed 200 characters" }),
  parts: z
    .array(AssessmentPartInputSchema)
    .min(1, { message: "Assessment must have at least one part" })
    .max(20, { message: "Assessment cannot have more than 20 parts" }),
  scheduling: SchedulingConfigSchema.optional(),
});

export type CreateAssessmentInput = z.infer<typeof CreateAssessmentInputSchema>;

// =============================================================================
// UPDATE ASSESSMENT INPUT
// =============================================================================

/**
 * Input for updating an existing assessment.
 * Uses a single PATCH endpoint:
 * - If status is present, it is an archive operation.
 * - If name/parts/scheduling are present, it is a content update.
 */
export const UpdateAssessmentInputSchema = z.object({
  name: z
    .string()
    .min(1, { message: "Assessment name is required" })
    .max(200, { message: "Assessment name cannot exceed 200 characters" })
    .optional(),
  parts: z
    .array(AssessmentPartInputSchema)
    .min(1, { message: "Assessment must have at least one part" })
    .max(20, { message: "Assessment cannot have more than 20 parts" })
    .optional(),
  scheduling: SchedulingConfigSchema.partial().optional(),
  status: z
    .literal("archived", {
      errorMap: () => ({ message: 'Status can only be set to "archived"' }),
    })
    .optional(),
});

export type UpdateAssessmentInput = z.infer<typeof UpdateAssessmentInputSchema>;

// =============================================================================
// SET JOB ASSESSMENT INPUT
// =============================================================================

/**
 * Input for assigning an assessment to a job.
 */
export const SetJobAssessmentInputSchema = z.object({
  assessmentId: z.string({
    required_error: "Assessment ID is required",
  }),
});

export type SetJobAssessmentInput = z.infer<typeof SetJobAssessmentInputSchema>;

// =============================================================================
// SCHEDULE INPUT (Candidate-Facing)
// =============================================================================

/**
 * Input for a candidate scheduling their assessment.
 * The scheduled time must be a valid future ISO datetime.
 */
export const ScheduleInputSchema = z.object({
  scheduledFor: z
    .string({ required_error: "Scheduled time is required" })
    .datetime({ message: "Scheduled time must be a valid ISO 8601 datetime" })
    .refine(
      (val) => new Date(val) > new Date(),
      { message: "Scheduled time must be in the future" }
    ),
  timezone: z
    .string({ required_error: "Timezone is required" })
    .refine(
      (val) => {
        try {
          Intl.DateTimeFormat(undefined, { timeZone: val });
          return true;
        } catch {
          return false;
        }
      },
      { message: "Timezone must be a valid IANA timezone identifier" }
    ),
});

export type ScheduleInput = z.infer<typeof ScheduleInputSchema>;

// =============================================================================
// EVALUATE INPUT
// =============================================================================

/**
 * Signal levels for assessment evaluation.
 * Aligned with Zehire's signal-first philosophy:
 * - clear_evidence: Candidate clearly demonstrated the required competency
 * - some_gaps: Partial demonstration with notable gaps
 * - insufficient_evidence: Not enough evidence to support advancement
 */
export const EvaluateSignalSchema = z.enum(
  ["clear_evidence", "some_gaps", "insufficient_evidence"],
  {
    errorMap: () => ({
      message:
        "Signal must be one of: clear_evidence, some_gaps, insufficient_evidence",
    }),
  }
);

export type EvaluateSignal = z.infer<typeof EvaluateSignalSchema>;

/**
 * Input for evaluating a submitted assessment.
 */
export const EvaluateInputSchema = z.object({
  signal: EvaluateSignalSchema,
  notes: z
    .string()
    .max(5000, { message: "Notes cannot exceed 5,000 characters" })
    .optional(),
});

export type EvaluateInput = z.infer<typeof EvaluateInputSchema>;

// =============================================================================
// CANCEL INPUT
// =============================================================================

/**
 * Input for cancelling an assessment invitation.
 */
export const CancelInputSchema = z.object({
  reason: z
    .string()
    .max(1000, { message: "Cancellation reason cannot exceed 1,000 characters" })
    .optional(),
});

export type CancelInput = z.infer<typeof CancelInputSchema>;

// =============================================================================
// BULK INVITE INPUT
// =============================================================================

/**
 * Input for bulk-inviting candidates to an assessment.
 */
export const BulkInviteInputSchema = z.object({
  candidateIds: z
    .array(
      z.string({ required_error: "Each candidate ID must be a string" }),
      { required_error: "Candidate IDs are required" }
    )
    .min(1, { message: "At least one candidate must be selected" })
    .max(50, { message: "Cannot invite more than 50 candidates at once" }),
});

export type BulkInviteInput = z.infer<typeof BulkInviteInputSchema>;

// =============================================================================
// ERROR TYPES (Discriminated Union)
// =============================================================================

/**
 * All possible error codes from the assessment service.
 * Uses a discriminated union on `code` for exhaustive pattern matching.
 */
export type AssessmentServiceError =
  | { code: "NOT_FOUND"; message: string }
  | { code: "FORBIDDEN"; message: string }
  | { code: "VALIDATION_ERROR"; message: string }
  | { code: "ASSESSMENT_NOT_FOUND"; message: string }
  | { code: "ASSESSMENT_ARCHIVED"; message: string }
  | { code: "NO_ASSESSMENT"; message: string }
  | { code: "ALREADY_INVITED"; message: string }
  | { code: "ALREADY_SCHEDULED"; message: string }
  | { code: "ALREADY_STARTED"; message: string }
  | { code: "ALREADY_SUBMITTED"; message: string }
  | { code: "ALREADY_EVALUATED"; message: string }
  | { code: "ALREADY_CANCELLED"; message: string }
  | { code: "NOT_SCHEDULED"; message: string }
  | { code: "NOT_IN_PROGRESS"; message: string }
  | { code: "NOT_SUBMITTED"; message: string }
  | { code: "NOT_EVALUATED"; message: string }
  | { code: "EXPIRED"; message: string }
  | { code: "NO_RESCHEDULES_LEFT"; message: string }
  | { code: "PAST_SCHEDULE_DEADLINE"; message: string }
  | { code: "INVALID_TIME"; message: string }
  | { code: "INVALID_SIGNAL"; message: string }
  | { code: "INVALID_FILE_TYPE"; message: string }
  | { code: "FILE_TOO_LARGE"; message: string }
  | { code: "FILE_NOT_FOUND"; message: string }
  | { code: "PART_NOT_FOUND"; message: string }
  | { code: "MISSING_PARTS"; message: string; missingParts: string[] }
  | { code: "JOB_NOT_OPEN"; message: string }
  | { code: "JOB_PUBLISHED"; message: string }
  | { code: "JOB_CLOSED"; message: string }
  | { code: "EMPTY_LIST"; message: string }
  | { code: "TOO_MANY_CANDIDATES"; message: string }
  | { code: "CANCELLED"; message: string };

/**
 * Result type for assessment service operations.
 * Enforces explicit success/failure handling at call sites.
 */
export type AssessmentServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: AssessmentServiceError };

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if the current time is within the grace period after a deadline.
 * Returns true if `now` is before `deadline + ASSESSMENT_GRACE_PERIOD_MINUTES`.
 */
export function isWithinGracePeriod(deadline: string): boolean {
  const deadlineDate = new Date(deadline);
  const graceEnd = new Date(
    deadlineDate.getTime() + ASSESSMENT_GRACE_PERIOD_MINUTES * 60 * 1000
  );
  return new Date() <= graceEnd;
}

/**
 * Check if a filename has an allowed file extension.
 * Handles compound extensions like `.tar.gz`.
 */
export function isAllowedFileType(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_FILE_TYPES.some((ext) => lower.endsWith(ext));
}

/**
 * Check if a MIME type is allowed for evidence uploads.
 */
export function isAllowedMimeType(mimeType: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Extract the file extension from a filename.
 * Returns the compound extension for known multi-part extensions (e.g., `.tar.gz`).
 * Returns an empty string if no extension is found.
 */
export function getFileExtension(filename: string): string {
  const lower = filename.toLowerCase();

  // Check compound extensions first
  if (lower.endsWith(".tar.gz")) {
    return ".tar.gz";
  }

  const lastDot = lower.lastIndexOf(".");
  if (lastDot === -1) {
    return "";
  }
  return lower.slice(lastDot);
}
