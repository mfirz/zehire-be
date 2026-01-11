-- Migration: 0009_job_fields
-- Description: Add work type, employment type, and salary fields to jobs table
-- Created: 2026-01-11

-- Add work_type column (required)
-- Defaults to 'remote' for existing jobs
ALTER TABLE jobs ADD COLUMN work_type TEXT NOT NULL DEFAULT 'remote'
  CHECK (work_type IN ('remote', 'hybrid', 'onsite'));

-- Add employment_type column (required)
-- Defaults to 'fulltime' for existing jobs
ALTER TABLE jobs ADD COLUMN employment_type TEXT NOT NULL DEFAULT 'fulltime'
  CHECK (employment_type IN ('fulltime', 'parttime', 'contract', 'internship'));

-- Add salary fields (all nullable)
ALTER TABLE jobs ADD COLUMN salary_min INTEGER;
ALTER TABLE jobs ADD COLUMN salary_max INTEGER;
ALTER TABLE jobs ADD COLUMN salary_currency TEXT
  CHECK (salary_currency IS NULL OR salary_currency IN ('USD', 'EUR', 'GBP', 'SGD', 'IDR'));
