-- Trigger e função para garantir que não haverá sobreposição de horários do mesmo psicólogo
-- Substitui a proteção apenas por índice único, pois assim conseguimos checar sobreposição de períodos 
-- (ex: 10:00-11:00 conflita com 10:30-11:30) e retornar uma mensagem amigável.

CREATE OR REPLACE FUNCTION check_appointment_overlap()
RETURNS trigger AS $$
DECLARE
  conflict_count integer;
BEGIN
  -- Se estiver cancelado, ignorar
  IF NEW.status = 'canceled' THEN
    RETURN NEW;
  END IF;

  -- Checar sobreposição
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

DROP TRIGGER IF EXISTS trg_prevent_appointment_overlap ON appointments;

CREATE TRIGGER trg_prevent_appointment_overlap
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION check_appointment_overlap();
