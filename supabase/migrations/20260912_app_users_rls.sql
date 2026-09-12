-- ============================================================================
-- Migration: RLS para app_users
-- Data: 2026-09-12
-- Causa: auditoria de segurança encontrou que a tabela app_users (guarda quem
--        é 'admin'/'secretaria') nunca teve RLS versionado em migration —
--        não há garantia de que o banco proteja essa tabela.
-- Objetivo: garantir RLS ativo, permitindo que cada usuário leia apenas a
--        própria linha (necessário para o login funcionar, que lê o próprio
--        role por e-mail), e que só admins possam criar/alterar/remover
--        linhas de app_users (evita que uma secretaria se autopromova).
-- ============================================================================

ALTER TABLE IF EXISTS app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_users_select_self" ON app_users;
CREATE POLICY "app_users_select_self" ON app_users
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR email = auth.email()
    OR EXISTS (
      SELECT 1 FROM app_users u
      WHERE (u.user_id = auth.uid() OR u.email = auth.email())
        AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "app_users_admin_write" ON app_users;
CREATE POLICY "app_users_admin_write" ON app_users
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users u
      WHERE (u.user_id = auth.uid() OR u.email = auth.email())
        AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users u
      WHERE (u.user_id = auth.uid() OR u.email = auth.email())
        AND u.role = 'admin'
    )
  );
