-- ============================================================================
-- Migration: Flag de contrato pessoal de repasse
-- Data: 2026-06-26
-- Objetivo: Permitir que psicólogos com contrato pessoal (ex: Michelly = 92%)
--           tenham sua regra de repasse priorizada sobre o repassAmount do plano.
--           Psicólogos sem essa flag continuam usando o valor do plano normalmente.
-- ============================================================================

ALTER TABLE psychologists
  ADD COLUMN IF NOT EXISTS repass_overrides_plan BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN psychologists.repass_overrides_plan IS
  'Quando TRUE, a regra do psicólogo (repass_rate ou repass_fixed_amount) sobrepõe o repassAmount do plano. Exemplo: Michelly = 92% do faturamento bruto.';
