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
  type ApplicationConfig,
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
  applicationNotes,
  applicationEvents,
  applicationStatuses,
  signalsStatuses,
  extractionStatuses,
  triageStatuses,
  eventTypes,
  type Application,
  type NewApplication,
  type ApplicationStatus,
  type SignalsStatus,
  type Answer,
  type NewAnswer,
  type ExtractionStatus,
  type ApplicationDraft,
  type NewApplicationDraft,
  type TriageStatus,
  type ApplicationNote,
  type NewApplicationNote,
  type ApplicationEvent,
  type NewApplicationEvent,
  type EventType,
} from "./applications";

// Custom Questions & CV (Phase 8)
export {
  customQuestions,
  customAnswers,
  cvWorkExperiences,
  cvEducation,
  cvSkills,
  questionCategories,
  answerTypes,
  failActions,
  cvExtractionStatuses,
  skillCategories,
  type CustomQuestion,
  type NewCustomQuestion,
  type CustomAnswer,
  type NewCustomAnswer,
  type CVWorkExperience,
  type NewCVWorkExperience,
  type CVEducationRecord,
  type NewCVEducationRecord,
  type CVSkill,
  type NewCVSkill,
  type QuestionCategory,
  type AnswerType,
  type FailAction,
  type CVExtractionStatus,
  type SkillCategory,
} from "./custom-questions";

// Interviews & Scheduling (Phase 9)
export {
  // Tables
  interviewers,
  interviewerAvailability,
  interviewerBlockedDates,
  interviewStageConfig,
  interviewStageInterviewers,
  scheduledInterviews,
  interviewParticipants,
  schedulingTokens,
  // Enums
  interviewerStatuses,
  calendarProviders,
  interviewModes,
  interviewStatuses,
  feedbackStatuses,
  videoCallProviders,
  // Types
  type Interviewer,
  type NewInterviewer,
  type InterviewerStatus,
  type CalendarProvider,
  type InterviewerAvailabilityRecord,
  type NewInterviewerAvailability,
  type InterviewerBlockedDate,
  type NewInterviewerBlockedDate,
  type InterviewStageConfigRecord,
  type NewInterviewStageConfig,
  type InterviewMode,
  type InterviewStageInterviewer,
  type NewInterviewStageInterviewer,
  type ScheduledInterview,
  type NewScheduledInterview,
  type InterviewStatus,
  type InterviewParticipant,
  type NewInterviewParticipant,
  type FeedbackStatus,
  type VideoCallProvider,
  type SchedulingToken,
  type NewSchedulingToken,
} from "./interviews";
