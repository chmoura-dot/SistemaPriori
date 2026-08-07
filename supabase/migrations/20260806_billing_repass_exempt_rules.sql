-- ============================================================================
-- Migration: Falta do Psicólogo (todos os convênios) + Falta do Paciente Isento
-- Data: 2026-08-06
-- ============================================================================
--
-- CONTEXTO DE NEGÓCIO
-- --------------------------------------------------------------------------
-- 1) Falta do Psicólogo (cancellation_fault='psychologist'):
--    Antes: AMS Petrobras e Particular eram tratados como isentos
--    (cancellation_billing='none'), o que zerava o preço e removia o
--    atendimento do faturamento. Agora, TODOS os planos de saúde (incluindo
--    AMS Petrobras) devem ser cobrados normalmente do convênio — a
--    autorização por sessão já foi consumida —, mantendo o repasse ao
--    psicólogo sempre bloqueado (isRepassBlocked, inalterado). Somente
--    Particular continua isento (não se cobra do paciente por falha da
--    clínica).
--
-- 2) Falta do Paciente — "Isento" (nova categoria cancellation_fault=
--    'patient_exempt'):
--    Quando a secretária escolhe "Falta do Paciente — Não Cobrar (Isento)"
--    para um paciente de CONVÊNIO, o sistema passa a cobrar o convênio
--    normalmente (autorização já consumida), mas SEM repasse ao psicólogo.
--    Para paciente PARTICULAR, o comportamento permanece: não cobra e não
--    repassa.
--    Esta categoria é distinta de 'patient' para não colidir com a RPC
--    discharge_customer (Alta/Encerramento de Tratamento), que também grava
--    cancellation_billing='none' + cancellation_fault='patient' e NUNCA deve
--    passar a cobrar o convênio.
--    IMPORTANTE: por essa mesma razão de ambiguidade histórica (registros
--    antigos de "Isento" e de "Alta" são indistinguíveis no banco — ambos
--    usam 'patient'), esta migration NÃO reclassifica retroativamente casos
--    de "Falta do Paciente — Isento" já existentes. A nova categoria
--    'patient_exempt' vale apenas para cancelamentos registrados a partir da
--    atualização do código-fonte.
--
-- ESCOPO DESTA MIGRATION
-- --------------------------------------------------------------------------
--   a) Amplia o CHECK constraint de cancellation_fault para aceitar o novo
--      valor 'patient_exempt'.
--   b) Corrige RETROATIVAMENTE os registros de "Falta do Psicólogo" em
--      convênios (exceto Particular) que foram gravados como
--      cancellation_billing='none' (regra antiga) — passam a 'plan', o que
--      os torna novamente elegíveis para faturamento.
-- ============================================================================

-- ── 1. Amplia o CHECK constraint de cancellation_fault ─────────────────────
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_cancellation_fault_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_cancellation_fault_check
  CHECK (cancellation_fault IS NULL OR cancellation_fault IN ('patient', 'patient_exempt', 'psychologist'));

COMMENT ON COLUMN appointments.cancellation_fault IS
  'De quem foi a falta em um cancelamento: patient (cobra e repassa normalmente), patient_exempt (falta do paciente ''Isento'' — cobra o convênio mas SEM repasse ao psicólogo; particular não cobra nem repassa), psychologist (falta do profissional — cobra convênio mas SEM repasse; particular isento). NULL para não cancelados ou legado.';

-- ── 2. Corrige retroativamente: Falta do Psicólogo em convênios ────────────
-- Antes desta mudança, resolvePsychologistAbsenceBilling() classificava AMS
-- Petrobras como isento ('none'). Esses registros ficaram fora do
-- faturamento indevidamente. Agora AMS (e qualquer outro convênio) deve
-- cobrar normalmente ('plan'). Particular permanece intocado.
UPDATE appointments a
   SET cancellation_billing = 'plan'
  FROM customers c
 WHERE a.customer_id = c.id
   AND a.status = 'canceled'
   AND a.cancellation_fault = 'psychologist'
   AND a.cancellation_billing = 'none'
   AND COALESCE(a.health_plan_at_time, c.health_plan) IS DISTINCT FROM 'Particular';

-- ── 3. Espelha a mesma regra em get_appointment_price (shadow calculation) ──
-- Réplica fiel da mudança em src/lib/pricing.ts::getAppPrice, para que
-- validate_price_parity não acuse divergência crítica quando o frontend
-- passar a cobrar (a) falta do psicólogo em qualquer convênio ou (b) falta
-- do paciente 'patient_exempt' em convênio.
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

  v_is_ams        := (v_plan_name = 'AMS Petrobras');
  v_is_particular := (v_plan_name = 'Particular' OR v_plan_name IS NULL);

  -- 1. Cancelado sem cobrança = R$0, EXCETO "Falta do Paciente — Isento"
  --    (cancellation_fault='patient_exempt') em convênio: cobra normalmente,
  --    mas sem repasse (bloqueado à parte, fora desta função de preço).
  IF v_app.status = 'canceled' AND v_app.cancellation_billing = 'none' THEN
    IF NOT (v_app.cancellation_fault = 'patient_exempt' AND NOT v_is_particular) THEN
      RETURN QUERY SELECT 0::numeric, 0::numeric, ARRAY['canceled_no_charge'];
      RETURN;
    END IF;
  END IF;

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
