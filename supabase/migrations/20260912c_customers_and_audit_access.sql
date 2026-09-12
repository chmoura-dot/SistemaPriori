-- ============================================================================
-- Migration: Restringe customers e audit_log a membros reais da equipe
-- Data: 2026-09-12
-- Objetivo:
--   - customers: trocar "qualquer autenticado" por "cadastrado em app_users"
--     (staff real). Nao restringe nada para quem ja usa o sistema hoje —
--     so fecha a porta para uma conta Supabase Auth futura sem vinculo com
--     a equipe (ex.: um psicologo convidado que nunca deveria ler prontuario
--     de todos os pacientes).
--   - audit_log: a trilha de auditoria (guarda snapshots antes/depois de
--     customers/appointments) e' uma ferramenta administrativa — a propria
--     migration original (20260605_audit_log.sql) ja comentava "em producao,
--     considere restringir a role admin". Aplicando isso agora.
-- ============================================================================

DROP POLICY IF EXISTS "Restrict customers access to authenticated staff" ON customers;
CREATE POLICY "Restrict customers access to authenticated staff" ON customers
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM app_users u
        WHERE u.user_id = auth.uid() OR u.email = auth.email()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM app_users u
        WHERE u.user_id = auth.uid() OR u.email = auth.email()
      )
    );

DROP POLICY IF EXISTS "audit_log_select_authenticated" ON audit_log;
CREATE POLICY "audit_log_select_admin" ON audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users u
      WHERE (u.user_id = auth.uid() OR u.email = auth.email())
        AND u.role = 'admin'
    )
  );
