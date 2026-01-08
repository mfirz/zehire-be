/**
 * Billing Calculator
 * ==================
 * Calculates prorated billing based on job active time within a billing period.
 *
 * Key concepts:
 * - Billing period = calendar month (e.g., 2026-01-01 to 2026-01-31)
 * - Active time = time between activated and deactivated events
 * - Prorate = (active_ms / period_ms) * monthly_rate
 *
 * Edge cases handled:
 * - Job activated before period start → use period start
 * - Job still active (no deactivated) → use period end
 * - Job activated and deactivated within period → use actual times
 * - Job deactivated before period start → 0 active time
 * - Job activated after period end → 0 active time
 */

import type { BillingEvent } from "../jobs/repository";

// =============================================================================
// TYPES
// =============================================================================

/**
 * A billing period (calendar month).
 */
export interface BillingPeriod {
  /** Start of period (inclusive), e.g., "2026-01-01T00:00:00Z" */
  start: string;
  /** End of period (exclusive), e.g., "2026-02-01T00:00:00Z" */
  end: string;
  /** Total milliseconds in period */
  totalMs: number;
}

/**
 * Usage for a single job within a billing period.
 */
export interface JobUsage {
  jobId: string;
  /** When the job was activated (or period start if before) */
  activeFrom: string | null;
  /** When the job was deactivated (or period end if still active) */
  activeTo: string | null;
  /** Milliseconds active within the period */
  activeMs: number;
  /** Fraction of period active (0-1) */
  activeFraction: number;
  /** Whether job is still active at period end */
  isStillActive: boolean;
}

/**
 * Complete usage summary for an organization in a billing period.
 */
export interface BillingUsage {
  orgId: string;
  period: BillingPeriod;
  /** Usage per job */
  jobs: JobUsage[];
  /** Total active job-days (sum of all job fractions) */
  totalJobDays: number;
  /** Whether billing is waived for this org */
  billingWaived: boolean;
  billingWaivedReason: string | null;
}

/**
 * Billing line item with pricing.
 */
export interface BillingLineItem {
  jobId: string;
  jobTitle: string;
  activeFrom: string | null;
  activeTo: string | null;
  activeDays: number;
  activeFraction: number;
  unitPrice: number; // Monthly rate
  amount: number; // Prorated amount
}

/**
 * Complete invoice for a billing period.
 */
export interface BillingInvoice {
  orgId: string;
  period: BillingPeriod;
  lineItems: BillingLineItem[];
  subtotal: number;
  /** Discount (negative if waived) */
  discount: number;
  discountReason: string | null;
  total: number;
  /** Currency code */
  currency: string;
}

// =============================================================================
// BILLING PERIOD HELPERS
// =============================================================================

/**
 * Create a billing period for a given month.
 *
 * @param year - Year (e.g., 2026)
 * @param month - Month (1-12)
 */
export function createBillingPeriod(year: number, month: number): BillingPeriod {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)); // First day of next month

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    totalMs: end.getTime() - start.getTime(),
  };
}

/**
 * Get the current billing period (current calendar month).
 */
export function getCurrentBillingPeriod(): BillingPeriod {
  const now = new Date();
  return createBillingPeriod(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

/**
 * Get the previous billing period (last calendar month).
 */
export function getPreviousBillingPeriod(): BillingPeriod {
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth(); // 0-indexed, so this is previous month

  if (month === 0) {
    year -= 1;
    month = 12;
  }

  return createBillingPeriod(year, month);
}

// =============================================================================
// BILLING CALCULATOR
// =============================================================================

/**
 * Calculate job usage within a billing period from billing events.
 *
 * @param jobId - Job ID
 * @param events - All billing events for this job (sorted by occurred_at)
 * @param period - The billing period to calculate for
 */
export function calculateJobUsage(
  jobId: string,
  events: BillingEvent[],
  period: BillingPeriod
): JobUsage {
  const periodStart = new Date(period.start).getTime();
  const periodEnd = new Date(period.end).getTime();

  // Find the activation and deactivation events
  let activatedAt: number | null = null;
  let deactivatedAt: number | null = null;

  for (const event of events) {
    const eventTime = new Date(event.occurredAt).getTime();

    if (event.eventType === "activated") {
      activatedAt = eventTime;
    } else if (event.eventType === "deactivated") {
      deactivatedAt = eventTime;
    }
  }

  // Job was never activated
  if (activatedAt === null) {
    return {
      jobId,
      activeFrom: null,
      activeTo: null,
      activeMs: 0,
      activeFraction: 0,
      isStillActive: false,
    };
  }

  // Job was deactivated before period started
  if (deactivatedAt !== null && deactivatedAt <= periodStart) {
    return {
      jobId,
      activeFrom: null,
      activeTo: null,
      activeMs: 0,
      activeFraction: 0,
      isStillActive: false,
    };
  }

  // Job was activated after period ended
  if (activatedAt >= periodEnd) {
    return {
      jobId,
      activeFrom: null,
      activeTo: null,
      activeMs: 0,
      activeFraction: 0,
      isStillActive: deactivatedAt === null,
    };
  }

  // Calculate effective active window within period
  const effectiveStart = Math.max(activatedAt, periodStart);
  const effectiveEnd = deactivatedAt !== null
    ? Math.min(deactivatedAt, periodEnd)
    : periodEnd;

  const activeMs = Math.max(0, effectiveEnd - effectiveStart);
  const activeFraction = activeMs / period.totalMs;

  return {
    jobId,
    activeFrom: new Date(effectiveStart).toISOString(),
    activeTo: new Date(effectiveEnd).toISOString(),
    activeMs,
    activeFraction,
    isStillActive: deactivatedAt === null,
  };
}

/**
 * Calculate total usage for an organization in a billing period.
 *
 * @param orgId - Organization ID
 * @param eventsByJob - Map of job ID to billing events
 * @param period - The billing period to calculate for
 * @param billingWaived - Whether billing is waived for this org
 * @param billingWaivedReason - Reason for waiver (if any)
 */
export function calculateBillingUsage(
  orgId: string,
  eventsByJob: Map<string, BillingEvent[]>,
  period: BillingPeriod,
  billingWaived: boolean = false,
  billingWaivedReason: string | null = null
): BillingUsage {
  const jobs: JobUsage[] = [];
  let totalJobDays = 0;

  for (const [jobId, events] of eventsByJob) {
    const usage = calculateJobUsage(jobId, events, period);
    if (usage.activeMs > 0 || usage.isStillActive) {
      jobs.push(usage);
      totalJobDays += usage.activeFraction;
    }
  }

  return {
    orgId,
    period,
    jobs,
    totalJobDays,
    billingWaived,
    billingWaivedReason,
  };
}

/**
 * Generate an invoice from billing usage.
 *
 * @param usage - Calculated billing usage
 * @param jobTitles - Map of job ID to title
 * @param monthlyRatePerJob - Monthly rate per active job (in cents)
 * @param currency - Currency code (default: "usd")
 */
export function generateInvoice(
  usage: BillingUsage,
  jobTitles: Map<string, string>,
  monthlyRatePerJob: number,
  currency: string = "usd"
): BillingInvoice {
  const periodDays = usage.period.totalMs / (1000 * 60 * 60 * 24);

  const lineItems: BillingLineItem[] = usage.jobs.map((job) => {
    const activeDays = job.activeFraction * periodDays;
    const amount = Math.round(job.activeFraction * monthlyRatePerJob);

    return {
      jobId: job.jobId,
      jobTitle: jobTitles.get(job.jobId) ?? "Unknown Job",
      activeFrom: job.activeFrom,
      activeTo: job.activeTo,
      activeDays: Math.round(activeDays * 100) / 100, // 2 decimal places
      activeFraction: Math.round(job.activeFraction * 10000) / 10000, // 4 decimal places
      unitPrice: monthlyRatePerJob,
      amount,
    };
  });

  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const discount = usage.billingWaived ? -subtotal : 0;
  const total = subtotal + discount;

  return {
    orgId: usage.orgId,
    period: usage.period,
    lineItems,
    subtotal,
    discount,
    discountReason: usage.billingWaived ? usage.billingWaivedReason : null,
    total,
    currency,
  };
}
