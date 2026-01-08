/**
 * Billing Service
 * ===============
 * Orchestrates billing calculations for organizations.
 *
 * This service:
 * - Fetches billing events from the repository
 * - Calculates usage per job
 * - Generates invoices with proration
 * - Handles billing waivers (founding access)
 */

import { BillingEventRepository, OrgRepository } from "../jobs/repository";
import type { BillingEvent } from "../jobs/repository";
import {
  calculateBillingUsage,
  createBillingPeriod,
  generateInvoice,
  getCurrentBillingPeriod,
  getPreviousBillingPeriod,
  type BillingInvoice,
  type BillingPeriod,
  type BillingUsage,
} from "./calculator";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default monthly rate per active job (in cents).
 * $200/month = 20000 cents
 */
const DEFAULT_MONTHLY_RATE_CENTS = 20000;

// =============================================================================
// BILLING SERVICE
// =============================================================================

export class BillingService {
  constructor(
    private readonly billingEventRepository: BillingEventRepository,
    private readonly orgRepository: OrgRepository,
    private readonly db: D1Database
  ) {}

  /**
   * Get billing usage for an organization in the current month.
   */
  async getCurrentUsage(orgId: string): Promise<BillingUsage> {
    const period = getCurrentBillingPeriod();
    return this.getUsageForPeriod(orgId, period);
  }

  /**
   * Get billing usage for an organization in the previous month.
   */
  async getPreviousUsage(orgId: string): Promise<BillingUsage> {
    const period = getPreviousBillingPeriod();
    return this.getUsageForPeriod(orgId, period);
  }

  /**
   * Get billing usage for an organization in a specific month.
   *
   * @param orgId - Organization ID
   * @param year - Year (e.g., 2026)
   * @param month - Month (1-12)
   */
  async getUsageForMonth(
    orgId: string,
    year: number,
    month: number
  ): Promise<BillingUsage> {
    const period = createBillingPeriod(year, month);
    return this.getUsageForPeriod(orgId, period);
  }

  /**
   * Get billing usage for an organization in a specific period.
   */
  async getUsageForPeriod(
    orgId: string,
    period: BillingPeriod
  ): Promise<BillingUsage> {
    // Get org capacity info (for billing waiver)
    const capacityInfo = await this.orgRepository.getCapacityInfo(orgId);

    // Get all billing events for the org in the period
    // We need events from before the period too (to know if jobs were already active)
    // So we fetch all events up to the period end
    const events = await this.billingEventRepository.getByOrgInRange(
      orgId,
      "1970-01-01T00:00:00Z", // Beginning of time
      period.end
    );

    // Group events by job
    const eventsByJob = this.groupEventsByJob(events);

    // Calculate usage
    return calculateBillingUsage(
      orgId,
      eventsByJob,
      period,
      capacityInfo?.billingWaived ?? false,
      capacityInfo?.billingWaivedReason ?? null
    );
  }

  /**
   * Generate an invoice for an organization for the previous month.
   *
   * @param orgId - Organization ID
   * @param monthlyRate - Monthly rate per job in cents (default: $200)
   */
  async generatePreviousMonthInvoice(
    orgId: string,
    monthlyRate: number = DEFAULT_MONTHLY_RATE_CENTS
  ): Promise<BillingInvoice> {
    const period = getPreviousBillingPeriod();
    return this.generateInvoiceForPeriod(orgId, period, monthlyRate);
  }

  /**
   * Generate an invoice for an organization for a specific month.
   *
   * @param orgId - Organization ID
   * @param year - Year (e.g., 2026)
   * @param month - Month (1-12)
   * @param monthlyRate - Monthly rate per job in cents (default: $200)
   */
  async generateInvoiceForMonth(
    orgId: string,
    year: number,
    month: number,
    monthlyRate: number = DEFAULT_MONTHLY_RATE_CENTS
  ): Promise<BillingInvoice> {
    const period = createBillingPeriod(year, month);
    return this.generateInvoiceForPeriod(orgId, period, monthlyRate);
  }

  /**
   * Generate an invoice for an organization for a specific period.
   */
  async generateInvoiceForPeriod(
    orgId: string,
    period: BillingPeriod,
    monthlyRate: number = DEFAULT_MONTHLY_RATE_CENTS
  ): Promise<BillingInvoice> {
    // Get usage
    const usage = await this.getUsageForPeriod(orgId, period);

    // Get job titles
    const jobTitles = await this.getJobTitles(usage.jobs.map((j) => j.jobId));

    // Generate invoice
    return generateInvoice(usage, jobTitles, monthlyRate);
  }

  /**
   * Get a preview of current month charges (not finalized).
   * Shows what the user would be charged if the month ended now.
   */
  async getCurrentChargesPreview(
    orgId: string,
    monthlyRate: number = DEFAULT_MONTHLY_RATE_CENTS
  ): Promise<BillingInvoice> {
    const period = getCurrentBillingPeriod();

    // Adjust period end to now for preview
    const now = new Date().toISOString();
    const adjustedPeriod: BillingPeriod = {
      ...period,
      end: now,
      totalMs: new Date(now).getTime() - new Date(period.start).getTime(),
    };

    // Get usage up to now
    const capacityInfo = await this.orgRepository.getCapacityInfo(orgId);
    const events = await this.billingEventRepository.getByOrgInRange(
      orgId,
      "1970-01-01T00:00:00Z",
      now
    );
    const eventsByJob = this.groupEventsByJob(events);

    const usage = calculateBillingUsage(
      orgId,
      eventsByJob,
      adjustedPeriod,
      capacityInfo?.billingWaived ?? false,
      capacityInfo?.billingWaivedReason ?? null
    );

    // Get job titles
    const jobTitles = await this.getJobTitles(usage.jobs.map((j) => j.jobId));

    // Generate invoice preview
    return generateInvoice(usage, jobTitles, monthlyRate);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Group billing events by job ID.
   */
  private groupEventsByJob(events: BillingEvent[]): Map<string, BillingEvent[]> {
    const eventsByJob = new Map<string, BillingEvent[]>();

    for (const event of events) {
      const jobEvents = eventsByJob.get(event.jobId) ?? [];
      jobEvents.push(event);
      eventsByJob.set(event.jobId, jobEvents);
    }

    // Sort each job's events by occurred_at
    for (const [, jobEvents] of eventsByJob) {
      jobEvents.sort(
        (a, b) =>
          new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
      );
    }

    return eventsByJob;
  }

  /**
   * Get job titles for a list of job IDs.
   */
  private async getJobTitles(jobIds: string[]): Promise<Map<string, string>> {
    if (jobIds.length === 0) {
      return new Map();
    }

    const placeholders = jobIds.map(() => "?").join(",");
    const result = await this.db
      .prepare(`SELECT id, title FROM jobs WHERE id IN (${placeholders})`)
      .bind(...jobIds)
      .all<{ id: string; title: string }>();

    const titles = new Map<string, string>();
    for (const row of result.results ?? []) {
      titles.set(row.id, row.title);
    }

    return titles;
  }
}
