-- Migration: 0003_add_organizations
-- Description: Add organizations table and multi-tenancy support
-- Created: 2026-01-07

-- =============================================================================
-- ORGANIZATIONS TABLE
-- =============================================================================
-- Stores organizations (tenants) for multi-tenancy support.
-- Each user belongs to one organization.
-- Jobs are scoped to organizations.

CREATE TABLE IF NOT EXISTS orgs (
  -- Primary identifier (21-char nanoid)
  id TEXT PRIMARY KEY NOT NULL,

  -- Organization name
  name TEXT NOT NULL,

  -- Cache versioning for job lists
  -- Incremented when jobs are created/modified
  -- Used to construct cache keys for edge caching
  jobs_list_version INTEGER NOT NULL DEFAULT 1,

  -- Standard timestamps
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Trigger to auto-update updated_at on row changes
CREATE TRIGGER IF NOT EXISTS trg_orgs_updated_at
  AFTER UPDATE ON orgs
  FOR EACH ROW
  WHEN OLD.updated_at = NEW.updated_at
BEGIN
  UPDATE orgs SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE id = NEW.id;
END;

-- =============================================================================
-- ADD ORG_ID TO USERS TABLE
-- =============================================================================
-- Link users to their organization.

ALTER TABLE users ADD COLUMN org_id TEXT REFERENCES orgs(id);

-- Index for looking up users by organization
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);

-- =============================================================================
-- ADD ORG_ID TO JOBS TABLE
-- =============================================================================
-- Scope jobs to organizations for multi-tenancy.

ALTER TABLE jobs ADD COLUMN org_id TEXT REFERENCES orgs(id);

-- Index for listing jobs by organization (primary query pattern)
CREATE INDEX IF NOT EXISTS idx_jobs_org_created ON jobs(org_id, created_at DESC);

-- Composite index for cursor-based pagination
-- Supports: WHERE org_id = ? AND (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_jobs_org_cursor ON jobs(org_id, created_at DESC, id DESC);
