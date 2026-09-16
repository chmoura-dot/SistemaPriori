-- ============================================================================
-- Migration: Sublocação de sala — extensão da auditoria financeira
-- Data: 2026-09-16
-- Objetivo: room_rentals precisa aparecer e ser revertível na Auditoria
--   Financeira, igual a appointments/billing_batches/repasses. Como
--   _revert_audit_log_row é chamada tanto por revert_financial_audit_log
--   quanto por revert_financial_audit_operation (20260914_audit_operation_
--   grouping.sql), CREATE OR REPLACE preserva o mesmo OID e ambos os
--   chamadores passam a suportar room_rentals sem qualquer outra mudança.
--   revert_financial_audit_operation também precisa ter seu próprio filtro
--   de tabela ampliado (é um segundo ponto, dentro do FOR da própria função).
-- ============================================================================

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
        (v_old->>'start_time')::TIME,
        (v_old->>'end_time')::TIME,
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

-- revert_financial_audit_operation tem seu próprio filtro de tabela (dentro
-- do FOR que itera as linhas do operation_id) — precisa ser ampliado junto,
-- senão linhas de room_rentals com o mesmo operation_id ficariam de fora da
-- reversão em lote mesmo já suportadas pelo helper acima.
CREATE OR REPLACE FUNCTION revert_financial_audit_operation(p_operation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_log audit_log%ROWTYPE;
  v_results jsonb := '[]'::jsonb;
  v_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM app_users
    WHERE (app_users.email = auth.email() OR app_users.user_id = auth.uid())
      AND app_users.role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Permissão negada. Apenas administradores podem reverter alterações de auditoria.';
  END IF;

  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'operation_id é obrigatório.';
  END IF;

  FOR v_log IN
    SELECT * FROM audit_log
    WHERE operation_id = p_operation_id
      AND table_name IN ('appointments', 'billing_batches', 'repasses', 'room_rentals')
    ORDER BY created_at DESC -- desfaz na ordem inversa: as escritas mais recentes primeiro
  LOOP
    v_results := v_results || jsonb_build_array(_revert_audit_log_row(v_log));
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Nenhum registro de auditoria encontrado para a operação %.', p_operation_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reverted_count', v_count,
    'results', v_results,
    'message', v_count || ' alteração(ões) revertida(s) com sucesso!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION revert_financial_audit_operation(uuid) TO authenticated;

-- Verificação
SELECT proname FROM pg_proc
 WHERE proname IN ('_revert_audit_log_row', 'revert_financial_audit_operation')
 ORDER BY proname;
