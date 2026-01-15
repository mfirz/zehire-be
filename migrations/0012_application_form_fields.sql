-- Add contact fields and CV storage to applications table
ALTER TABLE `applications` ADD COLUMN `preferred_name` text;
ALTER TABLE `applications` ADD COLUMN `phone` text;
ALTER TABLE `applications` ADD COLUMN `detected_country` text;
ALTER TABLE `applications` ADD COLUMN `detected_timezone` text;
ALTER TABLE `applications` ADD COLUMN `cv_path` text;
ALTER TABLE `applications` ADD COLUMN `cv_filename` text;
ALTER TABLE `applications` ADD COLUMN `cv_uploaded_at` text;

-- Add contact fields to application_drafts table
ALTER TABLE `application_drafts` ADD COLUMN `preferred_name` text;
ALTER TABLE `application_drafts` ADD COLUMN `phone` text;

-- Add application form configuration to jobs table
ALTER TABLE `jobs` ADD COLUMN `application_config` text;
