-- ============================================================================
-- Migration: Repasse em 2 fases (50/50) para Avaliação Neuropsicológica
-- Data: 2026-07-20
-- Objetivo:
--   Dividir o repasse da Avaliação Neuropsicológica em duas parcelas de 50%:
--     • Fase 1: liberada quando o atendimento é pago (regra atual de lote).
--     • Fase 2: liberada somente após a ENTREGA DO LAUDO (report_delivered_at).
--   Sessões não-elegíveis (AMS 2ª/3ª, bloqueadas, demais tipos) seguem 100%.
--
-- Grandfathering:
--   Sessões neuropsicológicas que JÁ constam em algum repasse existente são
--   marcadas retroativamente como quitadas nas duas fases (phase1 = phase2 =
--   id do repasse antigo). Isso evita reabrir/cobrar em duplicidade o que já
--   foi liquidado sob a regra antiga.
-- ============================================================================

-- 1. Novas colunas em appointments -------------------------------------------
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS report_delivered_at      timestamptz,
  ADD COLUMN IF NOT EXISTS report_delivered_by      text,
  ADD COLUMN IF NOT EXISTS repass_phase1_repasse_id uuid REFERENCES repasses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS repass_phase2_repasse_id uuid REFERENCES repasses(id) ON DELETE SET NULL;

COMMENT ON COLUMN appointments.report_delivered_at IS
  'Data/hora em que o laudo neuropsicológico foi entregue. NULL = ainda não entregue.';
COMMENT ON COLUMN appointments.report_delivered_by IS
  'Identificação (nome/email) de quem marcou o laudo como entregue — rastreabilidade.';
COMMENT ON COLUMN appointments.repass_phase1_repasse_id IS
  'Repasse que pagou a 1ª parcela (50% — sessão realizada) da Avaliação Neuropsicológica.';
COMMENT ON COLUMN appointments.repass_phase2_repasse_id IS
  'Repasse que pagou a 2ª parcela (50% — entrega do laudo) da Avaliação Neuropsicológica.';

-- 2. Índice auxiliar para a nova seção "Aguardando Entrega de Laudo" ----------
--    (fase 1 paga, laudo pendente).
CREATE INDEX IF NOT EXISTS idx_appointments_report_pending
  ON appointments (repass_phase1_repasse_id, report_delivered_at);

-- 3. Backfill de grandfathering ----------------------------------------------
--    Marca ambas as fases (quitado) para toda sessão neuropsicológica que já
--    aparece em algum repasse. Feito via DO block para funcionar tanto se a
--    coluna repasses.appointment_ids for uuid[]/text[] quanto jsonb.
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_name = 'repasses' AND column_name = 'appointment_ids';

  IF col_type = 'ARRAY' THEN
    EXECUTE $q$
      UPDATE appointments a
         SET repass_phase1_repasse_id = r.id,
             repass_phase2_repasse_id = r.id
        FROM repasses r
       WHERE a.type = 'Avaliação Neuropsicológica'
         AND a.repass_phase1_repasse_id IS NULL
         AND a.id::text = ANY (r.appointment_ids::text[])
    $q$;
  ELSE
    EXECUTE $q$
      UPDATE appointments a
         SET repass_phase1_repasse_id = r.id,
             repass_phase2_repasse_id = r.id
        FROM repasses r
       WHERE a.type = 'Avaliação Neuropsicológica'
         AND a.repass_phase1_repasse_id IS NULL
         AND a.id::text IN (SELECT jsonb_array_elements_text(r.appointment_ids))
    $q$;
  END IF;
END $$;
