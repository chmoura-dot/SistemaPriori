-- ═══════════════════════════════════════════════════════════════════════════
-- Remanejamento de Agenda (Reschedule) — vínculo entre atendimento cancelado
-- e o novo atendimento que o substitui no mesmo horário.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Contexto de negócio:
--   Quando um atendimento é cancelado e OUTRO é inserido no mesmo horário
--   (troca de paciente) ou o mesmo paciente é movido para outro dia/horário,
--   isso é um REMANEJAMENTO — não uma falta/no-show real. Hoje o sistema só
--   enxergava dois registros desconexos, o que:
--     • distorcia métricas (contava como cancelamento/falta);
--     • impossibilitava rastrear que a vaga foi reaproveitada;
--     • disparava notificações duplicadas e desencontradas.
--
--   Estas colunas criam o vínculo bidirecional e classificam o motivo do
--   cancelamento, separando-o de "quem faltou" (cancellation_fault) e de
--   "como cobrar" (cancellation_billing), que já existiam.

-- ── 1. Classificação do motivo do cancelamento ─────────────────────────────
-- NULL = não cancelado ou cancelamento legado (antes desta migração).
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS cancellation_type text
  CHECK (
    cancellation_type IS NULL
    OR cancellation_type IN ('no_show', 'psychologist_absence', 'discharge', 'reschedule', 'other')
  );

COMMENT ON COLUMN appointments.cancellation_type IS
  'Motivo do cancelamento: no_show (falta paciente), psychologist_absence (falta psicólogo), discharge (alta/encerramento), reschedule (remanejamento — vaga reaproveitada), other. NULL = não cancelado ou legado.';

-- ── 2. Vínculo bidirecional de remanejamento ───────────────────────────────
-- No registro CANCELADO: aponta para o novo atendimento que ocupou a vaga.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS replaced_by_appointment_id uuid
  REFERENCES appointments(id) ON DELETE SET NULL;

-- No registro NOVO: aponta para o atendimento original que foi remanejado.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS replaces_appointment_id uuid
  REFERENCES appointments(id) ON DELETE SET NULL;

COMMENT ON COLUMN appointments.replaced_by_appointment_id IS
  'No atendimento cancelado por remanejamento: ID do novo atendimento que reaproveitou a vaga.';
COMMENT ON COLUMN appointments.replaces_appointment_id IS
  'No atendimento novo criado por remanejamento: ID do atendimento original substituído.';

-- ── 3. Índices para as FKs (consultas de rastreabilidade) ──────────────────
CREATE INDEX IF NOT EXISTS idx_appointments_replaced_by
  ON appointments (replaced_by_appointment_id)
  WHERE replaced_by_appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_replaces
  ON appointments (replaces_appointment_id)
  WHERE replaces_appointment_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC atômica: reschedule_appointment_swap
-- ═══════════════════════════════════════════════════════════════════════════
-- Executa o remanejamento numa ÚNICA transação, evitando o estado intermediário
-- perigoso de "cancelei o antigo mas esqueci de criar o novo".
--
-- Fluxo:
--   1. Valida o atendimento original (existe e não está já cancelado).
--   2. Valida conflito de horário do NOVO slot (mesma regra do trigger de overlap),
--      ignorando o próprio atendimento original (que será cancelado).
--   3. Cancela o original: status='canceled', cancellation_type='reschedule',
--      cancellation_billing='none' (a vaga foi reaproveitada — não cobra o slot
--      antigo; quem cobra é o novo atendimento).
--   4. Cria o novo atendimento (status='active') com replaces_appointment_id.
--   5. Vincula o original ao novo (replaced_by_appointment_id).
--   6. Retorna os dois IDs.
CREATE OR REPLACE FUNCTION reschedule_appointment_swap(
  p_original_appointment_id uuid,
  p_customer_id       uuid,
  p_psychologist_id   uuid,
  p_room_id           uuid,
  p_mode              text,
  p_type              text,
  p_procedure_code    text,
  p_date              date,
  p_start_time        time,
  p_end_time          time,
  p_health_plan_at_time text DEFAULT NULL,
  p_custom_price      numeric DEFAULT NULL,
  p_custom_repass_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original    appointments%ROWTYPE;
  v_conflict    int;
  v_new_id      uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- 1. Carrega e valida o atendimento original
  SELECT * INTO v_original FROM appointments WHERE id = p_original_appointment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atendimento original não encontrado.';
  END IF;
  IF v_original.status = 'canceled' THEN
    RAISE EXCEPTION 'Atendimento original já está cancelado.';
  END IF;

  -- 2. Valida conflito de horário no novo slot (mesmo psicólogo), ignorando
  --    o próprio original (que será cancelado nesta transação).
  SELECT COUNT(*) INTO v_conflict
  FROM appointments a
  WHERE a.psychologist_id = p_psychologist_id
    AND a.date = p_date
    AND a.status <> 'canceled'
    AND a.id <> p_original_appointment_id
    AND (
      (p_start_time >= a.start_time AND p_start_time < a.end_time) OR
      (p_end_time   > a.start_time AND p_end_time  <= a.end_time) OR
      (p_start_time <= a.start_time AND p_end_time >= a.end_time)
    );
  IF v_conflict > 0 THEN
    RAISE EXCEPTION 'O psicólogo já possui um agendamento conflitante neste horário.' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Cancela o atendimento original como remanejamento (vaga reaproveitada).
  UPDATE appointments
     SET status = 'canceled',
         cancellation_type = 'reschedule',
         cancellation_billing = 'none',
         cancellation_fault = NULL,
         confirmed_psychologist = false
   WHERE id = p_original_appointment_id;

  -- 4. Cria o novo atendimento vinculado ao original.
  INSERT INTO appointments (
    customer_id, psychologist_id, room_id, mode, type, procedure_code,
    date, day_of_week, start_time, end_time,
    status, is_recurring, needs_renewal,
    confirmation_status,
    custom_price, custom_repass_amount,
    health_plan_at_time,
    replaces_appointment_id
  )
  VALUES (
    p_customer_id, p_psychologist_id, p_room_id, p_mode, p_type, p_procedure_code,
    p_date, EXTRACT(DOW FROM p_date)::int, p_start_time, p_end_time,
    'active', false, false,
    'pending',
    p_custom_price, p_custom_repass_amount,
    p_health_plan_at_time,
    p_original_appointment_id
  )
  RETURNING id INTO v_new_id;

  -- 5. Vincula o original ao novo atendimento.
  UPDATE appointments
     SET replaced_by_appointment_id = v_new_id
   WHERE id = p_original_appointment_id;

  -- 6. Retorna os IDs.
  RETURN jsonb_build_object(
    'success', true,
    'original_appointment_id', p_original_appointment_id,
    'new_appointment_id', v_new_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION reschedule_appointment_swap(
  uuid, uuid, uuid, uuid, text, text, text, date, time, time, text, numeric, numeric
) TO authenticated;
