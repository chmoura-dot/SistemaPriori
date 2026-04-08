-- Migration: Adicionar campos de histórico de renovação na tabela appointments
-- Data: 2026-04-07

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS renewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS renewed_by TEXT;

COMMENT ON COLUMN appointments.renewed_at IS 'Data/hora em que o agendamento foi renovado';
COMMENT ON COLUMN appointments.renewed_by IS 'Email do usuário que realizou a renovação';
