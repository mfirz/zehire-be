/**
 * Email Gateway Interface
 * =======================
 * Provider-agnostic interface for sending emails.
 *
 * This module defines the contract for email delivery without
 * depending on any specific provider (AWS SES, Resend, etc.).
 *
 * Implementations:
 * - ConsoleEmailGateway: Logs to console (development/testing)
 * - SesEmailGateway: AWS SES implementation (production)
 */

import type { Env } from "../../types/bindings";
import { SesEmailGateway } from "./providers/ses";

// =============================================================================
// INTERFACE
// =============================================================================

/**
 * Input for sending a magic link email.
 */
export interface SendMagicLinkInput {
  /** Recipient email address */
  email: string;

  /** Full magic link URL (includes token) */
  magicLinkUrl: string;

  /** When the magic link expires */
  expiresAt: Date;
}

/**
 * Input for sending an interviewer invite email.
 */
export interface SendInterviewerInviteInput {
  /** Interviewer email address */
  email: string;

  /** Interviewer name */
  name: string | null;

  /** Company/org name */
  companyName: string;

  /** Magic link URL to set up calendar */
  setupUrl: string;
}

/**
 * Input for sending interview confirmation email.
 */
export interface SendInterviewConfirmationInput {
  /** Candidate email address */
  candidateEmail: string;

  /** Candidate name */
  candidateName: string;

  /** Job title */
  jobTitle: string;

  /** Company name */
  companyName: string;

  /** Stage name (e.g., "Technical Interview") */
  stageName: string;

  /** Scheduled date/time in ISO format */
  scheduledAt: string;

  /** Interview duration in minutes */
  durationMinutes: number;

  /** Timezone for display */
  timezone: string;

  /** Video call link */
  videoCallLink: string | null;

  /** Interviewer names */
  interviewerNames: string[];

  /** ICS calendar file content */
  icsContent: string;
}

/**
 * Input for sending interview reminder email (24h before).
 */
export interface SendInterviewReminderInput {
  /** Recipient email (candidate or interviewer) */
  email: string;

  /** Recipient name */
  name: string;

  /** Whether this is for candidate or interviewer */
  recipientType: "candidate" | "interviewer";

  /** Job title */
  jobTitle: string;

  /** Company name */
  companyName: string;

  /** Scheduled date/time in ISO format */
  scheduledAt: string;

  /** Interview duration in minutes */
  durationMinutes: number;

  /** Timezone for display */
  timezone: string;

  /** Video call link */
  videoCallLink: string | null;

  /** For interviewer: candidate name */
  candidateName?: string | undefined;

  /** For interviewer: link to interview guide */
  interviewGuideUrl?: string | undefined;
}

/**
 * Input for sending feedback reminder email (2h after interview).
 */
export interface SendFeedbackReminderInput {
  /** Interviewer email */
  email: string;

  /** Interviewer name */
  interviewerName: string;

  /** Candidate name */
  candidateName: string;

  /** Job title */
  jobTitle: string;

  /** Link to submit feedback */
  feedbackUrl: string;
}

/**
 * Input for sending interview reschedule email.
 */
export interface SendInterviewRescheduleInput {
  /** Recipient email */
  email: string;

  /** Recipient name */
  name: string;

  /** Whether this is for candidate or interviewer */
  recipientType: "candidate" | "interviewer";

  /** Job title */
  jobTitle: string;

  /** Company name */
  companyName: string;

  /** Original scheduled time */
  originalScheduledAt: string;

  /** New scheduled time */
  newScheduledAt: string;

  /** Interview duration in minutes */
  durationMinutes: number;

  /** Timezone for display */
  timezone: string;

  /** Video call link */
  videoCallLink: string | null;

  /** Updated ICS calendar file content */
  icsContent: string;
}

/**
 * Input for sending interview cancellation email.
 */
export interface SendInterviewCancellationInput {
  /** Recipient email */
  email: string;

  /** Recipient name */
  name: string;

  /** Whether this is for candidate or interviewer */
  recipientType: "candidate" | "interviewer";

  /** Job title */
  jobTitle: string;

  /** Company name */
  companyName: string;

  /** Original scheduled time */
  scheduledAt: string;

  /** Timezone for display */
  timezone: string;

  /** Cancellation reason (optional) */
  reason?: string | undefined;
}

/**
 * Email gateway interface.
 * Implement this interface to add a new email provider.
 */
export interface EmailGateway {
  /**
   * Send a magic link email for authentication.
   */
  sendMagicLink(input: SendMagicLinkInput): Promise<void>;

  /**
   * Send an interviewer invite email.
   */
  sendInterviewerInvite(input: SendInterviewerInviteInput): Promise<void>;

  /**
   * Send interview confirmation email to candidate.
   */
  sendInterviewConfirmation(input: SendInterviewConfirmationInput): Promise<void>;

  /**
   * Send interview reminder email (24h before).
   */
  sendInterviewReminder(input: SendInterviewReminderInput): Promise<void>;

  /**
   * Send feedback reminder email to interviewer (2h after).
   */
  sendFeedbackReminder(input: SendFeedbackReminderInput): Promise<void>;

  /**
   * Send interview reschedule notification.
   */
  sendInterviewReschedule(input: SendInterviewRescheduleInput): Promise<void>;

  /**
   * Send interview cancellation notification.
   */
  sendInterviewCancellation(input: SendInterviewCancellationInput): Promise<void>;
}

// =============================================================================
// CONSOLE IMPLEMENTATION (Development/Testing)
// =============================================================================

/**
 * Console-based email gateway for development and testing.
 * Logs email details to console instead of sending real emails.
 */
export class ConsoleEmailGateway implements EmailGateway {
  async sendMagicLink(input: SendMagicLinkInput): Promise<void> {
    console.log("========================================");
    console.log("[EmailGateway] Magic Link Email (Console)");
    console.log("========================================");
    console.log(`To: ${input.email}`);
    console.log(`Magic Link: ${input.magicLinkUrl}`);
    console.log(`Expires At: ${input.expiresAt.toISOString()}`);
    console.log("========================================");
  }

  async sendInterviewerInvite(input: SendInterviewerInviteInput): Promise<void> {
    console.log("========================================");
    console.log("[EmailGateway] Interviewer Invite (Console)");
    console.log("========================================");
    console.log(`To: ${input.email}`);
    console.log(`Name: ${input.name ?? "N/A"}`);
    console.log(`Company: ${input.companyName}`);
    console.log(`Setup URL: ${input.setupUrl}`);
    console.log("========================================");
  }

  async sendInterviewConfirmation(input: SendInterviewConfirmationInput): Promise<void> {
    console.log("========================================");
    console.log("[EmailGateway] Interview Confirmation (Console)");
    console.log("========================================");
    console.log(`To: ${input.candidateEmail}`);
    console.log(`Candidate: ${input.candidateName}`);
    console.log(`Job: ${input.jobTitle} at ${input.companyName}`);
    console.log(`Stage: ${input.stageName}`);
    console.log(`When: ${input.scheduledAt} (${input.timezone})`);
    console.log(`Duration: ${input.durationMinutes} minutes`);
    console.log(`Video Call: ${input.videoCallLink ?? "N/A"}`);
    console.log(`Interviewers: ${input.interviewerNames.join(", ")}`);
    console.log(`ICS Content: ${input.icsContent.substring(0, 100)}...`);
    console.log("========================================");
  }

  async sendInterviewReminder(input: SendInterviewReminderInput): Promise<void> {
    console.log("========================================");
    console.log(`[EmailGateway] Interview Reminder - ${input.recipientType} (Console)`);
    console.log("========================================");
    console.log(`To: ${input.email}`);
    console.log(`Name: ${input.name}`);
    console.log(`Job: ${input.jobTitle} at ${input.companyName}`);
    console.log(`When: ${input.scheduledAt} (${input.timezone})`);
    console.log(`Duration: ${input.durationMinutes} minutes`);
    console.log(`Video Call: ${input.videoCallLink ?? "N/A"}`);
    if (input.candidateName) console.log(`Candidate: ${input.candidateName}`);
    if (input.interviewGuideUrl) console.log(`Guide: ${input.interviewGuideUrl}`);
    console.log("========================================");
  }

  async sendFeedbackReminder(input: SendFeedbackReminderInput): Promise<void> {
    console.log("========================================");
    console.log("[EmailGateway] Feedback Reminder (Console)");
    console.log("========================================");
    console.log(`To: ${input.email}`);
    console.log(`Interviewer: ${input.interviewerName}`);
    console.log(`Candidate: ${input.candidateName}`);
    console.log(`Job: ${input.jobTitle}`);
    console.log(`Feedback URL: ${input.feedbackUrl}`);
    console.log("========================================");
  }

  async sendInterviewReschedule(input: SendInterviewRescheduleInput): Promise<void> {
    console.log("========================================");
    console.log(`[EmailGateway] Interview Rescheduled - ${input.recipientType} (Console)`);
    console.log("========================================");
    console.log(`To: ${input.email}`);
    console.log(`Name: ${input.name}`);
    console.log(`Job: ${input.jobTitle} at ${input.companyName}`);
    console.log(`Original: ${input.originalScheduledAt}`);
    console.log(`New: ${input.newScheduledAt} (${input.timezone})`);
    console.log(`Duration: ${input.durationMinutes} minutes`);
    console.log(`Video Call: ${input.videoCallLink ?? "N/A"}`);
    console.log("========================================");
  }

  async sendInterviewCancellation(input: SendInterviewCancellationInput): Promise<void> {
    console.log("========================================");
    console.log(`[EmailGateway] Interview Cancelled - ${input.recipientType} (Console)`);
    console.log("========================================");
    console.log(`To: ${input.email}`);
    console.log(`Name: ${input.name}`);
    console.log(`Job: ${input.jobTitle} at ${input.companyName}`);
    console.log(`Was Scheduled: ${input.scheduledAt} (${input.timezone})`);
    if (input.reason) console.log(`Reason: ${input.reason}`);
    console.log("========================================");
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Configuration for email gateway creation.
 */
export interface EmailGatewayConfig {
  /** AWS Access Key ID (required for SES) */
  awsAccessKeyId?: string | undefined;
  /** AWS Secret Access Key (required for SES) */
  awsSecretAccessKey?: string | undefined;
  /** AWS Region (required for SES) */
  awsRegion?: string | undefined;
  /** Verified sender email address (required for SES) */
  sesFromEmail?: string | undefined;
  /** Optional SES configuration set name */
  sesConfigurationSet?: string | undefined;
}

/**
 * Create an email gateway instance based on configuration.
 *
 * Returns SES gateway if AWS credentials are configured,
 * otherwise falls back to console gateway for development.
 *
 * @example
 * ```typescript
 * // From Hono context:
 * const emailGateway = createEmailGateway({
 *   awsAccessKeyId: c.env.AWS_ACCESS_KEY_ID,
 *   awsSecretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
 *   awsRegion: c.env.AWS_REGION,
 *   sesFromEmail: c.env.SES_FROM_EMAIL,
 * });
 * ```
 */
export function createEmailGateway(config: EmailGatewayConfig = {}): EmailGateway {
  const { awsAccessKeyId, awsSecretAccessKey, awsRegion, sesFromEmail, sesConfigurationSet } =
    config;

  // Check if SES is configured
  if (awsAccessKeyId && awsSecretAccessKey && awsRegion && sesFromEmail) {
    console.log("[EmailGateway] Using AWS SES provider");
    return new SesEmailGateway({
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
      region: awsRegion,
      fromEmail: sesFromEmail,
      configurationSet: sesConfigurationSet,
    });
  }

  // Fall back to console gateway
  console.log("[EmailGateway] Using Console provider (SES not configured)");
  return new ConsoleEmailGateway();
}

/**
 * Create an email gateway from Cloudflare Workers environment bindings.
 *
 * Convenience function that extracts config from Env.
 *
 * @example
 * ```typescript
 * const emailGateway = createEmailGatewayFromEnv(c.env);
 * ```
 */
export function createEmailGatewayFromEnv(env: Env): EmailGateway {
  return createEmailGateway({
    awsAccessKeyId: env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    awsRegion: env.AWS_REGION,
    sesFromEmail: env.SES_FROM_EMAIL,
    sesConfigurationSet: env.SES_CONFIGURATION_SET,
  });
}
