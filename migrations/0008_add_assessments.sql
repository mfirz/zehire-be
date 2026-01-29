-- Assessment System: assessment definitions, parts, job assessments, candidate assessments, and files
-- This adds a complete assessment workflow for take-home evaluations linked to jobs and candidates.

-- =============================================================================
-- ASSESSMENT DEFINITIONS (library of reusable assessments per org)
-- =============================================================================

CREATE TABLE `assessment_definitions` (
  `id` text PRIMARY KEY NOT NULL,
  `org_id` text NOT NULL REFERENCES `orgs`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `scheduling_config` text NOT NULL,
  `status` text NOT NULL DEFAULT 'active',
  `created_by` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);--> statement-breakpoint

CREATE INDEX `idx_assessment_defs_org_status` ON `assessment_definitions` (`org_id`, `status`);--> statement-breakpoint
CREATE INDEX `idx_assessment_defs_org_created` ON `assessment_definitions` (`org_id`, `created_at`);--> statement-breakpoint

-- =============================================================================
-- ASSESSMENT PARTS (sections within an assessment definition)
-- =============================================================================

CREATE TABLE `assessment_parts` (
  `id` text PRIMARY KEY NOT NULL,
  `assessment_definition_id` text NOT NULL REFERENCES `assessment_definitions`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `instructions` text NOT NULL,
  `evidence_description` text NOT NULL,
  `required` integer NOT NULL DEFAULT 1,
  `order_index` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);--> statement-breakpoint

CREATE INDEX `idx_assessment_parts_def_order` ON `assessment_parts` (`assessment_definition_id`, `order_index`);--> statement-breakpoint

-- =============================================================================
-- JOB ASSESSMENTS (links a job to an assessment definition)
-- =============================================================================

CREATE TABLE `job_assessments` (
  `id` text PRIMARY KEY NOT NULL,
  `job_id` text NOT NULL REFERENCES `jobs`(`id`) ON DELETE CASCADE,
  `assessment_definition_id` text NOT NULL REFERENCES `assessment_definitions`(`id`),
  `snapshot` text,
  `snapshot_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX `idx_job_assessments_job` ON `job_assessments` (`job_id`);--> statement-breakpoint

-- =============================================================================
-- CANDIDATE ASSESSMENTS (tracks a candidate's assessment progress)
-- =============================================================================

CREATE TABLE `candidate_assessments` (
  `id` text PRIMARY KEY NOT NULL,
  `application_id` text NOT NULL REFERENCES `applications`(`id`) ON DELETE CASCADE,
  `job_id` text NOT NULL REFERENCES `jobs`(`id`) ON DELETE CASCADE,
  `status` text NOT NULL DEFAULT 'invited',
  `token` text NOT NULL,
  `token_expires_at` text NOT NULL,
  `invited_at` text NOT NULL,
  `schedule_deadline` text NOT NULL,
  `scheduled_for` text,
  `scheduled_timezone` text,
  `completion_deadline` text,
  `submitted_at` text,
  `reschedule_count` integer NOT NULL DEFAULT 0,
  `evaluation_signal` text,
  `evaluation_notes` text,
  `evaluated_by` text,
  `evaluated_at` text,
  `evaluation_updated_by` text,
  `evaluation_updated_at` text,
  `cancelled_at` text,
  `cancel_reason` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX `idx_candidate_assessments_token` ON `candidate_assessments` (`token`);--> statement-breakpoint
CREATE INDEX `idx_candidate_assessments_job_status` ON `candidate_assessments` (`job_id`, `status`);--> statement-breakpoint
CREATE INDEX `idx_candidate_assessments_application` ON `candidate_assessments` (`application_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_candidate_assessments_unique_app` ON `candidate_assessments` (`application_id`);--> statement-breakpoint
CREATE INDEX `idx_candidate_assessments_schedule_expiry` ON `candidate_assessments` (`status`, `schedule_deadline`);--> statement-breakpoint
CREATE INDEX `idx_candidate_assessments_completion_expiry` ON `candidate_assessments` (`status`, `completion_deadline`);--> statement-breakpoint

-- =============================================================================
-- ASSESSMENT FILES (files uploaded by candidates for assessment parts)
-- =============================================================================

CREATE TABLE `assessment_files` (
  `id` text PRIMARY KEY NOT NULL,
  `candidate_assessment_id` text NOT NULL REFERENCES `candidate_assessments`(`id`) ON DELETE CASCADE,
  `part_id` text NOT NULL,
  `file_name` text NOT NULL,
  `file_size` integer NOT NULL,
  `mime_type` text NOT NULL,
  `r2_key` text NOT NULL,
  `uploaded_at` text NOT NULL
);--> statement-breakpoint

CREATE INDEX `idx_assessment_files_candidate_part` ON `assessment_files` (`candidate_assessment_id`, `part_id`);
