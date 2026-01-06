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
 * Email gateway interface.
 * Implement this interface to add a new email provider.
 */
export interface EmailGateway {
  /**
   * Send a magic link email for authentication.
   *
   * @param input - Magic link details
   * @throws Error if email delivery fails
   */
  sendMagicLink(input: SendMagicLinkInput): Promise<void>;
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

    // Simulate async operation
    await Promise.resolve();
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
