-- Migration: Add description_text column for LLM processing
--
-- The description column now stores Tiptap JSON instead of plain text.
-- This new column stores the extracted plain text for LLM inference.

ALTER TABLE jobs ADD COLUMN description_text TEXT;
