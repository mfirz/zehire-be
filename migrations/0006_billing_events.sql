-- Migration: 0006_billing_events
-- Description: Create billing_events table for tracking job state transitions
-- Created: 2026-01-08

-- =============================================================================
-- BILLING EVENTS TABLE
-- =============================================================================
-- Immutable audit log of job state transitions for billing calculation.
--
-- Events:
--   - activated: Job first published (billing starts)
--   - paused: Job paused (audit only, still active for billing)
--   - resumed: Job resumed from pause (audit only)
--   - deactivated: Job closed (billing ends)
--
-- Billing calculation uses activated/deactivated events to compute active time.
-- Pause/resume are recorded for audit but don't affect billing (both states
-- are "active" - Zehire is on the hook for evaluative work).

CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  job_id TEXT NOT NULL,

  -- Event type
  event_type TEXT NOT NULL CHECK(event_type IN ('activated', 'paused', 'resumed', 'deactivated')),

  -- When the event occurred (state transition time)
  occurred_at TEXT NOT NULL,

  -- Metadata (optional, for context)
  metadata TEXT, -- JSON: { previousStatus, newStatus, ... }

  -- Record creation time (usually same as occurred_at)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

  FOREIGN KEY (org_id) REFERENCES orgs(id),
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

-- Index for querying events by org (for billing periods)
CREATE INDEX IF NOT EXISTS idx_billing_events_org_occurred
  ON billing_events(org_id, occurred_at);

-- Index for querying events by job
CREATE INDEX IF NOT EXISTS idx_billing_events_job
  ON billing_events(job_id, occurred_at);

-- Index for filtering by event type within time range
CREATE INDEX IF NOT EXISTS idx_billing_events_type_occurred
  ON billing_events(event_type, occurred_at);
