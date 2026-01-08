-- Migration: 0004_jobs_v2_billing
-- Description: Jobs API v2 with draft/publish lifecycle and billing infrastructure
-- Created: 2026-01-07

-- =============================================================================
-- PHASE 1: Update jobs table for new lifecycle
-- =============================================================================

-- Rename current status column to questions_status
-- (represents LLM question generation state, not visibility)
ALTER TABLE jobs RENAME COLUMN status TO questions_status;

-- Add new status column for visibility/billing lifecycle
-- draft → published → paused → closed
ALTER TABLE jobs ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published', 'paused', 'closed'));

-- Add public slug for SEO-friendly URLs (e.g., acme-corp-senior-engineer)
-- Note: UNIQUE constraint added via index below (SQLite limitation with ALTER TABLE)
ALTER TABLE jobs ADD COLUMN public_slug TEXT;

-- Add lifecycle timestamps
ALTER TABLE jobs ADD COLUMN published_at TEXT;
ALTER TABLE jobs ADD COLUMN closed_at TEXT;

-- Add regeneration rate limiting columns
ALTER TABLE jobs ADD COLUMN regeneration_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN last_regeneration_at TEXT;

-- Unique index for public slug lookups (enforces uniqueness, filtered - only non-null slugs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_public_slug ON jobs(public_slug) WHERE public_slug IS NOT NULL;

-- Index for status filtering with org scoping
CREATE INDEX IF NOT EXISTS idx_jobs_status_v2 ON jobs(org_id, status, created_at DESC);

-- =============================================================================
-- PHASE 2: Job billing events (event sourcing for accurate billing)
-- =============================================================================

CREATE TABLE IF NOT EXISTS job_billing_events (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('activated', 'paused', 'resumed', 'closed')),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (org_id) REFERENCES orgs(id)
);

-- Index for finding events by job
CREATE INDEX IF NOT EXISTS idx_billing_events_job ON job_billing_events(job_id, occurred_at);

-- Index for calculating billing per org per period
CREATE INDEX IF NOT EXISTS idx_billing_events_org_period ON job_billing_events(org_id, occurred_at);

-- =============================================================================
-- PHASE 3: Billing configuration (adjustable pricing)
-- =============================================================================

CREATE TABLE IF NOT EXISTS billing_config (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT,  -- NULL = global default for all orgs
  price_per_role_cents INTEGER NOT NULL DEFAULT 20000,  -- $200.00
  currency TEXT NOT NULL DEFAULT 'USD',
  effective_from TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

  FOREIGN KEY (org_id) REFERENCES orgs(id)
);

-- Index for finding org-specific config
CREATE INDEX IF NOT EXISTS idx_billing_config_org ON billing_config(org_id, effective_from DESC);

-- Insert default global pricing ($200/role/month)
INSERT INTO billing_config (id, org_id, price_per_role_cents, currency, effective_from)
VALUES ('default', NULL, 20000, 'USD', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

-- =============================================================================
-- PHASE 4: Billing periods (monthly summaries)
-- =============================================================================

CREATE TABLE IF NOT EXISTS billing_periods (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  period_start TEXT NOT NULL,  -- ISO 8601, start of billing period
  period_end TEXT NOT NULL,    -- ISO 8601, end of billing period
  total_active_minutes INTEGER NOT NULL DEFAULT 0,
  total_charge_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invoiced', 'paid', 'failed')),
  stripe_invoice_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

  FOREIGN KEY (org_id) REFERENCES orgs(id)
);

-- Index for finding billing periods by org
CREATE INDEX IF NOT EXISTS idx_billing_periods_org ON billing_periods(org_id, period_start DESC);

-- Trigger to auto-update updated_at
CREATE TRIGGER IF NOT EXISTS trg_billing_periods_updated_at
AFTER UPDATE ON billing_periods
FOR EACH ROW
WHEN OLD.updated_at = NEW.updated_at
BEGIN
  UPDATE billing_periods SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.id;
END;
