-- ============================================================================
-- Migration: Tabela de Auditoria (audit_log)
-- Data: 2026-06-05
-- Objetivo: Rastrear quem acessou/modificou dados sensíveis de pacientes.
-- Base legal: LGPD Art. 37 (registro de operações de tratamento de dados)
--             CFP Resolução 01/2009 (rastreabilidade de prontuários)
-- ============================================================================

-- 1. Criar tabela de auditoria
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,                           -- auth.uid() do operador
  user_email  TEXT,                            -- email para facilitar consulta
  action      TEXT NOT NULL,                   -- 'INSERT', 'UPDATE', 'DELETE'
  table_name  TEXT NOT NULL,                   -- tabela afetada
  record_id   TEXT,                            -- ID do registro afetado
  old_data    JSONB,                           -- snapshot antes da mudança (UPDATE/DELETE)
  new_data    JSONB,                           -- snapshot depois da mudança (INSERT/UPDATE)
  ip_address  INET,                            -- IP do cliente (quando disponível)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Índices para consulta de auditoria
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record
  ON audit_log (table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_user
  ON audit_log (user_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON audit_log (created_at DESC);

-- 3. RLS: somente service_role pode inserir (triggers rodam com SECURITY DEFINER);
--    leitura restrita a administradores autenticados.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Política de leitura: qualquer usuário autenticado pode consultar auditoria
-- (em produção, considere restringir a role 'admin' se houver sistema de roles)
CREATE POLICY "audit_log_select_authenticated"
  ON audit_log FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Política de inserção: apenas via trigger/service_role (não permite insert direto do frontend)
CREATE POLICY "audit_log_insert_service_only"
  ON audit_log FOR INSERT
  WITH CHECK (
    current_setting('role', true) = 'service_role'
    OR current_setting('role', true) = 'postgres'
  );

-- Ninguém pode atualizar ou deletar registros de auditoria
-- (a ausência de policy para UPDATE/DELETE bloqueia essas operações com RLS ativo)

-- 4. Função genérica de trigger para auditoria
CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- roda com permissões do owner (bypass RLS para INSERT)
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID;
  v_email    TEXT;
  v_old      JSONB;
  v_new      JSONB;
BEGIN
  -- Captura o user_id do Supabase Auth (NULL em operações server-side)
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  BEGIN
    v_email := auth.email();
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  -- Dados antes/depois
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSE -- UPDATE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  END IF;

  INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data, new_data)
  VALUES (
    v_user_id,
    v_email,
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id::TEXT, OLD.id::TEXT),
    v_old,
    v_new
  );

  -- Retorna o registro para não bloquear a operação original
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 5. Ativar triggers nas tabelas sensíveis

-- Auditoria em customers (dados pessoais de pacientes — LGPD)
DROP TRIGGER IF EXISTS trg_audit_customers ON customers;
CREATE TRIGGER trg_audit_customers
  AFTER INSERT OR UPDATE OR DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- Auditoria em appointments (agendamentos vinculados a pacientes)
DROP TRIGGER IF EXISTS trg_audit_appointments ON appointments;
CREATE TRIGGER trg_audit_appointments
  AFTER INSERT OR UPDATE OR DELETE ON appointments
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- Auditoria em discharge_events (registros de alta)
-- Só cria o trigger se a tabela existir (pode não ter sido migrada ainda)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'discharge_events') THEN
    DROP TRIGGER IF EXISTS trg_audit_discharge_events ON discharge_events;
    CREATE TRIGGER trg_audit_discharge_events
      AFTER INSERT OR UPDATE OR DELETE ON discharge_events
      FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
  ELSE
    RAISE NOTICE 'Tabela discharge_events não encontrada — trigger de auditoria ignorado.';
  END IF;
END;
$$;

-- ============================================================================
-- NOTA: Esta tabela cresce continuamente. Considere criar uma política de
-- retenção (ex: DELETE WHERE created_at < NOW() - INTERVAL '5 years')
-- executada via pg_cron mensalmente.
-- ============================================================================
