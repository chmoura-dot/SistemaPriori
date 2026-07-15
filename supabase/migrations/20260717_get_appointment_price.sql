-- ============================================================
-- Fase 4 — get_appointment_price + validate_price_parity (Shadow Calculation)
-- ============================================================
-- Tradução FIEL de src/lib/pricing.ts (getAppPrice + getAmsNeuropsicoSessionIndex
-- + getNeuropsicoStatus). NÃO substitui o cálculo do frontend — apenas espelha,
-- para detectar divergências antes que virem erro financeiro na fatura.
--
-- Decisões de escopo (validadas):
--   • maxSessionsPerMonth NÃO é validado (paridade com o comportamento atual).
--   • p_plan_id chega JÁ resolvido pelo frontend (matchPlanByHealthPlan) — o SQL
--     não re-deriva o plano a partir do nome textual do health_plan.
-- ============================================================

CREATE OR REPLACE FUNCTION get_appointment_price(
  p_appointment_id  uuid,
  p_psychologist_id uuid,   -- reservado para uso futuro; não afeta o preço bruto
  p_plan_id         uuid,   -- plano já resolvido pelo frontend
  p_date            date,   -- permite simular preço em outra data
  p_session_type    text    -- AppointmentType — permite simular tipo diferente do salvo
)
RETURNS TABLE (
  base_price    numeric,
  final_price   numeric,
  applied_rules text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app           appointments%ROWTYPE;
  v_customer      customers%ROWTYPE;
  v_plan_name     text;
  v_procedures    jsonb;
  v_rules         text[] := ARRAY[]::text[];
  v_is_ams        boolean;
  v_is_particular boolean;
  v_session_idx   int := -1;
  v_cycle_start   date;
  v_months_diff   int;
  v_rec           record;
  v_proc_by_code  jsonb;
  v_proc_by_type  jsonb;
  v_procedure     jsonb;
  v_last_date     date;
  v_diff_days     int;
  v_base          numeric := 0;
  v_final         numeric := 0;
BEGIN
  SELECT * INTO v_app FROM appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado: %', p_appointment_id;
  END IF;

  SELECT * INTO v_customer FROM customers WHERE id = v_app.customer_id;

  SELECT name, procedures INTO v_plan_name, v_procedures
    FROM plans WHERE id = p_plan_id;

  -- 1. Cancelado sem cobrança → R$0 (pricing.ts:113)
  IF v_app.status = 'canceled' AND v_app.cancellation_billing = 'none' THEN
    RETURN QUERY SELECT 0::numeric, 0::numeric, ARRAY['canceled_no_charge'];
    RETURN;
  END IF;

  v_is_ams        := (v_plan_name = 'AMS Petrobras');
  v_is_particular := (v_plan_name = 'Particular' OR v_plan_name IS NULL);

  -- 2. AMS Petrobras + Avaliação Neuropsicológica (pricing.ts:25-62, 121-130)
  IF v_is_ams AND p_session_type = 'NEUROPSICOLOGICA' THEN
    v_cycle_start := NULL;
    v_session_idx := -1;
    FOR v_rec IN
      SELECT id, date FROM appointments
       WHERE customer_id = v_app.customer_id
         AND type = 'NEUROPSICOLOGICA'
         AND status <> 'canceled'
       ORDER BY date, start_time
    LOOP
      IF v_cycle_start IS NULL THEN
        v_cycle_start := v_rec.date;
        v_session_idx := 0;
      ELSE
        v_months_diff := (EXTRACT(YEAR FROM v_rec.date) - EXTRACT(YEAR FROM v_cycle_start)) * 12
                       + (EXTRACT(MONTH FROM v_rec.date) - EXTRACT(MONTH FROM v_cycle_start));
        IF v_months_diff >= 10 THEN
          v_cycle_start := v_rec.date;
          v_session_idx := 0;
        ELSE
          v_session_idx := v_session_idx + 1;
        END IF;
      END IF;
      EXIT WHEN v_rec.id = p_appointment_id;
    END LOOP;

    v_rules := array_append(v_rules, format('ams_neuropsico_session_idx_%s', v_session_idx));

    IF v_session_idx >= 3 THEN
      RETURN QUERY SELECT 0::numeric, 0::numeric,
        array_append(v_rules, 'ams_neuropsico_blocked_4th_plus');
      RETURN;
    ELSIF v_session_idx IN (1, 2) THEN
      SELECT elem INTO v_procedure
        FROM jsonb_array_elements(v_procedures) elem
       WHERE elem->>'code' = '95090010' LIMIT 1;
      v_base  := COALESCE((v_procedure->>'price')::numeric, 0);
      v_final := COALESCE(v_app.custom_price, (v_procedure->>'price')::numeric, v_customer.custom_price, 0);
      RETURN QUERY SELECT v_base, v_final, array_append(v_rules, 'ams_neuropsico_2nd_3rd_session');
      RETURN;
    ELSE
      SELECT elem INTO v_procedure
        FROM jsonb_array_elements(v_procedures) elem
       WHERE elem->>'type' = 'NEUROPSICOLOGICA' LIMIT 1;
      v_base  := COALESCE((v_procedure->>'price')::numeric, 0);
      v_final := COALESCE(v_app.custom_price, (v_procedure->>'price')::numeric, v_customer.custom_price, 0);
      RETURN QUERY SELECT v_base, v_final, array_append(v_rules, 'ams_neuropsico_1st_session');
      RETURN;
    END IF;
  END IF;

  -- 3. Neuropsico genérico — bloqueio de 180 dias (pricing.ts:75-102, 132-136)
  IF p_session_type = 'NEUROPSICOLOGICA' AND NOT v_is_ams THEN
    SELECT date INTO v_last_date
      FROM appointments
     WHERE customer_id = v_app.customer_id
       AND type = 'NEUROPSICOLOGICA'
       AND status <> 'canceled'
       AND date < p_date
       AND id <> p_appointment_id
     ORDER BY date DESC LIMIT 1;

    IF v_last_date IS NOT NULL THEN
      v_diff_days := p_date - v_last_date;
      IF v_diff_days < 180 THEN
        RETURN QUERY SELECT 0::numeric, 0::numeric,
          array_append(v_rules, format('neuropsico_180_day_block_diff_%s', v_diff_days));
        RETURN;
      END IF;
    END IF;
  END IF;

  -- 4. Resolução padrão por procedimento (pricing.ts:142-184)
  v_proc_by_code := NULL;
  IF v_app.procedure_code IS NOT NULL THEN
    SELECT elem INTO v_proc_by_code
      FROM jsonb_array_elements(v_procedures) elem
     WHERE elem->>'code' = v_app.procedure_code LIMIT 1;
  END IF;

  SELECT elem INTO v_proc_by_type
    FROM jsonb_array_elements(v_procedures) elem
   WHERE elem->>'type' = p_session_type LIMIT 1;

  v_procedure := COALESCE(v_proc_by_code, v_proc_by_type);
  v_base := COALESCE((v_procedure->>'price')::numeric, 0);

  IF NOT v_is_particular AND v_proc_by_code IS NOT NULL THEN
    v_final := (v_proc_by_code->>'price')::numeric;
    v_rules := array_append(v_rules, 'procedure_by_code_priority');
  ELSIF NOT v_is_particular AND v_proc_by_type IS NOT NULL THEN
    v_final := COALESCE(v_app.custom_price, (v_proc_by_type->>'price')::numeric);
    v_rules := array_append(v_rules, 'procedure_by_type_fallback');
  ELSE
    v_final := COALESCE(v_app.custom_price, v_customer.custom_price, (v_procedure->>'price')::numeric, 0);
    v_rules := array_append(v_rules, 'particular_or_no_plan_fallback');
  END IF;

  RETURN QUERY SELECT v_base, v_final, v_rules;
END;
$$;

GRANT EXECUTE ON FUNCTION get_appointment_price(uuid, uuid, uuid, date, text) TO authenticated;


-- ============================================================
-- validate_price_parity — compara frontend vs. servidor e loga divergência
-- ============================================================
CREATE OR REPLACE FUNCTION validate_price_parity(
  p_appointment_id      uuid,
  p_psychologist_id     uuid,
  p_plan_id             uuid,
  p_date                date,
  p_session_type        text,
  p_price_from_frontend numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result  record;
  v_diff    numeric;
  v_matched boolean;
BEGIN
  SELECT * INTO v_result
    FROM get_appointment_price(p_appointment_id, p_psychologist_id, p_plan_id, p_date, p_session_type);

  v_diff    := ABS(COALESCE(v_result.final_price, 0) - COALESCE(p_price_from_frontend, 0));
  v_matched := v_diff < 1; -- tolerância de R$1 (mesmo threshold da Fase 2)

  IF NOT v_matched THEN
    PERFORM log_operation_failure(
      'pricing.parityMismatch',
      format('Divergência de preço: frontend=%s servidor=%s (appointment=%s)',
             p_price_from_frontend, v_result.final_price, p_appointment_id),
      jsonb_build_object(
        'appointment_id', p_appointment_id,
        'frontend_price', p_price_from_frontend,
        'server_price', v_result.final_price,
        'base_price', v_result.base_price,
        'applied_rules', v_result.applied_rules
      ),
      'critical'
    );
  END IF;

  RETURN jsonb_build_object(
    'matched', v_matched,
    'base_price', v_result.base_price,
    'final_price', v_result.final_price,
    'applied_rules', v_result.applied_rules
  );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_price_parity(uuid, uuid, uuid, date, text, numeric) TO authenticated;
