-- Migração de correção para o schema de appointments com campos internos

ALTER TABLE appointments
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_type text NULL,
  ADD COLUMN IF NOT EXISTS internal_title text NULL,
  ADD COLUMN IF NOT EXISTS internal_notes text NULL;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS check_internal_customer;

ALTER TABLE appointments ADD CONSTRAINT check_internal_customer
  CHECK (
    (is_internal = true AND customer_id IS NULL) OR
    (is_internal = false AND customer_id IS NOT NULL)
  );