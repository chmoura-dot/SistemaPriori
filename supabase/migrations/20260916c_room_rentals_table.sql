-- ============================================================================
-- Migration: Sublocação de sala — tabela room_rentals
-- Data: 2026-09-16
-- Objetivo: nova funcionalidade em que o psicólogo reserva uma sala e PAGA a
--   clínica por isso (fluxo financeiro inverso ao repasse, que é a clínica
--   pagando o psicólogo). Modelado como entidade própria — não um tipo de
--   `appointments` — para que repasse, faturamento, portfólio de pacientes e
--   dashboards, que hoje assumem que todo Appointment é um atendimento a
--   paciente, nunca precisem sequer saber que esta tabela existe.
-- ============================================================================

CREATE TABLE room_rentals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id               uuid NOT NULL REFERENCES rooms(id),
  psychologist_id       uuid NOT NULL REFERENCES psychologists(id),
  date                  date NOT NULL,
  start_time            time NOT NULL,
  end_time              time NOT NULL,
  status                text NOT NULL DEFAULT 'active',   -- 'active' | 'canceled'
  amount                numeric NOT NULL DEFAULT 0,
  payment_status        text NOT NULL DEFAULT 'pending',  -- 'pending' | 'paid'
  paid_at               timestamptz,
  notes                 text,
  is_recurring          boolean NOT NULL DEFAULT false,
  recurrence_frequency  text,
  recurrence_group_id   uuid,
  cancellation_reason   text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_room_rentals_date_room
  ON room_rentals (date, room_id) WHERE status = 'active';

CREATE INDEX idx_room_rentals_recurrence_group
  ON room_rentals (recurrence_group_id) WHERE recurrence_group_id IS NOT NULL;

CREATE INDEX idx_room_rentals_psychologist
  ON room_rentals (psychologist_id);

-- RLS: mesmo padrão staff-only (qualquer linha em app_users) já usado em
-- rooms/billing_batches/repasses (20260912l_staff_rls_lockdown.sql) —
-- psicólogo não loga no sistema hoje, então não há necessidade de policy
-- de self-service por psychologist_id.
ALTER TABLE room_rentals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_rentals_staff_all" ON room_rentals
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email()));

-- Auditoria: reaproveita a função genérica fn_audit_log() já usada em
-- customers/appointments/billing_batches/repasses — sem alterá-la.
CREATE TRIGGER trg_audit_room_rentals
  AFTER INSERT OR UPDATE OR DELETE ON room_rentals
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- Verificação
SELECT tablename FROM pg_tables WHERE tablename = 'room_rentals';
