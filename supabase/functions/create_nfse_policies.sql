-- Habilitar RLS nas tabelas
ALTER TABLE nfse_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfse_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfse_payers ENABLE ROW LEVEL SECURITY;

-- Criar políticas para permitir acesso a usuários autenticados
CREATE POLICY select_nfse_invoices ON nfse_invoices
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY insert_nfse_invoices ON nfse_invoices
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY select_nfse_invoice_items ON nfse_invoice_items
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY insert_nfse_invoice_items ON nfse_invoice_items
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY select_nfse_payers ON nfse_payers
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY insert_nfse_payers ON nfse_payers
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);