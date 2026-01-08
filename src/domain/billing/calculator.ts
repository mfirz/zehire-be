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
 * An active window within a billing period.
 * Represents a continuous period where billing applies.
 */
export interface ActiveWindow {
  /** When billing started for this window */
  from: string;
  /** When billing ended for this window, null if still active */
  to: string | null;
}

/**
 * Usage for a single job within a billing period.
 */
export interface JobUsage {
  jobId: string;
  /** Active windows within the period (accounts for pause/resume cycles) */
  activeWindows: ActiveWindow[];
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
  /** Active windows within the period (accounts for pause/resume cycles) */
  activeWindows: ActiveWindow[];
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
 * Handles full lifecycle: activated → paused → resumed → paused → resumed → deactivated
 * Each pause stops the billing clock, each resume restarts it.
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

  // Build active windows from events
  // Each window is [start, end] where billing applies
  const activeWindows: Array<{ start: number; end: number | null }> = [];
  let currentWindowStart: number | null = null;
  let isDeactivated = false;

  for (const event of events) {
    const eventTime = new Date(event.occurredAt).getTime();

    if (event.eventType === "activated" || event.eventType === "resumed") {
      // Start a new active window
      currentWindowStart = eventTime;
    } else if (event.eventType === "paused" || event.eventType === "deactivated") {
      // End the current active window
      if (currentWindowStart !== null) {
        activeWindows.push({ start: currentWindowStart, end: eventTime });
        currentWindowStart = null;
      }
      if (event.eventType === "deactivated") {
        isDeactivated = true;
      }
    }
  }

  // If there's an open window (job is currently active), close it at null (ongoing)
  if (currentWindowStart !== null) {
    activeWindows.push({ start: currentWindowStart, end: null });
  }

  // Job was never activated
  if (activeWindows.length === 0) {
    return {
      jobId,
      activeWindows: [],
      activeMs: 0,
      activeFraction: 0,
      isStillActive: false,
    };
  }

  // Calculate total active time within the period and build result windows
  let totalActiveMs = 0;
  let hasOpenWindow = false;
  const resultWindows: ActiveWindow[] = [];

  for (const window of activeWindows) {
    const windowEnd = window.end ?? periodEnd; // Use period end for open windows

    // Skip windows that don't overlap with the period
    if (windowEnd <= periodStart) continue;
    if (window.start >= periodEnd) continue;

    // Calculate overlap with period
    const effectiveStart = Math.max(window.start, periodStart);
    const effectiveEnd = Math.min(windowEnd, periodEnd);
    const windowMs = Math.max(0, effectiveEnd - effectiveStart);

    totalActiveMs += windowMs;

    // Add to result windows
    resultWindows.push({
      from: new Date(effectiveStart).toISOString(),
      to: window.end === null ? null : new Date(effectiveEnd).toISOString(),
    });

    // Check if this window is still open
    if (window.end === null) {
      hasOpenWindow = true;
    }
  }

  // No active time in this period
  if (totalActiveMs === 0) {
    return {
      jobId,
      activeWindows: [],
      activeMs: 0,
      activeFraction: 0,
      isStillActive: !isDeactivated && activeWindows.some((w) => w.end === null),
    };
  }

  const activeFraction = totalActiveMs / period.totalMs;

  return {
    jobId,
    activeWindows: resultWindows,
    activeMs: totalActiveMs,
    activeFraction,
    isStillActive: hasOpenWindow && !isDeactivated,
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
      activeWindows: job.activeWindows,
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
