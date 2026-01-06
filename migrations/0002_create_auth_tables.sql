-- Migration: 0002_create_auth_tables
-- Description: Create users and magic_link_tokens tables for authentication
-- Created: 2026-01-06

-- =============================================================================
-- USERS TABLE
-- =============================================================================
-- Stores registered users who can authenticate via magic link.

CREATE TABLE IF NOT EXISTS users (
  -- Primary identifier (21-char nanoid)
  id TEXT PRIMARY KEY NOT NULL,

  -- User email (unique, used for login)
  email TEXT NOT NULL UNIQUE,

  -- User role: "admin" or "recruiter"
  role TEXT NOT NULL DEFAULT 'recruiter'
    CHECK (role IN ('admin', 'recruiter')),

  -- Standard timestamps
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Index for email lookups (already unique, but explicit for clarity)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Trigger to auto-update updated_at on row changes
CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
  AFTER UPDATE ON users
  FOR EACH ROW
  WHEN OLD.updated_at = NEW.updated_at
BEGIN
  UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE id = NEW.id;
END;

-- =============================================================================
-- MAGIC LINK TOKENS TABLE
-- =============================================================================
-- Stores hashed magic link tokens for passwordless authentication.
--
-- Security:
-- - Tokens are stored as SHA-256 hashes (never plaintext)
-- - Single-use: used_at is set after successful authentication
-- - Time-limited: expires_at enforces TTL

CREATE TABLE IF NOT EXISTS magic_link_tokens (
  -- Primary identifier (21-char nanoid)
  id TEXT PRIMARY KEY NOT NULL,

  -- User this token belongs to
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- SHA-256 hash of the token (never store raw token)
  token_hash TEXT NOT NULL,

  -- When the token expires
  expires_at TEXT NOT NULL,

  -- When the token was used (null if unused)
  -- Set to prevent token reuse
  used_at TEXT,

  -- When the token was created
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Index for token lookup by hash
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_hash ON magic_link_tokens(token_hash);

-- Index for finding expired/used tokens (for cleanup)
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_cleanup ON magic_link_tokens(expires_at, used_at);

-- Index for finding tokens by user (for debugging/admin)
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_user ON magic_link_tokens(user_id);
