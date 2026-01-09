-- Migration: 0008_pipeline_generation
-- Description: Add pipeline generation columns to jobs table
-- Created: 2026-01-09

-- =============================================================================
-- PIPELINE GENERATION COLUMNS
-- =============================================================================
-- Follows the same pattern as question generation.
-- Pipeline recommends assessment types and interview rounds based on job details.

-- Pipeline status (mirrors questions_status)
ALTER TABLE jobs ADD COLUMN pipeline_status TEXT DEFAULT 'none';

-- LLM recommendation (raw output from pipeline advisor)
ALTER TABLE jobs ADD COLUMN pipeline_recommendation TEXT;

-- Pipeline configuration (editable by recruiter)
ALTER TABLE jobs ADD COLUMN pipeline TEXT;

-- Completion timestamp
ALTER TABLE jobs ADD COLUMN pipeline_generated_at TEXT;

-- Error tracking (for failed generation)
ALTER TABLE jobs ADD COLUMN pipeline_error TEXT;
ALTER TABLE jobs ADD COLUMN pipeline_error_code TEXT;

-- Rate limiting (same as questions: 20 max, cooldown between attempts)
ALTER TABLE jobs ADD COLUMN pipeline_regeneration_count INTEGER DEFAULT 0;
ALTER TABLE jobs ADD COLUMN pipeline_last_regeneration_at TEXT;

-- Processing metadata
ALTER TABLE jobs ADD COLUMN pipeline_processing_started_at TEXT;
ALTER TABLE jobs ADD COLUMN pipeline_processing_duration_ms INTEGER;

-- =============================================================================
-- INDEX FOR PIPELINE STATUS QUERIES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_jobs_pipeline_status
  ON jobs(org_id, pipeline_status, created_at DESC);
