-- Adicionar coluna invoice_number e restrição de unicidade para evitar duplicatas
ALTER TABLE nfse_invoices ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50);
ALTER TABLE nfse_invoices ADD CONSTRAINT unique_invoice_number UNIQUE (invoice_number);
