-- ============================================================================
-- Migration: Sublocação de sala — RPCs de criação/cancelamento/pagamento
-- Data: 2026-09-16
-- Objetivo: como sublocação envolve cobrança real do psicólogo, a checagem de
--   conflito de sala não pode ficar só client-side (que é o padrão hoje para
--   sala em `appointments` — só psicólogo tem trigger de overlap no banco).
--   create_room_rental faz a checagem de forma atômica, serializada por
--   pg_advisory_xact_lock(sala+data), contra appointments presenciais ativos
--   E room_rentals ativos.
-- ============================================================================

-- ── create_room_rental ───────────────────────────────────────────────────────
-- p_rows: array de ocorrências (avulsa = 1 elemento; série recorrente = N),
-- já geradas no client (mesmo padrão de buildRecurringRows em
-- appointmentWriteService.ts): [{"date":"2026-09-20","start_time":"14:00","end_time":"15:00"}, ...]
CREATE OR REPLACE FUNCTION create_room_rental(
  p_room_id               uuid,
  p_psychologist_id       uuid,
  p_rows                  jsonb,
  p_amount                numeric,
  p_is_recurring          boolean,
  p_recurrence_frequency  text DEFAULT NULL,
  p_recurrence_group_id   uuid DEFAULT NULL,
  p_notes                 text DEFAULT NULL,
  p_operation_id          uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_conflict_date date;
  v_inserted_ids uuid[] := ARRAY[]::uuid[];
  v_new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  PERFORM set_config('app.operation_id', COALESCE(p_operation_id, gen_random_uuid())::text, true);

  -- Serializa concorrência por sala: duas requisições simultâneas para a
  -- mesma sala esperam uma pela outra em vez de ambas passarem na checagem
  -- de conflito antes de qualquer uma inserir.
  PERFORM pg_advisory_xact_lock(hashtext(p_room_id::text));

  FOR v_row IN SELECT * FROM jsonb_to_recordset(p_rows) AS x(date date, start_time time, end_time time)
  LOOP
    IF EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.room_id = p_room_id
        AND a.date = v_row.date
        AND a.mode = 'Presencial'
        AND a.status <> 'canceled'
        AND a.start_time < v_row.end_time
        AND a.end_time > v_row.start_time
    ) THEN
      RAISE EXCEPTION 'Sala já ocupada por um agendamento em %.', v_row.date;
    END IF;

    IF EXISTS (
      SELECT 1 FROM room_rentals r
      WHERE r.room_id = p_room_id
        AND r.date = v_row.date
        AND r.status = 'active'
        AND r.start_time < v_row.end_time
        AND r.end_time > v_row.start_time
    ) THEN
      RAISE EXCEPTION 'Sala já sublocada para outro profissional em %.', v_row.date;
    END IF;

    INSERT INTO room_rentals (
      room_id, psychologist_id, date, start_time, end_time,
      amount, is_recurring, recurrence_frequency, recurrence_group_id, notes
    ) VALUES (
      p_room_id, p_psychologist_id, v_row.date, v_row.start_time, v_row.end_time,
      p_amount, p_is_recurring, p_recurrence_frequency, p_recurrence_group_id, p_notes
    ) RETURNING id INTO v_new_id;

    v_inserted_ids := v_inserted_ids || v_new_id;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'created_ids', v_inserted_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION create_room_rental(uuid, uuid, jsonb, numeric, boolean, text, uuid, text, uuid) TO authenticated;

-- ── cancel_future_room_rentals ───────────────────────────────────────────────
-- Espelha delete_future_recurring_appointments, mas faz soft-cancel em vez de
-- DELETE — preserva histórico de cobrança mesmo para ocorrências futuras
-- canceladas. Ocorrências já pagas não podem ser canceladas por aqui (exige
-- reverter o pagamento antes, via Auditoria Financeira).
CREATE OR REPLACE FUNCTION cancel_future_room_rentals(
  p_recurrence_group_id  uuid,
  p_from_date            date,
  p_reason               text DEFAULT NULL,
  p_operation_id         uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canceled_count int := 0;
  v_paid_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  PERFORM set_config('app.operation_id', COALESCE(p_operation_id, gen_random_uuid())::text, true);

  SELECT count(*) INTO v_paid_count
  FROM room_rentals
  WHERE recurrence_group_id = p_recurrence_group_id
    AND date >= p_from_date
    AND status = 'active'
    AND payment_status = 'paid';

  IF v_paid_count > 0 THEN
    RAISE EXCEPTION 'Existem % ocorrência(s) já paga(s) neste período — reverta o pagamento antes de cancelar.', v_paid_count;
  END IF;

  UPDATE room_rentals
  SET status = 'canceled', cancellation_reason = p_reason
  WHERE recurrence_group_id = p_recurrence_group_id
    AND date >= p_from_date
    AND status = 'active';

  GET DIAGNOSTICS v_canceled_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'canceled_count', v_canceled_count);
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_future_room_rentals(uuid, date, text, uuid) TO authenticated;

-- ── mark_room_rentals_paid ───────────────────────────────────────────────────
-- Marca 1+ ocorrências como pagas numa única transação/operationId, mesmo
-- padrão de mark_billing_batch_paid.
CREATE OR REPLACE FUNCTION mark_room_rentals_paid(
  p_ids           uuid[],
  p_paid_at       timestamptz,
  p_operation_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  PERFORM set_config('app.operation_id', COALESCE(p_operation_id, gen_random_uuid())::text, true);

  UPDATE room_rentals
  SET payment_status = 'paid', paid_at = p_paid_at
  WHERE id = ANY(p_ids) AND status = 'active';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'updated', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION mark_room_rentals_paid(uuid[], timestamptz, uuid) TO authenticated;

-- Verificação
SELECT proname FROM pg_proc
 WHERE proname IN ('create_room_rental', 'cancel_future_room_rentals', 'mark_room_rentals_paid')
 ORDER BY proname;
