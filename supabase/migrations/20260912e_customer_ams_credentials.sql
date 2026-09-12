-- ============================================================================
-- Migration: Isola a senha AMS/PAE em tabela propria, restrita a staff
-- Data: 2026-09-12
-- Causa: `customers.ams_password` era selecionada em texto puro por
--        `getCustomers()`, usado por praticamente toda tela que lista
--        pacientes (Agenda, Financeiro, Dashboard, CustomersPage...), ou
--        seja, a senha do portal do convenio de CADA paciente trafegava
--        para o navegador em contextos que nada tem a ver com a tela de
--        senhas AMS. Existia ate uma view `customers_masked` criada para
--        mascarar isso, mas nenhum codigo do app a usava.
-- Correcao: mover a senha para uma tabela dedicada, restrita a quem
--        realmente e' membro da equipe (`app_users` — admin ou secretaria;
--        decisao do time: ambos os perfis usam essa tela no dia a dia).
--        Isso ja fecha a exposicao original, que vazava para QUALQUER
--        conta Supabase Auth autenticada, mesmo sem vinculo com a equipe.
--        `ams_password_expiry` PERMANECE em `customers` — e' so uma data,
--        usada em alertas de "campos incompletos" em varias telas, sem
--        conteudo sensivel.
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_ams_credentials (
  customer_id  UUID PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  ams_password TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   TEXT
);

ALTER TABLE customer_ams_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ams_credentials_select_admin" ON customer_ams_credentials;
DROP POLICY IF EXISTS "ams_credentials_select_staff" ON customer_ams_credentials;
CREATE POLICY "ams_credentials_select_staff" ON customer_ams_credentials
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users u
      WHERE u.user_id = auth.uid() OR u.email = auth.email()
    )
  );

DROP POLICY IF EXISTS "ams_credentials_write_staff" ON customer_ams_credentials;
CREATE POLICY "ams_credentials_write_staff" ON customer_ams_credentials
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users u
      WHERE u.user_id = auth.uid() OR u.email = auth.email()
    )
  );

DROP POLICY IF EXISTS "ams_credentials_update_staff" ON customer_ams_credentials;
CREATE POLICY "ams_credentials_update_staff" ON customer_ams_credentials
  FOR UPDATE
  TO authenticated
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

-- Backfill: copia as senhas ja cadastradas antes de remover a coluna antiga
INSERT INTO customer_ams_credentials (customer_id, ams_password)
SELECT id, ams_password
  FROM customers
 WHERE ams_password IS NOT NULL
ON CONFLICT (customer_id) DO NOTHING;

-- A view existia so para mascarar ams_password em listagens; precisa ser
-- derrubada ANTES da coluna (ela depende de `ams_password`). Nenhum codigo
-- do app a referencia.
DROP VIEW IF EXISTS customers_masked;

ALTER TABLE customers DROP COLUMN IF EXISTS ams_password;
