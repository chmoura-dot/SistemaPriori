-- Adiciona campos de Pix ao cadastro de psicólogos
ALTER TABLE psychologists ADD COLUMN IF NOT EXISTS pix_key_type TEXT;
ALTER TABLE psychologists ADD COLUMN IF NOT EXISTS pix_key TEXT;
