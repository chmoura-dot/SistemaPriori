-- ============================================================================
-- Migration: Agrupamento de auditoria financeira — fluxos de paciente/plano
-- Data: 2026-09-15
-- Objetivo: dois fluxos disparados ao editar um paciente (correção retroativa
--   de convênio e propagação de preço customizado) faziam UPDATE em lote
--   direto do navegador (supabase.from(...).update(...).in(...)), sem passar
--   por nenhuma RPC — por isso nunca conseguiam marcar app.operation_id e
--   sempre apareciam como N linhas soltas na Auditoria Financeira. Move essa
--   lógica para duas RPCs novas, e estende bulk_adjust_plan_prices (mesmo
--   problema, reajuste em massa de preços de planos) com o mesmo parâmetro.
-- ============================================================================

-- 1. apply_customer_health_plan_retro ----------------------------------------
-- Substitui o bloco "Correção retroativa do plano de saúde" de
-- CustomersPage.tsx::handleSubmit. Colapsa em uma transação o que hoje são
-- 2 idas ao banco (lotes já enviados/pagos + atendimentos elegíveis) + filtro
-- em JS + update.
CREATE OR REPLACE FUNCTION apply_customer_health_plan_retro(
  p_customer_id  uuid,
  p_health_plan  text,
  p_future_only  boolean DEFAULT false,
  p_today        date DEFAULT CURRENT_DATE,
  p_operation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count int := 0;
  v_blocked_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  PERFORM set_config('app.operation_id', COALESCE(p_operation_id, gen_random_uuid())::text, true);

  WITH locked AS (
    SELECT DISTINCT unnest(appointment_ids) AS id
    FROM billing_batches
    WHERE status IN ('SENT', 'PAID')
  ),
  eligible AS (
    SELECT a.id
    FROM appointments a
    WHERE a.customer_id = p_customer_id
      AND a.is_internal = false
      AND a.billing_batch_id IS NULL
      AND (NOT p_future_only OR a.date >= p_today)
  ),
  to_update AS (
    SELECT e.id FROM eligible e
    WHERE NOT EXISTS (SELECT 1 FROM locked l WHERE l.id = e.id)
  )
  UPDATE appointments a
  SET health_plan_at_time = p_health_plan
  FROM to_update t
  WHERE a.id = t.id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  SELECT count(*) INTO v_blocked_count
  FROM eligible e
  WHERE EXISTS (SELECT 1 FROM locked l WHERE l.id = e.id);

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated_count, 'blocked_count', v_blocked_count);
END;
$$;

GRANT EXECUTE ON FUNCTION apply_customer_health_plan_retro(uuid, text, boolean, date, uuid) TO authenticated;

-- 2. apply_customer_price_propagation ----------------------------------------
-- Substitui o bloco "Propagação automática de valor para atendimentos não
-- faturados". Sem filtro is_internal e sem filtro de data — preserva a
-- assimetria que já existe hoje frente ao bloco de convênio (não é bug a
-- corrigir aqui).
CREATE OR REPLACE FUNCTION apply_customer_price_propagation(
  p_customer_id  uuid,
  p_custom_price numeric,
  p_operation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  PERFORM set_config('app.operation_id', COALESCE(p_operation_id, gen_random_uuid())::text, true);

  WITH locked AS (
    SELECT DISTINCT unnest(appointment_ids) AS id
    FROM billing_batches
    WHERE status IN ('SENT', 'PAID')
  ),
  to_update AS (
    SELECT a.id
    FROM appointments a
    WHERE a.customer_id = p_customer_id
      AND a.billing_batch_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM locked l WHERE l.id = a.id)
  )
  UPDATE appointments a
  SET custom_price = p_custom_price
  FROM to_update t
  WHERE a.id = t.id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated_count);
END;
$$;

GRANT EXECUTE ON FUNCTION apply_customer_price_propagation(uuid, numeric, uuid) TO authenticated;

-- 3. bulk_adjust_plan_prices ganha p_operation_id ----------------------------
-- Mesmo problema: reajuste em massa de preços/repasses de planos (PlansPage)
-- já é uma RPC, mas nunca marcou app.operation_id. Assinatura muda (novo
-- parâmetro no final), então precisa de DROP FUNCTION antes do CREATE OR
-- REPLACE, senão vira um overload duplicado exposto via PostgREST — mesma
-- armadilha já corrigida em sync_billing_batch_appointments
-- (20260914_audit_operation_grouping.sql).
DROP FUNCTION IF EXISTS bulk_adjust_plan_prices(uuid[], numeric, boolean, boolean, date, numeric);

CREATE OR REPLACE FUNCTION bulk_adjust_plan_prices(
  p_plan_ids       uuid[],
  p_amount         numeric,
  p_adjust_price   boolean,
  p_adjust_repass  boolean,
  p_effective_date date,
  p_min_price      numeric DEFAULT 0,
  p_operation_id   uuid DEFAULT NULL
)
RETURNS TABLE(plans_updated int, appointments_updated int, clamped_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plans_updated int := 0;
  v_appointments_updated int := 0;
  v_clamped_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  PERFORM set_config('app.operation_id', COALESCE(p_operation_id, gen_random_uuid())::text, true);

  IF p_plan_ids IS NULL OR array_length(p_plan_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  -- Conta quantos valores (preço ou repasse) ficariam abaixo do mínimo e
  -- serão travados nele, para informar o usuário.
  SELECT count(*) INTO v_clamped_count
  FROM plans pl, jsonb_array_elements(coalesce(pl.procedures, '[]'::jsonb)) elem
  WHERE pl.id = ANY(p_plan_ids)
    AND (
      (p_adjust_price AND (COALESCE((elem->>'price')::numeric, 0) + p_amount) < p_min_price)
      OR (p_adjust_repass AND (COALESCE((elem->>'repassAmount')::numeric, 0) + p_amount) < p_min_price)
    );

  -- 1) Agendamentos futuros (>= data de vigência) ainda não faturados, dos
  --    pacientes vinculados aos planos selecionados — usa os valores originais
  --    do plano (esta consulta roda antes do UPDATE em `plans` abaixo).
  WITH matched AS (
    SELECT
      a.id AS appointment_id,
      a.custom_price,
      a.custom_repass_amount,
      (proc.elem->>'price')::numeric AS plan_price,
      (proc.elem->>'repassAmount')::numeric AS plan_repass,
      psy.repass_overrides_plan
    FROM appointments a
    JOIN customers c ON c.id = a.customer_id
    JOIN plans pl ON pl.id = ANY(p_plan_ids) AND upper(pl.name) = upper(c.health_plan)
    LEFT JOIN psychologists psy ON psy.id = a.psychologist_id
    CROSS JOIN LATERAL (
      SELECT e AS elem FROM jsonb_array_elements(coalesce(pl.procedures, '[]'::jsonb)) e
      WHERE e->>'type' = a.type
      LIMIT 1
    ) proc
    WHERE a.billing_batch_id IS NULL
      AND a.date >= p_effective_date
  )
  UPDATE appointments a
  SET
    custom_price = CASE WHEN p_adjust_price
      THEN GREATEST(p_min_price, COALESCE(m.custom_price, m.plan_price) + p_amount)
      ELSE a.custom_price END,
    custom_repass_amount = CASE WHEN p_adjust_repass AND NOT COALESCE(m.repass_overrides_plan, false)
      THEN GREATEST(p_min_price, COALESCE(m.custom_repass_amount, m.plan_repass) + p_amount)
      ELSE a.custom_repass_amount END
  FROM matched m
  WHERE a.id = m.appointment_id;
  GET DIAGNOSTICS v_appointments_updated = ROW_COUNT;

  -- 2) Planos — aplica o reajuste travando qualquer valor resultante no mínimo.
  UPDATE plans pl
  SET procedures = (
    SELECT jsonb_agg(
      elem
        || CASE WHEN p_adjust_price
             THEN jsonb_build_object('price', GREATEST(p_min_price, COALESCE((elem->>'price')::numeric, 0) + p_amount))
             ELSE '{}'::jsonb END
        || CASE WHEN p_adjust_repass
             THEN jsonb_build_object('repassAmount', GREATEST(p_min_price, COALESCE((elem->>'repassAmount')::numeric, 0) + p_amount))
             ELSE '{}'::jsonb END
    )
    FROM jsonb_array_elements(coalesce(pl.procedures, '[]'::jsonb)) elem
  )
  WHERE pl.id = ANY(p_plan_ids);
  GET DIAGNOSTICS v_plans_updated = ROW_COUNT;

  RETURN QUERY SELECT v_plans_updated, v_appointments_updated, v_clamped_count;
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_adjust_plan_prices(uuid[], numeric, boolean, boolean, date, numeric, uuid) TO authenticated;

-- Verificação
SELECT proname FROM pg_proc
 WHERE proname IN (
   'apply_customer_health_plan_retro', 'apply_customer_price_propagation', 'bulk_adjust_plan_prices'
 )
 ORDER BY proname;
