-- Migration: 0011_applications
-- Description: Create applications, answers, and drafts tables for candidate tracking
-- Created: 2026-01-12

-- =============================================================================
-- APPLICATIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY NOT NULL,  -- nanoid
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- Candidate info
  candidate_email TEXT NOT NULL,
  candidate_name TEXT NOT NULL,

  -- Application status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'screening', 'assessment', 'interview', 'offer', 'rejected', 'withdrawn')),

  -- Signal extraction status
  signals_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (signals_status IN ('pending', 'processing', 'completed', 'failed')),

  -- Aggregated signal evaluations (JSON, computed after all answers evaluated)
  signal_evaluations TEXT,  -- JSON: SignalStateResult

  -- Decision posture (computed from signal_evaluations)
  decision_posture TEXT,  -- JSON: PostureResult

  -- Error tracking
  signals_error_message TEXT,
  signals_error_code TEXT,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  signals_computed_at TEXT
);

-- =============================================================================
-- ANSWERS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY NOT NULL,  -- nanoid
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,

  -- Link to the question
  archetype_id TEXT NOT NULL,
  question_text TEXT NOT NULL,

  -- Candidate's answer (always required in final submission)
  answer_text TEXT NOT NULL,

  -- Signal extraction results (JSON)
  extracted_signals TEXT,  -- JSON: ExtractedSignal[]
  extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed')),

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  answered_at TEXT NOT NULL,
  extracted_at TEXT
);

-- =============================================================================
-- APPLICATION DRAFTS TABLE (Save & Continue)
-- =============================================================================

CREATE TABLE IF NOT EXISTS application_drafts (
  id TEXT PRIMARY KEY NOT NULL,  -- nanoid
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- Candidate info (captured upfront)
  candidate_email TEXT NOT NULL,
  candidate_name TEXT NOT NULL,

  -- Saved answers (JSON array, may be partial)
  -- Format: [{ archetypeId: string, answerText: string | null }]
  answers TEXT NOT NULL DEFAULT '[]',

  -- Resume token for secure access (hashed)
  resume_token_hash TEXT NOT NULL,

  -- Expiry (7 days from creation)
  expires_at TEXT NOT NULL,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Applications
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_signals_status ON applications(signals_status);
CREATE INDEX IF NOT EXISTS idx_applications_candidate_email ON applications(candidate_email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_unique_candidate ON applications(job_id, candidate_email);

-- Answers
CREATE INDEX IF NOT EXISTS idx_answers_application_id ON answers(application_id);
CREATE INDEX IF NOT EXISTS idx_answers_extraction_status ON answers(extraction_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_answers_unique ON answers(application_id, archetype_id);

-- Drafts
CREATE INDEX IF NOT EXISTS idx_drafts_job_id ON application_drafts(job_id);
CREATE INDEX IF NOT EXISTS idx_drafts_email ON application_drafts(candidate_email);
CREATE INDEX IF NOT EXISTS idx_drafts_expires ON application_drafts(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_drafts_unique_candidate ON application_drafts(job_id, candidate_email);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS trg_applications_updated_at
  AFTER UPDATE ON applications
  FOR EACH ROW
  WHEN OLD.updated_at = NEW.updated_at
BEGIN
  UPDATE applications SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_answers_updated_at
  AFTER UPDATE ON answers
  FOR EACH ROW
  WHEN OLD.updated_at = NEW.updated_at
BEGIN
  UPDATE answers SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_drafts_updated_at
  AFTER UPDATE ON application_drafts
  FOR EACH ROW
  WHEN OLD.updated_at = NEW.updated_at
BEGIN
  UPDATE application_drafts SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE id = NEW.id;
END;
