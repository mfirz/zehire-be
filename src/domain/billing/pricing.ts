/**
 * Pricing Repository
 * ==================
 * Manages pricing history for versioned billing rates.
 *
 * Pricing is effective from a specific date forward until a new price
 * takes effect. This allows for:
 * - Scheduled price increases with advance notice
 * - Historical invoices calculated at their original rates
 * - Audit trail of pricing changes
 */

import { customAlphabet } from "nanoid";

// Alphanumeric-only ID generator
const alphanumericId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  21
);

// =============================================================================
// TYPES
// =============================================================================

/**
 * A pricing record.
 */
export interface PricingRecord {
  id: string;
  rateCents: number;
  currency: string;
  effectiveFrom: string;
  description: string | null;
  createdAt: string;
  createdBy: string | null;
}

/**
 * Input for creating a new pricing record.
 */
export interface CreatePricingInput {
  rateCents: number;
  currency?: string;
  effectiveFrom: string;
  description?: string;
  createdBy?: string;
}

// =============================================================================
// REPOSITORY
// =============================================================================

export class PricingRepository {
  constructor(private readonly db: D1Database) {}

  /**
   * Get the active price at a specific point in time.
   * Returns the most recent price with effective_from <= the given date.
   */
  async getActivePrice(atDate: string): Promise<PricingRecord | null> {
    const result = await this.db
      .prepare(
        `
        SELECT id, rate_cents, currency, effective_from, description, created_at, created_by
        FROM pricing_history
        WHERE effective_from <= ?
        ORDER BY effective_from DESC
        LIMIT 1
        `
      )
      .bind(atDate)
      .first<{
        id: string;
        rate_cents: number;
        currency: string;
        effective_from: string;
        description: string | null;
        created_at: string;
        created_by: string | null;
      }>();

    if (!result) return null;

    return {
      id: result.id,
      rateCents: result.rate_cents,
      currency: result.currency,
      effectiveFrom: result.effective_from,
      description: result.description,
      createdAt: result.created_at,
      createdBy: result.created_by,
    };
  }

  /**
   * Get the current active price (as of now).
   */
  async getCurrentPrice(): Promise<PricingRecord | null> {
    return this.getActivePrice(new Date().toISOString());
  }

  /**
   * Get all pricing history, ordered by effective date (newest first).
   */
  async getHistory(): Promise<PricingRecord[]> {
    const result = await this.db
      .prepare(
        `
        SELECT id, rate_cents, currency, effective_from, description, created_at, created_by
        FROM pricing_history
        ORDER BY effective_from DESC
        `
      )
      .all<{
        id: string;
        rate_cents: number;
        currency: string;
        effective_from: string;
        description: string | null;
        created_at: string;
        created_by: string | null;
      }>();

    return (result.results ?? []).map((row) => ({
      id: row.id,
      rateCents: row.rate_cents,
      currency: row.currency,
      effectiveFrom: row.effective_from,
      description: row.description,
      createdAt: row.created_at,
      createdBy: row.created_by,
    }));
  }

  /**
   * Get upcoming price changes (effective in the future).
   */
  async getUpcoming(): Promise<PricingRecord[]> {
    const now = new Date().toISOString();

    const result = await this.db
      .prepare(
        `
        SELECT id, rate_cents, currency, effective_from, description, created_at, created_by
        FROM pricing_history
        WHERE effective_from > ?
        ORDER BY effective_from ASC
        `
      )
      .bind(now)
      .all<{
        id: string;
        rate_cents: number;
        currency: string;
        effective_from: string;
        description: string | null;
        created_at: string;
        created_by: string | null;
      }>();

    return (result.results ?? []).map((row) => ({
      id: row.id,
      rateCents: row.rate_cents,
      currency: row.currency,
      effectiveFrom: row.effective_from,
      description: row.description,
      createdAt: row.created_at,
      createdBy: row.created_by,
    }));
  }

  /**
   * Create a new pricing record.
   * Used for scheduling price changes.
   */
  async create(input: CreatePricingInput): Promise<PricingRecord> {
    const id = `price${alphanumericId()}`;
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `
        INSERT INTO pricing_history (id, rate_cents, currency, effective_from, description, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
      .bind(
        id,
        input.rateCents,
        input.currency ?? "usd",
        input.effectiveFrom,
        input.description ?? null,
        now,
        input.createdBy ?? null
      )
      .run();

    return {
      id,
      rateCents: input.rateCents,
      currency: input.currency ?? "usd",
      effectiveFrom: input.effectiveFrom,
      description: input.description ?? null,
      createdAt: now,
      createdBy: input.createdBy ?? null,
    };
  }

  /**
   * Delete a future pricing record (can't delete past/current pricing).
   */
  async deleteFuture(id: string): Promise<boolean> {
    const now = new Date().toISOString();

    const result = await this.db
      .prepare(
        `
        DELETE FROM pricing_history
        WHERE id = ? AND effective_from > ?
        `
      )
      .bind(id, now)
      .run();

    return (result.meta?.changes ?? 0) > 0;
  }
}
