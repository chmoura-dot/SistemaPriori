-- ============================================================================
-- Migration: Versionamento de Regras de Repasse
-- Data: 2026-06-05
-- Objetivo: Separar regras de repasse do cadastro de psicólogos para
--           manter histórico auditável e evitar retroatividade acidental.
-- ============================================================================

-- 1. Tabela de versões de regras de repasse
CREATE TABLE IF NOT EXISTS psychologist_repass_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  psychologist_id  UUID NOT NULL REFERENCES psychologists(id) ON DELETE CASCADE,
  rule_type        TEXT NOT NULL DEFAULT 'percentage',  -- 'percentage' | 'fixed' | 'tiered'
  repass_rate      NUMERIC(5,4),                        -- ex: 0.4000 = 40%
  repass_fixed     NUMERIC(10,2),                       -- valor fixo por sessão
  rule_config      JSONB,                               -- configurações avançadas (tiers, exceções)
  valid_from       DATE NOT NULL,                       -- início da vigência
  valid_until      DATE,                                -- NULL = regra vigente
  notes            TEXT,                                 -- motivo da alteração
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID                                  -- user_id de quem criou

  -- Constraint: não pode haver sobreposição de datas para o mesmo psicólogo
  -- (validação no application layer, mas constraint de unicidade para regra vigente)
);

-- 2. Índice para buscar regra vigente por psicólogo
CREATE INDEX IF NOT EXISTS idx_repass_rules_psychologist_valid
  ON psychologist_repass_rules (psychologist_id, valid_from DESC)
  WHERE valid_until IS NULL;

-- 3. Índice para buscar regra válida em uma data específica (cálculos retroativos)
CREATE INDEX IF NOT EXISTS idx_repass_rules_psychologist_date
  ON psychologist_repass_rules (psychologist_id, valid_from, valid_until);

-- 4. RLS: mesma política das demais tabelas (usuário autenticado)
ALTER TABLE psychologist_repass_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_repass_rules"
  ON psychologist_repass_rules FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_insert_repass_rules"
  ON psychologist_repass_rules FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_update_repass_rules"
  ON psychologist_repass_rules FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- 5. Auditoria: trigger de auditoria (usa a mesma função da migration audit_log)
DROP TRIGGER IF EXISTS trg_audit_repass_rules ON psychologist_repass_rules;
CREATE TRIGGER trg_audit_repass_rules
  AFTER INSERT OR UPDATE OR DELETE ON psychologist_repass_rules
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- ============================================================================
-- MIGRAÇÃO DE DADOS: Copiar regras atuais dos psicólogos para a nova tabela
-- (Executa apenas se os campos existirem na tabela psychologists)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'psychologists' AND column_name = 'repass_rate'
  ) THEN
    INSERT INTO psychologist_repass_rules (psychologist_id, rule_type, repass_rate, repass_fixed, valid_from, notes)
    SELECT
      id,
      CASE
        WHEN repass_fixed_amount IS NOT NULL AND repass_fixed_amount > 0 THEN 'fixed'
        ELSE 'percentage'
      END,
      repass_rate,
      repass_fixed_amount,
      COALESCE(created_at::date, CURRENT_DATE),
      'Migrado automaticamente do cadastro de psicólogos'
    FROM psychologists
    WHERE active = true
      AND (repass_rate IS NOT NULL OR repass_fixed_amount IS NOT NULL);

    RAISE NOTICE 'Regras de repasse migradas com sucesso para psychologist_repass_rules.';
  END IF;
END;
$$;

-- ============================================================================
-- NOTA: Os campos repass_rate e repass_fixed_amount na tabela psychologists
-- devem ser mantidos temporariamente para compatibilidade com o código atual.
-- Após a migração do código frontend, eles podem ser removidos.
-- ============================================================================
