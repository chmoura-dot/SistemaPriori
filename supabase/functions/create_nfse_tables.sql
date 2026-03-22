-- Tabela para armazenar as notas fiscais
CREATE TABLE nfse_invoices (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    issue_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL, -- rascunho, emitida, cancelada
    payer JSONB NOT NULL, -- { nome: string, cpf_cnpj: string }
    total_amount NUMERIC(10, 2) NOT NULL,
    description TEXT,
    pdf_url TEXT
);

-- Tabela para armazenar os itens da nota fiscal
CREATE TABLE nfse_invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INT REFERENCES nfse_invoices(id) ON DELETE CASCADE,
    source_type VARCHAR(20) NOT NULL, -- appointment, subscription, billing_batch
    source_id INT NOT NULL, -- ID do item
    amount NUMERIC(10, 2) NOT NULL,
    description TEXT
);

-- Tabela para armazenar tomadores frequentes
CREATE TABLE nfse_payers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    cpf_cnpj VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);