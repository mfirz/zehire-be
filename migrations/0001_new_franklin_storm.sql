CREATE TABLE `custom_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`question_id` text NOT NULL,
	`answer_text` text,
	`answer_values` text,
	`answer_number` real,
	`answer_date` text,
	`answer_url` text,
	`screening_passed` integer,
	`extraction_status` text DEFAULT 'pending',
	`extracted_signals` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `custom_questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_custom_answers_application` ON `custom_answers` (`application_id`);--> statement-breakpoint
CREATE INDEX `idx_custom_answers_question` ON `custom_answers` (`question_id`);--> statement-breakpoint
CREATE INDEX `idx_custom_answers_extraction` ON `custom_answers` (`extraction_status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_custom_answers_unique` ON `custom_answers` (`application_id`,`question_id`);--> statement-breakpoint
CREATE TABLE `custom_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`category` text NOT NULL,
	`answer_type` text NOT NULL,
	`question_text` text NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`order_index` integer NOT NULL,
	`target_signals` text,
	`expected_answer` text,
	`fail_action` text DEFAULT 'flag',
	`options` text,
	`min_value` real,
	`max_value` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_custom_questions_job` ON `custom_questions` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_custom_questions_job_order` ON `custom_questions` (`job_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `cv_education` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`degree` text,
	`field` text,
	`institution` text NOT NULL,
	`year` text,
	`order_index` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cv_education_application` ON `cv_education` (`application_id`);--> statement-breakpoint
CREATE TABLE `cv_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`skill_name` text NOT NULL,
	`category` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cv_skills_application` ON `cv_skills` (`application_id`);--> statement-breakpoint
CREATE INDEX `idx_cv_skills_name` ON `cv_skills` (`skill_name`);--> statement-breakpoint
CREATE TABLE `cv_work_experiences` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`is_current` integer DEFAULT false,
	`duration_months` integer,
	`highlights` text,
	`order_index` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cv_work_exp_application` ON `cv_work_experiences` (`application_id`);--> statement-breakpoint
ALTER TABLE `applications` ADD `cv_raw_text` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `cv_summary_json` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `cv_extraction_status` text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `applications` ADD `cv_contradictions` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `total_years_experience` integer;--> statement-breakpoint
ALTER TABLE `applications` ADD `has_management_experience` integer DEFAULT false;