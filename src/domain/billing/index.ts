/**
 * Billing Domain Module
 * =====================
 * Public exports for the billing domain.
 */

// Calculator (pure functions)
export {
  calculateBillingUsage,
  calculateJobUsage,
  createBillingPeriod,
  generateInvoice,
  getCurrentBillingPeriod,
  getPreviousBillingPeriod,
  type ActiveWindow,
  type BillingInvoice,
  type BillingLineItem,
  type BillingPeriod,
  type BillingUsage,
  type JobUsage,
} from "./calculator";

// Pricing
export {
  PricingRepository,
  type PricingRecord,
  type CreatePricingInput,
} from "./pricing";

// Service
export { BillingService } from "./service";
