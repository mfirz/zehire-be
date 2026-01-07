/**
 * Jobs Domain Module
 * ==================
 * Public exports for the jobs domain.
 */

// Repository
export { JobRepository, OrgRepository } from "./repository";

// Service
export { JobService } from "./service";

// Processor (for queue consumer)
export { JobProcessor } from "./processor";

// Schemas and types
export {
  CreateJobInputSchema,
  CreateJobResponseSchema,
  JobContextSchema,
  JobListResponseSchema,
  JobStatusResponseSchema,
  RenderedQuestionSchema,
  ResolvedArchetypeSchema,
  type CreateJobInput,
  type CreateJobResponse,
  type JobContextOutput,
  type JobListItem,
  type JobListResponse,
  type JobRow,
  type JobStatusResponse,
  type RenderedQuestionOutput,
  type ResolvedArchetypeOutput,
} from "./schemas";

// Archetypes (re-export for convenience)
export type { LLMClient } from "./archetypes/inference";
export type { Archetype, JobContext, ResolvedArchetype } from "./archetypes/types";
