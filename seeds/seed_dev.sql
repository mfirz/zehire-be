-- Seed script for local development
-- Run with: bun run db:seed:local

-- Create a test organization
INSERT OR IGNORE INTO orgs (id, name, jobs_list_version, created_at, updated_at)
VALUES (
  'org_test_dev_001',
  'Test Organization',
  1,
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
);

-- Create a test user
INSERT OR IGNORE INTO users (id, email, role, org_id, created_at, updated_at)
VALUES (
  'user_test_dev_001',
  'farizzx77@gmail.com',
  'admin',
  'org_test_dev_001',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
);
