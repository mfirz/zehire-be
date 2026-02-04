/**
 * Assessment Response Formatters
 * ==============================
 * Pure functions that transform service/DB data into documented API response shapes.
 * Used by route handlers to ensure consistent response structures.
 */

import type {
  AssessmentDefinition,
  AssessmentPart,
  CandidateAssessment,
  AssessmentFile,
} from "../../db/schema/assessments";
import type { SchedulingConfig } from "../../domain/assessments/types";
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES } from "../../domain/assessments/types";

// =============================================================================
// HELPERS
// =============================================================================

function parseScheduling(configJson: string): SchedulingConfig {
  try {
    return JSON.parse(configJson);
  } catch {
    return { scheduleWithinDays: 7, completeWithinHours: 48, maxReschedules: 2 };
  }
}

function formatScheduledMessage(scheduledFor: string, timezone: string, prefix: string): string {
  try {
    const date = new Date(scheduledFor);
    const formatted = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
      timeZoneName: "short",
    }).format(date);
    return `${prefix} ${formatted}`;
  } catch {
    return `${prefix} ${scheduledFor}`;
  }
}

function groupFilesByPart(
  defParts: AssessmentPart[],
  files: AssessmentFile[],
  includeDownloadUrl: boolean
) {
  const partMap = new Map(defParts.map((p) => [p.id, p.name]));
  const grouped = new Map<string, AssessmentFile[]>();

  for (const file of files) {
    const existing = grouped.get(file.partId) ?? [];
    existing.push(file);
    grouped.set(file.partId, existing);
  }

  return Array.from(grouped.entries()).map(([partId, partFiles]) => ({
    partId,
    partName: partMap.get(partId) ?? partId,
    files: partFiles.map((f) => ({
      id: f.id,
      name: f.fileName,
      size: f.fileSize,
      mimeType: f.mimeType,
      uploadedAt: f.uploadedAt,
      ...(includeDownloadUrl ? { downloadUrl: `/assessments/files/${f.id}` } : {}),
    })),
  }));
}

// =============================================================================
// LIBRARY FORMATTERS
// =============================================================================

export function formatDefinitionResponse(
  definition: AssessmentDefinition,
  parts: AssessmentPart[]
) {
  const scheduling = parseScheduling(definition.schedulingConfig);
  return {
    id: definition.id,
    name: definition.name,
    parts: parts.map((p) => ({
      id: p.id,
      name: p.name,
      instructions: p.instructions,
      evidenceDescription: p.evidenceDescription,
      required: p.required,
    })),
    scheduling,
    status: definition.status,
    createdAt: definition.createdAt,
    updatedAt: definition.updatedAt,
  };
}

export function formatDefinitionListItem(
  definition: AssessmentDefinition & { partsCount: number }
) {
  const scheduling = parseScheduling(definition.schedulingConfig);
  return {
    id: definition.id,
    name: definition.name,
    partsCount: definition.partsCount,
    scheduling,
    status: definition.status,
    createdAt: definition.createdAt,
    updatedAt: definition.updatedAt,
  };
}

// =============================================================================
// JOB ASSESSMENT FORMATTERS
// =============================================================================

export function formatJobAssessmentResponse(
  definition: AssessmentDefinition,
  parts: AssessmentPart[],
  scheduling: SchedulingConfig,
  isSnapshot: boolean,
  snapshotAt: string | null
) {
  return {
    assessmentId: definition.id,
    name: definition.name,
    parts: parts.map((p) => ({
      id: p.id,
      name: p.name,
      instructions: p.instructions,
      evidenceDescription: p.evidenceDescription,
      required: p.required,
    })),
    scheduling,
    isSnapshot,
    snapshotAt,
  };
}

// =============================================================================
// CANDIDATE ASSESSMENT (RECRUITER) FORMATTERS
// =============================================================================

export function formatRecruiterAssessmentResponse(
  assessment: CandidateAssessment,
  defName: string,
  defParts: AssessmentPart[],
  files: AssessmentFile[]
) {
  const result: Record<string, unknown> = {
    id: assessment.id,
    status: assessment.status,
    assessment: {
      name: defName,
      parts: defParts.map((p) => ({
        id: p.id,
        name: p.name,
        evidenceDescription: p.evidenceDescription,
        required: p.required,
      })),
    },
    timeline: {
      invitedAt: assessment.invitedAt,
      scheduleDeadline: assessment.scheduleDeadline,
      scheduledFor: assessment.scheduledFor ?? null,
      scheduledTimezone: assessment.scheduledTimezone ?? null,
      completionDeadline: assessment.completionDeadline ?? null,
      startedAt: assessment.startedAt ?? null,
      submittedAt: assessment.submittedAt ?? null,
    },
    rescheduleCount: assessment.rescheduleCount,
    submissions: files.length > 0
      ? groupFilesByPart(defParts, files, true)
      : null,
    evaluation: assessment.evaluationSignal
      ? {
          signal: assessment.evaluationSignal,
          notes: assessment.evaluationNotes ?? null,
          evaluatedBy: assessment.evaluatedBy,
          evaluatedAt: assessment.evaluatedAt,
          updatedBy: assessment.evaluationUpdatedBy ?? null,
          updatedAt: assessment.evaluationUpdatedAt ?? null,
        }
      : null,
  };

  if (assessment.status === "cancelled") {
    result.cancelledAt = assessment.cancelledAt;
    result.cancelReason = assessment.cancelReason ?? null;
  }

  return result;
}

export function formatInviteResponse(assessment: CandidateAssessment) {
  return {
    id: assessment.id,
    status: assessment.status,
    timeline: {
      invitedAt: assessment.invitedAt,
      scheduleDeadline: assessment.scheduleDeadline,
      scheduledFor: assessment.scheduledFor ?? null,
      scheduledTimezone: assessment.scheduledTimezone ?? null,
      completionDeadline: assessment.completionDeadline ?? null,
      startedAt: assessment.startedAt ?? null,
      submittedAt: assessment.submittedAt ?? null,
    },
  };
}

export function formatEvaluateResponse(assessment: CandidateAssessment) {
  return {
    id: assessment.id,
    status: assessment.status,
    evaluation: {
      signal: assessment.evaluationSignal,
      notes: assessment.evaluationNotes ?? null,
      evaluatedBy: assessment.evaluatedBy,
      evaluatedAt: assessment.evaluatedAt,
      updatedBy: assessment.evaluationUpdatedBy ?? null,
      updatedAt: assessment.evaluationUpdatedAt ?? null,
    },
  };
}

export function formatCancelResponse(assessment: CandidateAssessment) {
  return {
    id: assessment.id,
    status: assessment.status,
    cancelledAt: assessment.cancelledAt,
    cancelReason: assessment.cancelReason ?? null,
  };
}

// =============================================================================
// CANDIDATE PORTAL FORMATTERS
// =============================================================================

export function formatPortalResponse(
  assessment: CandidateAssessment,
  definition: AssessmentDefinition,
  parts: AssessmentPart[],
  scheduling: SchedulingConfig,
  files: AssessmentFile[],
  job: { title: string; companyName: string | null }
) {
  const base = {
    id: assessment.id,
    status: assessment.status,
    company: job.companyName ?? "Company",
    jobTitle: job.title,
  };

  switch (assessment.status) {
    case "invited":
    case "scheduled":
      return {
        ...base,
        assessment: {
          name: definition.name,
          parts: parts.map((p) => ({
            id: p.id,
            name: p.name,
            instructions: null as string | null,
            required: p.required,
          })),
        },
        scheduling: {
          scheduleDeadline: assessment.scheduleDeadline,
          completeWithinHours: scheduling.completeWithinHours,
          maxReschedules: scheduling.maxReschedules,
        },
        scheduledFor: assessment.scheduledFor ?? null,
        scheduledTimezone: assessment.scheduledTimezone ?? null,
        completionDeadline: assessment.completionDeadline ?? null,
        rescheduleCount: assessment.rescheduleCount,
        remainingReschedules: scheduling.maxReschedules - assessment.rescheduleCount,
      };

    case "in_progress":
      return {
        ...base,
        assessment: {
          name: definition.name,
          parts: parts.map((p) => {
            const partFiles = files.filter((f) => f.partId === p.id);
            return {
              id: p.id,
              name: p.name,
              instructions: p.instructions,
              required: p.required,
              files: partFiles.map((f) => ({
                id: f.id,
                name: f.fileName,
                size: f.fileSize,
                mimeType: f.mimeType,
                uploadedAt: f.uploadedAt,
              })),
            };
          }),
        },
        completionDeadline: assessment.completionDeadline,
        allowedFileTypes: [...ALLOWED_FILE_TYPES],
        maxFileSizeMB: MAX_FILE_SIZE_BYTES / (1024 * 1024),
      };

    case "submitted":
    case "evaluated":
      return {
        ...base,
        assessment: { name: definition.name },
        submittedAt: assessment.submittedAt,
        message: "Your assessment has been submitted. Good luck!",
      };

    case "schedule_expired":
      return {
        ...base,
        assessment: { name: definition.name },
        message: "The scheduling deadline has passed.",
      };

    case "expired":
      return {
        ...base,
        assessment: { name: definition.name },
        message: "The assessment deadline has passed.",
      };

    case "cancelled":
      return {
        ...base,
        assessment: { name: definition.name },
        message: "This assessment has been cancelled.",
      };

    default:
      return { ...base, assessment: { name: definition.name } };
  }
}

export function formatScheduleResponse(assessment: CandidateAssessment) {
  const message = assessment.scheduledFor && assessment.scheduledTimezone
    ? formatScheduledMessage(assessment.scheduledFor, assessment.scheduledTimezone, "Scheduled for")
    : undefined;

  return {
    id: assessment.id,
    status: assessment.status,
    scheduledFor: assessment.scheduledFor,
    scheduledTimezone: assessment.scheduledTimezone,
    completionDeadline: assessment.completionDeadline,
    ...(message ? { message } : {}),
  };
}

export function formatRescheduleResponse(
  assessment: CandidateAssessment,
  maxReschedules: number
) {
  const message = assessment.scheduledFor && assessment.scheduledTimezone
    ? formatScheduledMessage(assessment.scheduledFor, assessment.scheduledTimezone, "Rescheduled to")
    : undefined;

  return {
    id: assessment.id,
    status: assessment.status,
    scheduledFor: assessment.scheduledFor,
    scheduledTimezone: assessment.scheduledTimezone,
    completionDeadline: assessment.completionDeadline,
    rescheduleCount: assessment.rescheduleCount,
    remainingReschedules: maxReschedules - assessment.rescheduleCount,
    ...(message ? { message } : {}),
  };
}

export function formatStartResponse(assessment: CandidateAssessment) {
  return {
    id: assessment.id,
    status: assessment.status,
  };
}

export function formatSubmitResponse(assessment: CandidateAssessment) {
  return {
    id: assessment.id,
    status: assessment.status,
    submittedAt: assessment.submittedAt,
    message: "Assessment submitted successfully. Good luck!",
  };
}

export function formatUploadResponse(file: AssessmentFile) {
  return {
    id: file.id,
    name: file.fileName,
    size: file.fileSize,
    mimeType: file.mimeType,
    uploadedAt: file.uploadedAt,
  };
}
