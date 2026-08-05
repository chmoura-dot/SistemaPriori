-- ============================================================================
-- Migration: Justificativa para desconsiderar atendimento do faturamento
-- Data: 2026-08-05
-- Contexto: Ao remover um atendimento de um lote de faturamento já enviado
--           (BatchDetailsModal > "Remover do lote"), o usuário agora escolhe
--           entre duas opções:
--             1. "Apenas remover do lote": comportamento já existente — o
--                atendimento volta a ficar elegível para um lote futuro.
--             2. "Desconsiderar de faturamento futuro": marca
--                billing_ignored = true (campo já existente desde
--                20260407_billing_ignored_field.sql) e passa a EXIGIR e
--                registrar uma justificativa, para auditoria financeira.
-- ============================================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS billing_ignored_reason TEXT,
  ADD COLUMN IF NOT EXISTS billing_ignored_at TIMESTAMPTZ;

COMMENT ON COLUMN appointments.billing_ignored_reason IS
  'Justificativa registrada quando billing_ignored é marcado como true através do modal "Remover do lote" (Faturamento > Detalhes do Lote). NULL quando o atendimento nunca foi desconsiderado por essa via (ex.: ignorado na criação do lote, sem exigência de motivo).';

COMMENT ON COLUMN appointments.billing_ignored_at IS
  'Timestamp de quando o atendimento foi marcado como billing_ignored = true através do fluxo de remoção definitiva de lote. NULL quando não aplicável.';
