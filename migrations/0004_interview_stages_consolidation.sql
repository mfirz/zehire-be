-- Pipeline Consolidation: Add name, focus, order_index to interview_stage_config
-- This allows storing all stage data in the relational table instead of JSON

-- Add new columns to interview_stage_config
-- These columns store data previously kept in jobs.pipeline JSON
ALTER TABLE `interview_stage_config` ADD COLUMN `name` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `interview_stage_config` ADD COLUMN `focus` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `interview_stage_config` ADD COLUMN `order_index` integer NOT NULL DEFAULT 0;--> statement-breakpoint

-- Create index for ordering stages by job
CREATE INDEX `idx_stage_config_job_order` ON `interview_stage_config` (`job_id`, `order_index`);
