/**
 * Applications Domain
 * ===================
 * Public exports for candidate applications.
 */

// Repository
export { ApplicationRepository } from "./repository";

// CV Service
export {
  CvService,
  ALLOWED_CV_TYPES,
  CV_TYPE_NAMES,
  MAX_CV_SIZE,
  type CvUploadResult,
  type CvValidationError,
} from "./cv.service";

// Schemas
export {
  // Constants
  APPLICATION_STATUSES,
  DRAFT_EXPIRY_DAYS,
  EXTRACTION_STATUSES,
  MIN_ANSWER_LENGTH,
  SIGNALS_STATUSES,
  // Input schemas
  AnswerInputSchema,
  DraftAnswerSchema,
  PublicApplySchema,
  ResumeDraftSchema,
  SaveDraftSchema,
  // Response schemas
  PublicApplyResponseSchema,
  ResumeDraftResponseSchema,
  SaveDraftResponseSchema,
  // Phase 0B: Recruiter API schemas
  ApplicationDetailSchema,
  ApplicationSummarySchema,
  ListApplicationsQuerySchema,
  UpdateApplicationSchema,
} from "./schemas";

// Types
export type {
  Answer,
  AnswerInput,
  Application,
  ApplicationDraft,
  ApplicationStatus,
  DraftAnswer,
  ExtractionStatus,
  PublicApplyInput,
  PublicApplyResponse,
  ResumeDraftInput,
  ResumeDraftResponse,
  SaveDraftInput,
  SaveDraftResponse,
  SignalsStatus,
  // Phase 0B: Recruiter API types
  ApplicationDetail,
  ApplicationSummary,
  ListApplicationsQuery,
  UpdateApplicationInput,
} from "./schemas";
