/**
 * Jobs Domain Module
 * ==================
 * Public exports for the jobs domain.
 */

// Repository
export {
  JobRepository,
  OrgRepository,
  BillingEventRepository,
  BILLING_EVENT_TYPES,
  type CapacityStatus,
  type OrgCapacityInfo,
  type BillingEvent,
  type BillingEventType,
  type RecordBillingEventInput,
} from "./repository";

// Service
export { JobService, type JobServiceError, type JobServiceResult } from "./service";

// Processor (for queue consumer)
export { JobProcessor } from "./processor";

// Slug utilities
export { generateBaseSlug, generateUniqueSlug } from "./slug";

// Schemas and types
export {
  CreateJobInputSchema,
  CreateJobResponseSchema,
  JobContextSchema,
  JobListResponseSchema,
  JobStatusResponseSchema,
  PublicJobResponseSchema,
  RenderedQuestionSchema,
  ResolvedArchetypeSchema,
  UpdateJobInputSchema,
  type CreateJobInput,
  type CreateJobResponse,
  type JobContextOutput,
  type JobListItem,
  type JobListResponse,
  type JobRow,
  type JobStatusResponse,
  type PublicJobResponse,
  type RenderedQuestionOutput,
  type ResolvedArchetypeOutput,
  type UpdateJobInput,
} from "./schemas";

// Archetypes (re-export for convenience)
export type { LLMClient } from "./archetypes/inference";
export type { Archetype, JobContext, ResolvedArchetype } from "./archetypes/types";
