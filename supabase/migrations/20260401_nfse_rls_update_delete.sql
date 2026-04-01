-- Adicionar políticas RLS de UPDATE e DELETE para nfse_invoices
-- Necessário para que o upsert (reimportação) e a exclusão de notas funcionem corretamente

CREATE POLICY update_nfse_invoices ON nfse_invoices
FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY delete_nfse_invoices ON nfse_invoices
FOR DELETE
USING (auth.uid() IS NOT NULL);
