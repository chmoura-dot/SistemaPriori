-- ============================================================================
-- Migration: Isola a chave PIX do psicologo em tabela propria, restrita a staff
-- Data: 2026-09-12
-- Causa: RLS de `psychologists` e' `USING (true)` para QUALQUER autenticado
--        (decisao documentada em 20260804_fix_psychologists_rls_policy.sql,
--        necessaria porque a lista de psicologos e' usada em varios
--        seletores da aplicacao) — ou seja, ate uma conta Supabase Auth sem
--        vinculo com a equipe (ex.: um psicologo convidado no futuro)
--        conseguiria ler a chave PIX de qualquer psicologo.
-- Correcao: mover a chave PIX para uma tabela dedicada, restrita a quem
--        realmente e' membro da equipe (`app_users` — admin ou secretaria;
--        decisao do time: ambos os perfis usam essa tela no dia a dia).
--        A tabela `psychologists` continua com RLS aberta a staff (nome,
--        telefone, especialidades, disponibilidade — necessario para
--        agenda/selecao de psicologo), sem o dado bancario sensivel.
-- ============================================================================

CREATE TABLE IF NOT EXISTS psychologist_bank_info (
  psychologist_id UUID PRIMARY KEY REFERENCES psychologists(id) ON DELETE CASCADE,
  pix_key_type    TEXT,
  pix_key         TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE psychologist_bank_info ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_info_select_admin" ON psychologist_bank_info;
DROP POLICY IF EXISTS "bank_info_select_staff" ON psychologist_bank_info;
CREATE POLICY "bank_info_select_staff" ON psychologist_bank_info
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users u
      WHERE u.user_id = auth.uid() OR u.email = auth.email()
    )
  );

DROP POLICY IF EXISTS "bank_info_insert_staff" ON psychologist_bank_info;
CREATE POLICY "bank_info_insert_staff" ON psychologist_bank_info
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users u
      WHERE u.user_id = auth.uid() OR u.email = auth.email()
    )
  );

DROP POLICY IF EXISTS "bank_info_update_staff" ON psychologist_bank_info;
CREATE POLICY "bank_info_update_staff" ON psychologist_bank_info
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

-- Backfill a partir das colunas antigas
INSERT INTO psychologist_bank_info (psychologist_id, pix_key_type, pix_key)
SELECT id, pix_key_type, pix_key
  FROM psychologists
 WHERE pix_key IS NOT NULL OR pix_key_type IS NOT NULL
ON CONFLICT (psychologist_id) DO NOTHING;

ALTER TABLE psychologists DROP COLUMN IF EXISTS pix_key;
ALTER TABLE psychologists DROP COLUMN IF EXISTS pix_key_type;
