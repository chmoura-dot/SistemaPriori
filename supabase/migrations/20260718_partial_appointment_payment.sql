-- ============================================================================
-- Migration: Pagamento individual (parcial) de atendimentos no faturamento
-- Data: 2026-07-18
-- Objetivo:
--   Permitir que cada atendimento de um lote seja marcado como pago
--   individualmente (ex.: pacientes particulares que pagam ao longo do tempo),
--   habilitando repasses graduais/sucessivos do mesmo lote.
-- ============================================================================

-- 1. Coluna paid_at em appointments — registra quando aquele atendimento
--    específico foi marcado como pago (independente do status do lote).
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

COMMENT ON COLUMN appointments.paid_at IS
  'Data em que o atendimento foi marcado como pago individualmente. NULL = ainda não pago.';

-- 2. Novo status possível para billing_batches: partially_paid.
--    O campo status é TEXT, portanto não há alteração de schema necessária.
--    Comportamentos:
--      draft          → lote em construção
--      sent           → lote enviado, nenhum atendimento pago
--      partially_paid → alguns atendimentos pagos, mas não todos
--      paid           → todos os atendimentos pagos/glosados (lote fechado)

-- 3. Remover a constraint de unicidade (psicólogo + lote) para permitir
--    repasses parciais e sucessivos do mesmo lote. A checagem de duplicidade
--    passa a ser feita a nível de atendimento (appointment_ids já repassados).
ALTER TABLE repasses
  DROP CONSTRAINT IF EXISTS uq_repasse_psychologist_batch;

-- 4. Índice auxiliar para calcular o progresso de pagamento de um lote.
CREATE INDEX IF NOT EXISTS idx_appointments_batch_billing_status
  ON appointments (billing_batch_id, billing_status);
