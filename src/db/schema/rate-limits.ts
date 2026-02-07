/**
 * Rate Limits Schema
 * ==================
 * Tracks request counts per key per time window for rate limiting.
 */

import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    window: text("window").notNull(),
    count: integer("count").notNull().default(1),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.window] }),
    index("idx_rate_limits_expires").on(table.expiresAt),
  ]
);

export type RateLimit = typeof rateLimits.$inferSelect;
export type NewRateLimit = typeof rateLimits.$inferInsert;
