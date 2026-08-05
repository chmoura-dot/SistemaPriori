-- ============================================================================
-- Migration: Corrigir RLS da tabela psychologists (política ausente)
-- Data: 2026-08-04
-- Causa do bug: A migration 20260803_security_hardening_rls.sql removeu a
--               política "Allow all for authenticated" da tabela
--               psychologists (DROP POLICY) mas nunca criou uma política
--               substituta. Com RLS habilitado e ZERO políticas, o Postgres
--               nega todo acesso (inclusive SELECT) silenciosamente.
--               Isso fez a aba "Psicólogos" e todos os seletores de
--               "psicólogo responsável" (Agenda, Faturamento, Repasse etc.)
--               ficarem vazios, sem erro aparente no front-end.
-- Efeito colateral: as políticas de appointments/repasses dependem de uma
--               subquery em psychologists (EXISTS ... FROM psychologists),
--               que também era bloqueada, potencialmente ocultando
--               agendamentos/repasses do próprio psicólogo autenticado.
-- Solução: Restaurar política de acesso total para usuários autenticados,
--               mantendo o mesmo padrão já usado em appointments/holidays.
-- ============================================================================

-- Garantir que RLS está habilitado (idempotente)
ALTER TABLE IF EXISTS psychologists ENABLE ROW LEVEL SECURITY;

-- Remover quaisquer políticas conflitantes/antigas antes de recriar
DROP POLICY IF EXISTS "Allow all for authenticated" ON psychologists;
DROP POLICY IF EXISTS "psychologists_authenticated_all" ON psychologists;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON psychologists;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON psychologists;

-- Recriar política que permite acesso total (SELECT/INSERT/UPDATE/DELETE)
-- para qualquer usuário autenticado. Necessário pois a aplicação usa uma
-- única role de app autenticada e diferencia permissões na camada de UI,
-- não no banco.
CREATE POLICY "Allow all for authenticated" ON psychologists
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE psychologists IS
  'Tabela de psicólogos. RLS habilitado: usuários autenticados têm acesso total (SELECT, INSERT, UPDATE, DELETE). Corrigido em 2026-08-04 após regressão causada pelo hardening de 2026-08-03.';
