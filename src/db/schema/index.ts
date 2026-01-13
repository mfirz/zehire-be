/**
 * Schema Index
 * ============
 * Re-exports all table schemas and types.
 */

// Organizations
export { orgs, type Org, type NewOrg } from "./orgs";

// Users & Auth
export {
  users,
  magicLinkTokens,
  userRoles,
  type User,
  type NewUser,
  type UserRole,
  type MagicLinkToken,
  type NewMagicLinkToken,
} from "./users";

// Jobs
export {
  jobs,
  jobStatuses,
  questionsStatuses,
  pipelineStatuses,
  workTypes,
  employmentTypes,
  salaryCurrencies,
  type Job,
  type NewJob,
  type JobStatus,
  type QuestionsStatus,
  type PipelineStatus,
  type WorkType,
  type EmploymentType,
  type SalaryCurrency,
} from "./jobs";

// Billing
export {
  billingEvents,
  pricingHistory,
  billingPeriods,
  billingEventTypes,
  billingPeriodStatuses,
  type BillingEvent,
  type NewBillingEvent,
  type BillingEventType,
  type PricingHistoryRecord,
  type NewPricingHistoryRecord,
  type BillingPeriod,
  type NewBillingPeriod,
  type BillingPeriodStatus,
} from "./billing";

// Applications
export {
  applications,
  answers,
  applicationDrafts,
  applicationStatuses,
  signalsStatuses,
  extractionStatuses,
  type Application,
  type NewApplication,
  type ApplicationStatus,
  type SignalsStatus,
  type Answer,
  type NewAnswer,
  type ExtractionStatus,
  type ApplicationDraft,
  type NewApplicationDraft,
} from "./applications";
