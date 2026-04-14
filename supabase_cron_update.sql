-- SCRIPT DE AGENDAMENTO COM ALTA CONFIABILIDADE (USAR SERVICE_ROLE)
-- ⚠️  SEGURANÇA: NUNCA commite este arquivo com a chave real!
-- Substitua 'SUA_SERVICE_ROLE_KEY' pela chave encontrada em: Settings > API > service_role (secret)
-- Após preencher, execute APENAS no SQL Editor do Supabase Dashboard (não versione com a chave real).

-- 1. Lembretes de WhatsApp (06:00 BRT / 09:00 UTC)
DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-reminder');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('whatsapp-reminder', '0 9 * * *', $$
  SELECT net.http_post(
      url:='https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/whatsapp-reminder',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
$$);

-- 2. Agenda Diária Psicólogos (06:00 BRT / 09:00 UTC)
DO $$
BEGIN
  PERFORM cron.unschedule('daily-agenda-email');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('daily-agenda-email', '0 9 * * *', $$
  SELECT net.http_post(
      url:='https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/daily-agenda-email',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
$$);

-- 3. Resumo Diário Coordenação (07:00 BRT / 10:00 UTC)
DO $$
BEGIN
  PERFORM cron.unschedule('clinic-daily-summary');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('clinic-daily-summary', '0 10 * * *', $$
  SELECT net.http_post(
      url:='https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/clinic-daily-summary',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
$$);

-- 4. Confirmação de Atendimentos (A cada 1 hora entre 09:00 e 23:00 UTC -> 06:00 e 20:00 BRT)
DO $$ 
BEGIN 
  PERFORM cron.unschedule('daily-confirmation-email'); 
EXCEPTION WHEN OTHERS THEN 
  NULL; 
END $$;

SELECT cron.schedule('daily-confirmation-email', '0 9-23 * * *', $$
  SELECT net.http_post(
      url:='https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/daily-confirmation-email',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
$$);

-- 5. Alerta de Senhas AMS Petrobras (Toda segunda-feira às 07:00 BRT / 10:00 UTC)
DO $$ 
BEGIN 
  PERFORM cron.unschedule('ams-password-alert'); 
EXCEPTION WHEN OTHERS THEN 
  NULL; 
END $$;

SELECT cron.schedule('ams-password-alert', '0 10 * * 1', $$
  SELECT net.http_post(
      url:='https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/ams-password-alert',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
$$);

-- 6. Aviso de Pendências de Agenda Atrasadas (Toda quarta-feira às 08:00 BRT / 11:00 UTC)
DO $$
BEGIN
  PERFORM cron.unschedule('stale-confirmation-nag');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('stale-confirmation-nag', '0 11 * * 3', $$
  SELECT net.http_post(
      url:='https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/stale-confirmation-nag',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
$$);

-- 7. Lembrete de Renovação de Agenda (Diariamente às 08:00 BRT / 11:00 UTC)
-- Envia email para nucleopriorirj@gmail.com com agendamentos que vencem em até 3 dias
DO $$
BEGIN
  PERFORM cron.unschedule('renewal-reminder-email');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('renewal-reminder-email', '0 11 * * *', $$
  SELECT net.http_post(
      url:='https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/renewal-reminder-email',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
$$);
