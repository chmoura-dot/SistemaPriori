-- Migration para adicionar regras de repasse na tabela de psicólogos
ALTER TABLE psychologists 
ADD COLUMN IF NOT EXISTS repass_rate NUMERIC DEFAULT 0.50,
ADD COLUMN IF NOT EXISTS repass_fixed_amount NUMERIC DEFAULT NULL;

-- Atualizar Michelly Monteiro com a regra de 94% (6% de taxa)
UPDATE psychologists 
SET repass_rate = 0.94 
WHERE name ILIKE '%Michelly%';
