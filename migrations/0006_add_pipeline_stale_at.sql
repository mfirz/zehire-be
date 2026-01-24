-- Add pipeline_stale_at column to track when pipeline becomes stale
-- This is set when title/description changes after pipeline was generated
-- Allows frontend to show warning: "Pipeline may be outdated. Regenerate?"

ALTER TABLE `jobs` ADD COLUMN `pipeline_stale_at` text;
