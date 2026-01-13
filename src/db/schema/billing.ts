/**
 * Billing Schema
 * ==============
 * Billing events, pricing history, and billing periods.
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { orgs } from "./orgs";
import { jobs } from "./jobs";

// Enums
export const billingEventTypes = ["activated", "paused", "resumed", "deactivated"] as const;
export type BillingEventType = (typeof billingEventTypes)[number];

export const billingPeriodStatuses = ["pending", "invoiced", "paid", "failed", "waived"] as const;
export type BillingPeriodStatus = (typeof billingPeriodStatuses)[number];

/**
 * Billing Events
 * Immutable audit log of job state transitions for billing calculation.
 */
export const billingEvents = sqliteTable(
  "billing_events",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    eventType: text("event_type", { enum: billingEventTypes }).notNull(),
    occurredAt: text("occurred_at").notNull(),
    metadata: text("metadata"), // JSON
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_billing_events_org_occurred").on(table.orgId, table.occurredAt),
    index("idx_billing_events_job").on(table.jobId, table.occurredAt),
    index("idx_billing_events_type_occurred").on(table.eventType, table.occurredAt),
  ]
);

/**
 * Pricing History
 * Versioned pricing for billing calculations.
 */
export const pricingHistory = sqliteTable(
  "pricing_history",
  {
    id: text("id").primaryKey(),
    rateCents: integer("rate_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    effectiveFrom: text("effective_from").notNull(),
    description: text("description"),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by"),
  },
  (table) => [index("idx_pricing_history_effective").on(table.effectiveFrom)]
);

/**
 * Billing Periods
 * Monthly billing summaries per organization.
 */
export const billingPeriods = sqliteTable(
  "billing_periods",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    totalActiveMinutes: integer("total_active_minutes").notNull().default(0),
    totalChargeCents: integer("total_charge_cents").notNull().default(0),
    status: text("status", { enum: billingPeriodStatuses }).notNull().default("pending"),
    stripeInvoiceId: text("stripe_invoice_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_billing_periods_org").on(table.orgId, table.periodStart)]
);

// Inferred types
export type BillingEvent = typeof billingEvents.$inferSelect;
export type NewBillingEvent = typeof billingEvents.$inferInsert;
export type PricingHistoryRecord = typeof pricingHistory.$inferSelect;
export type NewPricingHistoryRecord = typeof pricingHistory.$inferInsert;
export type BillingPeriod = typeof billingPeriods.$inferSelect;
export type NewBillingPeriod = typeof billingPeriods.$inferInsert;
