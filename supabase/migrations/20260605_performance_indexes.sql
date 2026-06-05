-- ============================================================================
-- Migration: Índices de Performance
-- Data: 2026-06-05
-- Objetivo: Criar índices para as queries mais críticas do sistema,
--           reduzindo tempo de resposta e I/O no PostgreSQL.
-- ============================================================================

-- 1. Appointments: cobertura para a query principal da grade de agenda
--    Query: WHERE date >= $1 AND date <= $2 ORDER BY date, start_time
CREATE INDEX IF NOT EXISTS idx_appointments_date_time
  ON appointments (date ASC, start_time ASC);

-- 2. Appointments: filtro por psicólogo + status (dashboard, repasse, billing)
CREATE INDEX IF NOT EXISTS idx_appointments_psychologist_status
  ON appointments (psychologist_id, status);

-- 3. Appointments: filtro por paciente (histórico do paciente)
CREATE INDEX IF NOT EXISTS idx_appointments_customer_id
  ON appointments (customer_id);

-- 4. Appointments: filtro por lote de faturamento (billing page)
CREATE INDEX IF NOT EXISTS idx_appointments_billing_batch
  ON appointments (billing_batch_id)
  WHERE billing_batch_id IS NOT NULL;

-- 5. Appointments: busca por grupo de recorrência (renovações / exclusão em lote)
CREATE INDEX IF NOT EXISTS idx_appointments_recurrence_group
  ON appointments (recurrence_group_id)
  WHERE recurrence_group_id IS NOT NULL;

-- 6. Appointments: filtro para renovações pendentes
CREATE INDEX IF NOT EXISTS idx_appointments_needs_renewal
  ON appointments (needs_renewal, status, date)
  WHERE needs_renewal = true;

-- 7. Customers: busca por nome (LIKE 'JOÃO%' / listagem ordenada)
CREATE INDEX IF NOT EXISTS idx_customers_name
  ON customers (name text_pattern_ops);

-- 8. Customers: filtro por psicólogo responsável
CREATE INDEX IF NOT EXISTS idx_customers_psychologist
  ON customers (psychologist_id);

-- 9. Customers: filtro por status (ativos/inativos)
CREATE INDEX IF NOT EXISTS idx_customers_status
  ON customers (status);

-- 10. NFS-e: busca por status de nota fiscal
CREATE INDEX IF NOT EXISTS idx_nfse_status
  ON nfse_invoices (status);

-- 11. NFS-e: busca dentro do JSONB payer (CPF/CNPJ do tomador)
CREATE INDEX IF NOT EXISTS idx_nfse_payer_gin
  ON nfse_invoices USING GIN (payer);

-- 12. Billing Batches: ordenação por data de envio
CREATE INDEX IF NOT EXISTS idx_billing_batches_sent_at
  ON billing_batches (sent_at DESC);

-- 13. Expenses: filtro por data (relatórios financeiros)
CREATE INDEX IF NOT EXISTS idx_expenses_date
  ON expenses (date DESC);

-- 14. Repasses: filtro por psicólogo
CREATE INDEX IF NOT EXISTS idx_repasses_psychologist
  ON repasses (psychologist_id);

-- 15. Waiting List: filtro por status
CREATE INDEX IF NOT EXISTS idx_waiting_list_status
  ON waiting_list (status);
