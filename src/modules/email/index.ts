/**
 * Email Module
 * ============
 * Provider-agnostic email sending.
 */

export {
  createEmailGateway,
  createEmailGatewayFromEnv,
  ConsoleEmailGateway,
  type EmailGateway,
  type EmailGatewayConfig,
  type SendMagicLinkInput,
  type SendInterviewerInviteInput,
  type SendInterviewConfirmationInput,
  type SendInterviewReminderInput,
  type SendFeedbackReminderInput,
  type SendInterviewRescheduleInput,
  type SendInterviewCancellationInput,
  type SendAssessmentInviteInput,
} from "./email.gateway";
