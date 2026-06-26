-- ============================================================================
-- Migration: Constraint de unicidade para repasses
-- Data: 2026-06-26
-- Objetivo: Impedir repasses duplicados para o mesmo par (psicólogo + lote).
--           Antes dessa constraint, a verificação existia apenas no frontend
--           (em memória), o que permitia duplicação em cliques simultâneos.
-- ============================================================================

-- 1. Limpar possíveis duplicatas existentes antes de criar a constraint
-- Mantém o repasse mais recente (maior created_at) e remove os duplicados
DELETE FROM repasses
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY psychologist_id, billing_batch_id
             ORDER BY created_at DESC
           ) AS rn
    FROM repasses
  ) sub
  WHERE rn > 1
);

-- 2. Adicionar constraint de unicidade
ALTER TABLE repasses
  ADD CONSTRAINT uq_repasse_psychologist_batch
  UNIQUE (psychologist_id, billing_batch_id);

-- 3. Comentário na constraint para documentação
COMMENT ON CONSTRAINT uq_repasse_psychologist_batch ON repasses IS
  'Garante que cada psicólogo tenha no máximo um repasse por lote de faturamento.';
