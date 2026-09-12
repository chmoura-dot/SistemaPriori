-- ═══════════════════════════════════════════════════════════════════════════
-- Corrige a validação inicial de reschedule_appointment_swap.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Bug: a função rejeitava o remanejamento quando o atendimento original já
-- estava com status='canceled' ("Atendimento original já está cancelado.").
-- Só que o ÚNICO fluxo de UI que chama esta RPC (botão "Remanejar" em
-- AppointmentCard.tsx, "encaixar outro paciente nesta vaga") só aparece
-- exatamente quando o atendimento JÁ está cancelado — é assim que a vaga fica
-- livre para reaproveitar. Ou seja, todo remanejamento pela UI sempre falhava
-- com essa exceção.
--
-- Correção: em vez de rejeitar por status='canceled', a trava correta é
-- impedir remanejar um atendimento que JÁ foi substituído antes
-- (replaced_by_appointment_id IS NOT NULL) — evita preencher a mesma vaga
-- duas vezes. Essa mesma condição já era checada no cliente
-- (AppointmentCard.tsx), mas não existia no servidor, deixando uma janela de
-- corrida (dois cliques/abas simultâneos podiam gerar dois substitutos para a
-- mesma vaga cancelada).
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

  -- 1. Carrega e valida o atendimento original.
  SELECT * INTO v_original FROM appointments WHERE id = p_original_appointment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atendimento original não encontrado.';
  END IF;
  IF v_original.replaced_by_appointment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este atendimento já foi remanejado para outro atendimento.';
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
