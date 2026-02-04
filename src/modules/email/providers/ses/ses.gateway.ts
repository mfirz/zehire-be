/**
 * AWS SES Email Gateway
 * =====================
 * Concrete EmailGateway implementation using AWS SES.
 *
 * Features:
 * - Workers-compatible (no AWS SDK)
 * - Non-blocking email delivery
 * - Failure-tolerant (logs errors, doesn't throw)
 * - Conservative with SES quota (no retries, no batching)
 */

import type {
  EmailGateway,
  SendMagicLinkInput,
  SendInterviewerInviteInput,
  SendInterviewConfirmationInput,
  SendInterviewReminderInput,
  SendFeedbackReminderInput,
  SendInterviewRescheduleInput,
  SendInterviewCancellationInput,
  SendSchedulingInviteInput,
  SendAssessmentInviteInput,
} from "../../email.gateway";
import { SesClient, SesError, type SesClientConfig } from "./ses.client";

// =============================================================================
// TYPES
// =============================================================================

export interface SesGatewayConfig extends SesClientConfig {
  /** Verified sender email address */
  fromEmail: string;
  /** Optional SES configuration set name */
  configurationSet?: string | undefined;
}

// =============================================================================
// SES GATEWAY CLASS
// =============================================================================

export class SesEmailGateway implements EmailGateway {
  private readonly client: SesClient;
  private readonly fromEmail: string;
  private readonly configurationSet?: string | undefined;

  constructor(config: SesGatewayConfig) {
    this.client = new SesClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
    });
    this.fromEmail = config.fromEmail;
    this.configurationSet = config.configurationSet;
  }

  /**
   * Send a magic link email.
   *
   * This method is designed to be failure-tolerant:
   * - Logs errors but doesn't throw
   * - Auth flow continues even if email fails
   * - Never reveals email status to caller
   */
  async sendMagicLink(input: SendMagicLinkInput): Promise<void> {
    const { email, magicLinkUrl, expiresAt } = input;

    // Calculate expiration in minutes for display
    const expiresInMinutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000));

    // Build email content
    const subject = "Your Zehire login link";
    const { textBody, htmlBody } = this.buildMagicLinkEmail(magicLinkUrl, expiresInMinutes);

    try {
      const result = await this.client.sendEmail({
        from: this.fromEmail,
        to: email,
        subject,
        textBody,
        htmlBody,
        configurationSet: this.configurationSet,
      });

      // Log success (without sensitive data)
      console.log("[SES] Email sent successfully", {
        messageId: result.messageId,
        recipient: this.redactEmail(email),
      });
    } catch (error) {
      // Log error with redacted data
      this.logError(error, email);

      // Don't rethrow - email failure should not break auth flow
      // The caller (auth service) will continue regardless
    }
  }

  /**
   * Send an interviewer invite email.
   */
  async sendInterviewerInvite(input: SendInterviewerInviteInput): Promise<void> {
    const subject = `You've been added as an interviewer at ${input.companyName}`;
    const { textBody, htmlBody } = this.buildInterviewerInviteEmail(input);

    try {
      const result = await this.client.sendEmail({
        from: this.fromEmail,
        to: input.email,
        subject,
        textBody,
        htmlBody,
        configurationSet: this.configurationSet,
      });

      console.log("[SES] Interviewer invite sent", {
        messageId: result.messageId,
        recipient: this.redactEmail(input.email),
      });
    } catch (error) {
      this.logError(error, input.email);
    }
  }

  /**
   * Send interview confirmation email to candidate.
   */
  async sendInterviewConfirmation(input: SendInterviewConfirmationInput): Promise<void> {
    const subject = `Interview Confirmed: ${input.jobTitle} at ${input.companyName}`;
    const { textBody, htmlBody } = this.buildInterviewConfirmationEmail(input);

    try {
      const result = await this.client.sendEmail({
        from: this.fromEmail,
        to: input.candidateEmail,
        subject,
        textBody,
        htmlBody,
        configurationSet: this.configurationSet,
        // TODO: Add ICS attachment when SES client supports it
      });

      console.log("[SES] Interview confirmation sent", {
        messageId: result.messageId,
        recipient: this.redactEmail(input.candidateEmail),
      });
    } catch (error) {
      this.logError(error, input.candidateEmail);
    }
  }

  /**
   * Send interview reminder email (24h before).
   */
  async sendInterviewReminder(input: SendInterviewReminderInput): Promise<void> {
    const subject =
      input.recipientType === "candidate"
        ? `Reminder: Your interview tomorrow - ${input.jobTitle}`
        : `Reminder: Interview tomorrow with ${input.candidateName}`;
    const { textBody, htmlBody } = this.buildInterviewReminderEmail(input);

    try {
      const result = await this.client.sendEmail({
        from: this.fromEmail,
        to: input.email,
        subject,
        textBody,
        htmlBody,
        configurationSet: this.configurationSet,
      });

      console.log("[SES] Interview reminder sent", {
        messageId: result.messageId,
        recipient: this.redactEmail(input.email),
        recipientType: input.recipientType,
      });
    } catch (error) {
      this.logError(error, input.email);
    }
  }

  /**
   * Send feedback reminder email to interviewer (2h after).
   */
  async sendFeedbackReminder(input: SendFeedbackReminderInput): Promise<void> {
    const subject = `Feedback needed: ${input.candidateName} - ${input.jobTitle}`;
    const { textBody, htmlBody } = this.buildFeedbackReminderEmail(input);

    try {
      const result = await this.client.sendEmail({
        from: this.fromEmail,
        to: input.email,
        subject,
        textBody,
        htmlBody,
        configurationSet: this.configurationSet,
      });

      console.log("[SES] Feedback reminder sent", {
        messageId: result.messageId,
        recipient: this.redactEmail(input.email),
      });
    } catch (error) {
      this.logError(error, input.email);
    }
  }

  /**
   * Send interview reschedule notification.
   */
  async sendInterviewReschedule(input: SendInterviewRescheduleInput): Promise<void> {
    const subject = `Interview Rescheduled: ${input.jobTitle} at ${input.companyName}`;
    const { textBody, htmlBody } = this.buildInterviewRescheduleEmail(input);

    try {
      const result = await this.client.sendEmail({
        from: this.fromEmail,
        to: input.email,
        subject,
        textBody,
        htmlBody,
        configurationSet: this.configurationSet,
      });

      console.log("[SES] Interview reschedule notification sent", {
        messageId: result.messageId,
        recipient: this.redactEmail(input.email),
      });
    } catch (error) {
      this.logError(error, input.email);
    }
  }

  /**
   * Send interview cancellation notification.
   */
  async sendInterviewCancellation(input: SendInterviewCancellationInput): Promise<void> {
    const subject = `Interview Cancelled: ${input.jobTitle} at ${input.companyName}`;
    const { textBody, htmlBody } = this.buildInterviewCancellationEmail(input);

    try {
      const result = await this.client.sendEmail({
        from: this.fromEmail,
        to: input.email,
        subject,
        textBody,
        htmlBody,
        configurationSet: this.configurationSet,
      });

      console.log("[SES] Interview cancellation notification sent", {
        messageId: result.messageId,
        recipient: this.redactEmail(input.email),
      });
    } catch (error) {
      this.logError(error, input.email);
    }
  }

  async sendSchedulingInvite(input: SendSchedulingInviteInput): Promise<void> {
    const subject = `Schedule your interview: ${input.jobTitle} at ${input.companyName}`;
    const { textBody, htmlBody } = this.buildSchedulingInviteEmail(input);

    try {
      const result = await this.client.sendEmail({
        from: this.fromEmail,
        to: input.email,
        subject,
        textBody,
        htmlBody,
        configurationSet: this.configurationSet,
      });

      console.log("[SES] Scheduling invite sent", {
        messageId: result.messageId,
        recipient: this.redactEmail(input.email),
      });
    } catch (error) {
      this.logError(error, input.email);
    }
  }

  async sendAssessmentInvite(input: SendAssessmentInviteInput): Promise<void> {
    const subject = `Assessment Invitation: ${input.jobTitle} at ${input.companyName}`;
    const { textBody, htmlBody } = this.buildAssessmentInviteEmail(input);

    try {
      const result = await this.client.sendEmail({
        from: this.fromEmail,
        to: input.email,
        subject,
        textBody,
        htmlBody,
        configurationSet: this.configurationSet,
      });

      console.log("[SES] Assessment invite sent", {
        messageId: result.messageId,
        recipient: this.redactEmail(input.email),
      });
    } catch (error) {
      this.logError(error, input.email);
    }
  }

  // ===========================================================================
  // EMAIL CONTENT BUILDING
  // ===========================================================================

  /**
   * Build magic link email content.
   */
  private buildMagicLinkEmail(
    magicLinkUrl: string,
    expiresInMinutes: number
  ): { textBody: string; htmlBody: string } {
    const textBody = `
Your Zehire Login Link
======================

You requested a login link for Zehire. Click the link below to sign in:

${magicLinkUrl}

This link expires in ${expiresInMinutes} minutes.

Security Notice:
- If you did not request this email, you can safely ignore it.
- Never share this link with anyone.
- Zehire will never ask for your password.

---
Zehire - Signal-First Hiring
`.trim();

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Zehire Login Link</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    <h1 style="color: #1a1a1a; margin-top: 0; font-size: 24px;">Your Zehire Login Link</h1>

    <p>You requested a login link for Zehire. Click the button below to sign in:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${this.escapeHtml(magicLinkUrl)}"
         style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Sign in to Zehire
      </a>
    </div>

    <p style="color: #666; font-size: 14px;">
      Or copy and paste this link into your browser:<br>
      <code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px; font-size: 12px; word-break: break-all;">
        ${this.escapeHtml(magicLinkUrl)}
      </code>
    </p>

    <p style="color: #666; font-size: 14px;">
      <strong>This link expires in ${expiresInMinutes} minutes.</strong>
    </p>

    <hr style="border: none; border-top: 1px solid #dee2e6; margin: 20px 0;">

    <div style="color: #666; font-size: 13px;">
      <p style="margin-bottom: 8px;"><strong>Security Notice:</strong></p>
      <ul style="margin: 0; padding-left: 20px;">
        <li>If you did not request this email, you can safely ignore it.</li>
        <li>Never share this link with anyone.</li>
        <li>Zehire will never ask for your password.</li>
      </ul>
    </div>
  </div>

  <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
    Zehire — Signal-First Hiring
  </p>
</body>
</html>
`.trim();

    return { textBody, htmlBody };
  }

  /**
   * Build interviewer invite email content.
   */
  private buildInterviewerInviteEmail(
    input: SendInterviewerInviteInput
  ): { textBody: string; htmlBody: string } {
    const greeting = input.name ? `Hi ${input.name}` : "Hi";

    const textBody = `
${greeting},

You've been added as an interviewer at ${input.companyName}.

Connect your calendar so candidates can book interview slots with you:

${input.setupUrl}

This takes about 30 seconds and is a one-time setup.

---
Zehire - Signal-First Hiring
`.trim();

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    <h1 style="color: #1a1a1a; margin-top: 0; font-size: 24px;">You're now an interviewer</h1>

    <p>${greeting},</p>

    <p>You've been added as an interviewer at <strong>${this.escapeHtml(input.companyName)}</strong>.</p>

    <p>Connect your calendar so candidates can book interview slots with you:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${this.escapeHtml(input.setupUrl)}"
         style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Set up my calendar
      </a>
    </div>

    <p style="color: #666; font-size: 14px;">Takes 30 seconds. One-time setup.</p>
  </div>

  <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
    Zehire — Signal-First Hiring
  </p>
</body>
</html>
`.trim();

    return { textBody, htmlBody };
  }

  /**
   * Build interview confirmation email content.
   */
  private buildInterviewConfirmationEmail(
    input: SendInterviewConfirmationInput
  ): { textBody: string; htmlBody: string } {
    const formattedDate = this.formatDateTime(input.scheduledAt, input.timezone);

    const textBody = `
Hi ${input.candidateName},

Your interview has been confirmed!

Position: ${input.jobTitle} at ${input.companyName}
Stage: ${input.stageName}
When: ${formattedDate}
Duration: ${input.durationMinutes} minutes
${input.videoCallLink ? `Video Call: ${input.videoCallLink}` : ""}
Interviewers: ${input.interviewerNames.join(", ")}

You'll receive a reminder 24 hours before.

---
Zehire - Signal-First Hiring
`.trim();

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    <h1 style="color: #1a1a1a; margin-top: 0; font-size: 24px;">Interview Confirmed!</h1>

    <p>Hi ${this.escapeHtml(input.candidateName)},</p>

    <p>Your interview has been confirmed.</p>

    <div style="background: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0 0 10px;"><strong>Position:</strong> ${this.escapeHtml(input.jobTitle)} at ${this.escapeHtml(input.companyName)}</p>
      <p style="margin: 0 0 10px;"><strong>Stage:</strong> ${this.escapeHtml(input.stageName)}</p>
      <p style="margin: 0 0 10px;"><strong>When:</strong> ${formattedDate}</p>
      <p style="margin: 0 0 10px;"><strong>Duration:</strong> ${input.durationMinutes} minutes</p>
      ${input.videoCallLink ? `<p style="margin: 0 0 10px;"><strong>Video Call:</strong> <a href="${this.escapeHtml(input.videoCallLink)}">${this.escapeHtml(input.videoCallLink)}</a></p>` : ""}
      <p style="margin: 0;"><strong>Interviewers:</strong> ${input.interviewerNames.map((n) => this.escapeHtml(n)).join(", ")}</p>
    </div>

    ${
      input.videoCallLink
        ? `
    <div style="text-align: center; margin: 20px 0;">
      <a href="${this.escapeHtml(input.videoCallLink)}"
         style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Join Video Call
      </a>
    </div>
    `
        : ""
    }

    <p style="color: #666; font-size: 14px;">You'll receive a reminder 24 hours before.</p>
  </div>

  <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
    Zehire — Signal-First Hiring
  </p>
</body>
</html>
`.trim();

    return { textBody, htmlBody };
  }

  /**
   * Build interview reminder email content.
   */
  private buildInterviewReminderEmail(
    input: SendInterviewReminderInput
  ): { textBody: string; htmlBody: string } {
    const formattedDate = this.formatDateTime(input.scheduledAt, input.timezone);
    const isCandidate = input.recipientType === "candidate";

    const textBody = isCandidate
      ? `
Hi ${input.name},

Reminder: Your interview is tomorrow!

Position: ${input.jobTitle} at ${input.companyName}
When: ${formattedDate}
Duration: ${input.durationMinutes} minutes
${input.videoCallLink ? `Video Call: ${input.videoCallLink}` : ""}

Good luck!

---
Zehire - Signal-First Hiring
`.trim()
      : `
Hi ${input.name},

Reminder: You have an interview tomorrow!

Candidate: ${input.candidateName}
Position: ${input.jobTitle}
When: ${formattedDate}
Duration: ${input.durationMinutes} minutes
${input.videoCallLink ? `Video Call: ${input.videoCallLink}` : ""}
${input.interviewGuideUrl ? `Interview Guide: ${input.interviewGuideUrl}` : ""}

---
Zehire - Signal-First Hiring
`.trim();

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    <h1 style="color: #1a1a1a; margin-top: 0; font-size: 24px;">Interview Tomorrow</h1>

    <p>Hi ${this.escapeHtml(input.name)},</p>

    <p>Reminder: You have an interview tomorrow!</p>

    <div style="background: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
      ${!isCandidate && input.candidateName ? `<p style="margin: 0 0 10px;"><strong>Candidate:</strong> ${this.escapeHtml(input.candidateName)}</p>` : ""}
      <p style="margin: 0 0 10px;"><strong>Position:</strong> ${this.escapeHtml(input.jobTitle)} at ${this.escapeHtml(input.companyName)}</p>
      <p style="margin: 0 0 10px;"><strong>When:</strong> ${formattedDate}</p>
      <p style="margin: 0 0 10px;"><strong>Duration:</strong> ${input.durationMinutes} minutes</p>
      ${input.videoCallLink ? `<p style="margin: 0;"><strong>Video Call:</strong> <a href="${this.escapeHtml(input.videoCallLink)}">${this.escapeHtml(input.videoCallLink)}</a></p>` : ""}
    </div>

    ${
      input.videoCallLink
        ? `
    <div style="text-align: center; margin: 20px 0;">
      <a href="${this.escapeHtml(input.videoCallLink)}"
         style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Join Video Call
      </a>
    </div>
    `
        : ""
    }

    ${isCandidate ? '<p style="color: #666;">Good luck!</p>' : ""}
  </div>

  <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
    Zehire — Signal-First Hiring
  </p>
</body>
</html>
`.trim();

    return { textBody, htmlBody };
  }

  /**
   * Build feedback reminder email content.
   */
  private buildFeedbackReminderEmail(
    input: SendFeedbackReminderInput
  ): { textBody: string; htmlBody: string } {
    const textBody = `
Hi ${input.interviewerName},

Please submit your feedback for the interview with ${input.candidateName}.

Position: ${input.jobTitle}

Submit your feedback here:
${input.feedbackUrl}

Your feedback helps make better hiring decisions.

---
Zehire - Signal-First Hiring
`.trim();

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    <h1 style="color: #1a1a1a; margin-top: 0; font-size: 24px;">Feedback Needed</h1>

    <p>Hi ${this.escapeHtml(input.interviewerName)},</p>

    <p>Please submit your feedback for the interview with <strong>${this.escapeHtml(input.candidateName)}</strong>.</p>

    <div style="background: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0;"><strong>Position:</strong> ${this.escapeHtml(input.jobTitle)}</p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${this.escapeHtml(input.feedbackUrl)}"
         style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Submit Feedback
      </a>
    </div>

    <p style="color: #666; font-size: 14px;">Your feedback helps make better hiring decisions.</p>
  </div>

  <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
    Zehire — Signal-First Hiring
  </p>
</body>
</html>
`.trim();

    return { textBody, htmlBody };
  }

  /**
   * Build interview reschedule email content.
   */
  private buildInterviewRescheduleEmail(
    input: SendInterviewRescheduleInput
  ): { textBody: string; htmlBody: string } {
    const newFormattedDate = this.formatDateTime(input.newScheduledAt, input.timezone);

    const textBody = `
Hi ${input.name},

Your interview has been rescheduled.

Position: ${input.jobTitle} at ${input.companyName}
New Time: ${newFormattedDate}
Duration: ${input.durationMinutes} minutes
${input.videoCallLink ? `Video Call: ${input.videoCallLink}` : ""}

---
Zehire - Signal-First Hiring
`.trim();

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    <h1 style="color: #1a1a1a; margin-top: 0; font-size: 24px;">Interview Rescheduled</h1>

    <p>Hi ${this.escapeHtml(input.name)},</p>

    <p>Your interview has been rescheduled.</p>

    <div style="background: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0 0 10px;"><strong>Position:</strong> ${this.escapeHtml(input.jobTitle)} at ${this.escapeHtml(input.companyName)}</p>
      <p style="margin: 0 0 10px;"><strong>New Time:</strong> ${newFormattedDate}</p>
      <p style="margin: 0 0 10px;"><strong>Duration:</strong> ${input.durationMinutes} minutes</p>
      ${input.videoCallLink ? `<p style="margin: 0;"><strong>Video Call:</strong> <a href="${this.escapeHtml(input.videoCallLink)}">${this.escapeHtml(input.videoCallLink)}</a></p>` : ""}
    </div>
  </div>

  <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
    Zehire — Signal-First Hiring
  </p>
</body>
</html>
`.trim();

    return { textBody, htmlBody };
  }

  /**
   * Build interview cancellation email content.
   */
  private buildInterviewCancellationEmail(
    input: SendInterviewCancellationInput
  ): { textBody: string; htmlBody: string } {
    const formattedDate = this.formatDateTime(input.scheduledAt, input.timezone);

    const textBody = `
Hi ${input.name},

Your interview has been cancelled.

Position: ${input.jobTitle} at ${input.companyName}
Was Scheduled: ${formattedDate}
${input.reason ? `Reason: ${input.reason}` : ""}

---
Zehire - Signal-First Hiring
`.trim();

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    <h1 style="color: #1a1a1a; margin-top: 0; font-size: 24px;">Interview Cancelled</h1>

    <p>Hi ${this.escapeHtml(input.name)},</p>

    <p>Your interview has been cancelled.</p>

    <div style="background: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0 0 10px;"><strong>Position:</strong> ${this.escapeHtml(input.jobTitle)} at ${this.escapeHtml(input.companyName)}</p>
      <p style="margin: 0 0 10px;"><strong>Was Scheduled:</strong> ${formattedDate}</p>
      ${input.reason ? `<p style="margin: 0;"><strong>Reason:</strong> ${this.escapeHtml(input.reason)}</p>` : ""}
    </div>
  </div>

  <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
    Zehire — Signal-First Hiring
  </p>
</body>
</html>
`.trim();

    return { textBody, htmlBody };
  }

  /**
   * Build scheduling invite email content.
   */
  private buildSchedulingInviteEmail(
    input: SendSchedulingInviteInput
  ): { textBody: string; htmlBody: string } {
    const textBody = `
Hi ${input.name},

Great news! ${input.companyName} would like to schedule an interview with you.

Position: ${input.jobTitle}
Stage: ${input.stageName}

Please choose a time that works for you:

${input.schedulingUrl}

This link expires in 7 days.

---
Zehire - Signal-First Hiring
`.trim();

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    <h1 style="color: #1a1a1a; margin-top: 0; font-size: 24px;">Schedule Your Interview</h1>

    <p>Hi ${this.escapeHtml(input.name)},</p>

    <p>Great news! <strong>${this.escapeHtml(input.companyName)}</strong> would like to schedule an interview with you.</p>

    <div style="background: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0 0 10px;"><strong>Position:</strong> ${this.escapeHtml(input.jobTitle)}</p>
      <p style="margin: 0;"><strong>Stage:</strong> ${this.escapeHtml(input.stageName)}</p>
    </div>

    <p>Please choose a time that works for you:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${this.escapeHtml(input.schedulingUrl)}"
         style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Schedule Interview
      </a>
    </div>

    <p style="color: #666; font-size: 14px;">This link expires in 7 days.</p>
  </div>

  <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
    Zehire — Signal-First Hiring
  </p>
</body>
</html>
`.trim();

    return { textBody, htmlBody };
  }

  /**
   * Build assessment invite email content.
   */
  private buildAssessmentInviteEmail(
    input: SendAssessmentInviteInput
  ): { textBody: string; htmlBody: string } {
    const deadlineDate = new Date(input.scheduleDeadline);
    const now = new Date();
    const daysUntilDeadline = Math.max(
      1,
      Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    );

    const textBody = `
Hi ${input.name},

${input.companyName} has invited you to complete an assessment for the ${input.jobTitle} position.

Assessment: ${input.assessmentName}

Please schedule your assessment within ${daysUntilDeadline} day${daysUntilDeadline !== 1 ? "s" : ""}.

View your assessment here:
${input.portalUrl}

---
Zehire - Signal-First Hiring
`.trim();

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    <h1 style="color: #1a1a1a; margin-top: 0; font-size: 24px;">Assessment Invitation</h1>

    <p>Hi ${this.escapeHtml(input.name)},</p>

    <p><strong>${this.escapeHtml(input.companyName)}</strong> has invited you to complete an assessment for the <strong>${this.escapeHtml(input.jobTitle)}</strong> position.</p>

    <div style="background: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0 0 10px;"><strong>Assessment:</strong> ${this.escapeHtml(input.assessmentName)}</p>
      <p style="margin: 0;"><strong>Schedule within:</strong> ${daysUntilDeadline} day${daysUntilDeadline !== 1 ? "s" : ""}</p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${this.escapeHtml(input.portalUrl)}"
         style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        View Assessment
      </a>
    </div>

    <p style="color: #666; font-size: 14px;">
      Or copy and paste this link into your browser:<br>
      <code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px; font-size: 12px; word-break: break-all;">
        ${this.escapeHtml(input.portalUrl)}
      </code>
    </p>
  </div>

  <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
    Zehire — Signal-First Hiring
  </p>
</body>
</html>
`.trim();

    return { textBody, htmlBody };
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Format date/time for display in emails.
   */
  private formatDateTime(isoDate: string, timezone: string): string {
    try {
      const date = new Date(isoDate);
      return date.toLocaleString("en-US", {
        timeZone: timezone,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      });
    } catch {
      return isoDate;
    }
  }

  /**
   * Escape HTML special characters.
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Redact email address for logging.
   * "user@example.com" → "u***@example.com"
   */
  private redactEmail(email: string): string {
    const [local, domain] = email.split("@");
    if (!local || !domain) return "***@***";
    return `${local[0]}***@${domain}`;
  }

  /**
   * Log error with structured data (no sensitive info).
   */
  private logError(error: unknown, email: string): void {
    const redactedEmail = this.redactEmail(email);

    if (this.isSesError(error)) {
      console.error("[SES] Failed to send email", {
        errorCode: error.code,
        errorMessage: error.message,
        statusCode: error.statusCode,
        recipient: redactedEmail,
      });
    } else if (error instanceof Error) {
      console.error("[SES] Failed to send email", {
        errorMessage: error.message,
        recipient: redactedEmail,
      });
    } else {
      console.error("[SES] Failed to send email", {
        error: "Unknown error",
        recipient: redactedEmail,
      });
    }
  }

  /**
   * Type guard for SES errors.
   */
  private isSesError(error: unknown): error is SesError {
    return error instanceof SesError;
  }
}
