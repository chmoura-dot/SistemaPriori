-- Migration to add columns for patient release reminder flow.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS reminder_dismissed_at timestamptz;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS reminder_justification text;
