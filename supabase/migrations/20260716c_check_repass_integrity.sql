-- Fase 2 da Auditoria — Monitor de paridade financeira do repasse.
--
-- Objetivo: mover a REGRA de repasse (a parte crítica, "onde mora o dinheiro")
-- para o servidor de forma incremental, SEM refatorar todo o cálculo de uma vez.
--
-- Como funciona:
--   O frontend continua calculando o valor bruto (getAppPrice, com todas as
--   regras de neuropsico/AMS) e envia esse gross já pronto. O servidor resolve
--   AUTORITATIVAMENTE a regra do psicólogo (repass_rate / repass_fixed_amount /
--   repass_overrides_plan) — que é a fonte de divergências financeiras — e
--   recalcula o repasse esperado replicando a hierarquia do getRepassValue:
--     1. override do atendimento (app_repass)
--     2. override do paciente (customer_repass)
--     3. contrato pessoal do psicólogo (repass_overrides_plan) → % ou fixo
--     4. valor do plano (plan_repass)
--     5. fallback: regra do psicólogo ou 50%
--
-- O frontend compara o total retornado com o total que ele calculou. Se
-- divergir, bloqueia a gravação e registra em operation_failures (Fase 1).

-- Espelha calcRepass() de src/lib/repassRules.ts
CREATE OR REPLACE FUNCTION calc_repass_rule(
  p_gross         numeric,
  p_repass_rate   numeric,
  p_repass_fixed  numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_rate      numeric;
  v_safe_rate numeric;
BEGIN
  IF p_gross IS NULL OR p_gross <= 0 THEN
    RETURN 0;
  END IF;

  -- Valor fixo tem prioridade (limitado ao bruto)
  IF p_repass_fixed IS NOT NULL AND p_repass_fixed > 0 THEN
    RETURN LEAST(p_repass_fixed, p_gross);
  END IF;

  -- Percentual (default 50%)
  v_rate := COALESCE(p_repass_rate, 0.50);
  -- Aceita tanto 0.40 quanto 40 (converte para decimal)
  v_safe_rate := CASE WHEN v_rate > 1 THEN v_rate / 100 ELSE v_rate END;
  -- Clamp entre 0 e 1
  v_safe_rate := GREATEST(0, LEAST(1, v_safe_rate));

  -- Arredonda para centavos
  RETURN ROUND(p_gross * v_safe_rate, 2);
END;
$$;

-- RPC principal chamada pelo frontend antes de gravar o repasse.
-- p_items: array JSONB, cada item:
--   { "gross": num, "app_repass": num|null, "customer_repass": num|null, "plan_repass": num|null }
-- Retorna: { "expected_total": num, "item_count": int }
CREATE OR REPLACE FUNCTION check_repass_integrity(
  p_psychologist_id uuid,
  p_items           jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate            numeric;
  v_fixed           numeric;
  v_overrides_plan  boolean;
  v_item            jsonb;
  v_gross           numeric;
  v_app_repass      numeric;
  v_customer_repass numeric;
  v_plan_repass     numeric;
  v_expected        numeric;
  v_total_cents     bigint := 0;
  v_count           int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Regra do psicólogo resolvida no SERVIDOR (fonte de verdade)
  SELECT repass_rate, repass_fixed_amount, COALESCE(repass_overrides_plan, false)
    INTO v_rate, v_fixed, v_overrides_plan
    FROM psychologists
   WHERE id = p_psychologist_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_gross           := COALESCE((v_item->>'gross')::numeric, 0);
    v_app_repass      := NULLIF(v_item->>'app_repass', '')::numeric;
    v_customer_repass := NULLIF(v_item->>'customer_repass', '')::numeric;
    v_plan_repass     := NULLIF(v_item->>'plan_repass', '')::numeric;

    -- Hierarquia (espelha getRepassValue de RepassePage.tsx)
    IF v_gross <= 0 THEN
      v_expected := 0;
    ELSIF v_app_repass IS NOT NULL AND v_app_repass > 0 THEN
      v_expected := v_app_repass;
    ELSIF v_customer_repass IS NOT NULL AND v_customer_repass > 0 THEN
      v_expected := v_customer_repass;
    ELSIF v_overrides_plan AND (v_rate IS NOT NULL OR (v_fixed IS NOT NULL AND v_fixed > 0)) THEN
      v_expected := calc_repass_rule(v_gross, v_rate, v_fixed);
    ELSIF v_plan_repass IS NOT NULL AND v_plan_repass > 0 THEN
      v_expected := v_plan_repass;
    ELSE
      v_expected := calc_repass_rule(v_gross, v_rate, v_fixed);
    END IF;

    v_total_cents := v_total_cents + ROUND(v_expected * 100);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'expected_total', (v_total_cents::numeric / 100),
    'item_count', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_repass_integrity(uuid, jsonb) TO authenticated;
