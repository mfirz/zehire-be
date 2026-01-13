/**
 * Drizzle Client
 * ==============
 * Creates a Drizzle ORM instance for Cloudflare D1.
 */

import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";
import * as schema from "./schema";

/**
 * Create a Drizzle database instance from D1 binding.
 */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

/**
 * Database type for use in repositories.
 */
export type Database = ReturnType<typeof createDb>;
