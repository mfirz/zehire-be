/**
 * AWS SES Provider
 * ================
 * Exports for the AWS SES email provider.
 */

export {
  SesClient,
  SesError,
  type SendEmailParams,
  type SendEmailResult,
  type SesClientConfig,
} from "./ses.client";
export { SesEmailGateway, type SesGatewayConfig } from "./ses.gateway";
