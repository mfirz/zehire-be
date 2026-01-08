/**
 * GET /v1/billing/preview
 * =======================
 * Preview of current month charges up to now.
 *
 * Shows what the user would be charged if the billing period ended right now.
 * Useful for real-time cost tracking.
 */

import type { Context } from "hono";
import { BillingService } from "../../../domain/billing";
import { BillingEventRepository, OrgRepository } from "../../../domain/jobs";
import type { AuthVariables, Env } from "../../../types/bindings";

/**
 * GET /v1/billing/preview - Current charges preview
 */
export async function getPreview(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>
): Promise<Response> {
  const user = c.get("user");
  const orgId = user.orgId;

  const billingService = createBillingService(c);
  const invoice = await billingService.getCurrentChargesPreview(orgId);

  return c.json(formatInvoiceResponse(invoice, true), 200);
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
  // Formatted for display
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
