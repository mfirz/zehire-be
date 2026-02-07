-- Rate limiting table for tracking request counts per key per time window.
-- Used to prevent brute-force attacks on auth endpoints.

CREATE TABLE `rate_limits` (
  `key` text NOT NULL,
  `window` text NOT NULL,
  `count` integer NOT NULL DEFAULT 1,
  `expires_at` text NOT NULL,
  PRIMARY KEY (`key`, `window`)
);

CREATE INDEX `idx_rate_limits_expires` ON `rate_limits` (`expires_at`);
