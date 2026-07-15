-- ============================================================
-- CRON — Alerta ativo de falhas críticas (Fase 1 da Auditoria)
-- ============================================================
-- ⚠️  ANTES DE RODAR: substitua SUA_SERVICE_ROLE_KEY pela chave em:
--     Dashboard > Settings > API > service_role (secret)
-- ⚠️  NUNCA commite este arquivo com a chave real.
--
-- Pré-requisito: a Edge Function 'critical-failure-alert' já deve estar
-- publicada (supabase functions deploy critical-failure-alert).
--
-- Frequência: a cada 10 minutos. A function só envia e-mail se houver
-- registros com severity='critical' e acknowledged=false; caso contrário,
-- não gera ruído.
-- ============================================================

DO $do$
BEGIN
  PERFORM cron.unschedule('critical-failure-alert');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $do$;

SELECT cron.schedule(
  'critical-failure-alert',
  '*/10 * * * *',
  $body$
    SELECT net.http_post(
        url := 'https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/critical-failure-alert',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
        body := '{}'::jsonb
    ) as request_id;
  $body$
);
