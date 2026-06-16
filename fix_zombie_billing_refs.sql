-- ============================================================================
-- FIX: Limpa referências "zumbi" de billing_batch_id em appointments
-- ============================================================================
-- Problema: alguns atendimentos têm billing_batch_id apontando para um lote
-- do qual NÃO fazem parte (seu ID não está no array appointment_ids do lote),
-- ou cujo lote foi excluído. Isso impede que esses atendimentos apareçam
-- como elegíveis no modal de faturamento.
--
-- Casos cobertos:
--   1) billing_batch_id aponta para um lote que NÃO existe mais (referência órfã)
--   2) billing_batch_id aponta para um lote existente, mas o ID do atendimento
--      NÃO está no array appointment_ids desse lote (estado zumbi do auto-save)
--
-- Segurança: este UPDATE só afeta atendimentos com referência inválida.
--            Atendimentos legitimamente faturados (cujo ID consta no
--            appointment_ids do lote) NÃO são alterados.
-- ============================================================================

-- 1. Diagnóstico: listar atendimentos afetados ANTES de corrigir
SELECT
  a.id AS appointment_id,
  a.date,
  a.start_time,
  a.billing_batch_id,
  bb.batch_number,
  bb.status AS batch_status,
  CASE
    WHEN bb.id IS NULL THEN 'LOTE EXCLUÍDO (referência órfã)'
    ELSE 'NÃO ESTÁ no appointment_ids do lote (estado zumbi)'
  END AS motivo
FROM appointments a
LEFT JOIN billing_batches bb ON bb.id = a.billing_batch_id
WHERE a.billing_batch_id IS NOT NULL
  AND (
    -- Lote não existe mais
    bb.id IS NULL
    OR
    -- Atendimento não está no array appointment_ids do lote
    NOT (a.id = ANY(bb.appointment_ids))
  )
ORDER BY a.date DESC, a.start_time;

-- 2. Correção: limpar billing_batch_id dos atendimentos afetados
UPDATE appointments a
SET billing_batch_id = NULL
WHERE a.billing_batch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM billing_batches bb
    WHERE bb.id = a.billing_batch_id
      AND a.id = ANY(bb.appointment_ids)
  );
