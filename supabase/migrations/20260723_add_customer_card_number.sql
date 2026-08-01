-- Migration: add_customer_card_number
-- Adiciona o número da carteirinha do convênio ao cadastro do paciente.
-- Campo opcional (nullable) — não impacta pacientes já cadastrados.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS card_number TEXT;

COMMENT ON COLUMN customers.card_number IS
  'Número da carteirinha do convênio/plano de saúde do paciente. '
  'Usado em faturamento e solicitações de autorização.';
