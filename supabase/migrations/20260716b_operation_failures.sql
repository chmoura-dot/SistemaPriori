-- Fase 1 da Auditoria — Observabilidade de falhas ("instalar os sensores").
--
-- Hoje erros de processamento (faturamento, repasse, inativação) só aparecem como
-- toast/alert efêmero para o usuário e um console.error que é descartado em
-- produção. Esta tabela dá VISIBILIDADE PERSISTENTE dessas falhas, permitindo
-- reconciliação manual e detecção de dados órfãos.
--
-- Diferença para audit_log: audit_log registra mudanças que DERAM CERTO (trigger),
-- operation_failures registra EXCEÇÕES/erros que ocorreram no fluxo de negócio.

CREATE TABLE IF NOT EXISTS operation_failures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,                       -- auth.uid() do operador (quando disponível)
  context      text NOT NULL,              -- ex: 'billing.handleCreateBatch', 'customer.inactivate'
  message      text NOT NULL,              -- mensagem de erro
  details      jsonb,                       -- payload/contexto adicional (IDs, etapa que falhou)
  severity     text NOT NULL DEFAULT 'error' CHECK (severity IN ('warn', 'error', 'critical')),
  acknowledged boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operation_failures_created_at
  ON operation_failures (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operation_failures_unack
  ON operation_failures (acknowledged) WHERE acknowledged = false;

ALTER TABLE operation_failures ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado (em produção, considere restringir a admin)
CREATE POLICY "operation_failures_select_authenticated"
  ON operation_failures FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Atualização (marcar como acknowledged): usuário autenticado
CREATE POLICY "operation_failures_update_authenticated"
  ON operation_failures FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Inserção direta é bloqueada — o registro deve passar pela RPC abaixo,
-- garantindo que user_id seja sempre capturado do servidor.

-- RPC para o frontend registrar falhas de forma padronizada e segura.
CREATE OR REPLACE FUNCTION log_operation_failure(
  p_context  text,
  p_message  text,
  p_details  jsonb DEFAULT NULL,
  p_severity text DEFAULT 'error'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO operation_failures (user_id, context, message, details, severity)
  VALUES (
    auth.uid(),
    p_context,
    p_message,
    p_details,
    CASE WHEN p_severity IN ('warn', 'error', 'critical') THEN p_severity ELSE 'error' END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION log_operation_failure(text, text, jsonb, text) TO authenticated;

-- NOTA de reliability: crie um alerta ativo lendo esta tabela.
-- Opção recomendada (sem código extra no frontend): pg_cron a cada 5 min que
-- verifica novos registros com severity='critical' e acknowledged=false e chama
-- uma Edge Function de notificação (e-mail/WhatsApp já existentes na infra).
