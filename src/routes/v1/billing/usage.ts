/**
 * GET /v1/billing
 * GET /v1/billing/:year/:month
 * ============================
 * Get billing usage for current or specific month.
 *
 * Returns:
 * - Usage summary for the organization
 * - Per-job active time breakdown
 * - Billing waiver status
 */

import type { Context } from "hono";
import { BillingService } from "../../../domain/billing";
import { BillingEventRepository, OrgRepository } from "../../../domain/jobs";
import type { AuthVariables, Env } from "../../../types/bindings";

/**
 * GET /v1/billing - Current month usage
 */
export async function getCurrentUsage(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>
): Promise<Response> {
  const user = c.get("user");
  const orgId = user.orgId;

  const billingService = createBillingService(c);
  const usage = await billingService.getCurrentUsage(orgId);

  return c.json(formatUsageResponse(usage), 200);
}

/**
 * GET /v1/billing/:year/:month - Specific month usage
 */
export async function getMonthlyUsage(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>
): Promise<Response> {
  const user = c.get("user");
  const orgId = user.orgId;

  const yearParam = c.req.param("year");
  const monthParam = c.req.param("month");

  // Validate year/month
  const year = parseInt(yearParam, 10);
  const month = parseInt(monthParam, 10);

  if (isNaN(year) || year < 2020 || year > 2100) {
    return c.json({ error: { code: "INVALID_YEAR", message: "Invalid year" } }, 400);
  }

  if (isNaN(month) || month < 1 || month > 12) {
    return c.json({ error: { code: "INVALID_MONTH", message: "Month must be 1-12" } }, 400);
  }

  const billingService = createBillingService(c);
  const usage = await billingService.getUsageForMonth(orgId, year, month);

  return c.json(formatUsageResponse(usage), 200);
}

// =============================================================================
// HELPERS
// =============================================================================

function createBillingService(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>
): BillingService {
  const billingEventRepository = new BillingEventRepository(c.env.DB);
  const orgRepository = new OrgRepository(c.env.DB);
  return new BillingService(billingEventRepository, orgRepository, c.env.DB);
}

interface UsageResponse {
  period: {
    start: string;
    end: string;
    totalDays: number;
  };
  jobs: Array<{
    jobId: string;
    activeWindows: Array<{ from: string; to: string | null }>;
    activeDays: number;
    activeFraction: number;
    isStillActive: boolean;
  }>;
  summary: {
    totalActiveJobDays: number;
    billingWaived: boolean;
    billingWaivedReason: string | null;
  };
}

function formatUsageResponse(usage: ReturnType<typeof import("../../../domain/billing").calculateBillingUsage>): UsageResponse {
  const periodDays = usage.period.totalMs / (1000 * 60 * 60 * 24);

  return {
    period: {
      start: usage.period.start,
      end: usage.period.end,
      totalDays: Math.round(periodDays * 100) / 100,
    },
    jobs: usage.jobs.map((job) => ({
      jobId: job.jobId,
      activeWindows: job.activeWindows,
      activeDays: Math.round(job.activeFraction * periodDays * 100) / 100,
      activeFraction: Math.round(job.activeFraction * 10000) / 10000,
      isStillActive: job.isStillActive,
    })),
    summary: {
      totalActiveJobDays: Math.round(usage.totalJobDays * periodDays * 100) / 100,
      billingWaived: usage.billingWaived,
      billingWaivedReason: usage.billingWaivedReason,
    },
  };
}
