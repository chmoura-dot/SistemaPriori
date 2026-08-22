-- ============================================================================
-- Migration: Correção do RPC revert_financial_audit_log
-- Data: 2026-08-22
-- Causa raiz:
--   1) v_old/v_new eram declaradas mas nunca recebiam v_log.old_data/new_data,
--      fazendo toda reversão de UPDATE cair em "Não há dados anteriores...".
--   2) Erro de sintaxe no branch DELETE de billing_batches: RETURN
--      jsonb_build_object( incompleto + END IF ausente, impedindo a função
--      de sequer ser compilada pelo CREATE OR REPLACE FUNCTION.
-- Rode este script no SQL Editor do painel web do Supabase.
-- ============================================================================

CREATE OR REPLACE FUNCTION revert_financial_audit_log(p_audit_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email TEXT;
  v_is_admin BOOLEAN := FALSE;
  v_log audit_log%ROWTYPE;
  v_old JSONB;
  v_new JSONB;
  v_app_id UUID;
  v_batch_id UUID;
  v_repasse_id UUID;
BEGIN
  -- A. Autenticação e Verificação de Permissão de Administrador
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  v_user_email := auth.email();

  SELECT EXISTS (
    SELECT 1 FROM app_users
    WHERE (app_users.email = v_user_email OR app_users.user_id = auth.uid())
      AND app_users.role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Permissão negada. Apenas administradores podem reverter alterações de auditoria.';
  END IF;

  -- B. Busca o registro de auditoria
  SELECT * INTO v_log
  FROM audit_log
  WHERE id = p_audit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro de auditoria com ID % não foi encontrado.', p_audit_id;
  END IF;

  -- B.1 Atribuição corrigida: sem isto, v_old/v_new ficavam sempre NULL
  v_old := v_log.old_data;
  v_new := v_log.new_data;

  -- C. Validação de Escopo (Apenas tabelas financeiras são permitidas)
  IF v_log.table_name NOT IN ('appointments', 'billing_batches', 'repasses') THEN
    RAISE EXCEPTION 'Reversão não suportada para a tabela %.', v_log.table_name;
  END IF;

  -- D. Execução da Reversão por Tabela

  -- ─── TABELA: APPOINTMENTS ──────────────────────────────────────────────
  IF v_log.table_name = 'appointments' THEN
    v_app_id := v_log.record_id::UUID;

    IF v_log.action = 'UPDATE' THEN
      IF v_old IS NULL THEN
        RAISE EXCEPTION 'Não há dados anteriores (old_data) para restaurar este atendimento.';
      END IF;

      -- Restaura cirurgicamente apenas os campos financeiros do atendimento
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
        'success', true,
        'table', 'appointments',
        'record_id', v_app_id,
        'message', 'Dados financeiros do atendimento restaurados com sucesso!'
      );

    ELSIF v_log.action = 'DELETE' THEN
      RAISE EXCEPTION 'A reversão de exclusão direta de agendamento não é permitida por esta rotina.';
    ELSIF v_log.action = 'INSERT' THEN
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
        'success', true,
        'table', 'appointments',
        'record_id', v_app_id,
        'message', 'Vínculos de faturamento do atendimento foram resetados.'
      );
    END IF;

  -- ─── TABELA: BILLING_BATCHES ───────────────────────────────────────────
  ELSIF v_log.table_name = 'billing_batches' THEN
    v_batch_id := v_log.record_id::UUID;

    IF v_log.action = 'UPDATE' THEN
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
        'success', true,
        'table', 'billing_batches',
        'record_id', v_batch_id,
        'message', 'Lote de faturamento restaurado para o estado anterior com sucesso!'
      );

    ELSIF v_log.action = 'INSERT' THEN
      UPDATE appointments
      SET billing_batch_id = NULL
      WHERE billing_batch_id = v_batch_id;

      DELETE FROM billing_batches WHERE id = v_batch_id;

      RETURN jsonb_build_object(
        'success', true,
        'table', 'billing_batches',
        'record_id', v_batch_id,
        'message', 'Lote de faturamento removido e atendimentos liberados com sucesso!'
      );

    ELSIF v_log.action = 'DELETE' THEN
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
        'success', true,
        'table', 'billing_batches',
        'record_id', v_batch_id,
        'message', 'Lote de faturamento excluído foi recriado com sucesso!'
      );
    END IF;


  -- ─── TABELA: REPASSES ──────────────────────────────────────────────────
  ELSIF v_log.table_name = 'repasses' THEN
    v_repasse_id := v_log.record_id::UUID;

    IF v_log.action = 'UPDATE' THEN
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
        'success', true,
        'table', 'repasses',
        'record_id', v_repasse_id,
        'message', 'Repasse restaurado para o estado anterior com sucesso!'
      );

    ELSIF v_log.action = 'INSERT' THEN
      DELETE FROM repasses WHERE id = v_repasse_id;

      RETURN jsonb_build_object(
        'success', true,
        'table', 'repasses',
        'record_id', v_repasse_id,
        'message', 'Repasse recém-criado foi desfeito e removido com sucesso!'
      );

    ELSIF v_log.action = 'DELETE' THEN
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
        'success', true,
        'table', 'repasses',
        'record_id', v_repasse_id,
        'message', 'Repasse foi restaurado com sucesso!'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', false, 'message', 'Nenhuma ação executada.');
END;
$$;

