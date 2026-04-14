-- SCRIPT DE ATUALIZAÇÃO DAS ROTINAS DE E-MAIL (SUPABASE CRON)
-- Este script configura o envio automático de Agenda, Confirmações e Lembretes.
-- ⚠️  SEGURANÇA: NUNCA commite este arquivo com a chave real!
-- IMPORTANTE: Substitua 'SUA_SERVICE_ROLE_KEY' pela chave encontrada em: 
-- Dashboard do Supabase > Settings > API > service_role (secret)

-- 1. Agenda Diária do Psicólogo (Enviada às 06:00 da manhã BRT / 09:00 UTC)
-- Envia a lista de pacientes que o profissional atenderá hoje.
DO $$ BEGIN PERFORM cron.unschedule('daily-agenda-email'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('daily-agenda-email', '0 9 * * *', $$
  SELECT net.http_post(
      url:='https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/daily-agenda-email',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
$$);

-- 2. Pedido de Confirmação de Atendimentos (A cada 1 hora entre 07:00 e 21:00 BRT / 10:00 e 00:00 UTC)
-- O sistema só envia o e-mail 30 minutos após a ÚLTIMA consulta do dia de cada psicólogo.
DO $$ BEGIN PERFORM cron.unschedule('daily-confirmation-email'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('daily-confirmation-email', '0 10-23 * * *', $$
  SELECT net.http_post(
      url:='https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/daily-confirmation-email',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
$$);

-- 3. Resumo Diário para a Clínica (Enviado às 07:30 da manhã BRT / 10:30 UTC)
-- Envia para a coordenação o resumo geral de salas e profissionais do dia.
DO $$ BEGIN PERFORM cron.unschedule('clinic-daily-summary'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('clinic-daily-summary', '30 10 * * *', $$
  SELECT net.http_post(
      url:='https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/clinic-daily-summary',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
$$);

-- 4. Aviso de Pendências Atrasadas (Diariamente às 08:15 BRT / 11:15 UTC)
-- Cobra confirmações que ficaram esquecidas de dias anteriores.
DO $$ BEGIN PERFORM cron.unschedule('stale-confirmation-nag'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('stale-confirmation-nag', '15 11 * * *', $$
  SELECT net.http_post(
      url:='https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/stale-confirmation-nag',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
$$);

-- 5. Lembrete de Senhas AMS Petrobras (Toda Segunda-feira às 07:00 BRT / 10:00 UTC)
DO $$ BEGIN PERFORM cron.unschedule('ams-password-alert'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('ams-password-alert', '0 10 * * 1', $$
  SELECT net.http_post(
      url:='https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/ams-password-alert',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
$$);
