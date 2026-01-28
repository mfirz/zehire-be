-- Add name column to users table for display name
-- Can be set via SSO (Google name) or manually

ALTER TABLE `users` ADD COLUMN `name` text;
