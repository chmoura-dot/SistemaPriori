-- ============================================================
-- APLICAÇÃO DAS MIGRATIONS DA "OPERAÇÃO INTEGRIDADE"
-- ============================================================
-- Rode este script UMA VEZ no SQL Editor do Supabase (produção).
-- É idempotente (IF NOT EXISTS / OR REPLACE) — seguro reexecutar.
--
-- CONTÉM:
--   Parte A) Tabela operation_failures + RPC log_operation_failure (Fase 1)
--   Parte B) RPC inactivate_customer (Fase 3)
--
-- MOTIVO: a verificação mostrou que operation_failures NÃO existe no
-- remoto, ou seja, essas migrations locais nunca foram aplicadas.
-- Isso deixa o logger.critical() e o handleInactivate do frontend
-- apontando para objetos inexistentes.
-- ============================================================


-- ─── PARTE A: operation_failures + log_operation_failure ────────────────────

CREATE TABLE IF NOT EXISTS operation_failures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,
  context      text NOT NULL,
  message      text NOT NULL,
  details      jsonb,
  severity     text NOT NULL DEFAULT 'error' CHECK (severity IN ('warn', 'error', 'critical')),
  acknowledged boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operation_failures_created_at
  ON operation_failures (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operation_failures_unack
  ON operation_failures (acknowledged) WHERE acknowledged = false;

ALTER TABLE operation_failures ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "operation_failures_select_authenticated" ON operation_failures;
  DROP POLICY IF EXISTS "operation_failures_update_authenticated" ON operation_failures;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY "operation_failures_select_authenticated"
  ON operation_failures FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "operation_failures_update_authenticated"
  ON operation_failures FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION log_operation_failure(
  p_context  text,
  p_message  text,
  p_details  jsonb DEFAULT NULL,
  p_severity text DEFAULT 'error'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO operation_failures (user_id, context, message, details, severity)
  VALUES (
    auth.uid(),
    p_context,
    p_message,
    p_details,
    CASE WHEN p_severity IN ('warn', 'error', 'critical') THEN p_severity ELSE 'error' END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION log_operation_failure(text, text, jsonb, text) TO authenticated;


-- ─── PARTE B: inactivate_customer (transação atômica) ───────────────────────

CREATE OR REPLACE FUNCTION inactivate_customer(p_customer_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer        customers%ROWTYPE;
  v_psy_name        text;
  v_future_ids      uuid[];
  v_canceled_count  int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado';
  END IF;

  SELECT name INTO v_psy_name
    FROM psychologists
   WHERE id = v_customer.psychologist_id;

  -- 1. Inativa o paciente
  UPDATE customers
     SET status = 'inactive',
         inactivation_reason = p_reason
   WHERE id = p_customer_id;

  -- 2. Cancela todas as consultas futuras (active/released)
  SELECT array_agg(id) INTO v_future_ids
    FROM appointments
   WHERE customer_id = p_customer_id
     AND date >= current_date
     AND status IN ('active', 'released');

  IF v_future_ids IS NOT NULL THEN
    UPDATE appointments
       SET status = 'canceled',
           cancellation_billing = 'none'
     WHERE id = ANY(v_future_ids);
    v_canceled_count := array_length(v_future_ids, 1);
  END IF;

  -- 3. Registra evento de alta para notificação ao admin
  INSERT INTO discharge_events (
    customer_id, psychologist_id, customer_name,
    psychologist_name, appointments_canceled
  )
  VALUES (
    p_customer_id,
    v_customer.psychologist_id,
    v_customer.name,
    COALESCE(v_psy_name, 'Psicólogo'),
    v_canceled_count
  );

  -- 4. Pausa assinaturas ativas do paciente
  UPDATE subscriptions
     SET status = 'inactive'
   WHERE customer_id = p_customer_id
     AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'appointments_canceled', v_canceled_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION inactivate_customer(uuid, text) TO authenticated;


-- ─── VERIFICAÇÃO FINAL (deve retornar as 2 funções e a tabela) ──────────────
SELECT to_regclass('public.operation_failures') AS operation_failures_table;
SELECT proname FROM pg_proc
 WHERE proname IN ('inactivate_customer', 'log_operation_failure')
 ORDER BY proname;
