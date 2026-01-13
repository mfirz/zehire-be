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
 * - Uses versioned pricing from pricing_history table
 */

import { BillingEventRepository, OrgRepository } from "../jobs/repository";
import type { BillingEventRecord } from "../jobs/repository";
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
import { PricingRepository } from "./pricing";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Fallback monthly rate if no pricing history exists (in cents).
 * $200/month = 20000 cents
 */
const FALLBACK_MONTHLY_RATE_CENTS = 20000;

// =============================================================================
// BILLING SERVICE
// =============================================================================

export class BillingService {
  private readonly pricingRepository: PricingRepository;

  constructor(
    private readonly billingEventRepository: BillingEventRepository,
    private readonly orgRepository: OrgRepository,
    private readonly db: D1Database
  ) {
    this.pricingRepository = new PricingRepository(db);
  }

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
   * Uses the pricing that was active during that period.
   *
   * @param orgId - Organization ID
   * @param rateOverride - Optional rate override (in cents), otherwise uses pricing history
   */
  async generatePreviousMonthInvoice(
    orgId: string,
    rateOverride?: number
  ): Promise<BillingInvoice> {
    const period = getPreviousBillingPeriod();
    return this.generateInvoiceForPeriod(orgId, period, rateOverride);
  }

  /**
   * Generate an invoice for an organization for a specific month.
   * Uses the pricing that was active during that period.
   *
   * @param orgId - Organization ID
   * @param year - Year (e.g., 2026)
   * @param month - Month (1-12)
   * @param rateOverride - Optional rate override (in cents), otherwise uses pricing history
   */
  async generateInvoiceForMonth(
    orgId: string,
    year: number,
    month: number,
    rateOverride?: number
  ): Promise<BillingInvoice> {
    const period = createBillingPeriod(year, month);
    return this.generateInvoiceForPeriod(orgId, period, rateOverride);
  }

  /**
   * Generate an invoice for an organization for a specific period.
   * Uses the pricing that was active at the start of the period.
   */
  async generateInvoiceForPeriod(
    orgId: string,
    period: BillingPeriod,
    rateOverride?: number
  ): Promise<BillingInvoice> {
    // Get usage
    const usage = await this.getUsageForPeriod(orgId, period);

    // Get job titles
    const jobTitles = await this.getJobTitles(usage.jobs.map((j) => j.jobId));

    // Get the rate: use override, or look up from pricing history
    const monthlyRate = rateOverride ?? await this.getRateForPeriod(period);

    // Generate invoice
    return generateInvoice(usage, jobTitles, monthlyRate);
  }

  /**
   * Get a preview of current month charges (not finalized).
   * Shows what the user would be charged if the month ended now.
   * Uses current active pricing.
   */
  async getCurrentChargesPreview(
    orgId: string,
    rateOverride?: number
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

    // Get the rate: use override, or look up current pricing
    const monthlyRate = rateOverride ?? await this.getRateForPeriod(period);

    // Generate invoice preview
    return generateInvoice(usage, jobTitles, monthlyRate);
  }

  /**
   * Get the current pricing information.
   */
  async getCurrentPricing() {
    return this.pricingRepository.getCurrentPrice();
  }

  /**
   * Get all pricing history.
   */
  async getPricingHistory() {
    return this.pricingRepository.getHistory();
  }

  /**
   * Get upcoming price changes.
   */
  async getUpcomingPriceChanges() {
    return this.pricingRepository.getUpcoming();
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Get the rate for a billing period from pricing history.
   * Uses the price that was active at the start of the period.
   */
  private async getRateForPeriod(period: BillingPeriod): Promise<number> {
    const pricing = await this.pricingRepository.getActivePrice(period.start);
    return pricing?.rateCents ?? FALLBACK_MONTHLY_RATE_CENTS;
  }

  /**
   * Group billing events by job ID.
   */
  private groupEventsByJob(events: BillingEventRecord[]): Map<string, BillingEventRecord[]> {
    const eventsByJob = new Map<string, BillingEventRecord[]>();

    for (const event of events) {
      const jobEvents = eventsByJob.get(event.jobId) ?? [];
      jobEvents.push(event);
      eventsByJob.set(event.jobId, jobEvents);
    }

    // Sort each job's events by occurredAt
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
