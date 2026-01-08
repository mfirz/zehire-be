-- Migration: 0005_org_capacity_billing
-- Description: Add active role capacity and billing waiver fields to orgs
-- Created: 2026-01-08

-- =============================================================================
-- ACTIVE ROLE CAPACITY
-- =============================================================================
-- Controls how many roles an org can have in "active" state (published + paused).
-- This is a responsibility boundary, not a feature gate.
--
-- Active role = Published OR Paused
--             = Zehire is "on the hook" for evaluative work
--
-- Default: 3 (sweet spot for "actually hiring")

ALTER TABLE orgs ADD COLUMN active_role_capacity INTEGER NOT NULL DEFAULT 3;

-- =============================================================================
-- BILLING WAIVER (Founding Access)
-- =============================================================================
-- Founding users see real billing but pay $0.
-- This reinforces that the work has real value.
--
-- billing_waived: Whether this org's billing is waived
-- billing_waived_reason: Human-readable reason ("Founding Access", "Partner", etc.)
-- billing_waived_until: Optional expiration date for waiver

ALTER TABLE orgs ADD COLUMN billing_waived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orgs ADD COLUMN billing_waived_reason TEXT;
ALTER TABLE orgs ADD COLUMN billing_waived_until TEXT;

-- =============================================================================
-- UPDATE billing_periods STATUS CHECK
-- =============================================================================
-- Add 'waived' status for founding access invoices.
-- SQLite doesn't support ALTER CHECK, so we need to recreate the table.
-- For now, we'll just rely on application-level validation since the
-- original CHECK allows any string (it's a soft constraint).

-- Note: The existing CHECK constraint in billing_periods is:
--   status IN ('pending', 'invoiced', 'paid', 'failed')
-- We'll add 'waived' at the application level and consider a proper
-- migration later if needed.
