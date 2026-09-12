-- ============================================================================
-- Migration: RPC atomica para reajuste em lote de precos de planos
-- Data: 2026-09-12
-- Causa: PlansPage.handleBulkAdjustment fazia dois Promise.all (um para
--        `plans`, outro para `appointments`) sem nenhuma transacao — se uma
--        escrita no meio falhasse, parte dos planos/agendamentos ficava
--        reajustada e parte nao, sem rollback e sem indicar ao usuario quais
--        registros pegaram o reajuste. Tambem nao havia nenhum limite minimo:
--        um valor de ajuste negativo (reducao) podia zerar ou colocar em
--        negativo o preco/repasse de um procedimento sem nenhum aviso.
-- Correcao: toda a operacao (planos + agendamentos futuros nao faturados)
--        passa a rodar dentro desta unica funcao SECURITY DEFINER — se
--        qualquer parte falhar, o Postgres desfaz tudo automaticamente.
--        Qualquer preco/repasse resultante e' travado em `p_min_price`
--        (default 0, nunca negativo), e a funcao informa quantos valores
--        precisaram ser travados para o frontend avisar o usuario.
-- Observacao: os agendamentos sao ajustados ANTES dos planos, na mesma ordem
--        usada pelo codigo anterior no frontend (que calculava tudo a partir
--        do preco original do plano, carregado antes de qualquer escrita) —
--        inverter a ordem faria o agendamento herdar o preco ja reajustado
--        do plano e aplicar o ajuste em dobro.
-- ============================================================================

CREATE OR REPLACE FUNCTION bulk_adjust_plan_prices(
  p_plan_ids uuid[],
  p_amount numeric,
  p_adjust_price boolean,
  p_adjust_repass boolean,
  p_effective_date date,
  p_min_price numeric DEFAULT 0
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

GRANT EXECUTE ON FUNCTION bulk_adjust_plan_prices(uuid[], numeric, boolean, boolean, date, numeric) TO authenticated;
