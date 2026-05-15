-- Migration: Suporte ao status 'draft' (Rascunho) em lotes de faturamento
-- O campo status na tabela billing_batches é TEXT, portanto nenhuma alteração
-- de schema é necessária. Este arquivo documenta a adição do novo status.
--
-- Novos comportamentos habilitados:
--   status = 'draft'  → Lote em construção (pode receber/remover atendimentos)
--   status = 'sent'   → Lote enviado à operadora (fluxo antigo mantido)
--   status = 'paid'   → Lote pago pela operadora (fluxo antigo mantido)
--
-- Para lotes com status 'draft', o campo sent_at armazena a competência
-- no formato YYYY-MM-01T00:00:00.000Z (não é a data real de envio).
-- O sent_at é atualizado para a data atual ao finalizar o rascunho.

-- Índice para agilizar busca de rascunhos por operadora
CREATE INDEX IF NOT EXISTS idx_billing_batches_status_health_plan
  ON billing_batches (status, health_plan);
