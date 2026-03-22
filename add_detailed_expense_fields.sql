-- Adiciona novos campos detalhados à tabela de despesas
ALTER TABLE expenses ADD COLUMN beneficiary TEXT;
ALTER TABLE expenses ADD COLUMN razao_social TEXT;
ALTER TABLE expenses ADD COLUMN nome_fantasia TEXT;
ALTER TABLE expenses ADD COLUMN product_description TEXT;

-- Comentários para documentação (opcional)
COMMENT ON COLUMN expenses.beneficiary IS 'Nome de quem recebe o pagamento';
COMMENT ON COLUMN expenses.razao_social IS 'Razão social da empresa prestadora';
COMMENT ON COLUMN expenses.nome_fantasia IS 'Nome fantasia da empresa prestadora';
COMMENT ON COLUMN expenses.product_description IS 'Descrição específica do produto ou serviço';
