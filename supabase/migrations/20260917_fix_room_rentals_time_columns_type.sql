-- ============================================================================
-- Migration: Corrige tipo de start_time/end_time em room_rentals
-- Data: 2026-09-17
-- Objetivo: room_rentals.start_time/end_time foram criados como `time` na
--   migration 20260916c, mas `appointments` (e todo o resto do sistema) trata
--   horário como `text` no formato "HH:mm" — nunca como tipo `time` nativo.
--   Isso causava "operator does not exist: text < time without time zone" em
--   create_room_rental (compara appointments.start_time [text] contra o
--   record vindo de jsonb_to_recordset [time]), e um bug silencioso de
--   exibição/comparação de string (PostgREST serializa `time` como
--   "16:00:00", com segundos, diferente do "16:00" que o resto do app espera).
--   Correção: alinhar o tipo ao padrão já usado por `appointments`.
-- ============================================================================

-- 1. Coluna: time -> text, no formato HH:mm (to_char em vez de ::text para
--    não introduzir segundos, caso já existisse alguma linha).
ALTER TABLE room_rentals
  ALTER COLUMN start_time TYPE text USING to_char(start_time, 'HH24:MI'),
  ALTER COLUMN end_time   TYPE text USING to_char(end_time,   'HH24:MI');

-- 2. create_room_rental: jsonb_to_recordset passa a tipar start_time/end_time
--    como text (mesmo formato "HH:mm" que já vem do client), eliminando a
--    comparação text/time contra appointments.start_time/end_time.
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
  v_inserted_ids uuid[] := ARRAY[]::uuid[];
  v_new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  PERFORM set_config('app.operation_id', COALESCE(p_operation_id, gen_random_uuid())::text, true);

  PERFORM pg_advisory_xact_lock(hashtext(p_room_id::text));

  FOR v_row IN SELECT * FROM jsonb_to_recordset(p_rows) AS x(date date, start_time text, end_time text)
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

-- 3. _revert_audit_log_row: remove os casts ::TIME no branch DELETE de
--    room_rentals — a coluna agora é text, então o valor de v_old->>'...'
--    (já texto, vindo do JSONB) é inserido diretamente.
CREATE OR REPLACE FUNCTION _revert_audit_log_row(p_log audit_log)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB := p_log.old_data;
  v_new JSONB := p_log.new_data;
  v_app_id UUID;
  v_batch_id UUID;
  v_repasse_id UUID;
  v_rental_id UUID;
BEGIN
  IF p_log.table_name NOT IN ('appointments', 'billing_batches', 'repasses', 'room_rentals') THEN
    RAISE EXCEPTION 'Reversão não suportada para a tabela %.', p_log.table_name;
  END IF;

  -- ─── TABELA: APPOINTMENTS ──────────────────────────────────────────────
  IF p_log.table_name = 'appointments' THEN
    v_app_id := p_log.record_id::UUID;

    IF p_log.action = 'UPDATE' THEN
      IF v_old IS NULL THEN
        RAISE EXCEPTION 'Não há dados anteriores (old_data) para restaurar este atendimento.';
      END IF;

      UPDATE appointments
      SET
        billing_batch_id       = (v_old->>'billing_batch_id')::UUID,
        billing_status         = v_old->>'billing_status',
        billing_ignored        = COALESCE((v_old->>'billing_ignored')::BOOLEAN, false),
        billing_ignored_reason = v_old->>'billing_ignored_reason',
        billing_ignored_at     = (v_old->>'billing_ignored_at')::TIMESTAMPTZ,
        paid_at                = (v_old->>'paid_at')::TIMESTAMPTZ,
        custom_price           = (v_old->>'custom_price')::NUMERIC,
        custom_repass_amount   = (v_old->>'custom_repass_amount')::NUMERIC,
        denial_reason          = v_old->>'denial_reason',
        denial_resolution      = v_old->>'denial_resolution'
      WHERE id = v_app_id;

      RETURN jsonb_build_object(
        'success', true, 'table', 'appointments', 'record_id', v_app_id,
        'message', 'Dados financeiros do atendimento restaurados com sucesso!'
      );

    ELSIF p_log.action = 'DELETE' THEN
      RAISE EXCEPTION 'A reversão de exclusão direta de agendamento não é permitida por esta rotina.';
    ELSIF p_log.action = 'INSERT' THEN
      UPDATE appointments
      SET
        billing_batch_id = NULL,
        billing_status = NULL,
        billing_ignored = false,
        billing_ignored_reason = NULL,
        billing_ignored_at = NULL,
        paid_at = NULL
      WHERE id = v_app_id;

      RETURN jsonb_build_object(
        'success', true, 'table', 'appointments', 'record_id', v_app_id,
        'message', 'Vínculos de faturamento do atendimento foram resetados.'
      );
    END IF;

  -- ─── TABELA: BILLING_BATCHES ───────────────────────────────────────────
  ELSIF p_log.table_name = 'billing_batches' THEN
    v_batch_id := p_log.record_id::UUID;

    IF p_log.action = 'UPDATE' THEN
      IF v_old IS NULL THEN
        RAISE EXCEPTION 'Não há dados anteriores para restaurar o lote de faturamento.';
      END IF;

      UPDATE billing_batches
      SET
        batch_number    = v_old->>'batch_number',
        sent_at         = (v_old->>'sent_at')::TIMESTAMPTZ,
        paid_at         = (v_old->>'paid_at')::TIMESTAMPTZ,
        status          = v_old->>'status',
        health_plan     = v_old->>'health_plan',
        total_amount    = (v_old->>'total_amount')::NUMERIC,
        appointment_ids = ARRAY(SELECT jsonb_array_elements_text(v_old->'appointment_ids'))
      WHERE id = v_batch_id;

      RETURN jsonb_build_object(
        'success', true, 'table', 'billing_batches', 'record_id', v_batch_id,
        'message', 'Lote de faturamento restaurado para o estado anterior com sucesso!'
      );

    ELSIF p_log.action = 'INSERT' THEN
      UPDATE appointments SET billing_batch_id = NULL WHERE billing_batch_id = v_batch_id;
      DELETE FROM billing_batches WHERE id = v_batch_id;

      RETURN jsonb_build_object(
        'success', true, 'table', 'billing_batches', 'record_id', v_batch_id,
        'message', 'Lote de faturamento removido e atendimentos liberados com sucesso!'
      );

    ELSIF p_log.action = 'DELETE' THEN
      INSERT INTO billing_batches (
        id, batch_number, sent_at, paid_at, status, health_plan, total_amount, appointment_ids, created_at
      ) VALUES (
        v_batch_id,
        v_old->>'batch_number',
        (v_old->>'sent_at')::TIMESTAMPTZ,
        (v_old->>'paid_at')::TIMESTAMPTZ,
        v_old->>'status',
        v_old->>'health_plan',
        (v_old->>'total_amount')::NUMERIC,
        ARRAY(SELECT jsonb_array_elements_text(v_old->'appointment_ids')),
        COALESCE((v_old->>'created_at')::TIMESTAMPTZ, NOW())
      );

      RETURN jsonb_build_object(
        'success', true, 'table', 'billing_batches', 'record_id', v_batch_id,
        'message', 'Lote de faturamento excluído foi recriado com sucesso!'
      );
    END IF;

  -- ─── TABELA: REPASSES ──────────────────────────────────────────────────
  ELSIF p_log.table_name = 'repasses' THEN
    v_repasse_id := p_log.record_id::UUID;

    IF p_log.action = 'UPDATE' THEN
      IF v_old IS NULL THEN
        RAISE EXCEPTION 'Não há dados anteriores para restaurar o repasse.';
      END IF;

      UPDATE repasses
      SET
        psychologist_id  = (v_old->>'psychologist_id')::UUID,
        billing_batch_id = (v_old->>'billing_batch_id')::UUID,
        appointment_ids  = ARRAY(SELECT jsonb_array_elements_text(v_old->'appointment_ids')),
        total_amount     = (v_old->>'total_amount')::NUMERIC,
        status           = v_old->>'status',
        paid_at          = (v_old->>'paid_at')::TIMESTAMPTZ,
        notes            = v_old->>'notes'
      WHERE id = v_repasse_id;

      RETURN jsonb_build_object(
        'success', true, 'table', 'repasses', 'record_id', v_repasse_id,
        'message', 'Repasse restaurado para o estado anterior com sucesso!'
      );

    ELSIF p_log.action = 'INSERT' THEN
      DELETE FROM repasses WHERE id = v_repasse_id;

      RETURN jsonb_build_object(
        'success', true, 'table', 'repasses', 'record_id', v_repasse_id,
        'message', 'Repasse recém-criado foi desfeito e removido com sucesso!'
      );

    ELSIF p_log.action = 'DELETE' THEN
      INSERT INTO repasses (
        id, psychologist_id, billing_batch_id, appointment_ids, total_amount, status, paid_at, notes, created_at
      ) VALUES (
        v_repasse_id,
        (v_old->>'psychologist_id')::UUID,
        (v_old->>'billing_batch_id')::UUID,
        ARRAY(SELECT jsonb_array_elements_text(v_old->'appointment_ids')),
        (v_old->>'total_amount')::NUMERIC,
        v_old->>'status',
        (v_old->>'paid_at')::TIMESTAMPTZ,
        v_old->>'notes',
        COALESCE((v_old->>'created_at')::TIMESTAMPTZ, NOW())
      );

      RETURN jsonb_build_object(
        'success', true, 'table', 'repasses', 'record_id', v_repasse_id,
        'message', 'Repasse foi restaurado com sucesso!'
      );
    END IF;

  -- ─── TABELA: ROOM_RENTALS ──────────────────────────────────────────────
  ELSIF p_log.table_name = 'room_rentals' THEN
    v_rental_id := p_log.record_id::UUID;

    IF p_log.action = 'UPDATE' THEN
      IF v_old IS NULL THEN
        RAISE EXCEPTION 'Não há dados anteriores para restaurar a sublocação.';
      END IF;

      UPDATE room_rentals
      SET
        status              = v_old->>'status',
        amount              = (v_old->>'amount')::NUMERIC,
        payment_status      = v_old->>'payment_status',
        paid_at             = (v_old->>'paid_at')::TIMESTAMPTZ,
        notes               = v_old->>'notes',
        cancellation_reason = v_old->>'cancellation_reason'
      WHERE id = v_rental_id;

      RETURN jsonb_build_object(
        'success', true, 'table', 'room_rentals', 'record_id', v_rental_id,
        'message', 'Sublocação restaurada para o estado anterior com sucesso!'
      );

    ELSIF p_log.action = 'INSERT' THEN
      DELETE FROM room_rentals WHERE id = v_rental_id;

      RETURN jsonb_build_object(
        'success', true, 'table', 'room_rentals', 'record_id', v_rental_id,
        'message', 'Sublocação recém-criada foi desfeita e removida com sucesso!'
      );

    ELSIF p_log.action = 'DELETE' THEN
      INSERT INTO room_rentals (
        id, room_id, psychologist_id, date, start_time, end_time, status, amount,
        payment_status, paid_at, notes, is_recurring, recurrence_frequency,
        recurrence_group_id, cancellation_reason, created_at
      ) VALUES (
        v_rental_id,
        (v_old->>'room_id')::UUID,
        (v_old->>'psychologist_id')::UUID,
        (v_old->>'date')::DATE,
        v_old->>'start_time',
        v_old->>'end_time',
        v_old->>'status',
        (v_old->>'amount')::NUMERIC,
        v_old->>'payment_status',
        (v_old->>'paid_at')::TIMESTAMPTZ,
        v_old->>'notes',
        COALESCE((v_old->>'is_recurring')::BOOLEAN, false),
        v_old->>'recurrence_frequency',
        (v_old->>'recurrence_group_id')::UUID,
        v_old->>'cancellation_reason',
        COALESCE((v_old->>'created_at')::TIMESTAMPTZ, NOW())
      );

      RETURN jsonb_build_object(
        'success', true, 'table', 'room_rentals', 'record_id', v_rental_id,
        'message', 'Sublocação excluída foi recriada com sucesso!'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', false, 'message', 'Nenhuma ação executada.');
END;
$$;

REVOKE ALL ON FUNCTION _revert_audit_log_row(audit_log) FROM PUBLIC;
REVOKE ALL ON FUNCTION _revert_audit_log_row(audit_log) FROM anon;
REVOKE ALL ON FUNCTION _revert_audit_log_row(audit_log) FROM authenticated;

-- Verificação
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name = 'room_rentals' AND column_name IN ('start_time', 'end_time');
