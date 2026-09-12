-- ============================================================================
-- Migration: Corrige politicas de "isolamento" quebradas em appointments/repasses
-- Data: 2026-09-12
-- Causa do bug: a migration 20260803_security_hardening_rls.sql criou as
--        politicas "Isolate appointments by user or psychologist" e
--        "Isolate repasses for target psychologist" com uma subquery
--          EXISTS (SELECT 1 FROM psychologists p
--                  WHERE p.id = auth.uid() AND p.active = true)
--        que NAO referencia a linha de appointments/repasses sendo avaliada.
--        Ou seja, qualquer usuario cujo auth.uid() coincida com o id de
--        QUALQUER psicologo ativo teria acesso a TODAS as linhas da tabela,
--        nao so as suas — o oposto de "isolar". Hoje isso nao concede nada
--        na pratica porque psicologos nao fazem login na SPA (confirmado
--        com o time), mas a logica esta errada e vira uma armadilha se um
--        dia um psicologo vier a logar.
--
--        Alem disso, 20260605_nfse_hardening.sql criou politicas
--        "repasses_auth_select/insert/update/delete" (USING auth.uid() IS
--        NOT NULL) que nunca foram removidas quando o isolamento de agosto
--        foi criado. Como politicas permissivas do mesmo comando se
--        combinam com OR, essas politicas de junho continuam liberando
--        acesso total a qualquer autenticado, anulando o isolamento.
--
-- Correcao: substitui a subquery quebrada por uma checagem real de
--        "e' um membro da equipe" via app_users (fonte real de quem loga
--        no sistema hoje: perfis admin/secretaria), e remove as politicas
--        orfas de repasses.
-- ============================================================================

-- 1. Remove as politicas permissivas orfas de repasses (deixadas por engano)
DROP POLICY IF EXISTS "repasses_auth_select" ON repasses;
DROP POLICY IF EXISTS "repasses_auth_insert" ON repasses;
DROP POLICY IF EXISTS "repasses_auth_update" ON repasses;
DROP POLICY IF EXISTS "repasses_auth_delete" ON repasses;

-- 2. Corrige a politica de appointments
DROP POLICY IF EXISTS "Isolate appointments by user or psychologist" ON appointments;
CREATE POLICY "Isolate appointments by user or psychologist" ON appointments
    FOR ALL TO authenticated
    USING (
      psychologist_id::text = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM app_users u
        WHERE u.user_id = auth.uid() OR u.email = auth.email()
      )
    )
    WITH CHECK (
      psychologist_id::text = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM app_users u
        WHERE u.user_id = auth.uid() OR u.email = auth.email()
      )
    );

-- 3. Corrige a politica de repasses
DROP POLICY IF EXISTS "Isolate repasses for target psychologist" ON repasses;
CREATE POLICY "Isolate repasses for target psychologist" ON repasses
    FOR ALL TO authenticated
    USING (
      psychologist_id::text = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM app_users u
        WHERE u.user_id = auth.uid() OR u.email = auth.email()
      )
    )
    WITH CHECK (
      psychologist_id::text = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM app_users u
        WHERE u.user_id = auth.uid() OR u.email = auth.email()
      )
    );
