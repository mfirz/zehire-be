-- Migration: 0001_create_jobs_table
-- Description: Create jobs table for async job creation pipeline
-- Created: 2024-01-06

-- Jobs table stores job postings and their LLM-generated context/questions
CREATE TABLE IF NOT EXISTS jobs (
  -- Primary identifier (21-char nanoid for URL-safe, compact IDs)
  id TEXT PRIMARY KEY NOT NULL,

  -- Questions generation status (discriminated union for type safety)
  -- Note: This column is renamed to 'questions_status' in migration 0004
  -- none: Questions not yet generated (draft state)
  -- pending: Queued for generation
  -- processing: LLM pipeline in progress
  -- completed: Successfully generated questions
  -- failed: Processing failed (check error_message)
  status TEXT NOT NULL DEFAULT 'none'
    CHECK (status IN ('none', 'pending', 'processing', 'completed', 'failed')),

  -- Input fields from job posting
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  company_name TEXT,
  department TEXT,
  location TEXT,

  -- LLM inference results (stored as JSON)
  -- Populated after inferJobContext() completes
  job_context TEXT,  -- JSON: JobContext object

  -- Resolved archetypes (stored as JSON array)
  -- Populated after resolveArchetypes() completes
  archetypes TEXT,  -- JSON: ResolvedArchetype[]

  -- Generated questions (stored as JSON array)
  -- Populated after renderQuestions() completes
  questions TEXT,  -- JSON: RenderedQuestion[]

  -- Error tracking for failed jobs
  error_message TEXT,
  error_code TEXT,  -- Machine-readable error code for client handling

  -- Processing metadata
  processing_started_at TEXT,  -- ISO timestamp when processing began
  processing_duration_ms INTEGER,  -- Total processing time in milliseconds

  -- Standard timestamps (ISO 8601 strings for D1 compatibility)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  completed_at TEXT  -- Set when status becomes 'completed' or 'failed'
);

-- Indexes for common query patterns
-- Query: List jobs by status (for monitoring/admin)
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- Query: List jobs by creation time (for pagination)
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);

-- Query: Find recently completed jobs
CREATE INDEX IF NOT EXISTS idx_jobs_completed_at ON jobs(completed_at DESC)
  WHERE completed_at IS NOT NULL;

-- Query: Find failed jobs for retry/debugging
CREATE INDEX IF NOT EXISTS idx_jobs_failed ON jobs(status, created_at DESC)
  WHERE status = 'failed';

-- Trigger to auto-update updated_at on row changes
-- Note: D1 supports triggers but not all SQLite trigger features
CREATE TRIGGER IF NOT EXISTS trg_jobs_updated_at
  AFTER UPDATE ON jobs
  FOR EACH ROW
  WHEN OLD.updated_at = NEW.updated_at
BEGIN
  UPDATE jobs SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE id = NEW.id;
END;
