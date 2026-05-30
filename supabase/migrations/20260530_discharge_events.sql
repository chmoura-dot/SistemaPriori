-- Tabela para registrar eventos de alta / interrupção de tratamento.
-- Cada registro representa UM evento de alta, com referência ao paciente e psicólogo.
-- O campo acknowledged_at controla se o admin já viu a notificação.

CREATE TABLE IF NOT EXISTS discharge_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid REFERENCES customers(id),
  psychologist_id       uuid REFERENCES psychologists(id),
  customer_name         text NOT NULL,
  psychologist_name     text NOT NULL,
  appointments_canceled int  DEFAULT 0,
  created_at            timestamptz DEFAULT now(),
  acknowledged_at       timestamptz  -- NULL = não lido pelo admin
);

-- RLS: apenas service_role e usuários autenticados podem ler/escrever
ALTER TABLE discharge_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read discharge_events"
  ON discharge_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update discharge_events"
  ON discharge_events FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert discharge_events"
  ON discharge_events FOR INSERT
  TO authenticated
  WITH CHECK (true);
