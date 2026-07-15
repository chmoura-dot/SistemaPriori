-- ============================================================================
-- Migration: Corrigir RLS da tabela psychologists (política DELETE)
-- Data: 2026-07-15
-- Causa do bug: RLS habilitado sem política FOR ALL/DELETE bloqueava
--               silenciosamente a exclusão de psicólogos via frontend.
-- Solução: Criar política FOR ALL (mesmo padrão de appointments/holidays).
-- ============================================================================

-- Garantir que RLS está habilitado
ALTER TABLE psychologists ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas para evitar conflito
DROP POLICY IF EXISTS "Allow all for authenticated" ON psychologists;
DROP POLICY IF EXISTS "psychologists_authenticated_all" ON psychologists;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON psychologists;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON psychologists;

-- Criar política que permite TUDO para usuários autenticados
CREATE POLICY "Allow all for authenticated" ON psychologists
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE psychologists IS
  'Tabela de psicólogos. RLS habilitado: apenas usuários autenticados têm acesso total (SELECT, INSERT, UPDATE, DELETE).';
