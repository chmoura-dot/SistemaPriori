-- Adiciona campo billing_ignored na tabela appointments
-- Permite marcar atendimentos para serem ignorados no faturamento (ajuste de sistema)
-- O histórico é mantido, mas o atendimento não aparece mais na lista de disponíveis para faturamento

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS billing_ignored BOOLEAN DEFAULT FALSE;

-- Índice para otimizar a consulta de atendimentos elegíveis para faturamento
CREATE INDEX IF NOT EXISTS idx_appointments_billing_ignored ON appointments(billing_ignored);
