/**
 * Database Module
 * ===============
 * Main export for Drizzle ORM setup.
 *
 * Usage:
 * ```typescript
 * import { createDb, jobs, type Job } from "../db";
 *
 * const db = createDb(env.DB);
 * const result = await db.select().from(jobs).where(eq(jobs.id, id)).get();
 * ```
 */

// Client
export { createDb, type Database } from "./client";

// Utilities
export { withDbRetry } from "./utils";

// Schema (re-export all tables and types)
export * from "./schema";

// Drizzle operators (re-export for convenience)
export { eq, ne, gt, gte, lt, lte, and, or, not, desc, asc, sql, isNull, isNotNull } from "drizzle-orm";
