-- Add startedAt timestamp to candidate_assessments table
-- This field is set when POST /assess/{token}/start is called (transition to in_progress)

ALTER TABLE `candidate_assessments` ADD COLUMN `started_at` text;
