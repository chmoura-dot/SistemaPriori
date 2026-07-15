-- ============================================================================
-- Migration: health_plan_at_time
-- Adiciona snapshot do plano de saúde vigente no momento de criação do agendamento.
-- Isso garante que mudanças futuras no cadastro do paciente (ex: Particular → AMS)
-- NÃO afetem retroativamente o faturamento de sessões já realizadas.
-- ============================================================================

-- 1. Novo campo (nullable — compatível com agendamentos existentes)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS health_plan_at_time TEXT;

-- 2. Backfill: popula agendamentos existentes com o plano ATUAL do paciente.
--    É a melhor aproximação possível para dados históricos.
--    Agendamentos internos (sem customer_id) são ignorados.
UPDATE appointments a
SET health_plan_at_time = c.health_plan
FROM customers c
WHERE a.customer_id = c.id
  AND a.health_plan_at_time IS NULL
  AND a.is_internal = false;

-- 3. Índice para otimizar filtros de faturamento por plano histórico
CREATE INDEX IF NOT EXISTS idx_appointments_health_plan_at_time
  ON appointments (health_plan_at_time)
  WHERE health_plan_at_time IS NOT NULL;
