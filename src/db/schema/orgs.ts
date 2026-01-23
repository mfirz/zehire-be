/**
 * Organizations Schema
 * ====================
 * Multi-tenancy support. Each user and job belongs to an organization.
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const orgs = sqliteTable("orgs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),

  // Cache versioning for job lists
  jobsListVersion: integer("jobs_list_version").notNull().default(1),

  // Active role capacity (published + paused jobs)
  activeRoleCapacity: integer("active_role_capacity").notNull().default(3),

  // Billing waiver (Founding Access)
  billingWaived: integer("billing_waived").notNull().default(0),
  billingWaivedReason: text("billing_waived_reason"),
  billingWaivedUntil: text("billing_waived_until"),

  // Video call provider (Phase 9)
  videoCallProvider: text("video_call_provider").default("calendar_native"), // "calendar_native", "zoom", "google_meet", "teams"
  videoTokens: text("video_tokens"), // Encrypted JSON (for Zoom, etc.)
  videoAccountId: text("video_account_id"), // Provider-specific account ID
  videoConnectedAt: text("video_connected_at"),

  // Timestamps
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Inferred types
export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
