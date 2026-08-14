-- ============================================================================
-- Migration: Otimização da Trigger de Sobreposição e Criação de Índice Composto
-- Data: 2026-08-14
-- Objetivo: Otimizar a performance da trigger `trg_prevent_appointment_overlap` 
--           retornando precocemente em updates que não alteram a agenda,
--           e criar um índice composto para acelerar a checagem de conflitos.
-- ============================================================================

-- 1. Otimização da Função da Trigger
CREATE OR REPLACE FUNCTION check_appointment_overlap()
RETURNS trigger AS $$
DECLARE
  conflict_count integer;
BEGIN
  -- Se for um UPDATE e nenhum dos campos de agendamento (psicólogo, data, horários, status) mudou,
  -- podemos retornar imediatamente sem fazer a busca pesada no banco.
  IF TG_OP = 'UPDATE' THEN
    IF NOT (
      NEW.psychologist_id IS DISTINCT FROM OLD.psychologist_id OR
      NEW.date IS DISTINCT FROM OLD.date OR
      NEW.start_time IS DISTINCT FROM OLD.start_time OR
      NEW.end_time IS DISTINCT FROM OLD.end_time OR
      NEW.status IS DISTINCT FROM OLD.status
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Se estiver cancelado, ignorar
  IF NEW.status = 'canceled' THEN
    RETURN NEW;
  END IF;

  -- Checar sobreposição usando o índice otimizado
  SELECT COUNT(*) INTO conflict_count
  FROM appointments a
  WHERE a.psychologist_id = NEW.psychologist_id
    AND a.date = NEW.date
    AND a.status != 'canceled'
    AND a.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      (NEW.start_time >= a.start_time AND NEW.start_time < a.end_time) OR
      (NEW.end_time > a.start_time AND NEW.end_time <= a.end_time) OR
      (NEW.start_time <= a.start_time AND NEW.end_time >= a.end_time)
    );

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'O psicólogo já possui um agendamento conflitante neste horário.' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Criação do Índice Otimizado para a busca da trigger
CREATE INDEX IF NOT EXISTS idx_appointments_psychologist_date
  ON appointments (psychologist_id, date)
  WHERE status != 'canceled';
