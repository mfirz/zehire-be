/**
 * Users Schema
 * ============
 * User accounts and magic link authentication tokens.
 */

import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { orgs } from "./orgs";

// Enums
export const userRoles = ["admin", "recruiter"] as const;
export type UserRole = (typeof userRoles)[number];

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    role: text("role", { enum: userRoles }).notNull().default("recruiter"),
    orgId: text("org_id").references(() => orgs.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_users_email").on(table.email),
    index("idx_users_org").on(table.orgId),
  ]
);

export const magicLinkTokens = sqliteTable(
  "magic_link_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_magic_link_tokens_hash").on(table.tokenHash),
    index("idx_magic_link_tokens_user").on(table.userId),
  ]
);

// Inferred types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
export type NewMagicLinkToken = typeof magicLinkTokens.$inferInsert;
