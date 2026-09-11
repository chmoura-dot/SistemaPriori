-- ============================================================================
-- Migration: Falta de Avaliação Neuropsicológica fora da AMS Petrobras nunca
--   cobra valor integral (auditoria "espelho" — a cobrança real usa
--   getAppPrice/getNeuropsicoStatus em src/lib/pricing.ts, corrigida lá).
-- Data: 2026-09-10
--
-- CONTEXTO DE NEGÓCIO
-- --------------------------------------------------------------------------
-- Caso real encontrado (paciente ISABELA PINTO MAGALHÃES, Particular):
--   19/08/2026 — FALTA, marcada para cobrar (cancellation_billing='plan')
--                → cobrava R$1.990 (valor integral da avaliação)
--   26/08/2026 — 1ª sessão REALMENTE realizada
--                → também cobrava R$1.990 (valor integral)
-- Resultado: 2 cobranças integrais para uma única avaliação.
--
-- Causa raiz: uma falta marcada para cobrar (qualquer opção diferente de
-- "Não Cobrar") não passava pelo bloqueio de reavaliação de 180 dias e,
-- sendo a 1ª tentativa, caía no fallback de preço cheio — mesmo a avaliação
-- nunca tendo sido entregue.
--
-- Correção: falta (do paciente OU do psicólogo) de Avaliação
-- Neuropsicológica fora da AMS Petrobras sempre cobra R$0, independente da
-- opção de cobrança marcada no cancelamento. A busca pela "sessão anterior"
-- do bloqueio de 180 dias continua ignorando sessões canceladas (sem
-- alteração) — assim a 1ª sessão REALMENTE realizada (26/08, no caso da
-- Isabela) não é bloqueada por uma falta anterior e cobra o integral
-- normalmente; só uma sessão real subsequente dentro de 180 dias é
-- bloqueada, como já era o comportamento correto para sessões realizadas.
--
-- Achado adicional durante o teste: não existe registro de plano
-- "Particular" cadastrado em produção, então v_plan_name fica NULL pra
-- pacientes particulares e "UPPER(NULL) = 'AMS PETROBRAS'" resulta em NULL
-- (não false) — e "NOT NULL" também é NULL, fazendo o Postgres pular
-- SILENCIOSAMENTE qualquer "IF ... AND NOT v_is_ams", inclusive o bloqueio de
-- 180 dias que já existia antes desta migration. Corrigido com
-- COALESCE(..., false) em v_is_ams.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_appointment_price(
  p_appointment_id  uuid,
  p_psychologist_id uuid,
  p_plan_id         uuid,
  p_date            date,
  p_session_type    text
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
  v_app                  appointments%ROWTYPE;
  v_customer              customers%ROWTYPE;
  v_plan_name             text;
  v_procedures            jsonb;
  v_rules                 text[] := ARRAY[]::text[];
  v_is_ams                boolean;
  v_is_particular         boolean;
  v_position              int := -1;
  v_attended              boolean;
  v_integral_used         boolean := false;
  v_code_95090010_count   int := 0;
  v_charge                text;
  v_cycle_start           date;
  v_months_diff           int;
  v_rec                   record;
  v_proc_by_code          jsonb;
  v_proc_by_type          jsonb;
  v_procedure             jsonb;
  v_last_date             date;
  v_diff_days             int;
  v_base                  numeric := 0;
  v_final                 numeric := 0;
BEGIN
  SELECT * INTO v_app FROM appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado: %', p_appointment_id;
  END IF;

  SELECT * INTO v_customer FROM customers WHERE id = v_app.customer_id;

  SELECT name, procedures INTO v_plan_name, v_procedures
    FROM plans WHERE id = p_plan_id;

  -- Comparação normalizada para maiúscula (igual ao matchPlanByHealthPlan do
  -- frontend) — plans.name é armazenado como 'AMS PETROBRAS' (tudo
  -- maiúsculo), então uma comparação sensível a caixa nunca reconhecia o
  -- plano corretamente.
  -- COALESCE para false: se p_plan_id não resolve nenhum plano (ex.: não
  -- existe registro de plano "Particular" cadastrado), v_plan_name fica NULL
  -- e a comparação vira NULL (não false) — e "NOT NULL" também é NULL, o que
  -- faz o Postgres pular silenciosamente qualquer "IF ... AND NOT v_is_ams"
  -- (inclusive o bloqueio de 180 dias e a correção de falta abaixo).
  v_is_ams        := COALESCE(UPPER(v_plan_name) = 'AMS PETROBRAS', false);
  v_is_particular := (UPPER(v_plan_name) = 'PARTICULAR' OR v_plan_name IS NULL);

  -- Falta (do paciente OU do psicólogo) de Avaliação Neuropsicológica fora
  -- da AMS Petrobras nunca cobra o valor integral — a avaliação não foi
  -- entregue, independente de qual opção de cobrança foi marcada no
  -- cancelamento. AMS Petrobras tem sua própria regra de falta (bloco
  -- abaixo), que cobra parcialmente via 95090010.
  IF v_app.status = 'canceled' AND p_session_type = 'Avaliação Neuropsicológica' AND NOT v_is_ams THEN
    RETURN QUERY SELECT 0::numeric, 0::numeric, ARRAY['neuropsico_no_show_no_charge'];
    RETURN;
  END IF;

  -- Cancelado sem cobrança = R$0, EXCETO "Falta do Paciente — Isento"
  -- (cancellation_fault='patient_exempt') em convênio: cobra normalmente,
  -- mas sem repasse (bloqueado à parte, fora desta função de preço).
  -- Ver migration 20260806_billing_repass_exempt_rules.sql.
  IF v_app.status = 'canceled' AND v_app.cancellation_billing = 'none' THEN
    IF NOT (v_app.cancellation_fault = 'patient_exempt' AND NOT v_is_particular) THEN
      RETURN QUERY SELECT 0::numeric, 0::numeric, ARRAY['canceled_no_charge'];
      RETURN;
    END IF;
  END IF;

  IF v_is_ams AND p_session_type = 'Avaliação Neuropsicológica' THEN
    v_cycle_start := NULL;
    v_position := -1;
    v_integral_used := false;
    v_code_95090010_count := 0;
    v_charge := NULL;

    -- Fila cronológica única: sessões reais + faltas que geram cobrança ao
    -- convênio (mesma condição usada acima para não zerar o preço).
    FOR v_rec IN
      SELECT id, date, status, cancellation_billing, cancellation_fault
        FROM appointments
       WHERE customer_id = v_app.customer_id
         AND type = 'Avaliação Neuropsicológica'
         AND (
           status <> 'canceled'
           OR (cancellation_billing IS NOT NULL AND cancellation_billing <> 'none')
           OR cancellation_fault = 'patient_exempt'
         )
       ORDER BY date, start_time
    LOOP
      v_attended := (v_rec.status <> 'canceled');

      IF v_cycle_start IS NULL THEN
        v_cycle_start := v_rec.date;
        v_position := 0;
      ELSE
        v_months_diff := (EXTRACT(YEAR FROM v_rec.date) - EXTRACT(YEAR FROM v_cycle_start)) * 12
                       + (EXTRACT(MONTH FROM v_rec.date) - EXTRACT(MONTH FROM v_cycle_start));
        IF v_months_diff >= 10 THEN
          v_cycle_start := v_rec.date;
          v_position := 0;
          v_integral_used := false;
          v_code_95090010_count := 0;
        ELSE
          v_position := v_position + 1;
        END IF;
      END IF;

      IF v_position >= 3 THEN
        v_charge := 'blocked';
      ELSIF v_attended AND NOT v_integral_used THEN
        v_charge := 'integral';
        v_integral_used := true;
      ELSIF v_code_95090010_count < 2 THEN
        v_charge := 'code_95090010';
        v_code_95090010_count := v_code_95090010_count + 1;
      ELSE
        v_charge := 'blocked';
      END IF;

      EXIT WHEN v_rec.id = p_appointment_id;
    END LOOP;

    v_rules := array_append(v_rules, format('ams_neuropsico_position_%s_charge_%s', v_position, v_charge));

    IF v_charge = 'blocked' THEN
      RETURN QUERY SELECT 0::numeric, 0::numeric,
        array_append(v_rules, 'ams_neuropsico_blocked');
      RETURN;
    ELSIF v_charge = 'code_95090010' THEN
      SELECT elem INTO v_procedure
        FROM jsonb_array_elements(v_procedures) elem
       WHERE elem->>'code' = '95090010' LIMIT 1;
      v_base  := COALESCE((v_procedure->>'price')::numeric, 0);
      v_final := COALESCE(v_app.custom_price, (v_procedure->>'price')::numeric, v_customer.custom_price, 0);
      RETURN QUERY SELECT v_base, v_final, array_append(v_rules, 'ams_neuropsico_code_95090010');
      RETURN;
    ELSE -- 'integral'
      SELECT elem INTO v_procedure
        FROM jsonb_array_elements(v_procedures) elem
       WHERE elem->>'type' = 'Avaliação Neuropsicológica' LIMIT 1;
      v_base  := COALESCE((v_procedure->>'price')::numeric, 0);
      v_final := COALESCE(v_app.custom_price, (v_procedure->>'price')::numeric, v_customer.custom_price, 0);
      RETURN QUERY SELECT v_base, v_final, array_append(v_rules, 'ams_neuropsico_integral');
      RETURN;
    END IF;
  END IF;

  IF p_session_type = 'Avaliação Neuropsicológica' AND NOT v_is_ams THEN
    SELECT date INTO v_last_date
      FROM appointments
     WHERE customer_id = v_app.customer_id
       AND type = 'Avaliação Neuropsicológica'
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

  v_proc_by_code := NULL;
  -- Verifica se o código não é apenas vazio ou espaços em branco
  IF v_app.procedure_code IS NOT NULL AND TRIM(v_app.procedure_code) <> '' THEN
    SELECT elem INTO v_proc_by_code
      FROM jsonb_array_elements(v_procedures) elem
     WHERE TRIM(elem->>'code') = TRIM(v_app.procedure_code) LIMIT 1;
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
