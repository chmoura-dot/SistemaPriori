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

-- 6. Aviso de Pendências de Agenda Atrasadas (Toda quarta-feira às 08:00 BRT / 11:00 UTC)
DO $do$
BEGIN
  PERFORM cron.unschedule('stale-confirmation-nag');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $do$;

SELECT cron.schedule(
  'stale-confirmation-nag',
  '0 11 * * 3',
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
