-- ============================================================================
-- Migration: HOTFIX — recursão infinita no RLS de app_users
-- Data: 2026-09-12
-- Causa: `20260912_app_users_rls.sql` criou as policies de `app_users`
--        (`app_users_select_self`, `app_users_admin_write`) com uma
--        subquery `EXISTS (SELECT 1 FROM app_users u WHERE ...)` DENTRO da
--        própria policy da tabela `app_users` — ou seja, a policy de
--        app_users lê app_users, o que reavalia a mesma policy de novo.
--        Isso ficou mascarado até agora pela policy permissiva "Allow full
--        access for authenticated users" (removida na Fase 6, migration
--        20260912l): como o Postgres combina policies permissivas com OR,
--        bastava a permissiva (USING true) já ser verdadeira para o
--        planejador não precisar avaliar as recursivas. Ao remover a
--        permissiva, a recursão passou a estourar em QUALQUER leitura que
--        dependa de `app_users` — ou seja, todas as tabelas que checam
--        staff via `EXISTS (SELECT 1 FROM app_users ...)` (praticamente
--        todo o sistema): "infinite recursion detected in policy for
--        relation app_users". Confirmado quebrando o sistema inteiro em
--        produção para qualquer usuário autenticado.
-- Correção: duas funções SECURITY DEFINER (`is_app_staff`/`is_app_admin`)
--        que consultam `app_users` como o DONO da tabela (bypassa RLS —
--        mesmo mecanismo já usado por `inactivate_customer`,
--        `register_subscription_payment` etc.), quebrando o ciclo. As
--        policies de `app_users` passam a usar essas funções em vez da
--        subquery recursiva inline.
-- ============================================================================

CREATE OR REPLACE FUNCTION is_app_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_users u
    WHERE u.user_id = auth.uid() OR u.email = auth.email()
  );
$$;

CREATE OR REPLACE FUNCTION is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_users u
    WHERE (u.user_id = auth.uid() OR u.email = auth.email())
      AND u.role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION is_app_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION is_app_admin() TO authenticated;

DROP POLICY IF EXISTS "app_users_select_self" ON app_users;
CREATE POLICY "app_users_select_self" ON app_users
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR email = auth.email()
    OR is_app_admin()
  );

DROP POLICY IF EXISTS "app_users_admin_write" ON app_users;
CREATE POLICY "app_users_admin_write" ON app_users
  FOR ALL
  TO authenticated
  USING (is_app_admin())
  WITH CHECK (is_app_admin());
