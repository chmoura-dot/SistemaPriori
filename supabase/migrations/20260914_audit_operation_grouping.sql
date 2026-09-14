-- ============================================================================
-- Migration: Agrupamento de auditoria financeira por operação
-- Data: 2026-09-14
-- Objetivo: uma ação do usuário (ex.: pagar um lote com 8 atendimentos) hoje
--   gera N linhas quase idênticas em audit_log, pois fn_audit_log() dispara
--   por linha (FOR EACH ROW), não por ação. Esta migration adiciona uma coluna
--   operation_id (nullable, retrocompatível) preenchida via variável de sessão
--   Postgres quando as RPCs de escrita em lote a definem, permitindo agrupar
--   as linhas resultantes de uma mesma ação na tela de Auditoria Financeira.
-- ============================================================================

-- 1. Coluna + índice ---------------------------------------------------------
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS operation_id UUID;

CREATE INDEX IF NOT EXISTS idx_audit_log_operation_id
  ON audit_log (operation_id)
  WHERE operation_id IS NOT NULL;

-- 2. Trigger genérico passa a capturar app.operation_id ----------------------
-- CREATE OR REPLACE preserva a mesma função/OID e portanto todos os triggers
-- já existentes (customers, appointments, discharge_events, billing_batches,
-- repasses, nfse_invoices) passam a gravar operation_id automaticamente.
CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID;
  v_email    TEXT;
  v_old      JSONB;
  v_new      JSONB;
  v_operation_id UUID;
BEGIN
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  BEGIN
    v_email := auth.email();
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  -- Setada por RPCs que fazem operações em lote via
  -- set_config('app.operation_id', ..., true) — is_local=true garante que a
  -- variável não sobrevive além da transação atual, mesmo em connection
  -- pooling (transaction mode), evitando vazar para transações não
  -- relacionadas numa conexão física reaproveitada.
  BEGIN
    v_operation_id := NULLIF(current_setting('app.operation_id', true), '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_operation_id := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSE -- UPDATE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  END IF;

  INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data, new_data, operation_id)
  VALUES (
    v_user_id,
    v_email,
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id::TEXT, OLD.id::TEXT),
    v_old,
    v_new,
    v_operation_id
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 3. sync_billing_batch_appointments ganha p_operation_id --------------------
-- Assinatura muda (novo parâmetro no final), então CREATE OR REPLACE criaria
-- um overload em vez de substituir — removemos a versão antiga explicitamente
-- para não deixar duas funções com o mesmo nome expostas via PostgREST.
DROP FUNCTION IF EXISTS sync_billing_batch_appointments(uuid, uuid[], numeric, text, text, timestamptz, timestamptz, uuid[], text);

CREATE OR REPLACE FUNCTION sync_billing_batch_appointments(
  p_batch_id        uuid,
  p_appointment_ids uuid[],
  p_total_amount    numeric,
  p_status          text DEFAULT NULL,
  p_batch_number    text DEFAULT NULL,
  p_sent_at         timestamptz DEFAULT NULL,
  p_paid_at         timestamptz DEFAULT NULL,
  p_ignored_ids     uuid[] DEFAULT NULL,
  p_ignored_reason  text DEFAULT NULL,
  p_operation_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_ids uuid[];
  v_added   uuid[];
  v_removed uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Marca todas as linhas de audit_log geradas nesta transação com o mesmo
  -- operation_id, para a UI agrupá-las como uma única ação do usuário.
  PERFORM set_config('app.operation_id', COALESCE(p_operation_id, gen_random_uuid())::text, true);

  SELECT appointment_ids INTO v_old_ids
  FROM billing_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de faturamento não encontrado: %', p_batch_id;
  END IF;

  UPDATE billing_batches SET
    appointment_ids = p_appointment_ids,
    total_amount    = p_total_amount,
    status          = COALESCE(p_status, status),
    batch_number    = COALESCE(p_batch_number, batch_number),
    sent_at         = COALESCE(p_sent_at, sent_at),
    paid_at         = COALESCE(p_paid_at, paid_at)
  WHERE id = p_batch_id;

  v_added := ARRAY(
    SELECT unnest(p_appointment_ids)
    EXCEPT
    SELECT unnest(COALESCE(v_old_ids, ARRAY[]::uuid[]))
  );

  v_removed := ARRAY(
    SELECT unnest(COALESCE(v_old_ids, ARRAY[]::uuid[]))
    EXCEPT
    SELECT unnest(p_appointment_ids)
  );

  IF array_length(v_added, 1) > 0 THEN
    UPDATE appointments SET billing_batch_id = p_batch_id
    WHERE id = ANY(v_added);
  END IF;

  IF array_length(v_removed, 1) > 0 THEN
    UPDATE appointments SET
      billing_batch_id = NULL,
      billing_ignored = CASE WHEN id = ANY(COALESCE(p_ignored_ids, ARRAY[]::uuid[])) THEN true ELSE billing_ignored END,
      billing_ignored_reason = CASE WHEN id = ANY(COALESCE(p_ignored_ids, ARRAY[]::uuid[])) THEN p_ignored_reason ELSE billing_ignored_reason END,
      billing_ignored_at = CASE WHEN id = ANY(COALESCE(p_ignored_ids, ARRAY[]::uuid[])) THEN now() ELSE billing_ignored_at END
    WHERE id = ANY(v_removed) AND billing_batch_id = p_batch_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'added', COALESCE(v_added, ARRAY[]::uuid[]),
    'removed', COALESCE(v_removed, ARRAY[]::uuid[])
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_billing_batch_appointments(uuid, uuid[], numeric, text, text, timestamptz, timestamptz, uuid[], text, uuid) TO authenticated;

-- 4. mark_billing_batch_paid (nova) -------------------------------------------
-- Substitui o padrão atual de submitPayment (N updateAppointment em loop +
-- 1 updateBillingBatch) por uma única transação com 1 UPDATE em lote em
-- appointments + 1 UPDATE em billing_batches (só quando o status realmente
-- muda, mesma otimização que já existe em recalcBatchStatus no frontend).
CREATE OR REPLACE FUNCTION mark_billing_batch_paid(
  p_batch_id      uuid,
  p_statuses      jsonb,   -- [{"id": uuid, "status": "paid"|"denied"|null, "reason": text, "resolution": text}, ...]
  p_paid_at       timestamptz,
  p_batch_status  text,
  p_batch_paid_at timestamptz,
  p_operation_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status text;
  v_updated int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  PERFORM set_config('app.operation_id', COALESCE(p_operation_id, gen_random_uuid())::text, true);

  UPDATE appointments a SET
    billing_status    = s.status,
    denial_reason     = CASE WHEN s.status = 'denied' THEN s.reason ELSE NULL END,
    denial_resolution = CASE WHEN s.status = 'denied' THEN s.resolution ELSE NULL END,
    paid_at           = CASE WHEN s.status = 'paid' THEN p_paid_at ELSE NULL END
  FROM jsonb_to_recordset(p_statuses) AS s(id uuid, status text, reason text, resolution text)
  WHERE a.id = s.id AND a.billing_batch_id = p_batch_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT status INTO v_current_status FROM billing_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de faturamento não encontrado: %', p_batch_id;
  END IF;

  -- Evita um UPDATE (e portanto uma linha de auditoria) redundante quando o
  -- status do lote não muda.
  IF v_current_status IS DISTINCT FROM p_batch_status THEN
    UPDATE billing_batches SET status = p_batch_status, paid_at = p_batch_paid_at
    WHERE id = p_batch_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'updated', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION mark_billing_batch_paid(uuid, jsonb, timestamptz, text, timestamptz, uuid) TO authenticated;

-- 5. Reversão: extrai lógica comum para um helper interno --------------------
-- _revert_audit_log_row NÃO tem checagem de admin própria — só é chamável a
-- partir de outra função SECURITY DEFINER deste schema. REVOKE explícito
-- evita que o PostgREST a exponha como endpoint (Postgres concede EXECUTE a
-- PUBLIC por padrão em CREATE FUNCTION).
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
BEGIN
  IF p_log.table_name NOT IN ('appointments', 'billing_batches', 'repasses') THEN
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
  END IF;

  RETURN jsonb_build_object('success', false, 'message', 'Nenhuma ação executada.');
END;
$$;

REVOKE ALL ON FUNCTION _revert_audit_log_row(audit_log) FROM PUBLIC;
REVOKE ALL ON FUNCTION _revert_audit_log_row(audit_log) FROM anon;
REVOKE ALL ON FUNCTION _revert_audit_log_row(audit_log) FROM authenticated;

-- revert_financial_audit_log vira um wrapper fino: checa admin, busca a
-- linha e delega a restauração ao helper. Comportamento público idêntico ao
-- de antes desta migration.
CREATE OR REPLACE FUNCTION revert_financial_audit_log(p_audit_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_log audit_log%ROWTYPE;
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

  SELECT * INTO v_log FROM audit_log WHERE id = p_audit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro de auditoria com ID % não foi encontrado.', p_audit_id;
  END IF;

  RETURN _revert_audit_log_row(v_log);
END;
$$;

-- Nova RPC: reverte toda uma operação (todas as linhas com o mesmo
-- operation_id) numa única transação — se qualquer linha falhar, a exceção
-- aborta a transação inteira e nada é revertido (tudo ou nada).
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
      AND table_name IN ('appointments', 'billing_batches', 'repasses')
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

GRANT EXECUTE ON FUNCTION revert_financial_audit_log(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION revert_financial_audit_operation(uuid) TO authenticated;

-- Verificação
SELECT proname FROM pg_proc
 WHERE proname IN (
   'fn_audit_log', 'sync_billing_batch_appointments', 'mark_billing_batch_paid',
   '_revert_audit_log_row', 'revert_financial_audit_log', 'revert_financial_audit_operation'
 )
 ORDER BY proname;
