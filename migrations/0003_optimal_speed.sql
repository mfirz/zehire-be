CREATE TABLE `interview_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`interview_id` text NOT NULL,
	`interviewer_id` text NOT NULL,
	`calendar_event_id` text,
	`feedback_status` text DEFAULT 'pending',
	`feedback_submitted_at` text,
	`feedback_content` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`interview_id`) REFERENCES `scheduled_interviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`interviewer_id`) REFERENCES `interviewers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_participants_interview` ON `interview_participants` (`interview_id`);--> statement-breakpoint
CREATE INDEX `idx_participants_interviewer` ON `interview_participants` (`interviewer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_participants_unique` ON `interview_participants` (`interview_id`,`interviewer_id`);--> statement-breakpoint
CREATE TABLE `interview_stage_config` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`mode` text DEFAULT 'any_one',
	`duration_minutes` integer DEFAULT 45,
	`buffer_minutes` integer DEFAULT 15,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stage_config_job_stage` ON `interview_stage_config` (`job_id`,`stage_id`);--> statement-breakpoint
CREATE TABLE `interview_stage_interviewers` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`interviewer_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`interviewer_id`) REFERENCES `interviewers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_stage_interviewers_job` ON `interview_stage_interviewers` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_stage_interviewers_stage` ON `interview_stage_interviewers` (`stage_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stage_interviewers_unique` ON `interview_stage_interviewers` (`job_id`,`stage_id`,`interviewer_id`);--> statement-breakpoint
CREATE TABLE `interviewer_availability` (
	`id` text PRIMARY KEY NOT NULL,
	`interviewer_id` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`interviewer_id`) REFERENCES `interviewers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_availability_interviewer` ON `interviewer_availability` (`interviewer_id`);--> statement-breakpoint
CREATE TABLE `interviewer_blocked_dates` (
	`id` text PRIMARY KEY NOT NULL,
	`interviewer_id` text NOT NULL,
	`blocked_date` text NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`interviewer_id`) REFERENCES `interviewers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_blocked_dates_interviewer` ON `interviewer_blocked_dates` (`interviewer_id`);--> statement-breakpoint
CREATE INDEX `idx_blocked_dates_date` ON `interviewer_blocked_dates` (`blocked_date`);--> statement-breakpoint
CREATE TABLE `interviewers` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`magic_token` text NOT NULL,
	`magic_token_expires_at` text,
	`calendar_provider` text,
	`calendar_connected` integer DEFAULT false,
	`calendar_tokens` text,
	`calendar_id` text,
	`timezone` text DEFAULT 'UTC',
	`status` text DEFAULT 'invited',
	`invited_at` text,
	`connected_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interviewers_magic_token_unique` ON `interviewers` (`magic_token`);--> statement-breakpoint
CREATE INDEX `idx_interviewers_org` ON `interviewers` (`org_id`);--> statement-breakpoint
CREATE INDEX `idx_interviewers_magic_token` ON `interviewers` (`magic_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_interviewers_org_email` ON `interviewers` (`org_id`,`email`);--> statement-breakpoint
CREATE TABLE `scheduled_interviews` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`job_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`timezone` text NOT NULL,
	`video_call_link` text,
	`video_call_provider` text,
	`status` text DEFAULT 'scheduled',
	`cancelled_reason` text,
	`rescheduled_from_id` text,
	`candidate_calendar_event_id` text,
	`reminder_sent_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_interviews_application` ON `scheduled_interviews` (`application_id`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_interviews_job` ON `scheduled_interviews` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_interviews_status` ON `scheduled_interviews` (`status`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_interviews_date` ON `scheduled_interviews` (`scheduled_at`);--> statement-breakpoint
CREATE TABLE `scheduling_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scheduling_tokens_token_unique` ON `scheduling_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_scheduling_tokens_token` ON `scheduling_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_scheduling_tokens_application` ON `scheduling_tokens` (`application_id`);--> statement-breakpoint
ALTER TABLE `applications` ADD `current_stage_id` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `stage_updated_at` text;--> statement-breakpoint
ALTER TABLE `orgs` ADD `video_call_provider` text DEFAULT 'calendar_native';--> statement-breakpoint
ALTER TABLE `orgs` ADD `video_tokens` text;--> statement-breakpoint
ALTER TABLE `orgs` ADD `video_account_id` text;--> statement-breakpoint
ALTER TABLE `orgs` ADD `video_connected_at` text;