CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`archetype_id` text NOT NULL,
	`question_text` text NOT NULL,
	`answer_text` text NOT NULL,
	`extracted_signals` text,
	`extraction_status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`answered_at` text NOT NULL,
	`extracted_at` text,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_answers_application_id` ON `answers` (`application_id`);--> statement-breakpoint
CREATE INDEX `idx_answers_extraction_status` ON `answers` (`extraction_status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_answers_unique` ON `answers` (`application_id`,`archetype_id`);--> statement-breakpoint
CREATE TABLE `application_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`candidate_email` text NOT NULL,
	`candidate_name` text NOT NULL,
	`preferred_name` text,
	`phone` text,
	`answers` text DEFAULT '[]' NOT NULL,
	`resume_token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_drafts_job_id` ON `application_drafts` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_drafts_email` ON `application_drafts` (`candidate_email`);--> statement-breakpoint
CREATE INDEX `idx_drafts_expires` ON `application_drafts` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_drafts_unique_candidate` ON `application_drafts` (`job_id`,`candidate_email`);--> statement-breakpoint
CREATE TABLE `application_events` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`event_type` text NOT NULL,
	`actor_id` text,
	`actor_name` text,
	`old_value` text,
	`new_value` text,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_application_events_application_id` ON `application_events` (`application_id`);--> statement-breakpoint
CREATE INDEX `idx_application_events_created_at` ON `application_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `application_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_application_notes_application_id` ON `application_notes` (`application_id`);--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`candidate_email` text NOT NULL,
	`candidate_name` text NOT NULL,
	`preferred_name` text,
	`phone` text,
	`detected_country` text,
	`detected_timezone` text,
	`cv_path` text,
	`cv_filename` text,
	`cv_uploaded_at` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`signals_status` text DEFAULT 'pending' NOT NULL,
	`signal_evaluations` text,
	`decision_posture` text,
	`signals_error_message` text,
	`signals_error_code` text,
	`triage_status` text,
	`source` text DEFAULT 'organic',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`signals_computed_at` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_applications_job_id` ON `applications` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_applications_status` ON `applications` (`status`);--> statement-breakpoint
CREATE INDEX `idx_applications_signals_status` ON `applications` (`signals_status`);--> statement-breakpoint
CREATE INDEX `idx_applications_triage_status` ON `applications` (`triage_status`);--> statement-breakpoint
CREATE INDEX `idx_applications_candidate_email` ON `applications` (`candidate_email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_applications_unique_candidate` ON `applications` (`job_id`,`candidate_email`);--> statement-breakpoint
CREATE TABLE `billing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`job_id` text NOT NULL,
	`event_type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_billing_events_org_occurred` ON `billing_events` (`org_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_billing_events_job` ON `billing_events` (`job_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_billing_events_type_occurred` ON `billing_events` (`event_type`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `billing_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`total_active_minutes` integer DEFAULT 0 NOT NULL,
	`total_charge_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`stripe_invoice_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_billing_periods_org` ON `billing_periods` (`org_id`,`period_start`);--> statement-breakpoint
CREATE TABLE `pricing_history` (
	`id` text PRIMARY KEY NOT NULL,
	`rate_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`effective_from` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	`created_by` text
);
--> statement-breakpoint
CREATE INDEX `idx_pricing_history_effective` ON `pricing_history` (`effective_from`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`questions_status` text DEFAULT 'none' NOT NULL,
	`pipeline_status` text DEFAULT 'none',
	`title` text NOT NULL,
	`description` text NOT NULL,
	`description_text` text,
	`company_name` text,
	`department` text,
	`location` text,
	`work_type` text DEFAULT 'remote' NOT NULL,
	`employment_type` text DEFAULT 'fulltime' NOT NULL,
	`salary_min` integer,
	`salary_max` integer,
	`salary_currency` text,
	`job_context` text,
	`archetypes` text,
	`questions` text,
	`error_message` text,
	`error_code` text,
	`regeneration_count` integer DEFAULT 0 NOT NULL,
	`last_regeneration_at` text,
	`processing_started_at` text,
	`processing_duration_ms` integer,
	`pipeline_recommendation` text,
	`pipeline` text,
	`pipeline_generated_at` text,
	`pipeline_error` text,
	`pipeline_error_code` text,
	`pipeline_regeneration_count` integer DEFAULT 0,
	`pipeline_last_regeneration_at` text,
	`pipeline_processing_started_at` text,
	`pipeline_processing_duration_ms` integer,
	`public_slug` text,
	`application_config` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	`published_at` text,
	`closed_at` text,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_org_created` ON `jobs` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_jobs_status_v2` ON `jobs` (`org_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_jobs_public_slug` ON `jobs` (`public_slug`);--> statement-breakpoint
CREATE INDEX `idx_jobs_questions_status` ON `jobs` (`questions_status`);--> statement-breakpoint
CREATE INDEX `idx_jobs_pipeline_status` ON `jobs` (`org_id`,`pipeline_status`,`created_at`);--> statement-breakpoint
CREATE TABLE `magic_link_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_magic_link_tokens_hash` ON `magic_link_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_magic_link_tokens_user` ON `magic_link_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `orgs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`jobs_list_version` integer DEFAULT 1 NOT NULL,
	`active_role_capacity` integer DEFAULT 3 NOT NULL,
	`billing_waived` integer DEFAULT 0 NOT NULL,
	`billing_waived_reason` text,
	`billing_waived_until` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'recruiter' NOT NULL,
	`org_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_org` ON `users` (`org_id`);