-- Migration: waiting_list_matching
--
-- Suporte à funcionalidade "Alerta de Vaga Compatível com a Fila de Espera".
-- Adiciona os campos necessários para o matching de disponibilidade
-- (tipo de atendimento, convênio, duração de sessão) e a modelagem de quais
-- convênios cada psicólogo atende (hoje inexistente no sistema).
--
-- Rode este script no SQL Editor do painel web do Supabase.

-- 1) Fila de Espera: tipo de atendimento, convênio e duração de sessão.
--    Nenhum dos três é obrigatório — preserva registros já cadastrados.
ALTER TABLE waiting_list
  ADD COLUMN IF NOT EXISTS appointment_type TEXT,
  ADD COLUMN IF NOT EXISTS health_plan TEXT,
  ADD COLUMN IF NOT EXISTS session_duration_minutes INTEGER NOT NULL DEFAULT 60;

COMMENT ON COLUMN waiting_list.appointment_type IS
  'Tipo de atendimento desejado (AppointmentType). Apenas informativo/exibição — não filtra candidatos no matching.';
COMMENT ON COLUMN waiting_list.health_plan IS
  'Convênio/Particular desejado (HealthPlan). Filtra psicólogos candidatos via psychologists.accepted_health_plans.';
COMMENT ON COLUMN waiting_list.session_duration_minutes IS
  'Duração assumida da sessão (minutos) para checar sobreposição com a agenda ao buscar vagas. Padrão 60min, editável pela secretária.';

-- 2) Psicólogos: quais convênios cada um atende.
--    Array vazio (default) = atende todos os convênios, preservando o
--    comportamento atual do sistema (hoje nenhuma regra de convênio existe
--    por psicólogo).
ALTER TABLE psychologists
  ADD COLUMN IF NOT EXISTS accepted_health_plans TEXT[] DEFAULT '{}';

COMMENT ON COLUMN psychologists.accepted_health_plans IS
  'Convênios que o psicólogo atende (enum HealthPlan). Array vazio = atende todos os convênios.';

-- 3) Índice de suporte: a query de matching sempre filtra registros 'pending'.
CREATE INDEX IF NOT EXISTS idx_waiting_list_pending
  ON waiting_list (status)
  WHERE status = 'pending';
