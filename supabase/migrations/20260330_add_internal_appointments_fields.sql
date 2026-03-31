-- Adiciona campos para suportar horários internos (sem paciente, sem faturamento)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_type text NULL,
  ADD COLUMN IF NOT EXISTS internal_title text NULL,
  ADD COLUMN IF NOT EXISTS internal_notes text NULL;

-- Permite customer_id ser NULL quando is_internal = true
ALTER TABLE appointments
  ALTER COLUMN customer_id DROP NOT NULL;

-- Constraint para garantir consistência
ALTER TABLE appointments ADD CONSTRAINT check_internal_customer
  CHECK (
    (is_internal = true AND customer_id IS NULL) OR
    (is_internal = false AND customer_id IS NOT NULL)
  );