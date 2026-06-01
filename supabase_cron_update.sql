-- ============================================================
-- SCRIPT COMPLETO DE CRONS DO NÚCLEO PRIORI (SUPABASE pg_cron)
-- ============================================================
-- ⚠️  ANTES DE RODAR: substitua TODAS as ocorrências de
--     SUA_SERVICE_ROLE_KEY
--    pela chave encontrada em:
--    Dashboard > Settings > API > service_role (secret)
-- ============================================================

-- 1. Agenda Diária do Psicólogo (06:00 BRT / 09:00 UTC)
DO $do$ BEGIN PERFORM cron.unschedule('daily-agenda-email'); EXCEPTION WHEN OTHERS THEN NULL; END $do$;
SELECT cron.schedule('daily-agenda-email', '0 9 * * *', $body$
  SELECT net.http_post(
      url := 'https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/daily-agenda-email',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
      body := '{}'::jsonb
  ) as request_id;
$body$);

-- 2. Pedido de Confirmação (a cada 1h entre 07:00–20:00 BRT / 10:00–23:00 UTC)
DO $do$ BEGIN PERFORM cron.unschedule('daily-confirmation-email'); EXCEPTION WHEN OTHERS THEN NULL; END $do$;
SELECT cron.schedule('daily-confirmation-email', '0 10-23 * * *', $body$
  SELECT net.http_post(
      url := 'https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/daily-confirmation-email',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
      body := '{}'::jsonb
  ) as request_id;
$body$);

-- 3. Resumo Diário da Clínica (07:30 BRT / 10:30 UTC)
DO $do$ BEGIN PERFORM cron.unschedule('clinic-daily-summary'); EXCEPTION WHEN OTHERS THEN NULL; END $do$;
SELECT cron.schedule('clinic-daily-summary', '30 10 * * *', $body$
  SELECT net.http_post(
      url := 'https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/clinic-daily-summary',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
      body := '{}'::jsonb
  ) as request_id;
$body$);

-- 4. Renovação Automática Rolling 60 dias (07:00 BRT / 10:00 UTC)
DO $do$ BEGIN PERFORM cron.unschedule('auto-renew-appointments'); EXCEPTION WHEN OTHERS THEN NULL; END $do$;
SELECT cron.schedule('auto-renew-appointments', '0 10 * * *', $body$
  SELECT net.http_post(
      url := 'https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/auto-renew-appointments',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
      body := '{}'::jsonb
  ) as request_id;
$body$);

-- 5. Aviso de Senhas AMS (Segunda-feira às 07:00 BRT / 10:00 UTC)
DO $do$
BEGIN
  PERFORM cron.unschedule('ams-password-alert');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $do$;

SELECT cron.schedule(
  'ams-password-alert',
  '0 10 * * 1',
  $body$
    SELECT net.http_post(
        url := 'https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/ams-password-alert',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
        body := '{}'::jsonb
    ) as re
  $body$
);

-- 6. Aviso de Pendências de Agenda Atrasadas (Diariamente às 08:15 BRT / 11:15 UTC)
DO $do$
BEGIN
  PERFORM cron.unschedule('stale-confirmation-nag');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $do$;

SELECT cron.schedule(
  'stale-confirmation-nag',
  '15 11 * * *',
  $body$
    SELECT net.http_post(
        url := 'https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/stale-confirmation-nag',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
        body := '{}'::jsonb
    ) as request_id;
  $body$
);

-- 7. Lembrete de Renovação de Agenda (Diariamente às 08:00 BRT / 11:00 UTC)
-- Envia email para nucleopriorirj@gmail.com com agendamentos que vencem em até 3 dias
DO $do$
BEGIN
  PERFORM cron.unschedule('renewal-reminder-email');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $do$;

SELECT cron.schedule(
  'renewal-reminder-email',
  '0 11 * * *',
  $body$
    SELECT net.http_post(
        url := 'https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/renewal-reminder-email',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
        body := '{}'::jsonb
    ) as request_id;
  $body$
);
