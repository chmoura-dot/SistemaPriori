-- Adiciona a coluna internal_notes na tabela appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS internal_notes text NULL;