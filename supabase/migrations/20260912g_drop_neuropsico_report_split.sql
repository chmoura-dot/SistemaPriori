-- ============================================================================
-- Migration: Remove a feature de repasse em 2 fases (nunca implementada)
-- Data: 2026-09-12
-- Contexto: 20260720_neuropsico_report_split.sql criou colunas para dividir
--        o repasse de Avaliacao Neuropsicologica em 50% na sessao + 50% na
--        entrega do laudo. A feature nunca foi conectada a nenhuma tela
--        (nao existe UI para marcar "laudo entregue"), e o calculo de
--        repasse real sempre pagou o valor integral, ignorando essas
--        colunas. Decisao: nao implementar, remover o campo morto.
-- ============================================================================

DROP INDEX IF EXISTS idx_appointments_report_pending;

ALTER TABLE appointments
  DROP COLUMN IF EXISTS report_delivered_at,
  DROP COLUMN IF EXISTS report_delivered_by,
  DROP COLUMN IF EXISTS repass_phase1_repasse_id,
  DROP COLUMN IF EXISTS repass_phase2_repasse_id;
