-- Script de migração das categorias de despesas
-- Execute este script no SQL Editor do seu painel do Supabase

UPDATE expenses SET category = 'Folha de Pagamento / Salários' WHERE category = 'Salários';
UPDATE expenses SET category = 'Empréstimos e Financiamentos' WHERE category = 'Empréstimos';
UPDATE expenses SET category = 'Impostos e Contabilidade' WHERE category = 'Impostos';
UPDATE expenses SET category = 'Aluguel e Condomínio' WHERE category = 'Aluguel';
UPDATE expenses SET category = 'Água / Luz / Internet / Telefone' WHERE category = 'Contas (Água/Luz/Internet)';
UPDATE expenses SET category = 'Marketing e Publicidade' WHERE category = 'Marketing';
UPDATE expenses SET category = 'Suprimentos e Copa' WHERE category = 'Suprimentos';
UPDATE expenses SET category = 'Outras Despesas' WHERE category = 'Outros';
