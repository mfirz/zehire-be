-- Migration: 0007_pricing_history
-- Description: Create pricing_history table for versioned pricing
-- Created: 2026-01-08

-- =============================================================================
-- PRICING HISTORY TABLE
-- =============================================================================
-- Tracks price changes over time. Billing uses the rate that was active
-- during each billing period.
--
-- Example:
--   - Rate $200 effective from 2026-01-01
--   - Rate $250 effective from 2026-03-01
--   - January/February invoices use $200
--   - March onwards uses $250

CREATE TABLE IF NOT EXISTS pricing_history (
  id TEXT PRIMARY KEY,

  -- Price in cents (e.g., 20000 = $200.00)
  rate_cents INTEGER NOT NULL,

  -- Currency code (lowercase)
  currency TEXT NOT NULL DEFAULT 'usd',

  -- When this price becomes effective (inclusive)
  effective_from TEXT NOT NULL,

  -- Human-readable description of the change
  description TEXT,

  -- Audit fields
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  created_by TEXT  -- User/admin who made the change
);

-- Index for looking up active price at a given time
CREATE INDEX IF NOT EXISTS idx_pricing_history_effective
  ON pricing_history(effective_from DESC);

-- =============================================================================
-- SEED DEFAULT PRICING
-- =============================================================================
-- Insert initial pricing: $200/month effective from the beginning

INSERT INTO pricing_history (id, rate_cents, currency, effective_from, description)
VALUES (
  'price_initial',
  20000,
  'usd',
  '2020-01-01T00:00:00Z',
  'Initial pricing: $200/month per active role'
);
