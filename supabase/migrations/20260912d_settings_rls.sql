-- ============================================================================
-- Migration: RLS para settings (guarda zapi_token, segredo de integracao)
-- Data: 2026-09-12
-- Causa: nenhuma migration versionada habilita/restringe RLS em `settings`,
--        que guarda o token da integracao de WhatsApp (Z-API). Restringe a
--        leitura/escrita a administradores.
-- ============================================================================

ALTER TABLE IF EXISTS settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_admin_only" ON settings;
CREATE POLICY "settings_admin_only" ON settings
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
