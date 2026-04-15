-- Prevenir agendamentos duplicados: mesmo psicólogo, mesma data, mesmo horário de início
-- Primeiro, garantir que não há duplicatas remanescentes antes de criar o índice
-- (as duplicatas foram removidas pelo script fix-duplicates.ts)

-- Criar índice único para prevenir duplicações futuras
-- Exclui agendamentos cancelados da restrição (status != 'canceled')
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_no_duplicate
  ON appointments (psychologist_id, date, start_time)
  WHERE status != 'canceled';

-- Comentário explicativo
COMMENT ON INDEX idx_appointments_no_duplicate IS 
  'Previne agendamentos duplicados: um psicólogo não pode ter dois atendimentos ativos no mesmo horário e data.';
