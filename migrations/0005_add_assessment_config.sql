-- Pipeline Consolidation: Add assessment_config column to jobs table
-- This stores assessment configuration separately from the deprecated pipeline JSON column

ALTER TABLE `jobs` ADD COLUMN `assessment_config` text;
