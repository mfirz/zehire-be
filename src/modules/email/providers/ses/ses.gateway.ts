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

import type { EmailGateway, SendMagicLinkInput } from "../../email.gateway";
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

  // ===========================================================================
  // HELPERS
  // ===========================================================================

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
