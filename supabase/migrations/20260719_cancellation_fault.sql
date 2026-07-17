-- ═══════════════════════════════════════════════════════════════════════════
-- Falta do Paciente vs. Falta do Psicólogo + Unificação de "Encerrar Tratamento"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Regra de negócio:
--   • Falta do PACIENTE  → cobra do convênio/particular normalmente E repassa
--                          ao psicólogo normalmente (o horário estava reservado
--                          e o profissional compareceu).
--   • Falta do PSICÓLOGO → NÃO cobra e NÃO repassa (a clínica não fatura nem
--                          paga repasse por uma ausência do profissional).
--
-- O campo cancellation_fault registra de quem foi a falta, para fins de
-- faturamento, repasse e auditoria. NULL = agendamento não cancelado ou
-- cancelado antes desta mudança (dado legado).

-- ── 1. Nova coluna ──────────────────────────────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS cancellation_fault text
  CHECK (cancellation_fault IS NULL OR cancellation_fault IN ('patient', 'psychologist'));

COMMENT ON COLUMN appointments.cancellation_fault IS
  'De quem foi a falta em um cancelamento: patient (cobra e repassa) ou psychologist (não cobra, não repassa). NULL para não cancelados ou legado.';

-- ── 2. RPC unificada de alta / encerramento de tratamento ───────────────────
-- Centraliza a lógica antes triplicada (Agenda, Painel de Validações e
-- Edge Function confirm-appointment) num único ponto: cancela a sessão atual e
-- todas as futuras do mesmo paciente+psicólogo (isento), e registra o evento
-- em discharge_events para visibilidade no dashboard.
CREATE OR REPLACE FUNCTION discharge_customer(
  p_customer_id       uuid,
  p_psychologist_id   uuid,
  p_current_appointment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_name   text;
  v_psy_name        text;
  v_future_ids      uuid[];
  v_canceled_count  int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT name INTO v_customer_name FROM customers WHERE id = p_customer_id;
  SELECT name INTO v_psy_name      FROM psychologists WHERE id = p_psychologist_id;

  -- 1. Cancela o agendamento atual, se informado (falta isenta)
  IF p_current_appointment_id IS NOT NULL THEN
    UPDATE appointments
       SET status = 'canceled',
           cancellation_billing = 'none',
           cancellation_fault = 'patient',
           confirmed_psychologist = false
     WHERE id = p_current_appointment_id;
  END IF;

  -- 2. Cancela todas as sessões futuras do mesmo paciente + psicólogo
  SELECT array_agg(id) INTO v_future_ids
    FROM appointments
   WHERE customer_id = p_customer_id
     AND psychologist_id = p_psychologist_id
     AND date >= current_date
     AND (p_current_appointment_id IS NULL OR id <> p_current_appointment_id)
     AND status IN ('active', 'released');

  IF v_future_ids IS NOT NULL THEN
    UPDATE appointments
       SET status = 'canceled',
           cancellation_billing = 'none',
           cancellation_fault = 'patient'
     WHERE id = ANY(v_future_ids);
    v_canceled_count := array_length(v_future_ids, 1);
  END IF;

  -- 3. Registra o evento de alta
  INSERT INTO discharge_events (
    customer_id, psychologist_id, customer_name,
    psychologist_name, appointments_canceled
  )
  VALUES (
    p_customer_id,
    p_psychologist_id,
    COALESCE(v_customer_name, 'Paciente'),
    COALESCE(v_psy_name, 'Psicólogo'),
    v_canceled_count
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointments_canceled', v_canceled_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION discharge_customer(uuid, uuid, uuid) TO authenticated;
