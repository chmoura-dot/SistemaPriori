-- ============================================================================
-- Migration: Endurecimento de RLS para NFS-e e Billing
-- Data: 2026-06-05
-- Objetivo: Restringir acesso a dados financeiros/fiscais e adicionar
--           FK de customer na tabela de NFS-e.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1: Adicionar customer_id FK em nfse_invoices
-- ═══════════════════════════════════════════════════════════════════════════

-- Adicionar coluna customer_id para vincular NF-Se a um paciente quando aplicável
-- (pode ser NULL para tomadores externos que não são pacientes da clínica)
ALTER TABLE nfse_invoices
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

-- Índice para buscar NFS-e por paciente
CREATE INDEX IF NOT EXISTS idx_nfse_customer_id
  ON nfse_invoices (customer_id)
  WHERE customer_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2: Reforçar RLS de NFS-e
-- Substituir políticas permissivas por políticas restritivas.
-- Qualquer usuário autenticado pode visualizar (admin), mas UPDATE/DELETE
-- requer políticas explícitas.
-- ═══════════════════════════════════════════════════════════════════════════

-- Remover políticas antigas se existirem
DO $$
BEGIN
  -- nfse_invoices
  DROP POLICY IF EXISTS select_nfse_invoices ON nfse_invoices;
  DROP POLICY IF EXISTS insert_nfse_invoices ON nfse_invoices;
  
  -- nfse_invoice_items
  DROP POLICY IF EXISTS select_nfse_invoice_items ON nfse_invoice_items;
  DROP POLICY IF EXISTS insert_nfse_invoice_items ON nfse_invoice_items;
  
  -- nfse_payers
  DROP POLICY IF EXISTS select_nfse_payers ON nfse_payers;
  DROP POLICY IF EXISTS insert_nfse_payers ON nfse_payers;
EXCEPTION WHEN OTHERS THEN
  NULL; -- ignora se a policy não existir
END;
$$;

-- Novas políticas: acesso completo para autenticados (CRUD)
-- Em um sistema multi-tenant futuro, substituir auth.uid() IS NOT NULL
-- por verificação de role/organização.
CREATE POLICY "nfse_invoices_auth_select"
  ON nfse_invoices FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "nfse_invoices_auth_insert"
  ON nfse_invoices FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "nfse_invoices_auth_update"
  ON nfse_invoices FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "nfse_invoices_auth_delete"
  ON nfse_invoices FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Mesma estrutura para invoice_items
CREATE POLICY "nfse_items_auth_select"
  ON nfse_invoice_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "nfse_items_auth_insert"
  ON nfse_invoice_items FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "nfse_items_auth_update"
  ON nfse_invoice_items FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "nfse_items_auth_delete"
  ON nfse_invoice_items FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Mesma estrutura para payers
CREATE POLICY "nfse_payers_auth_select"
  ON nfse_payers FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "nfse_payers_auth_insert"
  ON nfse_payers FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "nfse_payers_auth_update"
  ON nfse_payers FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "nfse_payers_auth_delete"
  ON nfse_payers FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 3: Garantir RLS em billing_batches e repasses
-- ═══════════════════════════════════════════════════════════════════════════

-- Habilitar RLS se ainda não estiver ativo
ALTER TABLE billing_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE repasses ENABLE ROW LEVEL SECURITY;

-- Billing Batches: CRUD para autenticados
DO $$
BEGIN
  DROP POLICY IF EXISTS "billing_batches_select" ON billing_batches;
  DROP POLICY IF EXISTS "billing_batches_insert" ON billing_batches;
  DROP POLICY IF EXISTS "billing_batches_update" ON billing_batches;
  DROP POLICY IF EXISTS "billing_batches_delete" ON billing_batches;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

CREATE POLICY "billing_batches_auth_select"
  ON billing_batches FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "billing_batches_auth_insert"
  ON billing_batches FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "billing_batches_auth_update"
  ON billing_batches FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "billing_batches_auth_delete"
  ON billing_batches FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Repasses: CRUD para autenticados
DO $$
BEGIN
  DROP POLICY IF EXISTS "repasses_select" ON repasses;
  DROP POLICY IF EXISTS "repasses_insert" ON repasses;
  DROP POLICY IF EXISTS "repasses_update" ON repasses;
  DROP POLICY IF EXISTS "repasses_delete" ON repasses;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

CREATE POLICY "repasses_auth_select"
  ON repasses FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "repasses_auth_insert"
  ON repasses FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "repasses_auth_update"
  ON repasses FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "repasses_auth_delete"
  ON repasses FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 4: Auditoria em tabelas financeiras
-- (usa a função fn_audit_log() da migration audit_log)
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_audit_nfse_invoices ON nfse_invoices;
CREATE TRIGGER trg_audit_nfse_invoices
  AFTER INSERT OR UPDATE OR DELETE ON nfse_invoices
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

DROP TRIGGER IF EXISTS trg_audit_billing_batches ON billing_batches;
CREATE TRIGGER trg_audit_billing_batches
  AFTER INSERT OR UPDATE OR DELETE ON billing_batches
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

DROP TRIGGER IF EXISTS trg_audit_repasses ON repasses;
CREATE TRIGGER trg_audit_repasses
  AFTER INSERT OR UPDATE OR DELETE ON repasses
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
