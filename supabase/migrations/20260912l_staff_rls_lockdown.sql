-- ============================================================================
-- Migration: Fase 6 — trava geral de RLS por membership em app_users
-- Data: 2026-09-12
-- Causa: auditoria de todas as policies do schema `public` (pg_policies)
--        revelou uma policy "Allow full access for authenticated users"
--        (USING true, comando ALL) presente em quase toda tabela sensível —
--        e, em várias tabelas sem esse nome, o mesmo problema com outro
--        nome ("Allow all for authenticated", "*_auth_select/insert/
--        update/delete", "authenticated_*_repass_rules" etc., a maioria
--        remanescente de `20260605_nfse_hardening.sql`). Como policies RLS
--        se combinam com OR, qualquer uma dessas sozinha já libera acesso
--        total a QUALQUER conta autenticada no Supabase Auth do projeto —
--        inclusive uma nunca vinculada a `app_users` — independente de
--        qualquer policy mais restrita já existente (inclusive as
--        adicionadas nas migrations 20260912/b/c/d desta mesma rodada).
-- Correção: para cada tabela abaixo, cria (quando ainda não existe) uma
--        policy exigindo membership em `app_users` (staff — admin OU
--        secretaria, mesmo padrão já usado em customers/appointments/
--        repasses/settings) e SÓ DEPOIS remove a(s) policy(ies) permissiva(s)
--        antiga(s) — nessa ordem, para nunca haver uma janela sem policy
--        de acesso válida. Em `app_users`/`appointments`/`customers`/
--        `repasses`/`settings` a policy restrita já existe (de migrations
--        anteriores) — só a permissiva redundante é removida.
-- Escopo mantido conservador: cada tabela recebe policy só para os comandos
--        (SELECT/INSERT/UPDATE/DELETE) que já tinham alguma policy
--        interativa antes — não é concedida nenhuma capacidade nova (ex.:
--        `psychologist_repass_rules`/`discharge_events`/`operation_failures`
--        nunca tiveram DELETE liberado para usuários comuns; continuam sem).
-- ============================================================================

-- Predicado padrão reaproveitado em todas as policies novas abaixo:
--   EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email())

-- ── Categoria A: já têm policy restrita por app_users — só remove a permissiva redundante ──

DROP POLICY IF EXISTS "Allow full access for authenticated users" ON app_users;
DROP POLICY IF EXISTS "Allow full access for authenticated users" ON appointments;
DROP POLICY IF EXISTS "Allow full access for authenticated users" ON customers;
DROP POLICY IF EXISTS "Allow full access for authenticated users" ON repasses;
DROP POLICY IF EXISTS "Allow full access for authenticated users" ON settings;

-- ── Categoria B: só tinham policy permissiva — cria a restrita, depois remove a antiga ──

-- billing_batches
CREATE POLICY "billing_batches_staff_all" ON billing_batches
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "Allow full access for authenticated users" ON billing_batches;
DROP POLICY IF EXISTS "billing_batches_auth_delete" ON billing_batches;
DROP POLICY IF EXISTS "billing_batches_auth_insert" ON billing_batches;
DROP POLICY IF EXISTS "billing_batches_auth_select" ON billing_batches;
DROP POLICY IF EXISTS "billing_batches_auth_update" ON billing_batches;

-- expenses
CREATE POLICY "expenses_staff_all" ON expenses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "Allow full access for authenticated users" ON expenses;

-- payments
CREATE POLICY "payments_staff_all" ON payments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "Allow full access for authenticated users" ON payments;

-- plans
CREATE POLICY "plans_staff_all" ON plans
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "Allow full access for authenticated users" ON plans;

-- rooms
CREATE POLICY "rooms_staff_all" ON rooms
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "Allow full access for authenticated users" ON rooms;

-- subscriptions
CREATE POLICY "subscriptions_staff_all" ON subscriptions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "Allow full access for authenticated users" ON subscriptions;

-- clinic_closures
CREATE POLICY "clinic_closures_staff_all" ON clinic_closures
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "Allow all for authenticated" ON clinic_closures;

-- holidays
CREATE POLICY "holidays_staff_all" ON holidays
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "Allow all for authenticated" ON holidays;

-- psychologists
CREATE POLICY "psychologists_staff_all" ON psychologists
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "Allow all for authenticated" ON psychologists;

-- waiting_list
CREATE POLICY "waiting_list_staff_all" ON waiting_list
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "Allow all for authenticated users" ON waiting_list;

-- nfse_invoices
CREATE POLICY "nfse_invoices_staff_all" ON nfse_invoices
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "nfse_invoices_auth_delete" ON nfse_invoices;
DROP POLICY IF EXISTS "nfse_invoices_auth_insert" ON nfse_invoices;
DROP POLICY IF EXISTS "nfse_invoices_auth_select" ON nfse_invoices;
DROP POLICY IF EXISTS "nfse_invoices_auth_update" ON nfse_invoices;

-- nfse_invoice_items
CREATE POLICY "nfse_invoice_items_staff_all" ON nfse_invoice_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "nfse_items_auth_delete" ON nfse_invoice_items;
DROP POLICY IF EXISTS "nfse_items_auth_insert" ON nfse_invoice_items;
DROP POLICY IF EXISTS "nfse_items_auth_select" ON nfse_invoice_items;
DROP POLICY IF EXISTS "nfse_items_auth_update" ON nfse_invoice_items;

-- nfse_payers
CREATE POLICY "nfse_payers_staff_all" ON nfse_payers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "nfse_payers_auth_delete" ON nfse_payers;
DROP POLICY IF EXISTS "nfse_payers_auth_insert" ON nfse_payers;
DROP POLICY IF EXISTS "nfse_payers_auth_select" ON nfse_payers;
DROP POLICY IF EXISTS "nfse_payers_auth_update" ON nfse_payers;

-- psychologist_repass_rules (nunca teve DELETE liberado para usuário comum — continua sem)
CREATE POLICY "repass_rules_staff_select" ON psychologist_repass_rules
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
CREATE POLICY "repass_rules_staff_insert" ON psychologist_repass_rules
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
CREATE POLICY "repass_rules_staff_update" ON psychologist_repass_rules
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "authenticated_insert_repass_rules" ON psychologist_repass_rules;
DROP POLICY IF EXISTS "authenticated_select_repass_rules" ON psychologist_repass_rules;
DROP POLICY IF EXISTS "authenticated_update_repass_rules" ON psychologist_repass_rules;

-- discharge_events (nunca teve DELETE liberado para usuário comum — continua sem;
-- a policy de INSERT já existente se chamava "Service role can insert..." mas na
-- prática valia para role authenticated — mantido o mesmo comando, só travado por staff)
CREATE POLICY "discharge_events_staff_select" ON discharge_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
CREATE POLICY "discharge_events_staff_update" ON discharge_events
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
CREATE POLICY "discharge_events_staff_insert" ON discharge_events
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "Authenticated users can read discharge_events" ON discharge_events;
DROP POLICY IF EXISTS "Authenticated users can update discharge_events" ON discharge_events;
DROP POLICY IF EXISTS "Service role can insert discharge_events" ON discharge_events;

-- operation_failures (nunca teve INSERT/DELETE liberado para usuário comum —
-- continua sem; gravação é feita via RPC log_operation_failure, SECURITY DEFINER)
CREATE POLICY "operation_failures_staff_select" ON operation_failures
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
CREATE POLICY "operation_failures_staff_update" ON operation_failures
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "operation_failures_select_authenticated" ON operation_failures;
DROP POLICY IF EXISTS "operation_failures_update_authenticated" ON operation_failures;

-- automation_logs (INSERT já era restrito a service_role — não mexido; só o SELECT)
CREATE POLICY "automation_logs_staff_select" ON automation_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));
DROP POLICY IF EXISTS "Allow read for authenticated users" ON automation_logs;
