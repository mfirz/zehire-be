/**
 * GET /v1/billing/:year/:month/invoice
 * =====================================
 * Get invoice for a specific month.
 *
 * Returns detailed invoice with line items, proration, and totals.
 */

import type { Context } from "hono";
import { BillingService } from "../../../domain/billing";
import { BillingEventRepository, OrgRepository } from "../../../domain/jobs";
import type { AuthVariables, Env } from "../../../types/bindings";

/**
 * GET /v1/billing/:year/:month/invoice - Invoice for specific month
 */
export async function getInvoice(
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

  // Check if requesting future month
  const now = new Date();
  const requestedDate = new Date(Date.UTC(year, month - 1, 1));
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  if (requestedDate > currentMonthStart) {
    return c.json(
      { error: { code: "FUTURE_PERIOD", message: "Cannot generate invoice for future periods" } },
      400
    );
  }

  const billingService = createBillingService(c);
  const invoice = await billingService.generateInvoiceForMonth(orgId, year, month);

  // Determine if this is current month (preview) or finalized
  const isPreview = requestedDate.getTime() === currentMonthStart.getTime();

  return c.json(formatInvoiceResponse(invoice, isPreview), 200);
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

interface InvoiceResponse {
  isPreview: boolean;
  period: {
    start: string;
    end: string;
  };
  lineItems: Array<{
    jobId: string;
    jobTitle: string;
    activeWindows: Array<{ from: string; to: string | null }>;
    activeDays: number;
    unitPriceCents: number;
    amountCents: number;
  }>;
  subtotalCents: number;
  discountCents: number;
  discountReason: string | null;
  totalCents: number;
  currency: string;
  formatted: {
    subtotal: string;
    discount: string;
    total: string;
  };
}

function formatInvoiceResponse(
  invoice: ReturnType<typeof import("../../../domain/billing").generateInvoice>,
  isPreview: boolean
): InvoiceResponse {
  return {
    isPreview,
    period: {
      start: invoice.period.start,
      end: invoice.period.end,
    },
    lineItems: invoice.lineItems.map((item) => ({
      jobId: item.jobId,
      jobTitle: item.jobTitle,
      activeWindows: item.activeWindows,
      activeDays: item.activeDays,
      unitPriceCents: item.unitPrice,
      amountCents: item.amount,
    })),
    subtotalCents: invoice.subtotal,
    discountCents: invoice.discount,
    discountReason: invoice.discountReason,
    totalCents: invoice.total,
    currency: invoice.currency,
    formatted: {
      subtotal: formatCents(invoice.subtotal, invoice.currency),
      discount: formatCents(invoice.discount, invoice.currency),
      total: formatCents(invoice.total, invoice.currency),
    },
  };
}

function formatCents(cents: number, currency: string): string {
  const dollars = cents / 100;
  const symbol = currency === "usd" ? "$" : currency.toUpperCase() + " ";
  return `${symbol}${dollars.toFixed(2)}`;
}
